const {
  getClientBalance,
  getClientById,
} = require("../services/finance/ledger.service");

exports.getClientStatement = async (req, res) => {
  try {
    const clientId = req.params.id;

    const client = await getClientById(clientId);
    if (!client) return res.status(404).json({ message: "Client not found" });

    const summary = await getClientBalance(clientId, { includeLedger: true });

    return res.json({
      client: {
        id: client._id,
        name: client.name,
        phone: client.phone
      },
      summary: {
        totalSales: summary.totalSales,
        totalPaid: summary.totalPaid,
        balance: summary.balance
      },
      sales: summary.sales,
      payments: summary.payments
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};