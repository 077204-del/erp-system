const mongoose = require("mongoose");

const cashSessionSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      default: Date.now,
    },

    openingCash: {
      type: Number,
      default: 0,
    },

    cashSales: {
      type: Number,
      default: 0,
    },

    debtPayments: {
      type: Number,
      default: 0,
    },

    expenses: {
      type: Number,
      default: 0,
    },

    closingCash: {
      type: Number,
      default: 0,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CashSession", cashSessionSchema);