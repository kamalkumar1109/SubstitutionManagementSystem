process.env.MONGODB_URI =
  process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017/sms_billing_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "billing-test-secret";
process.env.NODE_ENV = "test";
process.env.RAZORPAY_KEY_ID = "rzp_test_sms";
process.env.RAZORPAY_KEY_SECRET = "test_secret_sms";
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test";
process.env.SUBSCRIPTION_ENFORCEMENT = "false";

const http = require("http");
const { connectDb, disconnectDb } = require("../config/db");
const { createApp } = require("../app");
const { School, User, SchoolSubscription, Payment, SubscriptionPlan, WebhookEvent } = require("../models");
const { hashPassword } = require("../utils/password");
const { USER_ROLES, SUBSCRIPTION_STATUS, PAYMENT_STATUS } = require("../config/constants");
const { signPayload } = require("../services/razorpayGateway");
const { addBillingCycle } = require("../services/subscriptionService");

function assert(cond, message) {
  if (!cond) throw new Error(`Assertion failed: ${message}`);
}

function request(server, { method, path, body, token, schoolId, raw, headers }) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const payload = raw ? raw : body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: addr.port,
        path,
        method,
        headers: {
          ...(raw ? { "Content-Type": "application/json" } : { "Content-Type": "application/json" }),
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(schoolId ? { "X-School-Id": String(schoolId) } : {}),
          ...(headers || {})
        }
      },
      (res) => {
        let data = "";
        res.on("data", (c) => {
          data += c;
        });
        res.on("end", () => {
          let json = {};
          try {
            json = data ? JSON.parse(data) : {};
          } catch {
            json = { raw: data };
          }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  await connectDb();
  await Payment.collection.dropIndexes().catch(() => {});
  await Promise.all([
    School.deleteMany({}),
    User.deleteMany({}),
    SchoolSubscription.deleteMany({}),
    Payment.deleteMany({}),
    SubscriptionPlan.deleteMany({}),
    WebhookEvent.deleteMany({})
  ]);

  const school = await School.create({
    name: "Billing School",
    schoolCode: `BILL${Date.now()}`,
    email: "billing-school@school.test"
  });
  const admin = await User.create({
    schoolId: school._id,
    name: "School Admin",
    email: `billing-admin-${Date.now()}@school.test`,
    passwordHash: await hashPassword("password123"),
    role: USER_ROLES.SCHOOL_ADMIN
  });
  const owner = await User.create({
    name: "Owner",
    email: `billing-owner-${Date.now()}@sms.test`,
    passwordHash: await hashPassword("password123"),
    role: USER_ROLES.SUPER_ADMIN
  });

  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  async function login(email, role) {
    const res = await request(server, {
      method: "POST",
      path: "/api/auth/login",
      body: { loginId: email, password: "password123", expectedRole: role }
    });
    assert(res.status === 200, `login ${email}`);
    return res.json.token;
  }

  const schoolToken = await login(admin.email, USER_ROLES.SCHOOL_ADMIN);
  const ownerToken = await login(owner.email, USER_ROLES.SUPER_ADMIN);

  const emptyPlans = await request(server, {
    method: "GET",
    path: "/api/billing/plans",
    token: schoolToken
  });
  assert(emptyPlans.status === 200 && (emptyPlans.json.plans || []).length === 0, "no hardcoded plans");

  const createdMonthly = await request(server, {
    method: "POST",
    path: "/api/billing/plans",
    token: ownerToken,
    body: { name: "Configured monthly", billingCycle: "MONTHLY", amount: 100, currency: "INR" }
  });
  assert(createdMonthly.status === 201, "admin can configure a monthly plan");
  const monthly = createdMonthly.json.plan;

  const createdYearly = await request(server, {
    method: "POST",
    path: "/api/billing/plans",
    token: ownerToken,
    body: { name: "Configured yearly", billingCycle: "YEARLY", amount: 1000, currency: "INR" }
  });
  assert(createdYearly.status === 201, "admin can configure a yearly plan");

  const current = await request(server, {
    method: "GET",
    path: "/api/billing/current",
    token: schoolToken
  });
  assert(current.status === 200, "school billing page loads");
  assert(current.json.subscription.status === SUBSCRIPTION_STATUS.NONE, "new school has no subscription");
  assert(current.json.access.enforcementEnabled === false, "enforcement is off by default");
  assert(current.json.access.allowed === true, "development access is not locked");

  const checkout = await request(server, {
    method: "POST",
    path: "/api/billing/checkout",
    token: schoolToken,
    body: { planId: monthly._id }
  });
  assert(checkout.status === 201, "checkout creates a Razorpay order");
  assert(checkout.json.checkout.orderId, "order id is returned");
  assert(checkout.json.checkout.amount === 100, "amount comes from the configured plan");
  assert(!JSON.stringify(checkout.json).includes("test_secret_sms"), "secret is not sent to the client");

  const pendingPay = await Payment.findOne({ schoolId: school._id });
  assert(pendingPay.status === PAYMENT_STATUS.PENDING, "payment starts pending");

  const badSig = await request(server, {
    method: "POST",
    path: "/api/billing/verify",
    token: schoolToken,
    body: {
      razorpay_order_id: checkout.json.checkout.orderId,
      razorpay_payment_id: "pay_fail",
      razorpay_signature: "deadbeef"
    }
  });
  assert(badSig.status === 400, "invalid signature is rejected");

  const rzpPaymentId = "pay_ok_1";
  const signature = signPayload(
    `${checkout.json.checkout.orderId}|${rzpPaymentId}`,
    process.env.RAZORPAY_KEY_SECRET
  );
  const verified = await request(server, {
    method: "POST",
    path: "/api/billing/verify",
    token: schoolToken,
    body: {
      razorpay_order_id: checkout.json.checkout.orderId,
      razorpay_payment_id: rzpPaymentId,
      razorpay_signature: signature
    }
  });
  assert(verified.status === 200, "verified payment succeeds");
  assert(verified.json.subscription.status === SUBSCRIPTION_STATUS.ACTIVE, "subscription is activated");
  assert(verified.json.payment.status === PAYMENT_STATUS.SUCCEEDED, "payment is succeeded");

  const dup = await request(server, {
    method: "POST",
    path: "/api/billing/verify",
    token: schoolToken,
    body: {
      razorpay_order_id: checkout.json.checkout.orderId,
      razorpay_payment_id: rzpPaymentId,
      razorpay_signature: signature
    }
  });
  assert(dup.status === 200 && dup.json.duplicate === true, "duplicate verify is idempotent");
  const payCount = await Payment.countDocuments({
    schoolId: school._id,
    status: PAYMENT_STATUS.SUCCEEDED
  });
  assert(payCount === 1, "duplicate verify does not create another successful payment");

  const firstExpiry = new Date(verified.json.subscription.expiryDate).getTime();
  const renewCheckout = await request(server, {
    method: "POST",
    path: "/api/billing/checkout",
    token: schoolToken,
    body: { planId: monthly._id }
  });
  const renewPayId = "pay_ok_2";
  const renewSig = signPayload(
    `${renewCheckout.json.checkout.orderId}|${renewPayId}`,
    process.env.RAZORPAY_KEY_SECRET
  );
  const renewed = await request(server, {
    method: "POST",
    path: "/api/billing/verify",
    token: schoolToken,
    body: {
      razorpay_order_id: renewCheckout.json.checkout.orderId,
      razorpay_payment_id: renewPayId,
      razorpay_signature: renewSig
    }
  });
  assert(renewed.status === 200, "renewal payment succeeds");
  assert(
    new Date(renewed.json.subscription.expiryDate).getTime() > firstExpiry,
    "renewal extends expiry"
  );

  const failCheckout = await request(server, {
    method: "POST",
    path: "/api/billing/checkout",
    token: schoolToken,
    body: { planId: createdYearly.json.plan._id }
  });
  const failBody = JSON.stringify({
    event: "payment.failed",
    payload: {
      payment: {
        entity: {
          id: "pay_fail_1",
          order_id: failCheckout.json.checkout.orderId,
          error_code: "BAD_REQUEST_ERROR",
          error_description: "Payment failed"
        }
      }
    }
  });
  const failHook = await request(server, {
    method: "POST",
    path: "/api/billing/webhooks/razorpay",
    raw: failBody,
    headers: { "x-razorpay-signature": signPayload(failBody, process.env.RAZORPAY_WEBHOOK_SECRET) }
  });
  assert(failHook.status === 200, "failed webhook is accepted");
  const failed = await Payment.findOne({ razorpayOrderId: failCheckout.json.checkout.orderId });
  assert(failed.status === PAYMENT_STATUS.FAILED, "failed webhook marks the payment failed");

  const hookCheckout = await request(server, {
    method: "POST",
    path: "/api/billing/checkout",
    token: schoolToken,
    body: { planId: monthly._id }
  });
  assert(hookCheckout.status === 201, `webhook checkout: ${JSON.stringify(hookCheckout.json)}`);
  const capturedBody = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_hook_1",
          order_id: hookCheckout.json.checkout.orderId,
          status: "captured"
        }
      }
    }
  });
  const hookSig = signPayload(capturedBody, process.env.RAZORPAY_WEBHOOK_SECRET);
  const hook1 = await request(server, {
    method: "POST",
    path: "/api/billing/webhooks/razorpay",
    raw: capturedBody,
    headers: {
      "x-razorpay-signature": hookSig,
      "x-razorpay-event-id": "evt_1"
    }
  });
  assert(hook1.status === 200, "captured webhook activates payment");
  const hook2 = await request(server, {
    method: "POST",
    path: "/api/billing/webhooks/razorpay",
    raw: capturedBody,
    headers: {
      "x-razorpay-signature": hookSig,
      "x-razorpay-event-id": "evt_1"
    }
  });
  assert(hook2.json.duplicate === true, "duplicate webhook is ignored");

  const sub = await SchoolSubscription.findOne({ schoolId: school._id });
  sub.expiryDate = new Date(Date.now() - 60 * 1000);
  sub.status = SUBSCRIPTION_STATUS.ACTIVE;
  await sub.save();
  const expiredView = await request(server, {
    method: "GET",
    path: "/api/billing/current",
    token: schoolToken
  });
  assert(expiredView.json.subscription.status === SUBSCRIPTION_STATUS.EXPIRED, "expired subscriptions are marked");

  process.env.SUBSCRIPTION_ENFORCEMENT = "true";
  const blocked = await request(server, {
    method: "GET",
    path: "/api/teachers",
    token: schoolToken
  });
  assert(blocked.status === 402, "enforcement can restrict expired schools");
  process.env.SUBSCRIPTION_ENFORCEMENT = "false";
  const open = await request(server, {
    method: "GET",
    path: "/api/teachers",
    token: schoolToken
  });
  assert(open.status === 200, "with enforcement off, expired schools stay usable");

  const overview = await request(server, {
    method: "GET",
    path: "/api/billing/overview",
    token: ownerToken
  });
  assert(overview.status === 200, "admin billing overview loads");
  assert(overview.json.overview.totalSchools >= 1, "overview counts schools");
  assert(overview.json.overview.successfulPayments >= 1, "overview counts successful payments");

  const expected = addBillingCycle(new Date("2026-01-15T00:00:00.000Z"), "MONTHLY");
  assert(expected.getMonth() === 1, "monthly cycle advances one month");

  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await disconnectDb();
  console.log("[billing] all checks passed");
}

run().catch(async (err) => {
  console.error("[billing] FAILED:", err);
  try {
    await disconnectDb();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
