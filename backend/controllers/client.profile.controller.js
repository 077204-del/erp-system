const {
  getClientBalance,
  getClientById,
} = require("../services/finance/ledger.service");

// ======================
// CLIENT FULL PROFILE (FIXED)
// ======================
exports.getClientProfile = async (req, res) => {
  try {
    const clientId = req.params.id;

    const client = await getClientById(clientId);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    const summary = await getClientBalance(clientId, {
      includeLedger: true,
      populateSalesProduct: true,
      populatePaymentsSale: true,
    });

    return res.json({
      client: {
        id: client._id,
        name: client.name,
        phone: client.phone,
        storedDebt: client.totalDebt || 0
      },

      summary: {
        totalSales: summary.totalSales,
        totalPaidFromSales: summary.totalPaid,
        totalPayments: summary.totalPaid,
        realDebt: summary.balance
      },

      sales: summary.sales,
      payments: summary.payments
    });

  } catch (err) {
    console.log("CLIENT PROFILE ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
};