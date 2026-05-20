const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ["SALE", "PAYMENT", "DEBT"],
      index: true,
    },
    message: { type: String, required: true, maxlength: 2000 },
    amount: { type: Number, default: 0 },
    cashierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    read: { type: Boolean, default: false, index: true },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { collection: "notifications" }
);

module.exports =
  mongoose.models.Notification ||
  mongoose.model("Notification", notificationSchema);
