import { io } from "socket.io-client";
import { getApiBaseUrl } from "../config/apiBase";
import { formatMoneyDZD } from "../utils/erpFormat";

/** Must match backend: io.to("admins").emit("admin_notification", …) */
export const ADMIN_NOTIFICATION_EVENT = "admin_notification";
export const ADMIN_SOCKET_ROOM = "admins";

/** DEBUG: bypass role/token gates until notifications work in production. */
const FORCE_ADMIN_SOCKET_INIT = true;

let socketInstance = null;
let activeToken = "";
let toastApi = null;
let bootStarted = false;

function readAuthToken() {
  try {
    return String(localStorage.getItem("token") || "").trim();
  } catch {
    return "";
  }
}

function handleNotificationPayload(payload) {
  console.log("[ADMIN SOCKET INIT] admin_notification received", payload);
  if (!payload || typeof payload !== "object") return;
  const msg = String(payload.message || "").trim() || "Cashier activity";
  const amt = Number(payload.amount);
  const detail =
    Number.isFinite(amt) && amt > 0 ? ` · ${formatMoneyDZD(amt)}` : "";
  if (toastApi && typeof toastApi.info === "function") {
    toastApi.info(`${msg}${detail}`, payload.type || "Notification");
  }
}

function mountAdminNotificationListeners(socket) {
  if (socket.__erpAdminListenersMounted) {
    return;
  }
  socket.__erpAdminListenersMounted = true;

  socket.on("connect", () => {
    console.log("[SOCKET CONNECTED]", {
      socketId: socket.id,
      connected: socket.connected,
      event: ADMIN_NOTIFICATION_EVENT,
      room: ADMIN_SOCKET_ROOM,
    });
  });

  socket.on("admin_socket_ready", (meta) => {
    console.log("[joined admins room]", meta);
  });

  socket.on("connect_error", (err) => {
    console.warn("[ADMIN SOCKET INIT] connect_error", err?.message || err);
  });

  socket.on("disconnect", (reason) => {
    console.log("[ADMIN SOCKET INIT] disconnected", reason);
  });

  socket.on(ADMIN_NOTIFICATION_EVENT, handleNotificationPayload);
  console.log(
    "[ADMIN SOCKET INIT] listener mounted for",
    ADMIN_NOTIFICATION_EVENT
  );
}

/**
 * App-load boot: runs from index.js before React tree (forced debug).
 */
export function bootAdminNotificationSocket(options = {}) {
  if (bootStarted && socketInstance?.connected && !options.forceReconnect) {
    console.log("[ADMIN SOCKET INIT] boot already started — reusing socket");
    return socketInstance;
  }
  bootStarted = true;
  const tk = readAuthToken();
  console.log("[ADMIN SOCKET INIT] bootAdminNotificationSocket", {
    hasToken: Boolean(tk),
    force: FORCE_ADMIN_SOCKET_INIT,
  });
  return connectAdminNotificationSocket(tk, {
    ...options,
    force: FORCE_ADMIN_SOCKET_INIT,
  });
}

/**
 * Singleton admin Socket.IO client. Server joins room "admins" on handshake.
 */
export function connectAdminNotificationSocket(token, options = {}) {
  const force = FORCE_ADMIN_SOCKET_INIT || options.force === true;
  const tk = String(token || readAuthToken() || "").trim();

  if (!tk && !force) {
    console.log("[ADMIN SOCKET INIT] connect skipped — no token");
    return null;
  }

  if (options.toast) {
    toastApi = options.toast;
  }

  if (
    socketInstance &&
    activeToken === tk &&
    socketInstance.connected &&
    !options.forceReconnect
  ) {
    console.log("[ADMIN SOCKET INIT] reusing connected socket", {
      socketId: socketInstance.id,
    });
    return socketInstance;
  }

  if (socketInstance) {
    disconnectAdminNotificationSocket();
  }

  const base = getApiBaseUrl();
  console.log("[ADMIN SOCKET INIT] socket creating", { url: base, hasToken: Boolean(tk) });

  const socket = io(base, {
    autoConnect: false,
    path: "/socket.io",
    transports: ["polling", "websocket"],
    auth: tk ? { token: tk } : {},
    reconnection: true,
    reconnectionAttempts: 12,
  });

  mountAdminNotificationListeners(socket);
  console.log("[ADMIN SOCKET INIT] socket connecting");
  socket.connect();

  socketInstance = socket;
  activeToken = tk;
  return socketInstance;
}

export function disconnectAdminNotificationSocket() {
  if (!socketInstance) return;
  console.log("[ADMIN SOCKET INIT] disconnecting admin socket");
  socketInstance.removeAllListeners();
  socketInstance.close();
  socketInstance = null;
  activeToken = "";
  bootStarted = false;
}

export function getAdminNotificationSocket() {
  return socketInstance;
}

export function isAdminNotificationSocketConnected() {
  return Boolean(socketInstance && socketInstance.connected);
}
