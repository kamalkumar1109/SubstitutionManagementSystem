const express = require("express");
const { authenticate, requireRoles } = require("../middleware/auth");
const { USER_ROLES } = require("../config/constants");
const { enquiryLimiter } = require("../middleware/limiters");
const enquiryController = require("../controllers/enquiryController");

const router = express.Router();

router.post("/", enquiryLimiter, enquiryController.create);
router.get(
  "/",
  authenticate,
  requireRoles(USER_ROLES.SUPER_ADMIN),
  enquiryController.list
);

router.patch(
  "/:enquiryId",
  authenticate,
  requireRoles(USER_ROLES.SUPER_ADMIN),
  enquiryController.updateStatus
);

module.exports = router;
