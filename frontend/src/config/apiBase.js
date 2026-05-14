/**
 * Backend API origin only (Render Express). Used by axios (`src/api.js`) and offline replay.
 * CRA bakes `REACT_APP_*` at **build** time — set `REACT_APP_API_URL` in `.env.production` before `npm run build`.
 *
 * Resolution order:
 *   1) `window.__ERP_API_BASE__` (optional runtime override in WebView)
 *   2) `process.env.REACT_APP_API_URL`
 *   3) `DEFAULT_API_ORIGIN` (production Render default below)
 *
 * Remote UI (optional): `capacitor.config.json` → `server.url` before `npx cap sync` — keep API base separate.
 */

const DEFAULT_API_ORIGIN = "https://erp-system-1-rgd2.onrender.com";

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

  return DEFAULT_API_ORIGIN;
}
