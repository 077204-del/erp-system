const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");

const controller = require("../controllers/sales.controller");

router.post(
  "/",
  auth(["admin", "manager", "cashier", "canCreateSales"]),
  controller.createSale
);
router.get("/", auth(["admin", "manager", "cashier"]), controller.getSales);
router.get(
  "/cashiers/list",
  auth(["admin", "manager"]),
  controller.listSaleCashiers
);
router.patch(
  "/:id",
  auth(["admin", "manager", "cashier", "canEditSales"]),
  controller.updateSale
);
router.delete(
  "/:id",
  auth(["admin", "manager"]),
  controller.voidSale
);
router.get(
  "/:id/invoice",
  auth(["admin", "manager", "cashier"]),
  controller.generateInvoice
);
router.put(
  "/:id",
  auth(["admin", "manager", "cashier", "canCreatePayments"]),
  controller.paySale
);

module.exports = router;