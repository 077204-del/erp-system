import { useEffect, useRef } from "react";
import { useErpUi } from "../context/ErpUiContext";
import {
  connectAdminNotificationSocket,
  disconnectAdminNotificationSocket,
} from "../services/adminNotificationSocket";
import { Capacitor } from "@capacitor/core";
import { resolveWorkspaceRole } from "../utils/workspaceRole";

/**
 * Global admin socket — mounted once inside ErpUiProvider at App root.
 * Connects only for admin role after login (server joins room "admins").
 */
export default function AdminNotificationBridge({ token }) {
  const { toast } = useErpUi();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const role = resolveWorkspaceRole();
  const isAdmin = role === "admin";
  const tokenStr = String(token || "").trim();

  useEffect(() => {
    if (!isAdmin || !tokenStr) {
      disconnectAdminNotificationSocket();
      return undefined;
    }

    connectAdminNotificationSocket(tokenStr, {
      getToast: () => toastRef.current,
      forceReconnect: false,
    });

    return () => {
      if (!Capacitor.isNativePlatform()) {
        disconnectAdminNotificationSocket();
      }
    };
  }, [isAdmin, tokenStr]);

  return null;
}
