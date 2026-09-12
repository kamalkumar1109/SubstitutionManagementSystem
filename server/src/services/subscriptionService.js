const {
  BILLING_INTERVAL,
  SUBSCRIPTION_STATUS,
  PAYMENT_STATUS,
  AUDIT_ACTIONS
} = require("../config/constants");
const {
  SubscriptionPlan,
  School,
  SchoolSubscription,
  Payment,
  WebhookEvent
} = require("../models");
const { AppError } = require("../utils/AppError");
const { writeAudit } = require("./auditService");
const razorpay = require("./razorpayGateway");

function billingCycleOf(plan) {
  return plan.billingCycle || plan.interval;
}

function presentPlan(plan) {
  if (!plan) return null;
  return {
    _id: plan._id,
    name: plan.name,
    description: plan.description || "",
    billingCycle: billingCycleOf(plan),
    interval: billingCycleOf(plan),
    amount: plan.amount,
    currency: plan.currency,
    active: plan.active,
    razorpayPlanId: plan.razorpayPlanId || "",
    razorpayProductId: plan.razorpayProductId || "",
    features: plan.features || []
  };
}

function subscriptionIsActive(sub) {
  if (!sub) return false;
  if (sub.status !== SUBSCRIPTION_STATUS.ACTIVE && sub.status !== SUBSCRIPTION_STATUS.TRIALING) {
    return false;
  }
  if (sub.expiryDate && new Date(sub.expiryDate).getTime() < Date.now()) return false;
  return true;
}

function enforcementEnabled() {
  return String(process.env.SUBSCRIPTION_ENFORCEMENT || "").toLowerCase() === "true";
}

function addBillingCycle(from, cycle) {
  const next = new Date(from);
  if (cycle === BILLING_INTERVAL.YEARLY) next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

async function refreshExpiredSubscriptions() {
  const now = new Date();
  const expired = await SchoolSubscription.find({
    status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIALING, SUBSCRIPTION_STATUS.PAST_DUE] },
    expiryDate: { $lt: now }
  });
  for (const sub of expired) {
    sub.status = SUBSCRIPTION_STATUS.EXPIRED;
    await sub.save();
    await syncSchoolEmbed(sub);
  }
  return expired.length;
}

async function syncSchoolEmbed(sub) {
  await School.updateOne(
    { _id: sub.schoolId },
    {
      $set: {
        "subscription.planId": sub.planId,
        "subscription.status": sub.status,
        "subscription.billingInterval": sub.billingCycle,
        "subscription.currentPeriodStart": sub.startDate,
        "subscription.currentPeriodEnd": sub.expiryDate,
        "subscription.provider": "razorpay",
        "subscription.providerCustomerId": sub.razorpayCustomerId || null,
        "subscription.providerSubscriptionId": sub.razorpaySubscriptionId || null
      }
    }
  );
}

async function getOrCreateSchoolSubscription(schoolId) {
  let doc = await SchoolSubscription.findOne({ schoolId });
  if (!doc) {
    doc = await SchoolSubscription.create({
      schoolId,
      status: SUBSCRIPTION_STATUS.NONE,
      paymentStatus: PAYMENT_STATUS.PENDING
    });
  }
  return doc;
}

async function createPlan(payload) {
  const cycle = payload.billingCycle || payload.interval;
  if (!payload.name || payload.amount == null || !cycle) {
    throw AppError.badRequest("name, amount, and billingCycle are required");
  }
  if (!Object.values(BILLING_INTERVAL).includes(cycle)) {
    throw AppError.badRequest("billingCycle must be MONTHLY or YEARLY");
  }
  if (Number(payload.amount) < 0) {
    throw AppError.badRequest("amount cannot be negative");
  }
  return SubscriptionPlan.create({
    name: payload.name,
    description: payload.description || "",
    billingCycle: cycle,
    interval: cycle,
    amount: payload.amount,
    currency: payload.currency || "INR",
    active: payload.active !== false,
    razorpayPlanId: payload.razorpayPlanId || "",
    razorpayProductId: payload.razorpayProductId || "",
    features: payload.features || [],
    metadata: payload.metadata || {}
  });
}

