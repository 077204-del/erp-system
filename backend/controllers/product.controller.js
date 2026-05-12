const Product = require("../models/product.model");
const Sale = require("../models/sale.model");

const {

  getProductsSorted,

} = require("../services/finance/ledger.service");

const {

  writeCreateProduct,

  writeDeleteProductById,

  writeUpdateProductStockById,

  writeUpdateProductById,

} = require("../services/finance.write.service");

const { appendAudit } = require("../services/auditLog.service");

const { recordStockMovement } = require("../services/stockMovement.service");



function enrichProduct(p) {

  const o = p.toObject ? p.toObject() : p;

  const th =

    o.lowStockThreshold != null ? Number(o.lowStockThreshold) : 5;

  const q = Number(o.qty) || 0;

  const lowStock = th > 0 && q <= th;

  return { ...o, lowStock };

}

function validateNonNegativeNumber(name, v, required) {
  if (v === undefined || v === null || v === "") {
    if (required) return `${name} is required`;
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    return `${name} must be a non-negative number`;
  }
  return null;
}

// ➤ إضافة منتج

exports.createProduct = async (req, res) => {

  try {

    const name = req.body && req.body.name != null ? String(req.body.name).trim() : "";
    if (!name) {
      return res.status(400).json({ message: "name is required" });
    }

    const errQty = validateNonNegativeNumber("qty", req.body.qty, false);
    const errSp = validateNonNegativeNumber(
      "salePrice",
      req.body.salePrice,
      true
    );
    const errCp = validateNonNegativeNumber(
      "costPrice",
      req.body.costPrice,
      true
    );
    const errMin = validateNonNegativeNumber(
      "lowStockThreshold",
      req.body.lowStockThreshold != null && req.body.lowStockThreshold !== ""
        ? req.body.lowStockThreshold
        : req.body.minimumStock,
      false
    );
    const verr = errQty || errSp || errCp || errMin;
    if (verr) {
      return res.status(400).json({ message: verr });
    }

    const qtyRaw = req.body.qty;
    const qty =
      qtyRaw === undefined || qtyRaw === null || qtyRaw === ""
        ? 0
        : Number(qtyRaw);

    const lowRaw =
      req.body.lowStockThreshold != null && req.body.lowStockThreshold !== ""
        ? req.body.lowStockThreshold
        : req.body.minimumStock;
    const lowStockThreshold =
      lowRaw === undefined || lowRaw === null || lowRaw === ""
        ? 5
        : Number(lowRaw);

    const payload = {
      name,
      qty,
      costPrice: Number(req.body.costPrice),
      salePrice: Number(req.body.salePrice),
      lowStockThreshold,
      barcode: String(req.body.barcode || "").trim().slice(0, 120),
      category: String(req.body.category || "").trim().slice(0, 120),
    };

    const product = await writeCreateProduct(payload, req.user.id);

    appendAudit(

      {

        userId: req.user.id,

        action: "PRODUCT_CREATED",

        entityType: "Product",

        entityId: product._id,

      },

      req

    );

    res.status(201).json(enrichProduct(product));

  } catch (err) {

    res.status(500).json({ error: err.message });

  }

};



// ➤ جلب كل المنتجات

exports.getProducts = async (req, res) => {

  try {

    const products = await getProductsSorted();

    res.json(products.map((p) => enrichProduct(p)));

  } catch (err) {

    res.status(500).json({ error: err.message });

  }

};



// ➤ حذف منتج

