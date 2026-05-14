const { getDashboardStats } = require("../services/finance/ledger.service");
const { sumExpensesForRange } = require("../services/expenseQuery.service");

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function safeDateQuery(v) {
  if (v == null) return "";
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

exports.getDailyRegister = async (req, res) => {
  try {
    let date = safeDateQuery(req.query.date);
    if (!date) {
      date = new Date().toISOString().slice(0, 10);
    }

    const role = String(req.user && req.user.role ? req.user.role : "").toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    if (role === "cashier" && date !== today) {
      return res.status(403).json({
        message: "Cashiers may only view today's register.",
        allowedDate: today,
      });
    }

    const dash = await getDashboardStats(date, date);

    const salesTotal = toNumber(dash.stats && dash.stats.revenue);
    const cashIn = toNumber(dash.cash && dash.cash.totalCashIn);
    const paymentsTotal = cashIn;
    const expensesTotal = await sumExpensesForRange(date, date);
    const expNum = toNumber(expensesTotal);
    const netCash = toNumber(cashIn - expNum);

    return res.json({
      date,
      salesTotal,
      paymentsTotal,
      expensesTotal: expNum,
      cashIn,
      netCash: Number.isFinite(netCash) ? netCash : 0,
    });
  } catch (err) {
    const msg =
      err && typeof err.message === "string" && err.message.trim()
        ? err.message.trim()
        : "Server error";
    return res.status(500).json({
      message: msg,
      date: "",
      salesTotal: 0,
      paymentsTotal: 0,
      expensesTotal: 0,
      cashIn: 0,
      netCash: 0,
    });
  }
};