async function listPlans({ includeInactive } = {}) {
  const filter = includeInactive ? {} : { active: true };
  const plans = await SubscriptionPlan.find(filter).sort({ billingCycle: 1, name: 1 });
  return plans.map(presentPlan);
}

async function provisionSchoolPlan({ schoolId, planId, actorId }) {
  const sub = await getOrCreateSchoolSubscription(schoolId);
  if (!planId) {
    await syncSchoolEmbed(sub);
    return presentSubscription(await sub.populate("planId"));
  }

  const plan = await SubscriptionPlan.findById(planId);
  if (!plan || !plan.active) throw AppError.notFound("Subscription plan not found");

  const now = new Date();
  sub.planId = plan._id;
  sub.billingCycle = billingCycleOf(plan);
  sub.status = SUBSCRIPTION_STATUS.ACTIVE;
  sub.startDate = now;
  sub.expiryDate = addBillingCycle(now, sub.billingCycle);
  sub.paymentStatus = PAYMENT_STATUS.PENDING;
  await sub.save();
  await syncSchoolEmbed(sub);

  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.SUBSCRIPTION_CHANGED,
    entityType: "SchoolSubscription",
    entityId: sub._id,
    metadata: { planId: String(plan._id), status: sub.status, source: "admin-create-school" }
  });

  return presentSubscription(await sub.populate("planId"));
}

async function assignPlan({ schoolId, actorId, planId, status, trialEndsAt }) {
  const plan = await SubscriptionPlan.findById(planId);
  if (!plan || !plan.active) throw AppError.notFound("Subscription plan not found");
  const school = await School.findById(schoolId);
  if (!school) throw AppError.notFound("School not found");

  const sub = await getOrCreateSchoolSubscription(schoolId);
  const now = new Date();
  sub.planId = plan._id;
  sub.billingCycle = billingCycleOf(plan);
  sub.status = status || SUBSCRIPTION_STATUS.ACTIVE;
  sub.startDate = now;
  sub.expiryDate = trialEndsAt ? new Date(trialEndsAt) : addBillingCycle(now, sub.billingCycle);
  sub.paymentStatus = PAYMENT_STATUS.SUCCEEDED;
  await sub.save();
  await syncSchoolEmbed(sub);

  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.SUBSCRIPTION_CHANGED,
    entityType: "SchoolSubscription",
    entityId: sub._id,
    metadata: { planId: String(plan._id), status: sub.status }
  });

  return presentSubscription(await sub.populate("planId"));
}

function presentSubscription(sub) {
  if (!sub) return null;
  const plan = sub.planId && sub.planId.name ? presentPlan(sub.planId) : null;
  return {
    _id: sub._id,
    schoolId: sub.schoolId,
    plan,
    planId: plan?._id || sub.planId || null,
    status: sub.status,
    startDate: sub.startDate,
    expiryDate: sub.expiryDate,
    billingCycle: sub.billingCycle || plan?.billingCycle || null,
    paymentStatus: sub.paymentStatus,
    razorpayCustomerId: sub.razorpayCustomerId || "",
    razorpaySubscriptionId: sub.razorpaySubscriptionId || "",
    createdAt: sub.createdAt,
    updatedAt: sub.updatedAt
  };
}

function presentPayment(payment) {
  return {
    _id: payment._id,
    schoolId: payment.schoolId,
    subscriptionId: payment.subscriptionId,
    planId: payment.planId,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    paidAt: payment.paidAt,
    receipt: payment.receipt,
    razorpayOrderId: payment.razorpayOrderId || "",
    razorpayPaymentId: payment.razorpayPaymentId || "",
    billedForInterval: payment.billedForInterval || "",
    periodStart: payment.periodStart,
    periodEnd: payment.periodEnd,
    failureReason: payment.failureReason || "",
    createdAt: payment.createdAt
  };
}

