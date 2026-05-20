const jwt = require("jsonwebtoken");
const { mergeUserFromToken } = require("../services/rbac.service");

/**
 * Socket.IO: JWT from handshake.auth.token or query.token; admins join room "admins".
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
        return next();
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = mergeUserFromToken(decoded);
      socket.data.userId =
        user && user.id != null ? String(user.id) : "";
      socket.data.role = user && user.role ? String(user.role) : "";
      if (user && user.role === "admin") {
        socket.join("admins");
      }
    } catch {
      // unauthenticated or invalid token — no admin room
    }
    next();
  });
}

module.exports = { attachAdminSocket };
