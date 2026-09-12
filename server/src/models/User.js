const mongoose = require("mongoose");
const { USER_ROLES } = require("../config/constants");

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "School",
      default: null,
      index: true
    },
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true
    },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      required: true,
      index: true
    },
    active: { type: Boolean, default: true, index: true },
    lastLogin: { type: Date, default: null }
  },
  { timestamps: true }
);

userSchema.index({ schoolId: 1, role: 1 });

userSchema.pre("validate", function validateSchoolBinding() {
  if (this.role === USER_ROLES.SCHOOL_ADMIN && !this.schoolId) {
    throw new Error("SCHOOL_ADMIN must belong to exactly one school");
  }
  if (this.role === USER_ROLES.SUPER_ADMIN && this.schoolId) {
    throw new Error("SUPER_ADMIN must not be bound to a single school");
  }
});

module.exports = mongoose.model("User", userSchema);
