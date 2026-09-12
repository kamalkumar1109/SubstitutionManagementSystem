const rateLimit = require("express-rate-limit");
const { skipInTests } = require("./rateLimit");

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: { error: "Too many sign-in attempts. Please wait and try again." }
});

const enquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: { error: "Too many enquiries from this address. Please wait and try again." }
});

module.exports = { loginLimiter, enquiryLimiter };
