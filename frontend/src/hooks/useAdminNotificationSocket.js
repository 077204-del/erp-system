import { useEffect } from "react";
import {
  connectAdminNotificationSocket,
  disconnectAdminNotificationSocket,
  isAdminNotificationSocketConnected,
} from "../services/adminNotificationSocket";
import { resolveWorkspaceRole } from "../utils/workspaceRole";

/**
 * @deprecated Prefer AdminNotificationBridge at App root (single global listener).
 */
export function useAdminNotificationSocket({ enabled, toast }) {
  const workspaceRole = resolveWorkspaceRole();
  const socketEnabled = enabled !== false && workspaceRole === "admin";

  useEffect(() => {
    if (!socketEnabled) {
      return undefined;
    }
    let token = "";
    try {
      token = localStorage.getItem("token") || "";
    } catch {
      return undefined;
    }
    if (!token.trim()) return undefined;

    connectAdminNotificationSocket(token, { toast });
    return () => disconnectAdminNotificationSocket();
  }, [socketEnabled, toast]);

  return {
    connected: isAdminNotificationSocketConnected(),
    enabled: socketEnabled,
  };
}
