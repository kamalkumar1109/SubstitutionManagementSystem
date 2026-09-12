const express = require("express");
const { authenticate, requireRoles } = require("../middleware/auth");
const { USER_ROLES } = require("../config/constants");
const dashboardController = require("../controllers/dashboardController");
const adminController = require("../controllers/adminController");

const router = express.Router();
router.use(authenticate, requireRoles(USER_ROLES.SUPER_ADMIN));

router.get("/overview", dashboardController.platformOverview);
router.get("/settings", adminController.settings);

router.get("/schools", adminController.listSchools);
router.post("/schools", adminController.createSchool);
router.get("/schools/:schoolId", adminController.getSchool);
router.patch("/schools/:schoolId", adminController.updateSchool);
router.post("/schools/:schoolId/activate", adminController.activateSchool);
router.post("/schools/:schoolId/deactivate", adminController.deactivateSchool);

router.get("/subscriptions", adminController.listSubscriptions);
router.get("/payments", adminController.listPayments);
router.get("/plans", adminController.listPlans);
router.post("/plans", adminController.createPlan);

router.get("/enquiries", adminController.listEnquiries);
router.patch("/enquiries/:enquiryId", adminController.updateEnquiry);
router.get("/reviews", adminController.listReviews);
router.patch("/reviews/:reviewId", adminController.updateReview);

module.exports = router;
