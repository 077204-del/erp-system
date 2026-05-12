/**
 * API origin (web + Capacitor). No localhost — LAN default for mobile compatibility.
 * Optional runtime override (before React root mounts):
 *   window.__ERP_API_BASE__ = "https://api.example.com"
 */

const LAN_DEFAULT = "http://192.168.1.7:5000";

function normalizeBase(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "");
}

function runtimeOverride() {
  if (typeof window === "undefined") return "";
  try {
    return normalizeBase(window.__ERP_API_BASE__);
  } catch {
    return "";
  }
}

/**
 * @returns {string} API origin without trailing slash
 */
export function getApiBaseUrl() {
  const rt = runtimeOverride();
  if (rt) return rt;

  const fromEnv = normalizeBase(process.env.REACT_APP_API_URL);
  if (fromEnv) return fromEnv;

  return LAN_DEFAULT;
}
