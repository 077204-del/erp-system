import { Capacitor } from "@capacitor/core";
import { WEB_APP_BUILD_ID } from "./config/webBuildId";
import { ERP_CACHE_SCHEMA } from "./config/apiBase";

const NATIVE_BUILD_KEY = "erp_native_web_build_id";

const PRESERVE_LOCAL_KEYS = new Set([
  "token",
  "user",
  "erp-theme",
  "erp-sidebar-collapsed",
  "erp-ui-compact",
  NATIVE_BUILD_KEY,
]);

async function unregisterServiceWorkers() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    /* ignore */
  }
}

async function clearBrowserCaches() {
  if (typeof window === "undefined" || !window.caches) {
    return;
  }
  try {
    const keys = await window.caches.keys();
    await Promise.all(keys.map((k) => window.caches.delete(k)));
  } catch {
    /* ignore */
  }
}

function purgeStaleLocalStorage() {
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (!k || PRESERVE_LOCAL_KEYS.has(k)) continue;
      if (
        k.startsWith("erp_api_cache") ||
        k.startsWith(ERP_CACHE_SCHEMA) ||
        k.includes(":get:/api/") ||
        k === "erp_cache_schema" ||
        k === "erp_offline_queue"
      ) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/**
 * Native/Capacitor: drop stale offline caches after APK or web deploy updates.
 * Does not touch auth token or user profile in localStorage.
 */
export async function initNativeWebCache() {
  if (typeof window === "undefined") {
    return;
  }

  const isNative = Capacitor.isNativePlatform();
  let priorBuild = "";
  try {
    priorBuild = localStorage.getItem(NATIVE_BUILD_KEY) || "";
  } catch {
    /* ignore */
  }

  const buildChanged = priorBuild !== WEB_APP_BUILD_ID;

  if (isNative || buildChanged) {
    await unregisterServiceWorkers();
    await clearBrowserCaches();
    if (buildChanged) {
      purgeStaleLocalStorage();
    }
  }

  try {
    localStorage.setItem(NATIVE_BUILD_KEY, WEB_APP_BUILD_ID);
    document.documentElement.setAttribute(
      "data-erp-build",
      WEB_APP_BUILD_ID
    );
  } catch {
    /* ignore */
  }
}
