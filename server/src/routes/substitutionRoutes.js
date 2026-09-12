const express = require("express");
const { authenticate } = require("../middleware/auth");
const { schoolScope } = require("../middleware/schoolScope");
const { requireActiveSubscription } = require("../middleware/subscriptionAccess");
const substitutionController = require("../controllers/substitutionController");

const router = express.Router();
router.use(authenticate, schoolScope, requireActiveSubscription);

router.get("/today/pdf", substitutionController.todayPdf);
router.get("/today", substitutionController.today);
router.get("/runs", substitutionController.listRuns);
router.post("/generate", substitutionController.generate);
router.get("/round-duty/:assignmentId/candidates", substitutionController.roundDutyCandidates);
router.post("/round-duty/:assignmentId/override", substitutionController.roundDutyOverride);
router.get("/:substitutionId/candidates", substitutionController.candidates);
router.post("/:substitutionId/override", substitutionController.override);
router.get("/", substitutionController.list);
router.post("/override", substitutionController.override);

module.exports = router;
