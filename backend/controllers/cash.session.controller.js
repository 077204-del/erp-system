const financialEngine = require("../services/financialEngine.service");
const {
  roleFromReq,
  sanitizeCashSessionResponse,
} = require("../services/responseSanitize.service");

exports.getCashSession = async (req, res) => {
  try {
    const { date } = req.query;
    const role = roleFromReq(req);
    let from = date || "";
    let to = date || "";
    const period = financialEngine.resolveQueryPeriod(role, from, to);
    from = period.from;
    to = period.to;

    const ledgerOpts = financialEngine.ledgerOptionsForContext(
      role,
      req.user && req.user.id
    );
    const { core } = await financialEngine.compute(
      from,
      to,
      role,
      ledgerOpts
    );

    return res.json(
      sanitizeCashSessionResponse(
        {
          cashSales: core.cashSales,
          debtPayments: core.debtPayments,
          totalCashIn: core.cashIn,
          grossProfit: core.grossProfit,
          netProfit: core.netProfit,
        },
        role
      )
    );
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
