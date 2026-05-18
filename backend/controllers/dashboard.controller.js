const financialEngine = require("../services/financialEngine.service");
const ledger = require("../services/finance/ledger.service");
const {
  roleFromReq,
  sanitizeDashboardResponse,
} = require("../services/responseSanitize.service");

function safeString(v, fallback = "") {
  if (v == null) return fallback;
  return String(v);
}

exports.getDashboard = async (req, res) => {
  try {
    const { from, to } = req.query;
    const role = roleFromReq(req);

    if (role === "cashier" && req.user && req.user.id) {
      const scopedCore = await financialEngine.computeCore(from, to, {
        cashierId: String(req.user.id),
      });
      const totalDebt = await ledger.getTotalOutstandingDebtFromLedger();
      const td = Number(totalDebt);
      const safeDebt = Number.isFinite(td) ? td : 0;
      const body = sanitizeDashboardResponse(
        {
          range: scopedCore.range,
          stats: {
            salesCount: scopedCore.salesCount,
            sales: scopedCore.salesCount,
            totalSales: scopedCore.revenue,
            totalDebt: safeDebt,
          },
          debt: safeDebt,
        },
        role
      );
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.setHeader("Pragma", "no-cache");
      return res.status(200).json(body);
    }

    let attach = {};
    if (role === "admin") {
      try {
        attach.cashierWeeklyBreakdown = await ledger.aggregateCashierPerformance(
          from,
          to
        );
      } catch {
        attach.cashierWeeklyBreakdown = [];
      }
    }

    const body = await financialEngine.buildDashboard(from, to, role, attach);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    return res.status(200).json(body);
  } catch (err) {
    console.error("DASHBOARD ERROR:", err && err.message ? err.message : err);
    const role = roleFromReq(req);
    const empty = await financialEngine.buildDashboard(
      safeString(req.query && req.query.from, ""),
      safeString(req.query && req.query.to, ""),
      role
    );
    return res.status(200).json({
      ...empty,
      error: safeString(err && err.message, "Server error"),
    });
  }
};

exports.getDashboardFiltered = exports.getDashboard;
