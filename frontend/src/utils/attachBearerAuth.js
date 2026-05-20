/**
 * Attach Authorization for protected routes (Axios v1 AxiosHeaders-safe).
 * Strips the header on login/register so stale JWTs are not sent.
 */

function clearAuthorizationHeader(headers) {
  if (!headers) return;
  if (typeof headers.delete === "function") {
    headers.delete("Authorization");
    return;
  }
  try {
    delete headers.Authorization;
  } catch {
    /* ignore */
  }
}

/**
 * @param {import("axios").InternalAxiosRequestConfig} config
 */
export function attachBearerAuth(config) {
  const path = String(config.url || "").split("?")[0];
  if (path.includes("/api/auth/login") || path.includes("/api/auth/register")) {
    clearAuthorizationHeader(config.headers);
    return;
  }

  let raw = null;
  try {
    raw =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("token")
        : null;
  } catch {
    raw = null;
  }
  const token = raw != null ? String(raw).trim() : "";
  if (!token) {
    clearAuthorizationHeader(config.headers);
    return;
  }

  const bearer = `Bearer ${token}`;
  const h = config.headers;
  if (h && typeof h.set === "function") {
    h.set("Authorization", bearer, false);
    return;
  }
  config.headers = {
    ...(h && typeof h === "object" && !Array.isArray(h) ? h : {}),
    Authorization: bearer,
  };
}