async function getSchoolBilling({ schoolId }) {
  await refreshExpiredSubscriptions();
  const school = await School.findById(schoolId).select("name email");
  const sub = await getOrCreateSchoolSubscription(schoolId);
  await sub.populate("planId");
  const presented = presentSubscription(sub);
  const allowed = subscriptionIsActive(sub);
  return {
    schoolName: school?.name || "",
    subscription: presented,
    access: {
      enforcementEnabled: enforcementEnabled(),
      allowed: enforcementEnabled() ? allowed : true,
      wouldAllow: allowed
    },
    gateway: {
      configured: razorpay.configured() || razorpay.useStub(),
      keyId: razorpay.publicKeyId()
    }
  };
}

async function createCheckout({ schoolId, actorId, planId }) {
  const plan = await SubscriptionPlan.findOne({ _id: planId, active: true });
  if (!plan) throw AppError.notFound("Subscription plan not found");
  if (!(Number(plan.amount) > 0)) {
    throw AppError.badRequest("This plan is not ready for payment yet");
  }

  const school = await School.findById(schoolId);
  if (!school) throw AppError.notFound("School not found");
  const sub = await getOrCreateSchoolSubscription(schoolId);

  const amountPaise = Math.round(Number(plan.amount) * 100);
  const payment = await Payment.create({
    schoolId,
    subscriptionId: sub._id,
    planId: plan._id,
    amount: plan.amount,
    currency: plan.currency || "INR",
    status: PAYMENT_STATUS.PENDING,
    billedForInterval: billingCycleOf(plan),
    provider: "razorpay",
    receipt: `sms_${Date.now().toString(36)}`
  });
  payment.receipt = `sms_${String(payment._id).slice(-16)}`;
  await payment.save();

  const order = await razorpay.createOrder({
    amountPaise,
    currency: payment.currency,
    receipt: payment.receipt,
    notes: {
      schoolId: String(schoolId),
      paymentId: String(payment._id),
      planId: String(plan._id)
    }
  });

  payment.razorpayOrderId = order.id;
  await payment.save();

  sub.status = sub.status === SUBSCRIPTION_STATUS.ACTIVE ? sub.status : SUBSCRIPTION_STATUS.PENDING;
  sub.planId = plan._id;
  sub.billingCycle = billingCycleOf(plan);
  sub.paymentStatus = PAYMENT_STATUS.PENDING;
  sub.lastRazorpayOrderId = order.id;
  sub.lastPaymentId = payment._id;
  await sub.save();
  await syncSchoolEmbed(sub);

  razorpay.logBilling("checkout_created", {
    schoolId: String(schoolId),
    paymentId: String(payment._id),
    orderId: order.id,
    amount: payment.amount,
    currency: payment.currency
  });

  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.PAYMENT_EVENT,
    entityType: "Payment",
    entityId: payment._id,
    metadata: { status: PAYMENT_STATUS.PENDING, orderId: order.id }
  });

  return {
    keyId: razorpay.publicKeyId(),
    orderId: order.id,
    amount: payment.amount,
    amountPaise,
    currency: payment.currency,
    paymentId: payment._id,
    receipt: payment.receipt,
    plan: presentPlan(plan),
    prefill: {
      name: school.name,
      email: school.email
    },
    name: "Substitution Management System",
    description: plan.name
  };
}

