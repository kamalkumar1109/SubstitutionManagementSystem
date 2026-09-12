const mongoose = require("mongoose");
const { SUBSCRIPTION_STATUS, BILLING_INTERVAL } = require("../config/constants");

const { Schema } = mongoose;

const subscriptionSchema = new Schema(
  {
    planId: { type: Schema.Types.ObjectId, ref: "SubscriptionPlan", default: null },
    status: {
      type: String,
      enum: Object.values(SUBSCRIPTION_STATUS),
      default: SUBSCRIPTION_STATUS.NONE
    },
    billingInterval: {
      type: String,
      enum: Object.values(BILLING_INTERVAL)
    },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    trialEndsAt: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    provider: { type: String, default: null, trim: true },
    providerCustomerId: { type: String, default: null, trim: true },
    providerSubscriptionId: { type: String, default: null, trim: true },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { _id: false }
);

const schoolSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    schoolCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true
    },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, default: "", trim: true },
    address: { type: String, default: "", trim: true },
    logo: { type: String, default: "", trim: true },
    timezone: { type: String, default: "Asia/Kolkata", trim: true },
    active: { type: Boolean, default: true, index: true },
    currentAcademicSession: {
      type: Schema.Types.ObjectId,
      ref: "AcademicSession",
      default: null
    },
    subscription: { type: subscriptionSchema, default: () => ({}) }
  },
  { timestamps: true }
);

schoolSchema.index({ email: 1 });
schoolSchema.index({ active: 1, schoolCode: 1 });

module.exports = mongoose.model("School", schoolSchema);
