const financialEngine = require("../services/financialEngine.service");
const { roleFromReq } = require("../services/responseSanitize.service");

function safeString(v, fallback = "") {
  if (v == null) return fallback;
  return String(v);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

exports.getDashboard = async (req, res) => {
  try {
    let { from, to } = req.query;
    const role = roleFromReq(req);
    if (role === "cashier") {
      const day = todayISO();
      from = day;
      to = day;
    }

    const body = await financialEngine.buildDashboard(from, to, role);
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
