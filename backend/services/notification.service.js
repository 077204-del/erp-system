const mongoose = require("mongoose");
const Notification = require("../models/notification.model");
const User = require("../models/user.model");
const { normalizeRole } = require("./rbac.service");

const TYPES = new Set(["SALE", "PAYMENT", "UPDATE", "DEBT"]);

function defaultMessageForType(type) {
  if (type === "SALE") return "Created a sale";
  if (type === "PAYMENT") return "Recorded a payment";
  if (type === "UPDATE") return "Updated a sale";
  if (type === "DEBT") return "Recorded a client debt payment";
  return "Cashier activity";
}

function toPayload(doc) {
  const o = doc && typeof doc.toObject === "function" ? doc.toObject() : doc;
  if (!o) return null;
  const cashierId =
    o.cashierId != null ? String(o.cashierId) : null;
  const createdAt = o.createdAt || new Date();
  return {
    id: String(o._id),
    type: o.type,
    message: o.message,
    amount: Number(o.amount) || 0,
    read: Boolean(o.read),
    createdAt,
    cashierId,
    cashier: cashierId,
    timestamp: createdAt,
  };
}

/**
 * Persist admin notification and emit to connected admin sockets (room "admins").
 */
async function createNotification(payload) {
  const { app, type, message, amount = 0, cashierId } = payload;
  const normalizedType = type === "DEBT" ? "PAYMENT" : type;
  if (!TYPES.has(type) && !TYPES.has(normalizedType)) {
    throw new Error(`Invalid notification type: ${type}`);
  }
  const storeType = TYPES.has(normalizedType) ? normalizedType : type;
  const cid = cashierId != null ? String(cashierId).trim() : "";
  if (!cid || !mongoose.Types.ObjectId.isValid(cid)) {
    throw new Error("Invalid cashierId for notification");
  }

  const doc = await Notification.create({
    type: storeType,
    message: String(message || "").slice(0, 2000),
    amount: Number.isFinite(Number(amount)) ? Number(amount) : 0,
    cashierId: new mongoose.Types.ObjectId(cid),
    read: false,
  });

  const out = toPayload(doc);
  const io = app && typeof app.get === "function" ? app.get("io") : null;
  if (io && typeof io.to === "function") {
    try {
      io.to("admins").emit("admin_notification", out);
    } catch (err) {
      console.error(
        "[notifications] Socket emit failed:",
        err && err.message ? err.message : err
      );
    }
  }

  return doc;
}

/**
 * Cashier-only: no-op for admin/manager.
 */
async function notifyCashierAction(req, { type, message, amount }) {
  try {
    if (normalizeRole(req.user && req.user.role) !== "cashier") {
      return null;
    }
    if (!req.user || req.user.id == null) {
      return null;
    }
    let label = "Cashier";
    try {
      const u = await User.findById(req.user.id).select("username").lean();
      if (u && u.username) label = String(u.username).trim() || label;
    } catch {
      /* ignore */
    }
    const notifyType = type === "DEBT" ? "PAYMENT" : type;
    const body = String(message || "").trim() || defaultMessageForType(notifyType);
    const fullMessage = `[${label}] ${body}`;
    return await createNotification({
      app: req.app,
      type: notifyType,
      message: fullMessage,
      amount,
      cashierId: String(req.user.id),
    });
  } catch (err) {
    console.error(
      "[notifications] notifyCashierAction failed:",
      err && err.message ? err.message : err
    );
    return null;
  }
}

module.exports = {
  createNotification,
  notifyCashierAction,
  toPayload,
};
