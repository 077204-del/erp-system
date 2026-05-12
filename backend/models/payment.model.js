const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },

    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sale",
      default: null,
    },

    amount: {
      type: Number,
      required: true,
      min: 0
    },

    type: {
      type: String,
      enum: ["SALE_PAYMENT", "DIRECT_PAYMENT"],
      default: "SALE_PAYMENT"
    },

    // 🔥 THIS IS CRITICAL FOR CASH CLOSING
    method: {
      type: String,
      enum: ["CASH", "CARD", "BANK"],
      default: "CASH"
    },

    /** Business date for the payment (defaults to createdAt in controllers if omitted). */
    recordedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);