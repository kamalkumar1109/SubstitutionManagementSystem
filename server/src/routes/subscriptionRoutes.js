const express = require("express");
const { authenticate, requireRoles } = require("../middleware/auth");
const { schoolScope } = require("../middleware/schoolScope");
const { USER_ROLES } = require("../config/constants");
const subscriptionController = require("../controllers/subscriptionController");

const router = express.Router();

router.get("/config", authenticate, subscriptionController.publicConfig);
router.get("/plans", authenticate, subscriptionController.listPlans);
router.post(
  "/plans",
  authenticate,
  requireRoles(USER_ROLES.SUPER_ADMIN),
  subscriptionController.createPlan
);
router.get(
  "/overview",
  authenticate,
  requireRoles(USER_ROLES.SUPER_ADMIN),
  subscriptionController.overview
);
router.get(
  "/current",
  authenticate,
  schoolScope,
  subscriptionController.current
);
router.post(
  "/checkout",
  authenticate,
  schoolScope,
  requireRoles(USER_ROLES.SCHOOL_ADMIN),
  subscriptionController.checkout
);
router.post(
  "/verify",
  authenticate,
  schoolScope,
  requireRoles(USER_ROLES.SCHOOL_ADMIN),
  subscriptionController.verify
);
router.post(
  "/checkout/cancel",
  authenticate,
  schoolScope,
  requireRoles(USER_ROLES.SCHOOL_ADMIN),
  subscriptionController.cancelCheckout
);
router.post(
  "/assign",
  authenticate,
  schoolScope,
  requireRoles(USER_ROLES.SUPER_ADMIN),
  subscriptionController.assignPlan
);
router.get(
  "/payments",
  authenticate,
  requireRoles(USER_ROLES.SUPER_ADMIN),
  subscriptionController.listPayments
);
router.post(
  "/payments",
  authenticate,
  schoolScope,
  requireRoles(USER_ROLES.SUPER_ADMIN),
  subscriptionController.recordPayment
);

module.exports = router;
