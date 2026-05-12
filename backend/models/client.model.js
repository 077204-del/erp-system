const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    notes: { type: String, default: "" },

    totalDebt: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Client", clientSchema);