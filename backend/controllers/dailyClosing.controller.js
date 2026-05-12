const { getDailyClosingStats } = require("../services/finance/ledger.service");

exports.getDailyClosing = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: "date is required (YYYY-MM-DD)" });
    }

    const payload = await getDailyClosingStats(date);
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};