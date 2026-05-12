const jwt = require("jsonwebtoken");

function normalizeRoles(roles) {
  if (Array.isArray(roles)) {
    return roles.filter((r) => r != null && r !== "").map(String);
  }
  if (typeof roles === "string" && roles.trim()) {
    return [roles.trim()];
  }
  return [];
}

const KNOWN_PERMISSIONS = new Set([
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
]);

const CASHIER_DEFAULT_ALLOWED = new Set([
  "canCreateSales",
  "canCreatePayments",
]);

function hasRequestedPermission(user, permissions) {
  if (!permissions.length) return true;
  if (user && String(user.role || "").toLowerCase() === "admin") return true;
  // Default cashier mode (no granular map): keep only operational create flows.
  if (user == null || user.permissions == null) {
    return permissions.every((key) => CASHIER_DEFAULT_ALLOWED.has(key));
  }
  const perms = user.permissions;
  if (typeof perms !== "object") {
    return permissions.every((key) => CASHIER_DEFAULT_ALLOWED.has(key));
  }
  return permissions.every((key) => perms[key] === true);
}

function authorize(allowedRoles) {
  return (req, res, next) => {
    try {
      const header = req.headers.authorization;

      if (!header) {
        return res.status(401).json({ message: "No token" });
      }

      const token = header.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;

      const requiredPermissions = allowedRoles.filter((x) =>
        KNOWN_PERMISSIONS.has(x)
      );
      const requiredRoles = allowedRoles.filter(
        (x) => !KNOWN_PERMISSIONS.has(x)
      );

      if (
        requiredRoles.length &&
        !requiredRoles.includes(decoded.role)
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (!hasRequestedPermission(decoded, requiredPermissions)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      next();
    } catch (err) {
      return res.status(401).json({ message: "Invalid token" });
    }
  };
}

function auth(roles) {
  return authorize(normalizeRoles(roles));
}

function allowRoles(...roles) {
  const flat = roles
    .flat()
    .filter((r) => r != null && r !== "")
    .map(String);
  return authorize(flat);
}

auth.allowRoles = allowRoles;

module.exports = auth;