async function fulfillSuccessfulPayment({
  payment,
  razorpayPaymentId,
  razorpayOrderId,
  razorpaySubscriptionId,
  actorId
}) {
  if (payment.status === PAYMENT_STATUS.SUCCEEDED) {
    const sub = await SchoolSubscription.findById(payment.subscriptionId).populate("planId");
    return { payment, subscription: presentSubscription(sub), duplicate: true };
  }

  if (razorpayPaymentId) {
    const existing = await Payment.findOne({
      razorpayPaymentId,
      _id: { $ne: payment._id },
      status: PAYMENT_STATUS.SUCCEEDED
    });
    if (existing) {
      const sub = await SchoolSubscription.findById(existing.subscriptionId).populate("planId");
      return { payment: existing, subscription: presentSubscription(sub), duplicate: true };
    }
  }

  const plan = await SubscriptionPlan.findById(payment.planId);
  if (!plan) throw AppError.notFound("Subscription plan not found");
  const cycle = billingCycleOf(plan);
  const sub = await getOrCreateSchoolSubscription(payment.schoolId);
  const now = new Date();
  const base =
    sub.expiryDate && new Date(sub.expiryDate).getTime() > now.getTime()
      ? new Date(sub.expiryDate)
      : now;
  const start = sub.startDate && sub.status === SUBSCRIPTION_STATUS.ACTIVE ? sub.startDate : now;
  const expiry = addBillingCycle(base, cycle);

  payment.status = PAYMENT_STATUS.SUCCEEDED;
  payment.paidAt = now;
  payment.razorpayPaymentId = razorpayPaymentId || payment.razorpayPaymentId;
  payment.razorpayOrderId = razorpayOrderId || payment.razorpayOrderId;
  payment.razorpaySubscriptionId = razorpaySubscriptionId || payment.razorpaySubscriptionId;
  payment.providerPaymentId = payment.razorpayPaymentId;
  payment.periodStart = base;
  payment.periodEnd = expiry;
  payment.failureCode = "";
  payment.failureReason = "";
  await payment.save();

  sub.planId = plan._id;
  sub.status = SUBSCRIPTION_STATUS.ACTIVE;
  sub.startDate = start;
  sub.expiryDate = expiry;
  sub.billingCycle = cycle;
  sub.paymentStatus = PAYMENT_STATUS.SUCCEEDED;
  if (razorpaySubscriptionId) sub.razorpaySubscriptionId = razorpaySubscriptionId;
  sub.lastPaymentId = payment._id;
  await sub.save();
  await syncSchoolEmbed(sub);

  razorpay.logBilling("payment_succeeded", {
    schoolId: String(payment.schoolId),
    paymentId: String(payment._id),
    orderId: payment.razorpayOrderId,
    razorpayPaymentId: payment.razorpayPaymentId
  });

  await writeAudit({
    schoolId: payment.schoolId,
    actorId: actorId || null,
    action: AUDIT_ACTIONS.PAYMENT_EVENT,
    entityType: "Payment",
    entityId: payment._id,
    metadata: { status: PAYMENT_STATUS.SUCCEEDED }
  });
  await writeAudit({
    schoolId: payment.schoolId,
    actorId: actorId || null,
    action: AUDIT_ACTIONS.SUBSCRIPTION_CHANGED,
    entityType: "SchoolSubscription",
    entityId: sub._id,
    metadata: { status: SUBSCRIPTION_STATUS.ACTIVE, expiryDate: expiry }
  });

  return {
    payment,
    subscription: presentSubscription(await sub.populate("planId")),
    duplicate: false
  };
}

async function verifyCheckout({ schoolId, actorId, razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw AppError.badRequest("Missing Razorpay payment confirmation");
  }
  razorpay.verifyCheckoutSignature({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature
  });

  const payment = await Payment.findOne({ schoolId, razorpayOrderId });
  if (!payment) throw AppError.notFound("Payment order not found");

  return fulfillSuccessfulPayment({
    payment,
    razorpayPaymentId,
    razorpayOrderId,
    actorId
  });
}

