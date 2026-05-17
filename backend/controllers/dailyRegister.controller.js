const financialEngine = require("../services/financialEngine.service");
const { normalizeRole } = require("../services/rbac.service");

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

    const role = normalizeRole(req.user && req.user.role ? req.user.role : "");
    const today = new Date().toISOString().slice(0, 10);
    if (role === "cashier" && date !== today) {
      return res.status(403).json({
        message: "Cashiers may only view today's register.",
        allowedDate: today,
      });
    }

    const body = await financialEngine.buildDailyRegister(date, date, role);
    return res.json(body);
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
      revenue: 0,
      cost: 0,
      expenses: 0,
      grossProfit: 0,
      netProfit: 0,
    });
  }
};
