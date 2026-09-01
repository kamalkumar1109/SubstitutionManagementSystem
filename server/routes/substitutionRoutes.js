const express = require("express");
const { generate, list, manualOverride, reset } = require("../controllers/substitutionController");

const router = express.Router();

router.post("/generate-substitution", generate);
router.get("/substitutions", list);
router.post("/manual-override", manualOverride);
router.post("/reset-day", reset);

module.exports = router;