async function cancelCheckout({ schoolId, paymentId }) {
  const payment = await Payment.findOne({ _id: paymentId, schoolId });
  if (!payment) throw AppError.notFound("Payment not found");
  if (payment.status === PAYMENT_STATUS.SUCCEEDED) {
    return presentPayment(payment);
  }
  payment.status = PAYMENT_STATUS.CANCELLED;
  await payment.save();
  razorpay.logBilling("payment_cancelled", {
    schoolId: String(schoolId),
    paymentId: String(payment._id),
    orderId: payment.razorpayOrderId
  });
  return presentPayment(payment);
}

async function markPaymentFailed({ payment, failureCode, failureReason }) {
  if (payment.status === PAYMENT_STATUS.SUCCEEDED) return payment;
  payment.status = PAYMENT_STATUS.FAILED;
  payment.failureCode = failureCode || "";
  payment.failureReason = failureReason || "Payment failed";
  await payment.save();
  const sub = await SchoolSubscription.findById(payment.subscriptionId);
  if (sub && sub.status !== SUBSCRIPTION_STATUS.ACTIVE) {
    sub.paymentStatus = PAYMENT_STATUS.FAILED;
    await sub.save();
    await syncSchoolEmbed(sub);
  }
  razorpay.logBilling("payment_failed", {
    schoolId: String(payment.schoolId),
    paymentId: String(payment._id),
    orderId: payment.razorpayOrderId,
    failureCode: payment.failureCode
  });
  return payment;
}

async function handleWebhook({ rawBody, signature, eventIdHeader }) {
  razorpay.verifyWebhookSignature(rawBody, signature);
  let event;
  try {
    event = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody);
  } catch {
    throw AppError.badRequest("Invalid webhook payload");
  }

  const crypto = require("crypto");
  const eventId =
    eventIdHeader ||
    event.event_id ||
    (event.event && event.payload?.payment?.entity?.id
      ? `${event.event}:${event.payload.payment.entity.id}`
      : crypto.createHash("sha256").update(rawBody).digest("hex"));

  const already = await WebhookEvent.findOne({ provider: "razorpay", eventId: String(eventId) });
  if (already) {
    razorpay.logBilling("webhook_duplicate", { eventId: String(eventId), eventType: event.event });
  }

  const type = event.event;
  const paymentEntity = event.payload?.payment?.entity;
  let recordedPaymentId = already?.paymentId || null;
  if (type === "payment.captured" || type === "order.paid") {
    const orderId = paymentEntity?.order_id || event.payload?.order?.entity?.id;
    const rzpPaymentId = paymentEntity?.id;
    if (!orderId) {
      if (!already) {
        await WebhookEvent.create({
          provider: "razorpay",
          eventId: String(eventId),
          eventType: type || ""
        });
      }
      return { ok: true, ignored: true, duplicate: Boolean(already) };
    }
    const payment = await Payment.findOne({ razorpayOrderId: orderId });
    if (!payment) {
      razorpay.logBilling("webhook_unknown_order", { orderId, eventType: type });
      if (!already) {
        await WebhookEvent.create({
          provider: "razorpay",
          eventId: String(eventId),
          eventType: type || ""
        });
      }
      return { ok: true, ignored: true, duplicate: Boolean(already) };
    }
    await fulfillSuccessfulPayment({
      payment,
      razorpayPaymentId: rzpPaymentId,
      razorpayOrderId: orderId
    });
    recordedPaymentId = payment._id;
  } else if (type === "payment.failed") {
    const orderId = paymentEntity?.order_id;
    const payment = orderId ? await Payment.findOne({ razorpayOrderId: orderId }) : null;
    if (payment) {
      await markPaymentFailed({
        payment,
        failureCode: paymentEntity?.error_code || "",
        failureReason: paymentEntity?.error_description || "Payment failed"
      });
      recordedPaymentId = payment._id;
    }
  } else {
    razorpay.logBilling("webhook_ignored", { eventType: type });
  }

  if (!already) {
    await WebhookEvent.create({
      provider: "razorpay",
      eventId: String(eventId),
      eventType: type || "",
      paymentId: recordedPaymentId
    });
  }
  return { ok: true, duplicate: Boolean(already) };
}

