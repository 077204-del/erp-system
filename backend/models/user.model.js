const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true },
    password: String,
    role: {
      type: String,
      enum: ["admin", "manager", "cashier"],
      default: "cashier",
    },
    permissions: {
      type: {
        canCreateSales: { type: Boolean, default: false },
        canEditSales: { type: Boolean, default: false },
        canDeleteSales: { type: Boolean, default: false },
        canCreatePayments: { type: Boolean, default: false },
        canDeletePayments: { type: Boolean, default: false },
        canViewReports: { type: Boolean, default: false },
        canManageClients: { type: Boolean, default: false },
        canManageProducts: { type: Boolean, default: false },
        canManageExpenses: { type: Boolean, default: false },
        canManageUsers: { type: Boolean, default: false },
      },
      default: undefined,
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.User || mongoose.model("User", userSchema);
