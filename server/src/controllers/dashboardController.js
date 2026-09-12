const asyncHandler = require("../utils/asyncHandler");
const dashboardService = require("../services/dashboardService");

const schoolDashboard = asyncHandler(async (req, res) => {
  const dashboard = await dashboardService.getSchoolDashboard(req.schoolId);
  res.json({ ok: true, dashboard });
});

const platformOverview = asyncHandler(async (req, res) => {
  const overview = await dashboardService.getPlatformOverview();
  res.json({ ok: true, overview });
});

module.exports = { schoolDashboard, platformOverview };
