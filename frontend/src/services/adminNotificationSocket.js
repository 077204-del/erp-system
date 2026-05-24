import { Capacitor } from "@capacitor/core";
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
let webViewBootRegistered = false;
let pendingConnect = null;

function isNativeWebView() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

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

function getSocketIoOptions(token) {
  const native = isNativeWebView();
  return {
    autoConnect: false,
    path: "/socket.io",
    // Android WebView: polling-only avoids flaky cross-origin WebSocket upgrades
    transports: native ? ["polling"] : ["polling", "websocket"],
    upgrade: !native,
    auth: { token },
    query: { token },
    reconnection: true,
    reconnectionAttempts: native ? 20 : 12,
    reconnectionDelay: native ? 2000 : 1000,
    timeout: native ? 30000 : 20000,
  };
}

function ensureAdminNotificationListener(socket) {
  if (listenersMounted) return;
  listenersMounted = true;

  socket.on("connect", () => {
    if (isNativeWebView()) {
      console.log("WEBVIEW SOCKET CONNECTED", {
        socketId: socket.id,
        transport: socket.io?.engine?.transport?.name,
      });
    }
    console.log("socket connected", {
      socketId: socket.id,
      connected: socket.connected,
      room: ADMIN_SOCKET_ROOM,
      event: ADMIN_NOTIFICATION_EVENT,
      native: isNativeWebView(),
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

function runPendingConnect() {
  if (!pendingConnect) return;
  const job = pendingConnect;
  pendingConnect = null;
  job();
}

/**
 * Android WebView: wait for native onPageFinished / onResume signal before Socket.IO.
 */
export function whenWebViewReadyForSocket(callback) {
  if (!isNativeWebView()) {
    if (typeof document !== "undefined" && document.readyState !== "complete") {
      window.addEventListener("load", () => callback(), { once: true });
      return;
    }
    callback();
    return;
  }

  console.log("WEBVIEW SOCKET INIT");

  const run = () => {
    console.log("WEBVIEW SOCKET INIT — runtime ready");
    callback();
  };

  if (typeof window !== "undefined" && window.__erpWebViewReady) {
    run();
    return;
  }

  window.addEventListener("erp-webview-ready", run, { once: true });

  if (typeof document !== "undefined" && document.readyState === "complete") {
    window.setTimeout(run, 500);
  } else {
    window.addEventListener("load", () => window.setTimeout(run, 500), {
      once: true,
    });
  }

  window.setTimeout(run, 4000);
}

/**
 * Register global WebView resume hooks (Android Capacitor shell).
 */
export function initWebViewSocketBridge() {
  if (!isNativeWebView() || webViewBootRegistered) return;
  webViewBootRegistered = true;

  console.log("WEBVIEW SOCKET INIT — bridge registered");

  window.addEventListener("erp-webview-ready", () => {
    runPendingConnect();
    if (
      isAdminSession() &&
      readAuthToken() &&
      socketInstance &&
      !socketInstance.connected
    ) {
      console.log("WEBVIEW SOCKET INIT — reconnect after webview ready");
      socketInstance.connect();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !isAdminSession() || !readAuthToken()) return;
    console.log("WEBVIEW SOCKET INIT — visibility resume");
    window.dispatchEvent(new Event("erp-webview-ready"));
  });

  window.addEventListener("focus", () => {
    if (!isAdminSession() || !readAuthToken()) return;
    console.log("WEBVIEW SOCKET INIT — window focus");
    window.dispatchEvent(new Event("erp-webview-ready"));
  });
}

function connectAdminNotificationSocketNow(token, options = {}) {
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
  console.log("[admin-notifications] socket creating", {
    url: base,
    native: isNativeWebView(),
  });

  const socket = io(base, getSocketIoOptions(tk));
  ensureAdminNotificationListener(socket);
  console.log("[admin-notifications] socket connecting");
  socket.connect();

  socketInstance = socket;
  activeToken = tk;
  return socketInstance;
}

/**
 * Admin-only Socket.IO client. Server joins room "admins" on authenticated handshake.
 */
export function connectAdminNotificationSocket(token, options = {}) {
  pendingConnect = () => connectAdminNotificationSocketNow(token, options);

  if (isNativeWebView()) {
    whenWebViewReadyForSocket(() => {
      runPendingConnect();
    });
    return socketInstance;
  }

  return connectAdminNotificationSocketNow(token, options);
}

export function disconnectAdminNotificationSocket() {
  pendingConnect = null;
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
