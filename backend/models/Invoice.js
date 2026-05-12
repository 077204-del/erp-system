const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema({
  items: Array,
  total: Number,
  paid: Number,
  debt: Number,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Invoice", invoiceSchema);