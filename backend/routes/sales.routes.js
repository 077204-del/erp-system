const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");

const controller = require("../controllers/sales.controller");

router.post("/", auth(["admin", "cashier", "canCreateSales"]), controller.createSale);
router.get("/", auth(["admin", "cashier"]), controller.getSales);
router.delete("/:id", auth(["admin", "cashier", "canDeleteSales"]), controller.deleteSale);
router.get("/:id/invoice", auth(["admin", "cashier"]), controller.generateInvoice);
router.put("/:id", auth(["admin", "cashier", "canEditSales"]), controller.paySale);

module.exports = router;