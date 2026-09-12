const express = require("express");
const { authenticate } = require("../middleware/auth");
const { schoolScope } = require("../middleware/schoolScope");
const { requireActiveSubscription } = require("../middleware/subscriptionAccess");
const timetableController = require("../controllers/timetableController");

const router = express.Router();
router.use(authenticate, schoolScope, requireActiveSubscription);

router.post("/", timetableController.create);
router.get("/", timetableController.list);
router.get("/week", timetableController.week);
router.get("/swaps/class-grid", timetableController.classGrid);
router.get("/swaps/slots", timetableController.teacherSlots);
router.post("/swaps/preview", timetableController.previewSwap);
router.post("/swaps", timetableController.confirmSwap);
router.get("/entries", timetableController.queryEntries);
router.get("/:timetableId/grid", timetableController.grid);
router.get("/:timetableId/teacher/:teacherId", timetableController.teacherView);
router.get("/:timetableId/class/:classId", timetableController.classView);
router.get("/:timetableId/section/:sectionId", timetableController.sectionView);
router.get("/:timetableId", timetableController.getOne);
router.patch("/:timetableId", timetableController.update);
router.delete("/:timetableId", timetableController.remove);
router.post("/:timetableId/entries", timetableController.addEntry);
router.patch("/:timetableId/entries/:entryId", timetableController.updateEntry);
router.delete("/:timetableId/entries/:entryId", timetableController.removeEntry);

module.exports = router;
