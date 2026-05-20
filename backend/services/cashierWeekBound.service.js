/**
 * Cashier date window (server-side): last completed business week
 * Saturday 00:00:00 → Friday 23:59:59.999 (local calendar), same bounds style as rangeBoundsUTC.
 * The "current" week (Sat containing today) is excluded; data is always the prior full Sat–Fri block.
 */

function toYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isValidYmd(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

/**
 * Last full business week: previous Saturday through the following Friday (local YMD).
 * Inclusive date strings pair with expenseQuery.rangeBoundsUTC (local day edges).
 * @param {Date} [now]
 * @returns {{ from: string, to: string, weekStart: string, weekEnd: string }}
 */
function getCashierWeekRange(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = today.getDay();

  let daysBackToCurrentSaturday;
  if (dow === 6) {
    daysBackToCurrentSaturday = 0;
  } else if (dow === 0) {
    daysBackToCurrentSaturday = 1;
  } else {
    daysBackToCurrentSaturday = dow + 1;
  }

  const currentWeekSaturday = new Date(today);
  currentWeekSaturday.setDate(today.getDate() - daysBackToCurrentSaturday);

  const lastFullWeekSaturday = new Date(currentWeekSaturday);
  lastFullWeekSaturday.setDate(currentWeekSaturday.getDate() - 7);

  const lastFullWeekFriday = new Date(lastFullWeekSaturday);
  lastFullWeekFriday.setDate(lastFullWeekSaturday.getDate() + 6);

  return {
    from: toYMD(lastFullWeekSaturday),
    to: toYMD(lastFullWeekFriday),
    weekStart: toYMD(lastFullWeekSaturday),
    weekEnd: toYMD(lastFullWeekFriday),
  };
}

/** @deprecated Use getCashierWeekRange — kept for existing imports. */
function getCashierWeekQueryRange(now) {
  const w = getCashierWeekRange(now);
  return { from: w.from, to: w.to };
}

/**
 * Single source of truth for cashier sales/financial range (ignores query from/to).
 * @returns {{ from: string, to: string }}
 */
function resolveCashierFromTo() {
  const w = getCashierWeekRange();
  return { from: w.from, to: w.to };
}

/**
 * Register `date` must lie in the canonical cashier window (last full Sat–Fri, strict).
 */
function isCashierAllowedRegisterDate(dateStr, now = new Date()) {
  if (!isValidYmd(dateStr)) {
    return false;
  }
  const s = String(dateStr).trim();
  const w = getCashierWeekRange(now);
  return s >= w.from && s <= w.to;
}

module.exports = {
  getCashierWeekRange,
  getCashierWeekQueryRange,
  resolveCashierFromTo,
  isCashierAllowedRegisterDate,
};
