/**
 * Money field guards for API responses (no business formulas).
 */

function parseMoney(value, fallback = 0) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n < 0 ? 0 : n;
}

function pickMoney(source, keys) {
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

function lockMoneyFields(obj, fieldNames) {
  if (!obj || typeof obj !== "object") return obj;
  const out = { ...obj };
  fieldNames.forEach((name) => {
    if (Object.prototype.hasOwnProperty.call(out, name)) {
      out[name] = parseMoney(out[name]);
    }
  });
  return out;
}

module.exports = {
  parseMoney,
  pickMoney,
  lockMoneyFields,
};
