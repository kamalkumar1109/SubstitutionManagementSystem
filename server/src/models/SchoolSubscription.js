const mongoose = require("mongoose");
const { SUBSCRIPTION_STATUS, BILLING_INTERVAL, PAYMENT_STATUS } = require("../config/constants");

const { Schema } = mongoose;

const schoolSubscriptionSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, unique: true, index: true },
    planId: { type: Schema.Types.ObjectId, ref: "SubscriptionPlan", default: null },
    status: {
      type: String,
      enum: Object.values(SUBSCRIPTION_STATUS),
      default: SUBSCRIPTION_STATUS.NONE,
      index: true
    },
    startDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null },
    billingCycle: {
      type: String,
      enum: Object.values(BILLING_INTERVAL),
      default: undefined
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.PENDING
    },
    razorpayCustomerId: { type: String, default: "", trim: true },
    razorpaySubscriptionId: { type: String, default: "", trim: true },
    lastRazorpayOrderId: { type: String, default: "", trim: true },
    lastPaymentId: { type: Schema.Types.ObjectId, ref: "Payment", default: null }
  },
  { timestamps: true }
);

schoolSubscriptionSchema.index({ status: 1, expiryDate: 1 });
schoolSubscriptionSchema.index({ expiryDate: 1 });

module.exports = mongoose.model("SchoolSubscription", schoolSubscriptionSchema);
