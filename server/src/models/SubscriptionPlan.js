const mongoose = require("mongoose");
const { BILLING_INTERVAL } = require("../config/constants");

const { Schema } = mongoose;

const subscriptionPlanSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, default: "", trim: true },
    billingCycle: {
      type: String,
      enum: Object.values(BILLING_INTERVAL),
      required: true
    },
    interval: {
      type: String,
      enum: Object.values(BILLING_INTERVAL)
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, trim: true, uppercase: true, default: "INR" },
    active: { type: Boolean, default: true },
    razorpayPlanId: { type: String, default: "", trim: true },
    razorpayProductId: { type: String, default: "", trim: true },
    features: [{ type: String, trim: true }],
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

subscriptionPlanSchema.pre("validate", function syncCycle() {
  const cycle = this.billingCycle || this.interval;
  this.billingCycle = cycle;
  this.interval = cycle;
});

subscriptionPlanSchema.index({ active: 1, billingCycle: 1 });

module.exports = mongoose.model("SubscriptionPlan", subscriptionPlanSchema);
