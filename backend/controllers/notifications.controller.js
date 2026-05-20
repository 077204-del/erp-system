const Notification = require("../models/notification.model");

function safeLimit(v) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(100, n);
}

exports.listNotifications = async (req, res) => {
  try {
    const limit = safeLimit(req.query && req.query.limit);
    const rows = await Notification.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("cashierId", "username role")
      .lean();

    const notifications = rows.map((n) => ({
      id: String(n._id),
      type: n.type,
      message: n.message,
      amount: Number(n.amount) || 0,
      read: Boolean(n.read),
      createdAt: n.createdAt,
      cashierId:
        n.cashierId && typeof n.cashierId === "object" && n.cashierId._id
          ? String(n.cashierId._id)
          : n.cashierId != null
            ? String(n.cashierId)
            : null,
      cashierUsername:
        n.cashierId && typeof n.cashierId === "object"
          ? String(n.cashierId.username || "")
          : "",
    }));

    return res.json({ notifications });
  } catch (err) {
    return res.status(500).json({
      message: err && err.message ? err.message : "Server error",
    });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({ read: false });
    return res.json({ unreadCount });
  } catch (err) {
    return res.status(500).json({
      message: err && err.message ? err.message : "Server error",
    });
  }
};
