const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const controller = require("../controllers/expense.controller");

router.get(
  "/summary",
  auth(["admin", "manager", "canManageExpenses"]),
  controller.summary
);
router.post(
  "/",
  auth(["admin", "manager", "canManageExpenses"]),
  controller.create
);
router.get(
  "/",
  auth(["admin", "manager", "canManageExpenses"]),
  controller.list
);
router.delete(
  "/:id",
  auth(["admin", "manager", "canManageExpenses"]),
  controller.remove
);

module.exports = router;
