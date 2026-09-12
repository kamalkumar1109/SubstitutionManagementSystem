const crypto = require("crypto");
const { env } = require("../config/env");
const { AppError } = require("../utils/AppError");

function configured() {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

function publicKeyId() {
  return env.RAZORPAY_KEY_ID || "";
}

function useStub() {
  return env.NODE_ENV === "test" || process.env.RAZORPAY_STUB === "true";
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function signPayload(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  if (!env.RAZORPAY_KEY_SECRET) {
    throw AppError.badRequest("Payment gateway is not configured");
  }
  const expected = signPayload(`${orderId}|${paymentId}`, env.RAZORPAY_KEY_SECRET);
  if (!timingSafeEqual(expected, signature)) {
    throw AppError.badRequest("Payment signature could not be verified");
  }
  return true;
}

function verifyWebhookSignature(rawBody, signature) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw AppError.badRequest("Webhook secret is not configured");
  }
  const expected = signPayload(rawBody, env.RAZORPAY_WEBHOOK_SECRET);
  if (!timingSafeEqual(expected, signature)) {
    throw AppError.badRequest("Webhook signature could not be verified");
  }
  return true;
}

async function createOrder({ amountPaise, currency, receipt, notes }) {
  if (useStub()) {
    if (!configured() && env.NODE_ENV !== "test") {
      throw AppError.badRequest("Payment gateway is not configured");
    }
    return {
      id: `order_stub_${receipt}`,
      amount: amountPaise,
      currency,
      status: "created",
      receipt,
      notes: notes || {}
    };
  }

  if (!configured()) {
    throw AppError.badRequest("Payment gateway is not configured");
  }

  const Razorpay = require("razorpay");
  const client = new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET
  });

  return client.orders.create({
    amount: amountPaise,
    currency,
    receipt,
    notes: notes || {},
    payment_capture: 1
  });
}

function logBilling(event, fields) {
  const safe = { ...fields };
  delete safe.signature;
  delete safe.secret;
  delete safe.keySecret;
  delete safe.card;
  delete safe.cvv;
  console.log("[billing]", event, safe);
}

module.exports = {
  configured,
  publicKeyId,
  useStub,
  signPayload,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  createOrder,
  logBilling
};
