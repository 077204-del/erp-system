import { io } from "socket.io-client";
import { getApiBaseUrl } from "../config/apiBase";
import { formatMoneyDZD } from "../utils/erpFormat";

/** Must match backend: io.to("admins").emit("admin_notification", …) */
export const ADMIN_NOTIFICATION_EVENT = "admin_notification";
export const ADMIN_SOCKET_ROOM = "admins";

let socketInstance = null;
let activeToken = "";
let toastApi = null;

function handleNotificationPayload(payload) {
  console.log(
    "[notifications:client] admin_notification received",
    payload
  );
  if (!payload || typeof payload !== "object") return;
  const msg = String(payload.message || "").trim() || "Cashier activity";
  const amt = Number(payload.amount);
  const detail =
    Number.isFinite(amt) && amt > 0 ? ` · ${formatMoneyDZD(amt)}` : "";
  if (toastApi && typeof toastApi.info === "function") {
    toastApi.info(`${msg}${detail}`, payload.type || "Notification");
  }
}

/**
 * Register listeners once per socket instance — before connect().
 */
function mountAdminNotificationListeners(socket) {
  if (socket.__erpAdminListenersMounted) {
    return;
  }
  socket.__erpAdminListenersMounted = true;

  socket.on("connect", () => {
    console.log("[notifications:client] socket connected", {
      socketId: socket.id,
      connected: socket.connected,
      event: ADMIN_NOTIFICATION_EVENT,
      room: ADMIN_SOCKET_ROOM,
    });
  });

  socket.on("admin_socket_ready", (meta) => {
    console.log("[notifications:client] joined room", ADMIN_SOCKET_ROOM, meta);
  });

  socket.on("connect_error", (err) => {
    console.warn(
      "[notifications:client] connect_error",
      err?.message || err
    );
  });

  socket.on("disconnect", (reason) => {
    console.log("[notifications:client] disconnected", reason);
  });

  socket.on(ADMIN_NOTIFICATION_EVENT, handleNotificationPayload);
  console.log(
    "[notifications:client] listener mounted for",
    ADMIN_NOTIFICATION_EVENT
  );
}

/**
 * Singleton admin Socket.IO client. Server joins room "admins" on handshake.
 */
export function connectAdminNotificationSocket(token, options = {}) {
  const tk = String(token || "").trim();
  if (!tk) {
    console.log("[notifications:client] connect skipped — no token");
    return null;
  }

  if (options.toast) {
    toastApi = options.toast;
  }

  if (
    socketInstance &&
    activeToken === tk &&
    socketInstance.connected
  ) {
    console.log("[notifications:client] reusing connected socket", {
      socketId: socketInstance.id,
    });
    return socketInstance;
  }

  if (socketInstance) {
    disconnectAdminNotificationSocket();
  }

  const base = getApiBaseUrl();
  console.log("[notifications:client] establishing connection", {
    url: base,
    room: ADMIN_SOCKET_ROOM,
    listenEvent: ADMIN_NOTIFICATION_EVENT,
  });

  const socket = io(base, {
    autoConnect: false,
    path: "/socket.io",
    transports: ["polling", "websocket"],
    auth: { token: tk },
    reconnection: true,
    reconnectionAttempts: 12,
  });

  mountAdminNotificationListeners(socket);
  socket.connect();

  socketInstance = socket;
  activeToken = tk;
  return socketInstance;
}

export function disconnectAdminNotificationSocket() {
  if (!socketInstance) return;
  console.log("[notifications:client] disconnecting admin socket");
  socketInstance.removeAllListeners();
  socketInstance.close();
  socketInstance = null;
  activeToken = "";
}

export function getAdminNotificationSocket() {
  return socketInstance;
}

export function isAdminNotificationSocketConnected() {
  return Boolean(socketInstance && socketInstance.connected);
}
