import { localCalendarYmd } from "./localCalendarYmd";

/** Cashier "Today" preset — local calendar YYYY-MM-DD. */
export function cashierTodayRange(now = new Date()) {
  const today = localCalendarYmd(now);
  return { from: today, to: today };
}

/**
 * Cashier business week: last Saturday (inclusive) → today (local calendar).
 * Never extends to future Friday or Sunday-based weeks.
 */
export function getCashierWeekRange(now = new Date()) {
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = todayDate.getDay();

  let daysBack;
  if (dow === 6) {
    daysBack = 0;
  } else if (dow === 0) {
    daysBack = 1;
  } else {
    daysBack = dow + 1;
  }

  const weekStart = new Date(todayDate);
  weekStart.setDate(todayDate.getDate() - daysBack);

  return {
    from: localCalendarYmd(weekStart),
    to: localCalendarYmd(todayDate),
  };
}

/** @deprecated Use getCashierWeekRange */
export const cashierSatToTodayRange = getCashierWeekRange;
