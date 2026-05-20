const financialEngine = require("../services/financialEngine.service");
const { roleFromReq } = require("../services/responseSanitize.service");

function safeString(v, fallback = "") {
  if (v == null) return fallback;
  return String(v).trim();
}

exports.getCashClosing = async (req, res) => {
  try {
    const role = roleFromReq(req);
    let from = safeString(req.query.from, "");
    let to = safeString(req.query.to, "");
    const date = safeString(req.query.date, "");

    if (!from && !to && date && date !== "ALL") {
      from = date;
      to = date;
    }

    const period = financialEngine.resolveQueryPeriod(role, from, to);
    from = period.from;
    to = period.to;

    const ledgerOpts = financialEngine.ledgerOptionsForContext(
      role,
      req.user && req.user.id
    );

    const body = await financialEngine.buildCashClosing(
      from,
      to,
      role,
      ledgerOpts
    );
    return res.json({
      ...body,
      date:
        date ||
        (from && to ? (from === to ? from : `${from}..${to}`) : "ALL"),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
