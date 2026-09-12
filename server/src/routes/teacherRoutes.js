const express = require("express");
const { authenticate } = require("../middleware/auth");
const { schoolScope } = require("../middleware/schoolScope");
const { requireActiveSubscription } = require("../middleware/subscriptionAccess");
const teacherController = require("../controllers/teacherController");

const router = express.Router();
router.use(authenticate, schoolScope, requireActiveSubscription);

router.post("/", teacherController.create);
router.get("/", teacherController.list);
router.get("/:teacherId", teacherController.getOne);
router.patch("/:teacherId", teacherController.update);
router.post("/:teacherId/deactivate", teacherController.deactivate);
router.post("/:teacherId/activate", teacherController.activate);
router.delete("/:teacherId", teacherController.remove);

module.exports = router;
