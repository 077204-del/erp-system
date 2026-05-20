const financialEngine = require("../services/financialEngine.service");
const ledger = require("../services/finance/ledger.service");
const { roleFromReq } = require("../services/responseSanitize.service");

function safeString(v, fallback = "") {
  if (v == null) return fallback;
  return String(v);
}

exports.getDashboard = async (req, res) => {
  try {
    const role = roleFromReq(req);
    let from = safeString(req.query && req.query.from, "");
    let to = safeString(req.query && req.query.to, "");
    const period = financialEngine.resolveQueryPeriod(role, from, to);
    from = period.from;
    to = period.to;

    const ledgerOpts = financialEngine.ledgerOptionsForContext(
      role,
      req.user && req.user.id
    );

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

    const body = await financialEngine.buildDashboard(
      from,
      to,
      role,
      attach,
      ledgerOpts
    );
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    return res.status(200).json(body);
  } catch (err) {
    console.error("DASHBOARD ERROR:", err && err.message ? err.message : err);
    const role = roleFromReq(req);
    const period = financialEngine.resolveQueryPeriod(
      role,
      safeString(req.query && req.query.from, ""),
      safeString(req.query && req.query.to, "")
    );
    const ledgerOpts = financialEngine.ledgerOptionsForContext(
      role,
      req.user && req.user.id
    );
    const empty = await financialEngine.buildDashboard(
      period.from,
      period.to,
      role,
      {},
      ledgerOpts
    );
    return res.status(200).json({
      ...empty,
      error: safeString(err && err.message, "Server error"),
    });
  }
};

exports.getDashboardFiltered = exports.getDashboard;
