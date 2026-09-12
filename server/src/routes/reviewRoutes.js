const express = require("express");
const { authenticate } = require("../middleware/auth");
const { schoolScope } = require("../middleware/schoolScope");
const { requireActiveSubscription } = require("../middleware/subscriptionAccess");
const reviewController = require("../controllers/reviewController");

const router = express.Router();

router.get("/public", reviewController.publicList);
router.get("/mine", authenticate, schoolScope, requireActiveSubscription, reviewController.mine);
router.put("/mine", authenticate, schoolScope, requireActiveSubscription, reviewController.saveMine);
router.delete("/mine", authenticate, schoolScope, requireActiveSubscription, reviewController.removeMine);

module.exports = router;
