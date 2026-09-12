const { env } = require("../config/env");

function skipInTests(req, res) {
  if (env.NODE_ENV === "test") return true;
  if (req.headers["x-sms-test"] === "1") return true;
  return false;
}

module.exports = { skipInTests };
