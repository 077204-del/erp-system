import { ERP_CACHE_SCHEMA } from "../config/apiBase";
import {
  OFFLINE_CACHE_PREFIX,
  OFFLINE_CACHE_SCHEMA_KEY,
} from "./offlineConstants";

const MAX_ENTRY_CHARS = 450_000;

function keyFor(config) {
  const method = (config.method || "get").toLowerCase();
  const url = String(config.url || "").replace(/\?.*$/, "");
  const params = config.params ? JSON.stringify(config.params) : "";
  return `${OFFLINE_CACHE_PREFIX}${method}:${url}?${params}`;
}

export function shouldCacheGetUrl(url, config) {
  if (config && config.__erpFresh === true) return false;
  const u = String(url || "").split("?")[0];
  /** Dashboard must never be cached — prevents web/mobile KPI drift. */
  if (u.endsWith("/api/dashboard") || u.endsWith("/api/reports")) return false;
  /** Role-sensitive payloads — never cache (prevents costPrice leakage across sessions). */
  if (u.endsWith("/api/products") || u.endsWith("/api/sales")) return false;
  return (
    u.endsWith("/api/expenses") ||
    u.endsWith("/api/clients") ||
    u.endsWith("/api/payments")
  );
}

export function cacheSuccessfulGet(config, data, status) {
  if ((config.method || "get").toLowerCase() !== "get") return;
  if (!shouldCacheGetUrl(config.url, config)) return;
  if (config.__erpReplay) return;
  try {
    const payload = JSON.stringify({
      t: Date.now(),
      status: status || 200,
      data,
    });
    if (payload.length > MAX_ENTRY_CHARS) return;
    localStorage.setItem(keyFor(config), payload);
  } catch {
    /* quota */
  }
}

export function readCachedGet(config) {
  if (config && config.__erpFresh === true) return null;
  const u = String(config.url || "").split("?")[0];
  if (
    u.endsWith("/api/dashboard") ||
    u.endsWith("/api/reports") ||
    u.endsWith("/api/products") ||
    u.endsWith("/api/sales")
  ) {
    return null;
  }
  try {
    const raw = localStorage.getItem(keyFor(config));
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return null;
    return { data: o.data, status: o.status || 200 };
  } catch {
    return null;
  }
}

function collectCacheKeys(matcher) {
  const toRemove = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (matcher(k)) toRemove.push(k);
    }
    toRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}

/** Remove all API response caches (schema migration + app boot). */
export function purgeApiCachesOnBoot() {
  try {
    const prev = localStorage.getItem(OFFLINE_CACHE_SCHEMA_KEY);
    const schemaChanged = prev !== ERP_CACHE_SCHEMA;
    if (schemaChanged) {
      localStorage.setItem(OFFLINE_CACHE_SCHEMA_KEY, ERP_CACHE_SCHEMA);
    }
    collectCacheKeys(
      (k) =>
        k.startsWith("erp_api_cache") ||
        k.startsWith(OFFLINE_CACHE_PREFIX) ||
        k.includes(":get:/api/dashboard") ||
        k.includes(":get:/api/reports")
    );
  } catch {
    /* ignore */
  }
}

/** Drop cached workspace GETs after mutations. */
export function invalidateWorkspaceCaches() {
  collectCacheKeys(
    (k) =>
      k.startsWith(OFFLINE_CACHE_PREFIX) &&
      (k.includes(":get:/api/products") ||
        k.includes(":get:/api/clients") ||
        k.includes(":get:/api/sales") ||
        k.includes(":get:/api/payments") ||
        k.includes(":get:/api/expenses") ||
        k.includes(":get:/api/dashboard") ||
        k.includes(":get:/api/reports"))
  );
}
