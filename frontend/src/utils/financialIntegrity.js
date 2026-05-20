/**
 * Production stability: parse API money fields only — no client-side financial formulas.
 */

export function parseMoney(value, fallback = 0) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n < 0 ? 0 : n;
}

/** Returns undefined when input is missing/invalid (optional KPI fields). */
export function parseMoneyOptional(value) {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n < 0 ? 0 : n;
}

export function pickMoney(source, keys) {
  if (!source || typeof source !== "object" || !Array.isArray(keys)) {
    return undefined;
  }
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i];
    if (!Object.prototype.hasOwnProperty.call(source, k)) continue;
    const v = source[k];
    if (v == null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n < 0 ? 0 : n;
  }
  return undefined;
}

export function hasMoney(value) {
  return value != null && Number.isFinite(Number(value));
}

/** Display-only: |grossProfit − expenses − netProfit| within tolerance (API consistency). */
export function profitIdentityDelta(grossProfit, expenses, netProfit) {
  if (
    !Number.isFinite(Number(grossProfit)) ||
    !Number.isFinite(Number(expenses)) ||
    !Number.isFinite(Number(netProfit))
  ) {
    return null;
  }
  return Number(grossProfit) - Number(expenses) - Number(netProfit);
}
