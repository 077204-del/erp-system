import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { getApiBaseUrl } from "../config/apiBase";
import { formatMoneyDZD } from "../utils/erpFormat";
import { resolveWorkspaceRole } from "../utils/workspaceRole";

/**
 * Admin-only (web): live cashier activity via Socket.IO room "admins".
 * Requires admin logged in on web; native push is not implemented yet.
 */
export function useAdminNotificationSocket({ enabled, onNotification, toast }) {
  const onNotificationRef = useRef(onNotification);
  const toastRef = useRef(toast);
  onNotificationRef.current = onNotification;
  toastRef.current = toast;

  const workspaceRole = resolveWorkspaceRole();
  const isAdminRole = workspaceRole === "admin";
  const socketEnabled = enabled !== false && isAdminRole;

  useEffect(() => {
    if (!socketEnabled) {
      console.log("[notifications:client] socket disabled", {
        enabled,
        workspaceRole,
        isAdminRole,
      });
      return undefined;
    }

    let token = "";
    try {
      token = localStorage.getItem("token") || "";
    } catch {
      return undefined;
    }
    if (!token.trim()) {
      console.log("[notifications:client] no auth token — skip socket");
      return undefined;
    }

    const base = getApiBaseUrl();
    console.log("[notifications:client] connecting", { url: base, role: workspaceRole });

    const socket = io(base, {
      path: "/socket.io",
      transports: ["polling", "websocket"],
      auth: { token: token.trim() },
      reconnection: true,
      reconnectionAttempts: 12,
    });

    socket.on("connect", () => {
      console.log("[notifications:client] socket connected", {
        socketId: socket.id,
        transport: socket.io.engine?.transport?.name,
      });
    });

    socket.on("admin_socket_ready", (meta) => {
      console.log("[notifications:client] admin room ready", meta);
    });

    socket.on("connect_error", (err) => {
      console.warn("[notifications:client] connect_error", err?.message || err);
    });

    socket.on("disconnect", (reason) => {
      console.log("[notifications:client] disconnected", reason);
    });

    socket.on("admin_notification", (payload) => {
      console.log("[notifications:client] admin_notification received", payload);
      if (!payload || typeof payload !== "object") return;
      const msg = String(payload.message || "").trim() || "Cashier activity";
      const amt = Number(payload.amount);
      const detail =
        Number.isFinite(amt) && amt > 0 ? ` · ${formatMoneyDZD(amt)}` : "";
      if (typeof onNotificationRef.current === "function") {
        onNotificationRef.current(payload);
      }
      const t = toastRef.current;
      if (t && typeof t.info === "function") {
        t.info(`${msg}${detail}`, payload.type || "Notification");
      }
    });

    return () => {
      console.log("[notifications:client] closing socket");
      socket.removeAllListeners();
      socket.close();
    };
  }, [socketEnabled, workspaceRole]);

  return { connectedRole: workspaceRole, enabled: socketEnabled };
}
