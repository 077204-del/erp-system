const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["monthly", "daily"], required: true },
    category: { type: String, trim: true, default: "general" },
    amount: { type: Number, required: true },
    description: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.Expense || mongoose.model("Expense", expenseSchema);
