const AuditLog = require("../models/auditLog.model");

function safeInt(v, fallback, max) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

exports.listAuditLogs = async (req, res) => {
  try {
    const limit = safeInt(req.query.limit, 80, 200);
    const items = await AuditLog.find({})
      .sort({ at: -1 })
      .limit(limit)
      .lean();

    return res.json({
      items: items.map((row) => ({
        id: String(row._id),
        at: row.at,
        userId: row.userId ? String(row.userId) : null,
        action: row.action,
        entityType: row.entityType || null,
        entityId: row.entityId || null,
        meta: row.meta,
      })),
    });
  } catch (err) {
    return res.status(500).json({
      message: err && err.message ? String(err.message) : "Server error",
      items: [],
    });
  }
};
