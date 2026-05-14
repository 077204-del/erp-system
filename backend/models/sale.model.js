const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },

    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    cashierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },

    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    total: { type: Number, required: true },

    paidAmount: { type: Number, default: 0 },
    debt: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["PAID", "DEBT", "PARTIAL", "UNPAID", "VOID"],
      default: "UNPAID",
    },

    voided: { type: Boolean, default: false, index: true },
    voidedAt: { type: Date, default: null },
    voidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    voidReason: { type: String, default: "", maxlength: 2000 },
    /** Snapshot of monetary / line fields before void (audit). */
    voidSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },

    profit: { type: Number, default: 0 },

    paymentMethod: {
      type: String,
      enum: ["CASH", "CARD", "DEBT"],
      default: "CASH",
    },

    // 🔥 unified date (ONLY THIS USED IN SYSTEM)
    saleDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "sales",
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/** API-facing status: paid | partial | unpaid (derived from legacy status enum). */
saleSchema.virtual("paymentStatus").get(function () {
  const s = this.status;
  if (s === "VOID" || this.voided === true) return "voided";
  if (s === "PAID") return "paid";
  if (s === "PARTIAL") return "partial";
  return "unpaid";
});

/** Alias for API docs: remaining balance on the line. */
saleSchema.virtual("debtAmount").get(function () {
  const d = Number(this.debt);
  return Number.isFinite(d) ? d : 0;
});

module.exports = mongoose.model("Sale", saleSchema);