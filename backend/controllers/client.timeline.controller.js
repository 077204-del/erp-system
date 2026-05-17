const {
  getClientBalance,
  getClientById,
} = require("../services/finance/ledger.service");
const {
  roleFromReq,
  buildAccess,
  sanitizeSale,
} = require("../services/responseSanitize.service");

// ======================
// CLIENT TIMELINE (REAL ERP VIEW)
// ======================
exports.getClientTimeline = async (req, res) => {
  try {
    const clientId = req.params.id;

    const client = await getClientById(clientId);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    const role = roleFromReq(req);
    const summary = await getClientBalance(clientId, {
      includeLedger: true,
      populateSalesProduct: true,
      populatePaymentsSale: true,
    });

    const timeline = [];

    summary.sales.forEach((s) => {
      timeline.push({
        type: "SALE",
        date: s.createdAt,
        data: sanitizeSale(s, role),
      });
    });

    summary.payments.forEach((p) => {
      timeline.push({
        type: "PAYMENT",
        date: p.createdAt,
        data: p,
      });
    });

    timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

    return res.json({
      client: {
        id: client._id,
        name: client.name,
        phone: client.phone,
        storedDebt: client.totalDebt || 0,
      },

      summary: {
        totalSales: summary.totalSales,
        totalPayments: summary.totalPaid,
        realDebt: summary.balance,
      },

      timeline,
      access: buildAccess(role),
    });
  } catch (err) {
    console.log("TIMELINE ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
