/** Client-side guards when API cache or legacy payloads omit access flags. */

export function normalizeRoleClient(role) {
  let r = String(role || "").trim().toLowerCase();
  if (r === "administrator" || r === "superadmin" || r === "owner") r = "admin";
  if (r === "admin" || r === "manager" || r === "cashier") return r;
  return r || "cashier";
}

export function stripProductCostFields(products) {
  if (!Array.isArray(products)) return [];
  return products.map((p) => {
    if (!p || typeof p !== "object") return p;
    const { costPrice, purchasePrice, margin, ...rest } = p;
    return rest;
  });
}

export function stripSaleFinancialFields(sales) {
  if (!Array.isArray(sales)) return [];
  return sales.map((s) => {
    if (!s || typeof s !== "object") return s;
    const { profit, margin, ...rest } = s;
    if (rest.productId && typeof rest.productId === "object") {
      const { costPrice, purchasePrice, margin: pm, ...pRest } = rest.productId;
      rest.productId = pRest;
    }
    return rest;
  });
}
