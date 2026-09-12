const { AppError } = require("../utils/AppError");

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      details: err.details || undefined
    });
  }

  if (err.name === "ValidationError") {
    return res.status(400).json({ error: err.message });
  }

  if (err.code === 11000) {
    return res.status(409).json({ error: "Duplicate record", details: err.keyValue });
  }

  console.error("[SMS]", err);
  return res.status(500).json({ error: "Internal server error" });
}

module.exports = { errorHandler };
