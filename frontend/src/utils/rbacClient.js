/** Role helpers for UI routing only — security is enforced on the backend. */

export function normalizeRoleClient(role) {
  let r = String(role || "").trim().toLowerCase();
  if (r === "administrator" || r === "superadmin" || r === "owner") r = "admin";
  if (r === "admin" || r === "manager" || r === "cashier") return r;
  return r || "cashier";
}

export function canViewFinancialRole(role) {
  const r = normalizeRoleClient(role);
  return r === "admin" || r === "manager";
}

export function canViewCostPriceRole(role) {
  return canViewFinancialRole(role);
}
