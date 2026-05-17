const financialEngine = require("../services/financialEngine.service");
const { roleFromReq } = require("../services/responseSanitize.service");

exports.getCashClosing = async (req, res) => {
  try {
    const { date } = req.query;
    const from = date && date !== "ALL" ? date : null;
    const to = date && date !== "ALL" ? date : null;
    const role = roleFromReq(req);

    if (!from || !to) {
      const body = await financialEngine.buildCashClosing("", "", role);
      return res.json({ ...body, date: date || "ALL" });
    }

    const body = await financialEngine.buildCashClosing(from, to, role);
    return res.json(body);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
