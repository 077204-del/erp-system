const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");

const controller = require("../controllers/payment.controller");

router.post(
  "/",
  auth(["admin", "manager", "cashier", "canCreatePayments"]),
  controller.createPayment
);
router.get("/", auth(["admin", "manager", "cashier"]), controller.getPayments);
router.delete(
  "/:id",
  auth(["admin", "canDeletePayments"]),
  controller.deletePayment
);

module.exports = router;