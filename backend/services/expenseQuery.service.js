const Expense = require("../models/expense.model");

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Align expense date windows with saleDate filtering in ledger.service (local calendar day). */
function rangeBoundsUTC(fromStr, toStr) {
  if (
    !fromStr ||
    !toStr ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(fromStr)) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(toStr))
  ) {
    return null;
  }
  const [fy, fm, fd] = String(fromStr).split("-").map(Number);
  const [ty, tm, td] = String(toStr).split("-").map(Number);
  let start = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
  let end = new Date(ty, tm - 1, td, 23, 59, 59, 999);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  if (start > end) {
    const t = start;
    start = end;
    end = t;
  }
  return { start, end };
}

function monthBoundsFromDateUTC(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  const y = x.getUTCFullYear();
  const m = x.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const last = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
  return { first, last };
}

function monthOverlapsRange(expenseDate, fromStr, toStr) {
  const bounds = rangeBoundsUTC(fromStr, toStr);
  if (!bounds) return false;
  const mb = monthBoundsFromDateUTC(expenseDate);
  if (!mb) return false;
  return mb.first <= bounds.end && mb.last >= bounds.start;
}

function enumerateMonthKeys(fromStr, toStr) {
  const bounds = rangeBoundsUTC(fromStr, toStr);
  if (!bounds) return [];
  const keys = [];
  let y = bounds.start.getUTCFullYear();
  let m = bounds.start.getUTCMonth();
  const endY = bounds.end.getUTCFullYear();
  const endM = bounds.end.getUTCMonth();
  while (y < endY || (y === endY && m <= endM)) {
    keys.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return keys;
}

function getMonthDateBounds(monthStr) {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(String(monthStr))) return null;
  const [y, m] = monthStr.split("-").map(Number);
  if (!y || m < 1 || m > 12) return null;
  const last = new Date(Date.UTC(y, m, 0));
  const dd = String(last.getUTCDate()).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return {
    start: `${y}-${mm}-01`,
    end: `${y}-${mm}-${dd}`,
  };
}

async function sumExpenseSplitForRange(fromStr, toStr) {
  try {
    const bounds = rangeBoundsUTC(fromStr, toStr);
    if (!bounds) {
      return { daily: 0, monthly: 0, total: 0 };
    }

    const dailyDocs = await Expense.find({
      type: "daily",
      date: { $gte: bounds.start, $lte: bounds.end },
    }).lean();

    const daily = dailyDocs.reduce((acc, e) => acc + toNum(e.amount), 0);

    const monthlyDocs = await Expense.find({ type: "monthly" }).lean();
    const monthly = monthlyDocs.reduce((acc, e) => {
      if (!e.date) return acc;
      return monthOverlapsRange(e.date, fromStr, toStr)
        ? acc + toNum(e.amount)
        : acc;
    }, 0);

    const total = toNum(daily) + toNum(monthly);
    return { daily: toNum(daily), monthly: toNum(monthly), total };
  } catch {
    return { daily: 0, monthly: 0, total: 0 };
  }
}

async function sumExpensesForRange(fromStr, toStr) {
  const split = await sumExpenseSplitForRange(fromStr, toStr);
  return split.total;
}

async function summaryForMonth(month) {
  const b = getMonthDateBounds(month);
  if (!b) {
    return { totalDaily: 0, totalMonthly: 0, totalExpenses: 0 };
  }

  const bounds = rangeBoundsUTC(b.start, b.end);
  if (!bounds) {
    return { totalDaily: 0, totalMonthly: 0, totalExpenses: 0 };
  }

  const dailyDocs = await Expense.find({
    type: "daily",
    date: { $gte: bounds.start, $lte: bounds.end },
  }).lean();

  const totalDaily = dailyDocs.reduce((acc, e) => acc + toNum(e.amount), 0);

  const monthlyDocs = await Expense.find({ type: "monthly" }).lean();
  const totalMonthly = monthlyDocs.reduce((acc, e) => {
    if (!e.date) return acc;
    return monthOverlapsRange(e.date, b.start, b.end)
      ? acc + toNum(e.amount)
      : acc;
  }, 0);

  return {
    totalDaily,
    totalMonthly,
    totalExpenses: totalDaily + totalMonthly,
  };
}

async function findExpensesFiltered(typeFilter, fromStr, toStr) {
  const typeOk = typeFilter === "daily" || typeFilter === "monthly";

  if (!fromStr || !toStr || !rangeBoundsUTC(fromStr, toStr)) {
    const q = {};
    if (typeOk) q.type = typeFilter;
    return Expense.find(q).sort({ date: -1 }).limit(2000).lean();
  }

  const bounds = rangeBoundsUTC(fromStr, toStr);
  const orClauses = [];

  if (!typeOk || typeFilter === "daily") {
    orClauses.push({
      type: "daily",
      date: { $gte: bounds.start, $lte: bounds.end },
    });
  }

  if (!typeOk || typeFilter === "monthly") {
    const months = enumerateMonthKeys(fromStr, toStr);
    for (const mk of months) {
      const mb = getMonthDateBounds(mk);
      if (!mb) continue;
      const inner = rangeBoundsUTC(mb.start, mb.end);
      if (!inner) continue;
      orClauses.push({
        type: "monthly",
        date: { $gte: inner.start, $lte: inner.end },
      });
    }
  }

  if (orClauses.length === 0) {
    return [];
  }

  const query = orClauses.length === 1 ? orClauses[0] : { $or: orClauses };
  return Expense.find(query).sort({ date: -1 }).limit(2000).lean();
}

module.exports = {
  sumExpensesForRange,
  sumExpenseSplitForRange,
  summaryForMonth,
  getMonthDateBounds,
  rangeBoundsUTC,
  findExpensesFiltered,
  monthOverlapsRange,
};
