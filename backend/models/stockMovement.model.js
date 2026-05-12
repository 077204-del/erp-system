const mongoose = require("mongoose");

const stockMovementSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    movementType: {
      type: String,
      required: true,
      enum: ["SALE_OUT", "MANUAL_ADD", "MANUAL_REMOVE", "PRODUCT_CREATE"],
      index: true,
    },
    qtyBefore: { type: Number, required: true },
    qtyChange: { type: Number, required: true },
    qtyAfter: { type: Number, required: true },
    reason: { type: String, default: "" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: "Sale" },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { collection: "stockmovements" }
);

module.exports =
  mongoose.models.StockMovement ||
  mongoose.model("StockMovement", stockMovementSchema);
