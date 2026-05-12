const { getDashboardStats } = require("../services/finance/ledger.service");

exports.getCashSession = async (req, res) => {
  try {
    const { date } = req.query;
    const from = date || null;
    const to = date || null;
    const dashboard = await getDashboardStats(from, to);

    return res.json({
      session: {
        cashSales: dashboard.cash.cashSales,
        debtPayments: dashboard.cash.debtPayments,
        totalCashIn: dashboard.cash.totalCashIn,
        profit: dashboard.stats.profit,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};