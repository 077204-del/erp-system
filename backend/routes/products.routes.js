const express = require("express");
const router = express.Router();

const productController = require("../controllers/product.controller");
const auth = require("../middleware/auth.middleware");

// ======================
// PRODUCTS ROUTES (RBAC CLEAN)
// ======================

// ➤ GET PRODUCTS
// cashier + admin
router.get(
  "/",
  auth(["admin", "manager", "cashier"]),
  productController.getProducts
);

// ➤ CREATE PRODUCT
// admin only
router.post(
  "/",
  auth(["admin", "manager", "cashier", "canManageProducts"]),
  productController.createProduct
);

// ➤ UPDATE FULL PRODUCT
// admin only
router.put(
  "/:id",
  auth(["admin", "manager", "cashier", "canManageProducts"]),
  productController.updateProduct
);

// ➤ UPDATE STOCK ONLY
// admin only
router.put(
  "/:id/stock",
  auth(["admin", "manager", "cashier", "canManageProducts"]),
  productController.updateStock
);

// ➤ DELETE PRODUCT
// admin only
router.delete(
  "/:id",
  auth(["admin", "manager", "cashier", "canManageProducts"]),
  productController.deleteProduct
);

module.exports = router;