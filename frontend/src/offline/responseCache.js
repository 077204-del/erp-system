import { OFFLINE_CACHE_PREFIX } from "./offlineConstants";

const MAX_ENTRY_CHARS = 450_000;

function keyFor(config) {
  const method = (config.method || "get").toLowerCase();
  const url = String(config.url || "").replace(/\?.*$/, "");
  const params = config.params ? JSON.stringify(config.params) : "";
  return `${OFFLINE_CACHE_PREFIX}${method}:${url}?${params}`;
}

export function shouldCacheGetUrl(url) {
  const u = String(url || "").split("?")[0];
  return (
    u.endsWith("/api/dashboard") ||
    u.endsWith("/api/sales") ||
    u.endsWith("/api/expenses") ||
    u.endsWith("/api/products") ||
    u.endsWith("/api/clients") ||
    u.endsWith("/api/payments")
  );
}

export function cacheSuccessfulGet(config, data, status) {
  if ((config.method || "get").toLowerCase() !== "get") return;
  if (!shouldCacheGetUrl(config.url)) return;
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

/** Drop cached workspace GETs so lists refresh after mutations (online or queued offline). */
export function invalidateWorkspaceCaches() {
  try {
    const prefix = OFFLINE_CACHE_PREFIX;
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      if (
        k.includes(":get:/api/products") ||
        k.includes(":get:/api/clients") ||
        k.includes(":get:/api/sales") ||
        k.includes(":get:/api/payments") ||
        k.includes(":get:/api/expenses") ||
        k.includes(":get:/api/dashboard")
      ) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}
