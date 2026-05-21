import { normalizeRoleClient } from "./rbacClient";

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

/** Decode JWT payload (no signature verify) — UI routing only. */
export function decodeJwtPayloadUnsafe() {
  try {
    const t = localStorage.getItem("token");
    if (!t) return null;
    const parts = t.split(".");
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (b64.length % 4)) % 4;
    if (pad) b64 += "=".repeat(pad);
    const json = JSON.parse(atob(b64));
    return json && typeof json === "object" ? json : null;
  } catch {
    return null;
  }
}

/**
 * JWT role wins over stale localStorage.user (keeps cashier/admin UI in sync).
 */
export function readStoredUserWithJwtSync() {
  const u = readStoredUser();
  const jwt = decodeJwtPayloadUnsafe();
  if (!jwt) return u;

  const jwtRole = jwt.role != null ? normalizeRoleClient(jwt.role) : "";
  if (!jwtRole) return u;

  const merged = {
    ...(u && typeof u === "object" ? u : {}),
    role: jwtRole,
    ...(jwt.permissions != null && typeof jwt.permissions === "object"
      ? { permissions: jwt.permissions }
      : {}),
  };
  if (merged.id == null && jwt.id != null) merged.id = String(jwt.id);

  const storedRole = u != null ? normalizeRoleClient(u.role) : "";
  if (jwtRole !== storedRole) {
    try {
      localStorage.setItem("user", JSON.stringify(merged));
    } catch {
      /* ignore */
    }
  }
  return merged;
}

/** Single source of truth for workspace UI role routing. */
export function resolveWorkspaceRole() {
  const jwt = decodeJwtPayloadUnsafe();
  const u = readStoredUserWithJwtSync();
  const fromJwt =
    jwt?.role != null ? normalizeRoleClient(jwt.role) : "";
  if (fromJwt) return fromJwt;
  return normalizeRoleClient(u?.role);
}

export function isCashierWorkspaceRole(role) {
  return resolveWorkspaceRole() === "cashier";
}