exports.deleteProduct = async (req, res) => {

  try {

    const id = req.params.id;

    const existing = await Product.findById(id);

    if (!existing) {

      return res.status(404).json({ message: "Product not found" });

    }

    const saleCount = await Sale.countDocuments({ productId: id });
    if (saleCount > 0) {
      return res.status(400).json({
        message: "Cannot delete product linked to sales history",
        saleCount: Number(saleCount) || 0,
      });
    }



    const qtyBefore = Number(existing.qty) || 0;

    if (qtyBefore > 0) {

      try {

        await recordStockMovement({

          productId: existing._id,

          movementType: "MANUAL_REMOVE",

          qtyBefore,

          qtyChange: -qtyBefore,

          qtyAfter: 0,

          userId: req.user.id,

          reason: "PRODUCT_DELETED",

        });

      } catch (e) {

        console.error("[stockMovement] PRODUCT_DELETED:", e.message);

      }

    }



    const product = await writeDeleteProductById(id);



    if (!product) {

      return res.status(404).json({ message: "Product not found" });

    }



    appendAudit(

      {

        userId: req.user.id,

        action: "PRODUCT_DELETED",

        entityType: "Product",

        entityId: id,

      },

      req

    );



    res.json({ message: "Deleted successfully" });

  } catch (err) {

    res.status(500).json({ error: err.message });

  }

};



// ➤ تحديث stock فقط

exports.updateStock = async (req, res) => {

  try {

    const { qty } = req.body;



    const result = await writeUpdateProductStockById(

      req.params.id,

      qty,

      req.user.id

    );



    if (!result.ok) {

      return res.status(result.status).json(result.body);

    }



    const product = result.product;



    appendAudit(

      {

        userId: req.user.id,

        action: "STOCK_UPDATED",

        entityType: "Product",

        entityId: product._id,

        meta: { qty },

      },

      req

    );



    res.json(enrichProduct(product));

  } catch (err) {

    res.status(500).json({ error: err.message });

  }

};



// ➤ ✏️ Edit full product (SAFE UPDATE)

exports.updateProduct = async (req, res) => {

  try {

    const { name, qty, salePrice, costPrice, barcode, category } = req.body;
    const minRaw =
      req.body.lowStockThreshold != null && req.body.lowStockThreshold !== ""
        ? req.body.lowStockThreshold
        : req.body.minimumStock;

    if (qty !== undefined && qty !== null && qty !== "") {
      const errQty = validateNonNegativeNumber("qty", qty, false);
      if (errQty) {
        return res.status(400).json({ message: errQty });
      }
    }
    if (salePrice !== undefined && salePrice !== null && salePrice !== "") {
      const e = validateNonNegativeNumber("salePrice", salePrice, false);
      if (e) return res.status(400).json({ message: e });
    }
    if (costPrice !== undefined && costPrice !== null && costPrice !== "") {
      const e = validateNonNegativeNumber("costPrice", costPrice, false);
      if (e) return res.status(400).json({ message: e });
    }
    if (minRaw !== undefined && minRaw !== null && minRaw !== "") {
      const e = validateNonNegativeNumber("lowStockThreshold", minRaw, false);
      if (e) return res.status(400).json({ message: e });
    }

    let lowStockThreshold;
    if (minRaw !== undefined && minRaw !== null && minRaw !== "") {
      lowStockThreshold = Number(minRaw);
    }

    const patch = {
      name: name != null ? String(name).trim() : undefined,
      qty,
      salePrice,
      costPrice,
      barcode:
        barcode !== undefined
          ? String(barcode || "").trim().slice(0, 120)
          : undefined,
      category:
        category !== undefined
          ? String(category || "").trim().slice(0, 120)
          : undefined,
      lowStockThreshold,
    };

    if (patch.name === "") {
      return res.status(400).json({ message: "name cannot be empty" });
    }

    const updated = await writeUpdateProductById(

      req.params.id,

      patch,

      req.user.id

    );



    if (!updated) {

      return res.status(404).json({ message: "Product not found" });

    }



    appendAudit(

      {

        userId: req.user.id,

        action: "PRODUCT_UPDATED",

        entityType: "Product",

        entityId: updated._id,

      },

      req

    );



    res.json(enrichProduct(updated));

  } catch (err) {

    res.status(500).json({ error: err.message });

  }

};


