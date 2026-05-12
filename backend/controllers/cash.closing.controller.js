const { getClosingStats } = require("../services/finance/ledger.service");

exports.getCashClosing = async (req, res) => {
  try {
    const { date } = req.query;
    const from = date && date !== "ALL" ? date : null;
    const to = date && date !== "ALL" ? date : null;
    const closing = await getClosingStats(from, to);

    return res.json({
      date: date || "ALL",
      totalSales: closing.totalSales,
      totalPaid: closing.cashBreakdown.totalCashIn,
      totalDebt: closing.debt,
      profit: closing.profit,
      cashSales: closing.cashBreakdown.cashSales,
      debtPayments: closing.cashBreakdown.debtPayments,
      cashIn: closing.cashIn,
      netCash: closing.netCash,
      countSales: closing.countSales,
      countPayments: closing.countPayments,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};