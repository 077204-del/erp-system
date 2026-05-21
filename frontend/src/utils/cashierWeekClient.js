import { localCalendarYmd } from "./localCalendarYmd";

/** Parse YYYY-MM-DD or Date as local calendar noon (avoids UTC drift). */
function parseLocalCalendarDate(input) {
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return new Date(
      input.getFullYear(),
      input.getMonth(),
      input.getDate(),
      12,
      0,
      0,
      0
    );
  }
  const s = String(input ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  const fallback = new Date(input);
  if (Number.isNaN(fallback.getTime())) {
    return new Date();
  }
  return new Date(
    fallback.getFullYear(),
    fallback.getMonth(),
    fallback.getDate(),
    12,
    0,
    0,
    0
  );
}

/** Cashier "Today" preset — local calendar YYYY-MM-DD. */
export function cashierTodayRange(now = new Date()) {
  const today =
    typeof now === "string" && /^\d{4}-\d{2}-\d{2}$/.test(now.trim())
      ? now.trim()
      : localCalendarYmd(parseLocalCalendarDate(now));
  return { from: today, to: today };
}

/**
 * Cashier week: Saturday (inclusive) → today (local calendar). Never ISO/Mon–Sun week.
 * @param {Date|string} date
 */
export function getCashierWeekRange(date) {
  const d = parseLocalCalendarDate(date ?? new Date());
  const day = d.getDay();
  const diffToSaturday = (day + 1) % 7;
  const saturday = new Date(d);
  saturday.setDate(d.getDate() - diffToSaturday);
  const toYmd = localCalendarYmd(new Date());
  return {
    from: localCalendarYmd(saturday),
    to: toYmd,
  };
}
