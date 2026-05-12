const AuditLog = require("../models/auditLog.model");



function resolveRequestContext(req) {

  if (!req || typeof req !== "object") {

    return { ip: "", userAgent: "" };

  }

  const ff = req.headers && req.headers["x-forwarded-for"];

  const ip =

    (typeof ff === "string" && ff.split(",")[0] && ff.split(",")[0].trim()) ||

    req.ip ||

    (req.socket && req.socket.remoteAddress) ||

    "";

  const ua =

    (typeof req.get === "function" && req.get("user-agent")) ||

    (req.headers && req.headers["user-agent"]) ||

    "";

  return {

    ip: String(ip || "").slice(0, 200),

    userAgent: String(ua || "").slice(0, 500),

  };

}



/**

 * Append-only audit. Never throws to route handlers; DB errors are logged only.

 * Pass Express req as second arg to capture IP / User-Agent when available.

 */

function appendAudit(payload, req) {

  try {

    const { ip, userAgent } = resolveRequestContext(req);

    const doc = {

      at: new Date(),

      userId: payload.userId || null,

      action: payload.action,

      entityType: payload.entityType != null ? String(payload.entityType) : null,

      entityId:

        payload.entityId != null ? String(payload.entityId) : null,

      clientIp: ip,

      userAgent,

      meta: payload.meta,

    };



    AuditLog.create(doc).catch((e) =>

      console.error("[audit] append failed:", e.message)

    );

  } catch (e) {

    console.error("[audit] append skipped:", e.message);

  }

}



module.exports = { appendAudit, resolveRequestContext };


