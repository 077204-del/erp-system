/**
 * Single backend API origin for all axios calls (Render Express).
 * Static SPA on Render must not rely on same-origin /api proxy.
 */

const ERP_API_ORIGIN = "https://erp-system-1-rgd2.onrender.com";

/**
 * @returns {string} API origin without trailing slash
 */
export function getApiBaseUrl() {
  return ERP_API_ORIGIN.replace(/\/+$/, "");
}
