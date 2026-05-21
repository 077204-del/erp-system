import { useEffect } from "react";
import {
  bootAdminNotificationSocket,
  connectAdminNotificationSocket,
} from "../services/adminNotificationSocket";

console.log("[ADMIN SOCKET INIT] AdminNotificationBridge module loaded");

/**
 * Root-level admin socket bridge — must mount once, no route guards.
 * DEBUG: forces socket boot on every app load (role/token checks bypassed in service).
 */
export default function AdminNotificationBridge() {
  console.log("[ADMIN SOCKET INIT] bridge mounted");

  useEffect(() => {
    console.log("[ADMIN SOCKET INIT] bridge effect — starting socket");
    bootAdminNotificationSocket({ forceReconnect: true });

    const onStorage = () => {
      let tk = "";
      try {
        tk = localStorage.getItem("token") || "";
      } catch {
        /* ignore */
      }
      console.log("[ADMIN SOCKET INIT] token storage change — reconnect", {
        hasToken: Boolean(String(tk).trim()),
      });
      connectAdminNotificationSocket(tk, { forceReconnect: true });
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return null;
}
