const financialEngine = require("../services/financialEngine.service");
const {
  roleFromReq,
  sanitizeDailyRegisterResponse,
} = require("../services/responseSanitize.service");

function safeDateQuery(v) {
  if (v == null) return "";
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

/**
 * Daily Register KPIs — computeCore only (same call for all roles: unscoped, single day).
 */
function registerPayloadFromCore(core, displayDate, role) {
  const salesTotal =
    core.totalSales != null ? core.totalSales : core.revenue;
  const cashIn = core.cashIn;
  const netCashFlow =
    core.netCashFlow != null ? core.netCashFlow : core.cashIn;

  const body = {
    date: displayDate,
    range: core.range || null,
    salesTotal,
    salesCount: core.salesCount,
    cashIn,
    totalCashIn: cashIn,
    paymentsTotal: cashIn,
    netCash: cashIn,
    netCashFlow,
    cashSales: core.cashSales,
    debtPayments: core.debtPayments,
    cash: {
      totalCashIn: cashIn,
      cashIn,
      cashSales: core.cashSales,
      debtPayments: core.debtPayments,
    },
  };

  if (role === "admin" || role === "manager") {
    body.revenue = core.revenue;
    body.cost = core.cost;
    body.expenses = core.expenses;
    body.expensesTotal = core.expenses;
    body.grossProfit = core.grossProfit;
    body.netProfit = core.netProfit;
  }
  return body;
}

exports.getDailyRegister = async (req, res) => {
  try {
    let date = safeDateQuery(req.query.date);
    if (!date) {
      date = new Date().toISOString().slice(0, 10);
    }

    const role = roleFromReq(req);
    const from = date;
    const to = date;

    const core = await financialEngine.computeCore(from, to);
    const body = registerPayloadFromCore(core, date, role);

    return res.json(sanitizeDailyRegisterResponse(body, role));
  } catch (err) {
    console.error(
      "[daily-register] error:",
      err && err.message ? err.message : err
    );
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
