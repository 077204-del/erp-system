const jwt = require("jsonwebtoken");
const { mergeUserFromToken, normalizeRole } = require("../services/rbac.service");

/**
 * Socket.IO: JWT from handshake.auth.token or query.token; admins join room "admins".
 * Real-time admin toasts are web-only (Socket.IO); native push is not implemented yet.
 */
function attachAdminSocket(io) {
  io.use((socket, next) => {
    try {
      const raw =
        (socket.handshake.auth && socket.handshake.auth.token) ||
        (socket.handshake.query && socket.handshake.query.token) ||
        "";
      const token = typeof raw === "string" ? raw.trim() : "";
      if (!token || !process.env.JWT_SECRET) {
        console.log("[notifications:socket] handshake without admin token", {
          hasToken: Boolean(token),
          hasJwtSecret: Boolean(process.env.JWT_SECRET),
        });
        return next();
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = mergeUserFromToken(decoded);
      const role = normalizeRole(user && user.role);
      socket.data.userId =
        user && user.id != null ? String(user.id) : "";
      socket.data.role = role;
      if (role === "admin") {
        socket.join("admins");
        console.log("[notifications:socket] joining admins room", {
          userId: socket.data.userId,
          role,
        });
      }
    } catch (err) {
      console.log("[notifications:socket] handshake auth failed:", err.message);
    }
    next();
  });

  io.on("connection", (socket) => {
    const role = socket.data.role || "";
    const inAdmins = socket.rooms.has("admins");
    console.log("[notifications:socket] connected", {
      socketId: socket.id,
      userId: socket.data.userId || null,
      role: role || "(none)",
      inAdmins,
      targetRoom: "admins",
    });
    if (inAdmins) {
      console.log("joined room admins", {
        socketId: socket.id,
        userId: socket.data.userId,
        role,
      });
      socket.emit("admin_socket_ready", { ok: true, role, room: "admins" });
    }
  });
}

module.exports = { attachAdminSocket };
