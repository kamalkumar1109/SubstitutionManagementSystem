const mongoose = require("mongoose");
const { PAYMENT_STATUS, BILLING_INTERVAL } = require("../config/constants");

const { Schema } = mongoose;

const paymentSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: "SchoolSubscription", default: null, index: true },
    planId: { type: Schema.Types.ObjectId, ref: "SubscriptionPlan", default: null },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, trim: true, uppercase: true },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.PENDING,
      index: true
    },
    paidAt: { type: Date, default: null },
    receipt: { type: String, default: "", trim: true },
    provider: { type: String, default: "razorpay", trim: true },
    razorpayOrderId: { type: String, default: "", trim: true, index: true },
    razorpayPaymentId: { type: String, default: "", trim: true },
    razorpaySubscriptionId: { type: String, default: "", trim: true },
    providerPaymentId: { type: String, default: "", trim: true },
    billedForInterval: {
      type: String,
      enum: [...Object.values(BILLING_INTERVAL), ""],
      default: ""
    },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    failureCode: { type: String, default: "", trim: true },
    failureReason: { type: String, default: "", trim: true },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

paymentSchema.index({ schoolId: 1, createdAt: -1 });
paymentSchema.index(
  { razorpayPaymentId: 1 },
  { unique: true, partialFilterExpression: { razorpayPaymentId: { $type: "string", $gt: "" } } }
);
paymentSchema.index(
  { providerPaymentId: 1 },
  { unique: true, partialFilterExpression: { providerPaymentId: { $type: "string", $gt: "" } } }
);

paymentSchema.pre("validate", function normalizeEmptyIds() {
  if (this.providerPaymentId === "") this.providerPaymentId = undefined;
  if (this.razorpayPaymentId === "") this.razorpayPaymentId = undefined;
});

module.exports = mongoose.model("Payment", paymentSchema);
