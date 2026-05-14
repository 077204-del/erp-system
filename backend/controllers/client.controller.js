const {
  getClientBalance: getClientBalanceStats,
  getClientById,
  getClientsSorted,
  getClientDebtLedger,
} = require("../services/finance/ledger.service");
const {
  writeCreateClient,
  writeDeleteClientById,
} = require("../services/finance.write.service");
const { appendAudit } = require("../services/auditLog.service");
const Client = require("../models/client.model");
const Sale = require("../models/sale.model");
const Payment = require("../models/payment.model");

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function paymentStatusFromSaleStatus(status) {
  if (status === "VOID") return "voided";
  if (status === "PAID") return "paid";
  if (status === "PARTIAL") return "partial";
  return "unpaid";
}

// ======================
// CREATE CLIENT
// ======================
exports.createClient = async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const name =
      body.fullName != null
        ? String(body.fullName).trim()
        : body.name != null
          ? String(body.name).trim()
          : "";
    const phone = body.phone != null ? String(body.phone).trim() : "";
    const address = body.address != null ? String(body.address).trim() : "";
    const notes = body.notes != null ? String(body.notes).trim() : "";
    if (!name) {
      return res.status(400).json({ message: "name is required" });
    }
    const client = await writeCreateClient({
      name,
      phone,
      address,
      notes,
      totalDebt: 0,
    });
    appendAudit(
      {
        userId: req.user.id,
        action: "CLIENT_CREATED",
        entityType: "Client",
        entityId: client._id,
      },
      req
    );
    res.status(201).json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ======================
// GET ALL CLIENTS
// ======================
exports.getClients = async (req, res) => {
  try {
    const clients = await getClientsSorted();
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ======================
// GET ONE CLIENT
// ======================
exports.getClient = async (req, res) => {
  try {
    const client = await getClientById(req.params.id);

    if (!client) {
      return res.status(404).json({ message: "Not found" });
    }

    res.json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ======================
// DELETE CLIENT
// ======================
exports.deleteClient = async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await Client.findById(id).lean();
    if (!existing) {
      return res.status(404).json({ message: "Client not found" });
    }
    const summary = await getClientBalanceStats(id);
    if (safeNum(summary.balance) > 0) {
      return res.status(400).json({
        message: "Cannot delete client with outstanding debt",
        totalDebt: safeNum(summary.balance),
      });
    }
    const [saleCount, paymentCount] = await Promise.all([
      Sale.countDocuments({ clientId: id }),
      Payment.countDocuments({ clientId: id }),
    ]);
    if (saleCount > 0 || paymentCount > 0) {
      return res.status(400).json({
        message: "Cannot delete client with financial history",
        saleCount: safeNum(saleCount),
        paymentCount: safeNum(paymentCount),
      });
    }
    await writeDeleteClientById(id);
    appendAudit(
      {
        userId: req.user.id,
        action: "CLIENT_DELETED",
        entityType: "Client",
        entityId: id,
      },
      req
    );
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ======================
// UPDATE CLIENT
// ======================
exports.updateClient = async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const name =
      body.fullName != null
        ? String(body.fullName).trim()
        : body.name != null
          ? String(body.name).trim()
          : "";
    const phone = body.phone != null ? String(body.phone).trim() : "";
    const address = body.address != null ? String(body.address).trim() : "";
    const notes = body.notes != null ? String(body.notes).trim() : "";
    if (!name) {
      return res.status(400).json({ message: "name is required" });
    }
    const updated = await Client.findByIdAndUpdate(
      id,
      { $set: { name, phone, address, notes } },
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res.status(404).json({ message: "Client not found" });
    }
    appendAudit(
      {
        userId: req.user.id,
        action: "CLIENT_UPDATED",
        entityType: "Client",
        entityId: id,
      },
      req
    );
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ======================
// CLIENT DEBT LEDGER (sales-derived)
// ======================
exports.getClientDebt = async (req, res) => {
  try {
    const ledger = await getClientDebtLedger(req.params.id);
    if (!ledger) {
      return res.status(404).json({ message: "Client not found" });
    }

    const sales = ledger.sales.map((s) => {
      const o = s.toObject ? s.toObject({ virtuals: true }) : { ...s };
      return {
        _id: o._id,
        productId: o.productId,
        quantity: safeNum(o.quantity),
        unitPrice: safeNum(o.unitPrice),
        total: safeNum(o.total),
        paidAmount: safeNum(o.paidAmount),
        debtAmount: safeNum(o.debt),
        paymentStatus:
          o.paymentStatus || paymentStatusFromSaleStatus(o.status),
        status: o.status,
        saleDate: o.saleDate,
      };
    });

    return res.json({
      clientId: ledger.clientId,
      totalDebt: safeNum(ledger.totalDebt),
      totalPaid: safeNum(ledger.totalPaid),
      sales,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ======================
// CLIENT BALANCE (LIGHT VERSION)
// ======================
exports.getClientBalance = async (req, res) => {
  try {
    const clientId = req.params.id;

    const client = await getClientById(clientId);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    const summary = await getClientBalanceStats(clientId, {
      includeLedger: true,
    });

    res.json({
      client: {
        id: client._id,
        name: client.name,
        phone: client.phone,
      },
      summary: {
        totalDebt: safeNum(summary.balance),
        totalPaid: safeNum(summary.totalPaid),
      },
      sales: summary.sales,
      payments: summary.payments,
    });

  } catch (err) {
    console.log(err.message);
    res.status(500).json({ error: err.message });
  }
};