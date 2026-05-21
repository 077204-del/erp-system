/**
 * Single source of truth for the active Render backend (Express API).
 * All axios calls MUST use getApiBaseUrl() — never hardcode other Render service URLs.
 *
 * Deprecated (do not use): erp-system-2, erp-system-3, or any non-active host.
 */

/** Active production API — only this service should receive traffic. */
export const ACTIVE_API_ORIGIN = "https://erp-system-1-rgd2.onrender.com";

const ACTIVE_HOST = "erp-system-1-rgd2.onrender.com";

/** Hostname fragments that must never be used as API base. */
const DEPRECATED_HOST_PATTERNS = [
  /erp-system-2/i,
  /erp-system-3/i,
  /erp-system-2-/i,
  /erp-system-3-/i,
];

export const ERP_CACHE_SCHEMA = "erp_cache_v6";

function normalizeBase(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "");
}

export function isDeprecatedApiHost(url) {
  const s = normalizeBase(url).toLowerCase();
  if (!s) return false;
  return DEPRECATED_HOST_PATTERNS.some((re) => re.test(s));
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isAllowedApiOrigin(url) {
  const base = normalizeBase(url);
  if (!base || isDeprecatedApiHost(base)) return false;
  try {
    const u = new URL(base.startsWith("http") ? base : `https://${base}`);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    return u.hostname === ACTIVE_HOST;
  } catch {
    return false;
  }
}

function resolveApiOrigin() {
  const fromEnv = normalizeBase(process.env.REACT_APP_API_URL || "");
  const canonical = normalizeBase(ACTIVE_API_ORIGIN);

  if (fromEnv && isAllowedApiOrigin(fromEnv)) {
    return fromEnv;
  }
  if (fromEnv && isDeprecatedApiHost(fromEnv)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[API] Ignoring deprecated REACT_APP_API_URL:",
        fromEnv,
        "→ using",
        canonical
      );
    }
  }

  return canonical;
}

/**
 * Pin canonical API origin on window (overwrites stale Capacitor/WebView overrides).
 */
export function initApiBaseRuntime() {
  if (typeof window === "undefined") return getApiBaseUrl();
  const resolved = getApiBaseUrl();
  try {
    window.__ERP_API_BASE__ = resolved;
  } catch {
    /* ignore */
  }
  return resolved;
}

/**
 * @returns {string} API origin without trailing slash
 */
export function getApiBaseUrl() {
  let resolved = resolveApiOrigin();
  if (!isAllowedApiOrigin(resolved)) {
    resolved = normalizeBase(ACTIVE_API_ORIGIN);
  }
  if (typeof window !== "undefined") {
    try {
      window.__ERP_API_BASE__ = resolved;
    } catch {
      /* ignore */
    }
  }
  return resolved;
}
