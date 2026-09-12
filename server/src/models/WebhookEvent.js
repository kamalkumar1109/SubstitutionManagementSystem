const mongoose = require("mongoose");

const { Schema } = mongoose;

const webhookEventSchema = new Schema(
  {
    provider: { type: String, required: true, trim: true },
    eventId: { type: String, required: true, trim: true },
    eventType: { type: String, default: "", trim: true },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment", default: null }
  },
  { timestamps: true }
);

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

module.exports = mongoose.model("WebhookEvent", webhookEventSchema);
