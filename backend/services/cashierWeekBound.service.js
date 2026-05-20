/**
 * Cashier date window (server-side): current business week Saturday → Friday (local calendar).
 * Active range: [weekStart, min(today, weekEndFriday)] while the week is in progress.
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
 * Current business week (Sat–Fri). `to` is capped at today while the week is ongoing.
 * @param {Date} [now]
 * @returns {{ from: string, to: string, weekStart: string, weekEnd: string }}
 */
function getCashierWeekRange(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = today.getDay();

  let daysBack;
  if (dow === 6) {
    daysBack = 0;
  } else if (dow === 0) {
    daysBack = 1;
  } else {
    daysBack = dow + 1;
  }

  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - daysBack);

  const weekEndFriday = new Date(weekStart);
  weekEndFriday.setDate(weekStart.getDate() + 6);

  const toCap =
    today.getTime() <= weekEndFriday.getTime() ? today : weekEndFriday;

  return {
    from: toYMD(weekStart),
    to: toYMD(toCap),
    weekStart: toYMD(weekStart),
    weekEnd: toYMD(weekEndFriday),
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
  if (isValidYmd(w.from) && isValidYmd(w.to) && w.from <= w.to) {
    return { from: w.from, to: w.to };
  }
  const today = toYMD(new Date());
  return {
    from: isValidYmd(w.from) ? w.from : today,
    to: isValidYmd(w.to) ? w.to : today,
  };
}

/**
 * Register `date` must lie in the canonical cashier window (current Sat–Fri, strict).
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
