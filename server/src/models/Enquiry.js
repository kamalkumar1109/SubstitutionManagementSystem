const mongoose = require("mongoose");
const { ENQUIRY_STATUS } = require("../config/constants");

const { Schema } = mongoose;

const enquirySchema = new Schema(
  {
    schoolName: { type: String, default: "", trim: true, maxlength: 200 },
    contactPerson: { type: String, default: "", trim: true, maxlength: 160 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, default: "", trim: true, maxlength: 40 },
    numberOfTeachers: { type: Number, default: null, min: 0, max: 100000 },
    message: { type: String, default: "", trim: true, maxlength: 4000 },
    status: {
      type: String,
      enum: Object.values(ENQUIRY_STATUS),
      default: ENQUIRY_STATUS.NEW,
      index: true
    },
    source: { type: String, default: "website", trim: true }
  },
  { timestamps: true }
);

enquirySchema.index({ createdAt: -1 });
enquirySchema.index({ email: 1, createdAt: -1 });

module.exports = mongoose.model("Enquiry", enquirySchema);
