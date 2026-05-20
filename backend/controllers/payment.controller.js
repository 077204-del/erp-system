const {
  writeApplyPaymentToSale,
  writeApplyClientDebtPayment,
  writeDeletePaymentById,
} = require("../services/finance.write.service");
const { getPaymentsList } = require("../services/finance/ledger.service");
const { appendAudit } = require("../services/auditLog.service");
const { notifyCashierAction } = require("../services/notification.service");

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
}

// ======================
// CREATE PAYMENT (sale-only legacy | client + optional sale FIFO)
// ======================
exports.createPayment = async (req, res, next) => {
  try {
    const { clientId, saleId, amount, method, date } = req.body;

    const paymentAmount = num(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({
        message: "Invalid payment amount",
      });
    }

    if (saleId && !clientId) {
      const result = await writeApplyPaymentToSale({
        saleId,
        amount: paymentAmount,
        method: method || "CASH",
        type: "SALE_PAYMENT",
        recordedAt: date,
      });

      if (!result.ok) {
        return res.status(result.status).json(result.body);
      }

      appendAudit(
        {
          userId: req.user.id,
          action: "PAYMENT_RECORDED",
          entityType: "Payment",
          entityId: result.payment._id,
          meta: { saleId, amount: paymentAmount },
        },
        req
      );

      return res.status(201).json({
        message: "Payment recorded",
        payment: result.payment,
        payments: [result.payment],
        updatedSale: result.sale,
        updatedSales: [result.sale],
      });
    }

    if (!clientId) {
      return res.status(400).json({
        message: "clientId is required (or use saleId alone for legacy)",
      });
    }

    const result = await writeApplyClientDebtPayment({
      clientId,
      saleId: saleId || null,
      amount: paymentAmount,
      method: method || "CASH",
      type: "SALE_PAYMENT",
      recordedAt: date,
    });

    if (!result.ok) {
      return res.status(result.status).json(result.body);
    }

    appendAudit(
      {
        userId: req.user.id,
        action: "PAYMENT_RECORDED",
        entityType: "Payment",
        entityId: result.payments[0]?._id,
        meta: {
          clientId,
          saleId: saleId || null,
          amount: paymentAmount,
          allocations: result.payments.length,
        },
      },
      req
    );

    void notifyCashierAction(req, {
      type: "DEBT",
      message: "",
      amount: paymentAmount,
    });

    return res.status(201).json({
      message: "Payment recorded",
      payments: result.payments,
      updatedSales: result.sales,
      appliedAmount: result.appliedAmount,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ======================
// DELETE PAYMENT (admin — reverses allocation on linked sale)
// ======================
exports.deletePayment = async (req, res) => {
  try {
    const result = await writeDeletePaymentById(req.params.id);
    if (!result.ok) {
      return res.status(result.status).json(result.body);
    }
    appendAudit(
      {
        userId: req.user.id,
        action: "PAYMENT_DELETED",
        entityType: "Payment",
        entityId: req.params.id,
      },
      req
    );
    return res.json({ message: "Payment deleted" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ======================
// GET PAYMENTS
// ======================
exports.getPayments = async (req, res, next) => {
  try {
    const payments = await getPaymentsList();

    return res.json(payments);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
