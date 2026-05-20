/**
 * Calendar YYYY-MM-DD in the browser's local timezone (not UTC).
 * Aligns with backend `rangeBoundsUTC` / `getDateRange` which parse Y-M-D as local wall dates.
 */

export function localCalendarYmd(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** True if `d` falls on the same local calendar day as `isoYmd` (YYYY-MM-DD). */
export function isSameLocalCalendarDay(isoYmd, d) {
  if (!isoYmd || !d) return false;
  try {
    return localCalendarYmd(d) === String(isoYmd).trim();
  } catch {
    return false;
  }
}
