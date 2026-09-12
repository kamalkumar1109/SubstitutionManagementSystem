const asyncHandler = require("../utils/asyncHandler");
const adminPlatformService = require("../services/adminPlatformService");
const reviewService = require("../services/reviewService");
const subscriptionService = require("../services/subscriptionService");

const overview = asyncHandler(async (req, res) => {
  const overview = await adminPlatformService.getPlatformOverview();
  res.json({ ok: true, overview });
});

const listSchools = asyncHandler(async (req, res) => {
  const schools = await adminPlatformService.listAdminSchools();
  res.json({ ok: true, schools });
});

const createSchool = asyncHandler(async (req, res) => {
  const details = await adminPlatformService.createAdminSchool(req.body || {}, req.user._id);
  res.status(201).json({ ok: true, ...details });
});

const getSchool = asyncHandler(async (req, res) => {
  const details = await adminPlatformService.getAdminSchool(req.params.schoolId);
  res.json({ ok: true, ...details });
});

const updateSchool = asyncHandler(async (req, res) => {
  const details = await adminPlatformService.updateAdminSchool(
    req.params.schoolId,
    req.body || {},
    req.user._id
  );
  res.json({ ok: true, ...details });
});

const activateSchool = asyncHandler(async (req, res) => {
  const details = await adminPlatformService.setSchoolActive(req.params.schoolId, true, req.user._id);
  res.json({ ok: true, ...details });
});

const deactivateSchool = asyncHandler(async (req, res) => {
  const details = await adminPlatformService.setSchoolActive(req.params.schoolId, false, req.user._id);
  res.json({ ok: true, ...details });
});

const listSubscriptions = asyncHandler(async (req, res) => {
  const subscriptions = await adminPlatformService.listAdminSubscriptions(req.query.status);
  res.json({ ok: true, subscriptions });
});

const listPayments = asyncHandler(async (req, res) => {
  const payments = await adminPlatformService.listAdminPayments();
  res.json({ ok: true, payments });
});

const listEnquiries = asyncHandler(async (req, res) => {
  const enquiries = await enquiryService.listEnquiries();
  res.json({ ok: true, enquiries });
});

const updateEnquiry = asyncHandler(async (req, res) => {
  const enquiry = await enquiryService.updateEnquiryStatus(req.params.enquiryId, req.body.status);
  res.json({ ok: true, enquiry });
});

const listReviews = asyncHandler(async (req, res) => {
  const reviews = await reviewService.listAllForAdmin();
  res.json({ ok: true, reviews });
});

const updateReview = asyncHandler(async (req, res) => {
  const review = await reviewService.setPublished({
    reviewId: req.params.reviewId,
    published: req.body.published,
    actorId: req.user._id
  });
  res.json({ ok: true, review });
});

const listPlans = asyncHandler(async (req, res) => {
  const plans = await subscriptionService.listPlans({ includeInactive: true });
  res.json({ ok: true, plans });
});

const createPlan = asyncHandler(async (req, res) => {
  const plan = await subscriptionService.createPlan(req.body);
  res.status(201).json({ ok: true, plan: subscriptionService.presentPlan(plan) });
});

const settings = asyncHandler(async (req, res) => {
  res.json({
    ok: true,
    settings: adminPlatformService.platformSettings(),
    admin: { name: req.user.name, email: req.user.email, role: req.user.role }
  });
});

module.exports = {
  overview,
  listSchools,
  createSchool,
  getSchool,
  updateSchool,
  activateSchool,
  deactivateSchool,
  listSubscriptions,
  listPayments,
  listEnquiries,
  updateEnquiry,
  listReviews,
  updateReview,
  listPlans,
  createPlan,
  settings
};
