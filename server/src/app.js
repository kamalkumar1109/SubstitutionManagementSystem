const express = require("express");
const cors = require("cors");

const { errorHandler } = require("./middleware/errorHandler");
const authRoutes = require("./routes/authRoutes");
const schoolRoutes = require("./routes/schoolRoutes");
const academicSessionRoutes = require("./routes/academicSessionRoutes");
const catalogRoutes = require("./routes/catalogRoutes");
const teacherRoutes = require("./routes/teacherRoutes");
const timetableRoutes = require("./routes/timetableRoutes");
const dailyStatusRoutes = require("./routes/dailyStatusRoutes");
const substitutionRoutes = require("./routes/substitutionRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const enquiryRoutes = require("./routes/enquiryRoutes");
const adminRoutes = require("./routes/adminRoutes");
const systemRoutes = require("./routes/systemRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const subscriptionController = require("./controllers/subscriptionController");

const legacyAttendanceRoutes = require("../routes/attendanceRoutes");
const legacySubstitutionRoutes = require("../routes/substitutionRoutes");

function createApp() {
  const app = express();
  app.use(cors());
  app.post(
    "/api/billing/webhooks/razorpay",
    express.raw({ type: "application/json" }),
    subscriptionController.webhook
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (req, res) => res.json({ ok: true, api: "legacy+saas" }));

  app.use("/api", systemRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/schools", schoolRoutes);
  app.use("/api/academic-sessions", academicSessionRoutes);
  app.use("/api/catalog", catalogRoutes);
  app.use("/api/teachers", teacherRoutes);
  app.use("/api/timetables", timetableRoutes);
  app.use("/api/daily-status", dailyStatusRoutes);
  app.use("/api/substitutions", substitutionRoutes);
  app.use("/api/billing", subscriptionRoutes);
  app.use("/api/enquiries", enquiryRoutes);
  app.use("/api/reviews", reviewRoutes);
  app.use("/api/admin", adminRoutes);

  app.use(legacyAttendanceRoutes);
  app.use(legacySubstitutionRoutes);

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
