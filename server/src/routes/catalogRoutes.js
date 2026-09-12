const express = require("express");
const { authenticate } = require("../middleware/auth");
const { schoolScope } = require("../middleware/schoolScope");
const { requireActiveSubscription } = require("../middleware/subscriptionAccess");
const catalogController = require("../controllers/catalogController");

const router = express.Router();
router.use(authenticate, schoolScope, requireActiveSubscription);

router.post("/class-groups", catalogController.createClassGroup);
router.get("/class-groups", catalogController.listClassGroups);
router.patch("/class-groups/:id", catalogController.updateClassGroup);
router.post("/class-groups/:id/deactivate", catalogController.deactivateClassGroup);
router.post("/class-groups/:id/activate", catalogController.activateClassGroup);
router.delete("/class-groups/:id", catalogController.deleteClassGroup);

router.post("/classes", catalogController.createClass);
router.get("/classes", catalogController.listClasses);
router.patch("/classes/:id", catalogController.updateClass);
router.post("/classes/:id/deactivate", catalogController.deactivateClass);
router.post("/classes/:id/activate", catalogController.activateClass);
router.delete("/classes/:id", catalogController.deleteClass);

router.post("/sections", catalogController.createSection);
router.get("/sections", catalogController.listSections);
router.patch("/sections/:id", catalogController.updateSection);
router.post("/sections/:id/deactivate", catalogController.deactivateSection);
router.post("/sections/:id/activate", catalogController.activateSection);
router.delete("/sections/:id", catalogController.deleteSection);

router.post("/subjects", catalogController.createSubject);
router.get("/subjects", catalogController.listSubjects);
router.patch("/subjects/:id", catalogController.updateSubject);
router.post("/subjects/:id/deactivate", catalogController.deactivateSubject);
router.post("/subjects/:id/activate", catalogController.activateSubject);
router.delete("/subjects/:id", catalogController.deleteSubject);

module.exports = router;
