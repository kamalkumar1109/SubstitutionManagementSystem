const express = require("express");
const { authenticate } = require("../middleware/auth");
const { schoolScope } = require("../middleware/schoolScope");
const academicSessionController = require("../controllers/academicSessionController");

const router = express.Router();
router.use(authenticate, schoolScope);

router.post("/", academicSessionController.create);
router.get("/", academicSessionController.list);
router.post("/:sessionId/current", academicSessionController.setCurrent);

module.exports = router;
