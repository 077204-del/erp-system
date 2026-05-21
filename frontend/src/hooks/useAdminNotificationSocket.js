import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { getApiBaseUrl } from "../config/apiBase";
import { formatMoneyDZD } from "../utils/erpFormat";

/**
 * Admin-only: listen for cashier activity via Socket.IO (room "admins").
 * Does not affect cashier sessions or API contracts.
 */
export function useAdminNotificationSocket({ enabled, onNotification, toast }) {
  const onNotificationRef = useRef(onNotification);
  onNotificationRef.current = onNotification;

  useEffect(() => {
    if (!enabled) return undefined;
    let token = "";
    try {
      token = localStorage.getItem("token") || "";
    } catch {
      return undefined;
    }
    if (!token.trim()) return undefined;

    const base = getApiBaseUrl();
    const socket = io(base, {
      transports: ["websocket", "polling"],
      auth: { token: token.trim() },
      reconnection: true,
      reconnectionAttempts: 8,
    });

    socket.on("admin_notification", (payload) => {
      if (!payload || typeof payload !== "object") return;
      const msg = String(payload.message || "").trim() || "Cashier activity";
      const amt = Number(payload.amount);
      const detail =
        Number.isFinite(amt) && amt > 0 ? ` · ${formatMoneyDZD(amt)}` : "";
      if (typeof onNotificationRef.current === "function") {
        onNotificationRef.current(payload);
      }
      if (toast && typeof toast.info === "function") {
        toast.info(`${msg}${detail}`, payload.type || "Notification");
      }
    });

    return () => {
      socket.removeAllListeners();
      socket.close();
    };
  }, [enabled, toast]);
}
