const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function requiredInProduction(name, fallback) {
  const value = process.env[name] || fallback;
  if (process.env.NODE_ENV === "production" && !process.env[name]) {
    throw new Error(`${name} must be set in production`);
  }
  return value;
}

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT) || 5050,
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/sms",
  JWT_SECRET: requiredInProduction("JWT_SECRET", "dev-only-jwt-secret-change-me"),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  SUPER_ADMIN_EMAIL: process.env.SUPER_ADMIN_EMAIL || "",
  SUPER_ADMIN_PASSWORD: process.env.SUPER_ADMIN_PASSWORD || "",
  SUPER_ADMIN_NAME: process.env.SUPER_ADMIN_NAME || "Platform Owner",
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || "",
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || "",
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || "",
  SUBSCRIPTION_ENFORCEMENT: String(process.env.SUBSCRIPTION_ENFORCEMENT || "").toLowerCase() === "true"
};

module.exports = { env };
