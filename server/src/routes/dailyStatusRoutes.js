const express = require("express");
const { authenticate } = require("../middleware/auth");
const { schoolScope } = require("../middleware/schoolScope");
const { requireActiveSubscription } = require("../middleware/subscriptionAccess");
const dailyStatusController = require("../controllers/dailyStatusController");

const router = express.Router();
router.use(authenticate, schoolScope, requireActiveSubscription);

router.get("/", dailyStatusController.list);
router.post("/", dailyStatusController.setStatus);

module.exports = router;
