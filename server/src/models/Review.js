const mongoose = require("mongoose");

const { Schema } = mongoose;

const reviewSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, unique: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    reviewMessage: { type: String, required: true, trim: true },
    published: { type: Boolean, default: true, index: true },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Review", reviewSchema);
