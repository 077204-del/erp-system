export function safeNum(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

export function safeText(v, fallback = "—") {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s.length ? s : fallback;
}

/** Latin digits, LTR-friendly (use inside RTL UI with .erp-table-num / .erp-num). */
export function formatNumber(v) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(safeNum(v, 0));
}

/** Money amounts (Algeria DZD) — use for prices/totals; keep {@link formatNumber} for qty/counts. */
export function formatMoneyDZD(v) {
  return `${formatNumber(v)} DZD`;
}

export function sumSaleTotals(sales) {
  if (!Array.isArray(sales)) return 0;
  return sales.reduce((acc, s) => acc + safeNum(s?.total, 0), 0);
}

export function apiErrorMessage(err) {
  if (!err) return "Request failed";
  const d = err.response && err.response.data;
  if (!d) return err.message || "Request failed";
  if (d.code === "INSUFFICIENT_STOCK") {
    const a =
      d.available !== undefined && d.available !== null
        ? d.available
        : "?";
    return `Not enough stock (available: ${a}).`;
  }
  return d.message || d.error || err.message || "Request failed";
}
