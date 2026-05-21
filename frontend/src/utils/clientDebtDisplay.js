import { buildClientDebtRows, normalizeId } from "./erpAggregates";
import { safeNum } from "./erpFormat";

/**
 * Resolve outstanding debt for one client from workspace cache (no new API).
 * Prefers client.totalDebt, then Σ sale.debt, then debt-summary style rollup.
 */
export function resolveClientDebtFromWorkspace(clientId, clients, sales, payments) {
  if (!clientId) return 0;
  const id = String(clientId);

  const client = (Array.isArray(clients) ? clients : []).find(
    (c) => normalizeId(c._id) === id
  );
  if (client) {
    const stored =
      client.totalDebt ??
      client.debt ??
      client.balance ??
      client.remainingDebt;
    if (stored != null && Number.isFinite(Number(stored))) {
      return Math.max(0, Number(stored));
    }
  }

  const salesArr = Array.isArray(sales) ? sales : [];
  let lineDebtSum = 0;
  let hasLineDebt = false;
  salesArr.forEach((s) => {
    const cid = normalizeId(s.clientId);
    if (cid !== id) return;
    const d = safeNum(s.debt, 0);
    if (d > 0) {
      lineDebtSum += d;
      hasLineDebt = true;
    }
  });
  if (hasLineDebt) return lineDebtSum;

  const rows = buildClientDebtRows(clients, sales, payments);
  const row = rows.find((r) => String(r._id) === id);
  return row ? Math.max(0, safeNum(row.debt, 0)) : 0;
}
