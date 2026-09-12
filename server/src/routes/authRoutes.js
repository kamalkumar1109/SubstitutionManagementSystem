const express = require("express");
const { authenticate, requireRoles } = require("../middleware/auth");
const { USER_ROLES } = require("../config/constants");
const { loginLimiter } = require("../middleware/limiters");
const authController = require("../controllers/authController");

const router = express.Router();

router.post(
  "/register-school",
  authenticate,
  requireRoles(USER_ROLES.SUPER_ADMIN),
  authController.registerSchool
);
router.post("/login", loginLimiter, authController.login);
router.post("/logout", authController.logout);
router.get("/me", authenticate, authController.me);
router.patch(
  "/email",
  authenticate,
  requireRoles(USER_ROLES.SCHOOL_ADMIN),
  authController.changeEmail
);
router.patch(
  "/password",
  authenticate,
  requireRoles(USER_ROLES.SCHOOL_ADMIN),
  authController.changePassword
);

module.exports = router;
