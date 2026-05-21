import { useEffect } from "react";
import { useErpUi } from "../context/ErpUiContext";
import {
  connectAdminNotificationSocket,
  disconnectAdminNotificationSocket,
} from "../services/adminNotificationSocket";
import { resolveWorkspaceRole } from "../utils/workspaceRole";

/**
 * Global admin layout: one Socket.IO connection + one admin_notification listener.
 * Mounted once at App root (not per page).
 */
export default function AdminNotificationBridge({ token }) {
  const { toast } = useErpUi();
  const role = resolveWorkspaceRole();
  const isAdmin = role === "admin";
  const hasToken = Boolean(token && String(token).trim());

  useEffect(() => {
    if (!hasToken || !isAdmin) {
      disconnectAdminNotificationSocket();
      return undefined;
    }

    connectAdminNotificationSocket(token, { toast });

    return () => {
      disconnectAdminNotificationSocket();
    };
  }, [hasToken, isAdmin, token]);

  return null;
}
