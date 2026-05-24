import { io } from "socket.io-client";
import { getApiBaseUrl } from "../config/apiBase";
import { formatMoneyDZD } from "../utils/erpFormat";
import { resolveWorkspaceRole } from "../utils/workspaceRole";

/** Must match backend: io.to("admins").emit("admin_notification", …) */
export const ADMIN_NOTIFICATION_EVENT = "admin_notification";
export const ADMIN_SOCKET_ROOM = "admins";

let socketInstance = null;
let activeToken = "";
let toastApi = null;
let listenersMounted = false;

function readAuthToken() {
  try {
    return String(localStorage.getItem("token") || "").trim();
  } catch {
    return "";
  }
}

function isAdminSession() {
  return resolveWorkspaceRole() === "admin";
}

function handleNotificationPayload(payload) {
  console.log("admin_notification received", payload);
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
 * Register admin_notification listener once on the singleton socket.
 */
function ensureAdminNotificationListener(socket) {
  if (listenersMounted) return;
  listenersMounted = true;

  socket.on("connect", () => {
    console.log("socket connected", {
      socketId: socket.id,
      connected: socket.connected,
      room: ADMIN_SOCKET_ROOM,
      event: ADMIN_NOTIFICATION_EVENT,
    });
  });

  socket.on("admin_socket_ready", (meta) => {
    console.log("joined room admins", meta);
  });

  socket.on("connect_error", (err) => {
    console.warn("[admin-notifications] connect_error", err?.message || err);
  });

  socket.on("disconnect", (reason) => {
    console.log("[admin-notifications] disconnected", reason);
  });

  socket.on(ADMIN_NOTIFICATION_EVENT, handleNotificationPayload);
}

/**
 * Admin-only Socket.IO client. Server joins room "admins" on authenticated handshake.
 */
export function connectAdminNotificationSocket(token, options = {}) {
  if (!isAdminSession()) {
    console.log("[admin-notifications] skipped — not admin role");
    return null;
  }

  const tk = String(token || readAuthToken() || "").trim();
  if (!tk) {
    console.log("[admin-notifications] skipped — no auth token");
    return null;
  }

  if (options.toast) {
    toastApi = options.toast;
  } else if (typeof options.getToast === "function") {
    toastApi = options.getToast();
  }

  if (
    socketInstance &&
    activeToken === tk &&
    socketInstance.connected &&
    !options.forceReconnect
  ) {
    return socketInstance;
  }

  if (socketInstance) {
    disconnectAdminNotificationSocket();
  }

  const base = getApiBaseUrl();
  console.log("[admin-notifications] socket creating", { url: base });

  const socket = io(base, {
    autoConnect: false,
    path: "/socket.io",
    transports: ["polling", "websocket"],
    auth: { token: tk },
    query: { token: tk },
    reconnection: true,
    reconnectionAttempts: 12,
  });

  ensureAdminNotificationListener(socket);
  console.log("[admin-notifications] socket connecting");
  socket.connect();

  socketInstance = socket;
  activeToken = tk;
  return socketInstance;
}

export function disconnectAdminNotificationSocket() {
  if (!socketInstance) return;
  socketInstance.disconnect();
  socketInstance = null;
  activeToken = "";
  listenersMounted = false;
}

export function getAdminNotificationSocket() {
  return socketInstance;
}

export function isAdminNotificationSocketConnected() {
  return Boolean(socketInstance && socketInstance.connected);
}
