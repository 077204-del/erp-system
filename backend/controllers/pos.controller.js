const { writeCreateSale } = require("../services/finance.write.service");
const { getClientById } = require("../services/finance/ledger.service");
const { appendAudit } = require("../services/auditLog.service");

// ======================
// POS TRANSACTION (PRODUCTION SAFE)
// ======================
exports.createPOS = async (req, res) => {
  try {
    const {
      productId,
      clientId,
      quantity,
      paidAmount = 0,
      paymentMethod = "CASH",
    } = req.body;

    if (!productId || !clientId || !quantity) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const client = await getClientById(clientId);
    if (!client) return res.status(404).json({ message: "Client not found" });

    const createResult = await writeCreateSale({
      productId,
      clientId,
      quantity,
      paidAmount,
      paymentMethod,
      cashierId: req.user.id,
    });

    if (!createResult.ok) {
      return res.status(createResult.status).json(createResult.body);
    }

    const sale = createResult.sale;

    appendAudit(
      {
        userId: req.user.id,
        action: "SALE_CREATED",
        entityType: "Sale",
        entityId: sale._id,
        meta: { channel: "POS" },
      },
      req
    );

    return res.json({
      message: "POS transaction completed",
      sale
    });

  } catch (err) {
    console.log("POS ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
};