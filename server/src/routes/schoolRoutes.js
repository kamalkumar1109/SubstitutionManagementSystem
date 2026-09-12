const express = require("express");
const { authenticate, requireRoles } = require("../middleware/auth");
const { schoolScope } = require("../middleware/schoolScope");
const { USER_ROLES } = require("../config/constants");
const schoolController = require("../controllers/schoolController");
const dashboardController = require("../controllers/dashboardController");
const authController = require("../controllers/authController");

const router = express.Router();

router.get(
  "/",
  authenticate,
  requireRoles(USER_ROLES.SUPER_ADMIN),
  schoolController.list
);
router.get("/current", authenticate, schoolScope, schoolController.getOne);
router.get(
  "/current/dashboard",
  authenticate,
  requireRoles(USER_ROLES.SCHOOL_ADMIN, USER_ROLES.SUPER_ADMIN),
  schoolScope,
  dashboardController.schoolDashboard
);
router.patch("/current", authenticate, schoolScope, schoolController.update);
router.post(
  "/current/users",
  authenticate,
  schoolScope,
  requireRoles(USER_ROLES.SUPER_ADMIN, USER_ROLES.SCHOOL_ADMIN),
  authController.createUser
);

module.exports = router;
