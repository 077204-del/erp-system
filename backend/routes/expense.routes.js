const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const controller = require("../controllers/expense.controller");

router.get("/summary", auth(["admin", "cashier", "canManageExpenses"]), controller.summary);
router.post("/", auth(["admin", "cashier", "canManageExpenses"]), controller.create);
router.get("/", auth(["admin", "cashier", "canManageExpenses"]), controller.list);
router.delete("/:id", auth(["admin", "cashier", "canManageExpenses"]), controller.remove);

module.exports = router;
