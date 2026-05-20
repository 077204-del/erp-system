const financialEngine = require("../services/financialEngine.service");
const {
  roleFromReq,
  sanitizeDailyRegisterResponse,
} = require("../services/responseSanitize.service");

/** Set `ERP_TRACE_REGISTER=1` to log Daily Register response pipeline (not computeCore internals). */
function traceRegisterResponse() {
  return String(process.env.ERP_TRACE_REGISTER || "").trim() === "1";
}

function safeDateQuery(v) {
  if (v == null) return "";
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

/** Default register day when `date` query omitted — host local calendar (Render = UTC). */
function hostLocalCalendarYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
      date = hostLocalCalendarYmd();
    }

    const role = roleFromReq(req);
    const period = financialEngine.resolveQueryPeriod(role, date, date);
    const core = await financialEngine.computeCore(period.from, period.to);

    if (traceRegisterResponse()) {
      const coreLog = { ...core };
      if (Array.isArray(coreLog.sales)) {
        coreLog.sales = `[${coreLog.sales.length} sale docs omitted]`;
      }
      console.log("[REGISTER RAW CORE]", coreLog);
    }

    const body = registerPayloadFromCore(core, date, role);

    if (traceRegisterResponse()) {
      console.log("[REGISTER FINAL BODY PRE-SANITIZE]", {
        role,
        ...body,
      });
    }

    const sanitized = sanitizeDailyRegisterResponse(body, role);

    if (traceRegisterResponse()) {
      console.log("[REGISTER FINAL JSON POST-SANITIZE]", sanitized);
    }

    return res.json(sanitized);
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
