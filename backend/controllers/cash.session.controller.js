const financialEngine = require("../services/financialEngine.service");
const {
  roleFromReq,
  sanitizeCashSessionResponse,
} = require("../services/responseSanitize.service");

exports.getCashSession = async (req, res) => {
  try {
    const { date } = req.query;
    const from = date || null;
    const to = date || null;
    const role = roleFromReq(req);

    const { core } = await financialEngine.compute(from || "", to || "", role);

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
