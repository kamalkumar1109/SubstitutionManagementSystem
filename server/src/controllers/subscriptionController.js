const asyncHandler = require("../utils/asyncHandler");
const subscriptionService = require("../services/subscriptionService");
const { USER_ROLES } = require("../config/constants");
const { AppError } = require("../utils/AppError");

const publicConfig = asyncHandler(async (req, res) => {
  const { env } = require("../config/env");
  const razorpay = require("../services/razorpayGateway");
  res.json({
    ok: true,
    keyId: razorpay.publicKeyId(),
    configured: razorpay.configured() || razorpay.useStub(),
    enforcementEnabled: String(process.env.SUBSCRIPTION_ENFORCEMENT || "").toLowerCase() === "true",
    testMode: env.NODE_ENV !== "production"
  });
});

const createPlan = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.SUPER_ADMIN) {
    throw AppError.forbidden("Only SUPER_ADMIN can manage plans");
  }
  const plan = await subscriptionService.createPlan(req.body);
  res.status(201).json({ ok: true, plan: subscriptionService.presentPlan(plan) });
});

const listPlans = asyncHandler(async (req, res) => {
  const plans = await subscriptionService.listPlans({
    includeInactive: req.query.includeInactive === "true" && req.user.role === USER_ROLES.SUPER_ADMIN
  });
  res.json({ ok: true, plans });
});

const current = asyncHandler(async (req, res) => {
  const billing = await subscriptionService.getSchoolBilling({ schoolId: req.schoolId });
  res.json({ ok: true, ...billing });
});

const checkout = asyncHandler(async (req, res) => {
  const session = await subscriptionService.createCheckout({
    schoolId: req.schoolId,
    actorId: req.user._id,
    planId: req.body.planId
  });
  res.status(201).json({ ok: true, checkout: session });
});

const verify = asyncHandler(async (req, res) => {
  const result = await subscriptionService.verifyCheckout({
    schoolId: req.schoolId,
    actorId: req.user._id,
    razorpayOrderId: req.body.razorpay_order_id || req.body.razorpayOrderId,
    razorpayPaymentId: req.body.razorpay_payment_id || req.body.razorpayPaymentId,
    razorpaySignature: req.body.razorpay_signature || req.body.razorpaySignature
  });
  res.json({
    ok: true,
    duplicate: result.duplicate,
    payment: subscriptionService.presentPayment(result.payment),
    subscription: result.subscription
  });
});

const cancelCheckout = asyncHandler(async (req, res) => {
  const payment = await subscriptionService.cancelCheckout({
    schoolId: req.schoolId,
    paymentId: req.body.paymentId
  });
  res.json({ ok: true, payment });
});

const assignPlan = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.SUPER_ADMIN) {
    throw AppError.forbidden("Only SUPER_ADMIN can assign plans");
  }
  const subscription = await subscriptionService.assignPlan({
    schoolId: req.schoolId,
    actorId: req.user._id,
    planId: req.body.planId,
    status: req.body.status,
    trialEndsAt: req.body.trialEndsAt
  });
  res.json({ ok: true, subscription });
});

const recordPayment = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.SUPER_ADMIN) {
    throw AppError.forbidden("Only SUPER_ADMIN can record payments");
  }
  const payment = await subscriptionService.recordPayment({
    schoolId: req.schoolId,
    actorId: req.user._id,
    payload: req.body
  });
  res.status(201).json({ ok: true, payment });
});

const listPayments = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.SUPER_ADMIN) {
    throw AppError.forbidden("Only SUPER_ADMIN can list payments");
  }
  const payments = await subscriptionService.listPayments();
  res.json({ ok: true, payments });
});

const overview = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.SUPER_ADMIN) {
    throw AppError.forbidden("Only SUPER_ADMIN can view billing overview");
  }
  const overview = await subscriptionService.billingOverview();
  res.json({ ok: true, overview });
});

const webhook = asyncHandler(async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  const signature = req.headers["x-razorpay-signature"];
  const eventId = req.headers["x-razorpay-event-id"];
  const result = await subscriptionService.handleWebhook({
    rawBody,
    signature,
    eventIdHeader: eventId
  });
  res.json(result);
});

module.exports = {
  publicConfig,
  createPlan,
  listPlans,
  current,
  checkout,
  verify,
  cancelCheckout,
  assignPlan,
  recordPayment,
  listPayments,
  overview,
  webhook
};
