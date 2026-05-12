const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    barcode: {
      type: String,
      default: "",
      trim: true,
    },

    category: {
      type: String,
      default: "",
      trim: true,
    },

    qty: {
      type: Number,
      default: 0,
      min: 0 // 🔥 يمنع stock سلبي
    },

    costPrice: {
      type: Number,
      required: true,
      min: 0
    },

    salePrice: {
      type: Number,
      required: true,
      min: 0
    },

    lowStockThreshold: {
      type: Number,
      default: 5,
      min: 0,
    },
  },
  {
    timestamps: true
  }
);

// ======================
// 🔥 PRE-SAVE SAFETY HOOK
// ======================
productSchema.pre("save", function (next) {
  if (this.qty < 0) this.qty = 0;
  if (this.costPrice < 0) this.costPrice = 0;
  if (this.salePrice < 0) this.salePrice = 0;

  if (typeof next === "function") {
    next();
  }
});

// ======================
// 🔥 SAFE EXPORT
// ======================
module.exports =
  mongoose.models.Product || mongoose.model("Product", productSchema);