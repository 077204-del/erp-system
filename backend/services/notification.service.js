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

async function countAdminSockets(io) {
  try {
    if (!io || typeof io.in !== "function") return 0;
    const sockets = await io.in("admins").fetchSockets();
    return Array.isArray(sockets) ? sockets.length : 0;
  } catch {
    return -1;
  }
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
      const adminCount = await countAdminSockets(io);
      io.to("admins").emit("admin_notification", out);
      console.log("[notifications] emitted admin_notification", {
        event: "admin_notification",
        targetRoom: "admins",
        targetRole: "admin",
        connectedAdmins: adminCount,
        type: out.type,
        payload: out,
      });
      if (adminCount === 0) {
        console.warn(
          "[notifications] no admin sockets in room 'admins' — web admin may be offline or not connected"
        );
      }
    } catch (err) {
      console.error(
        "[notifications] Socket emit failed:",
        err && err.message ? err.message : err
      );
    }
  } else {
    console.warn(
      "[notifications] Socket.IO not available on app — notification saved only"
    );
  }

  return doc;
}

/**
 * Cashier-only: no-op for admin/manager.
 */
async function notifyCashierAction(req, { type, message, amount }) {
  try {
    const role = normalizeRole(req.user && req.user.role);
    if (role !== "cashier") {
      console.log("[notifications] notifyCashierAction skipped (not cashier)", {
        role,
        type,
      });
      return null;
    }
    if (!req.user || req.user.id == null) {
      console.log("[notifications] notifyCashierAction skipped (no user id)", {
        type,
      });
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
    console.log("[notifications] notifyCashierAction", {
      type: notifyType,
      cashierId: String(req.user.id),
      amount: Number(amount) || 0,
    });
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