async function recordPayment({ schoolId, actorId, payload }) {
  const payment = await Payment.create({
    schoolId,
    planId: payload.planId || null,
    amount: payload.amount,
    currency: payload.currency || "INR",
    status: payload.status,
    provider: payload.provider || "manual",
    providerPaymentId: payload.providerPaymentId,
    billedForInterval: payload.billedForInterval || "",
    periodStart: payload.periodStart || null,
    periodEnd: payload.periodEnd || null,
    metadata: payload.metadata || {}
  });

  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.PAYMENT_EVENT,
    entityType: "Payment",
    entityId: payment._id,
    metadata: { status: payment.status, amount: payment.amount }
  });

  return payment;
}

async function listPayments() {
  return Payment.find({})
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("schoolId", "name schoolCode")
    .populate("planId", "name billingCycle interval")
    .populate("subscriptionId", "status expiryDate billingCycle");
}

async function billingOverview() {
  await refreshExpiredSubscriptions();
  const now = new Date();
  const inTwoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [
    totalSchools,
    activeSubscriptions,
    expiredSubscriptions,
    pendingSubscriptions,
    pendingPayments,
    successfulPayments,
    failedPayments,
    upcomingRenewals,
    monthlyActive,
    yearlyActive
  ] = await Promise.all([
    School.countDocuments(),
    SchoolSubscription.countDocuments({ status: SUBSCRIPTION_STATUS.ACTIVE }),
    SchoolSubscription.countDocuments({ status: SUBSCRIPTION_STATUS.EXPIRED }),
    SchoolSubscription.countDocuments({ status: SUBSCRIPTION_STATUS.PENDING }),
    Payment.countDocuments({ status: PAYMENT_STATUS.PENDING }),
    Payment.countDocuments({ status: PAYMENT_STATUS.SUCCEEDED }),
    Payment.countDocuments({ status: PAYMENT_STATUS.FAILED }),
    SchoolSubscription.countDocuments({
      status: SUBSCRIPTION_STATUS.ACTIVE,
      expiryDate: { $gte: now, $lte: inTwoWeeks }
    }),
    SchoolSubscription.countDocuments({
      status: SUBSCRIPTION_STATUS.ACTIVE,
      billingCycle: BILLING_INTERVAL.MONTHLY
    }),
    SchoolSubscription.countDocuments({
      status: SUBSCRIPTION_STATUS.ACTIVE,
      billingCycle: BILLING_INTERVAL.YEARLY
    })
  ]);

  return {
    totalSchools,
    activeSubscriptions,
    expiredSubscriptions,
    pendingSubscriptions,
    pendingPayments,
    successfulPayments,
    failedPayments,
    upcomingRenewals,
    monthlyActive,
    yearlyActive
  };
}

async function evaluateAccess(schoolId) {
  await refreshExpiredSubscriptions();
  const sub = await SchoolSubscription.findOne({ schoolId });
  const allowed = subscriptionIsActive(sub);
  const enforcing = enforcementEnabled();
  return {
    enforcementEnabled: enforcing,
    allowed: enforcing ? allowed : true,
    wouldAllow: allowed,
    status: sub?.status || SUBSCRIPTION_STATUS.NONE
  };
}

module.exports = {
  createPlan,
  listPlans,
  assignPlan,
  provisionSchoolPlan,
  getOrCreateSchoolSubscription,
  recordPayment,
  listPayments,
  presentPlan,
  presentPayment,
  getSchoolBilling,
  createCheckout,
  verifyCheckout,
  cancelCheckout,
  handleWebhook,
  fulfillSuccessfulPayment,
  markPaymentFailed,
  billingOverview,
  evaluateAccess,
  refreshExpiredSubscriptions,
  enforcementEnabled,
  subscriptionIsActive,
  addBillingCycle
};
