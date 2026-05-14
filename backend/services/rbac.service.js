/**
 * Role-based effective permissions (JWT + middleware).
 * Keys must stay in sync with auth.middleware KNOWN_PERMISSIONS and user model.
 */

const PERMISSION_KEYS = [
  "canCreateSales",
  "canEditSales",
  "canDeleteSales",
  "canCreatePayments",
  "canDeletePayments",
  "canViewReports",
  "canManageClients",
  "canManageProducts",
  "canManageExpenses",
  "canManageUsers",
];

function emptyPermissionMap() {
  const o = {};
  for (const k of PERMISSION_KEYS) o[k] = false;
  return o;
}

function roleDefaultPermissions(role) {
  const r = String(role || "").toLowerCase();
  if (r === "admin") {
    const all = {};
    for (const k of PERMISSION_KEYS) all[k] = true;
    return all;
  }
  if (r === "manager") {
    return {
      ...emptyPermissionMap(),
      canCreateSales: true,
      canEditSales: true,
      canDeleteSales: false,
      canCreatePayments: true,
      canDeletePayments: false,
      canViewReports: true,
      canManageClients: true,
      canManageProducts: true,
      canManageExpenses: true,
      canManageUsers: false,
    };
  }
  /* cashier and unknown */
  return {
    ...emptyPermissionMap(),
    canCreateSales: true,
    canEditSales: true,
    canDeleteSales: false,
    canCreatePayments: true,
    canDeletePayments: false,
    canViewReports: false,
    canManageClients: true,
    canManageProducts: false,
    canManageExpenses: false,
    canManageUsers: false,
  };
}

/**
 * Merge stored DB overrides on top of role defaults.
 * Explicit true/false in stored map wins for that key.
 */
function mergePermissions(role, stored) {
  const base = roleDefaultPermissions(role);
  if (stored == null || typeof stored !== "object") {
    return base;
  }
  const out = { ...base };
  for (const k of PERMISSION_KEYS) {
    if (stored[k] === true) out[k] = true;
    if (stored[k] === false) out[k] = false;
  }
  return out;
}

function normalizeRole(role) {
  const r = String(role || "").trim().toLowerCase();
  if (r === "admin" || r === "manager" || r === "cashier") return r;
  return "cashier";
}

/**
 * Build req.user / JWT payload: same shape as legacy { id, role, permissions }.
 */
function mergeUserFromToken(decoded) {
  if (!decoded || typeof decoded !== "object") {
    return decoded;
  }
  const role = normalizeRole(decoded.role);
  const permissions = mergePermissions(role, decoded.permissions);
  return {
    ...decoded,
    id: decoded.id != null ? decoded.id : decoded._id,
    role,
    permissions,
  };
}

function permissionsForLoginUser(userDoc) {
  const role = normalizeRole(userDoc && userDoc.role);
  const stored =
    userDoc &&
    userDoc.permissions != null &&
    typeof userDoc.permissions === "object"
      ? userDoc.permissions
      : null;
  return mergePermissions(role, stored);
}

module.exports = {
  PERMISSION_KEYS,
  roleDefaultPermissions,
  mergePermissions,
  mergeUserFromToken,
  permissionsForLoginUser,
  normalizeRole,
};
