const PDFDocument = require("pdfkit");
const {
  writeCreateSale,
  writeUpdateSaleById,
  writeApplyPaymentToSale,
  writeVoidSaleById,
} = require("../services/finance.write.service");
const { getSalesList, getSaleById } = require("../services/finance/ledger.service");
const { appendAudit } = require("../services/auditLog.service");
const {
  roleFromReq,
  sanitizeSale,
  sanitizeSaleList,
} = require("../services/responseSanitize.service");
const {
  renderProfessionalInvoicePdf,
  renderThermalInvoiceHtml,
} = require("../services/invoiceRender.service");
const mongoose = require("mongoose");
const User = require("../models/user.model");
const financialEngine = require("../services/financialEngine.service");
const { notifyCashierAction } = require("../services/notification.service");

function normalizeRoleForSalesFilter(role) {
  const r = String(role || "").trim().toLowerCase();
  if (r === "admin" || r === "manager" || r === "cashier") return r;
  return "cashier";
}

function cashierSaleEditWindowMs() {
  const n = parseInt(process.env.CASHIER_SALE_EDIT_WINDOW_MINUTES || "30", 10);
  return (Number.isFinite(n) && n > 0 ? n : 30) * 60 * 1000;
}

function assertCashierMayEditSale(req, saleDoc) {
  const role = String(req.user && req.user.role ? req.user.role : "").toLowerCase();
  if (role !== "cashier") return null;
  const ref = new Date(saleDoc.createdAt || saleDoc.saleDate || Date.now());
  if (Number.isNaN(ref.getTime())) return null;
  if (Date.now() - ref.getTime() > cashierSaleEditWindowMs()) {
    return {
      status: 403,
      body: {
        message:
          "Cashiers may only edit sales within the allowed time window. Ask a manager or admin.",
        code: "SALE_EDIT_WINDOW",
      },
    };
  }
  return null;
}

// ======================
// CREATE SALE
// ======================
exports.createSale = async (req, res, next) => {
  try {
    const {
      productId,
      clientId,
      quantity,
      paidAmount = 0,
      paymentMethod = "CASH",
      negotiatedUnitPrice,
      agreedUnitPrice,
      paymentType,
    } = req.body;

    const negotiated =
      negotiatedUnitPrice != null ? negotiatedUnitPrice : agreedUnitPrice;

    const result = await writeCreateSale({
      productId,
      clientId,
      quantity,
      paidAmount,
      paymentMethod,
      paymentType,
      cashierId: req.user.id,
      negotiatedUnitPrice: negotiated,
    });

    if (!result.ok) {
      return res.status(result.status).json(result.body);
    }

    const { sale } = result;

    appendAudit(
      {
        userId: req.user.id,
        action: "SALE_CREATED",
        entityType: "Sale",
        entityId: sale._id,
      },
      req
    );

    const role = roleFromReq(req);
    const safeSale = sanitizeSale(sale, role);
    const io = req.app.get("io");
    if (io) {
      io.emit("new-sale", safeSale);
    }

    void notifyCashierAction(req, {
      type: "SALE",
      message: "",
      amount: Number(sale.total) || 0,
    });

    return res.status(201).json(safeSale);
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
};

// ======================
// GET SALES
// ======================
exports.getSales = async (req, res, next) => {
  try {
    let { from, to, cashierId } = req.query;
    const role = normalizeRoleForSalesFilter(req.user && req.user.role);
    const rawCid = cashierId != null ? String(cashierId).trim() : "";
    let listOpts = {};
    if (role === "cashier") {
      if (req.user && req.user.id) {
        listOpts = { cashierId: String(req.user.id) };
      }
      const period = financialEngine.resolveQueryPeriod(role, from, to);
      from = period.from;
      to = period.to;
      const sales = await getSalesList(from, to, listOpts);
      return res.json(sanitizeSaleList(sales, roleFromReq(req)));
    } else if (
      role === "admin" &&
      rawCid &&
      mongoose.Types.ObjectId.isValid(rawCid)
    ) {
      listOpts = { cashierId: rawCid };
    }
    const sales = await getSalesList(from, to, listOpts);

    return res.json(sanitizeSaleList(sales, roleFromReq(req)));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/** Cashiers for sales/report filters (admin only — weekly performance visibility). */
exports.listSaleCashiers = async (req, res) => {
  try {
    const role = normalizeRoleForSalesFilter(req.user && req.user.role);
    if (role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const rows = await User.find({ role: "cashier" })
      .select("username")
      .sort({ username: 1 })
      .lean();
    return res.json(
      rows.map((u) => ({
        id: String(u._id),
        username: u.username != null ? String(u.username) : "",
      }))
    );
  } catch (err) {
    return res.status(500).json({
      message: err && err.message ? err.message : "Server error",
    });
  }
};

// ======================
// UPDATE SALE LINE (PATCH — same sale _id; stock + totals reconciled)
// ======================
exports.updateSale = async (req, res) => {
  try {
    const existing = await getSaleById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Sale not found" });
    }
    const blocked = assertCashierMayEditSale(req, existing);
    if (blocked) {
      return res.status(blocked.status).json(blocked.body);
    }

    const {
      productId,
      clientId,
      quantity,
      paidAmount = 0,
      paymentMethod = "CASH",
      negotiatedUnitPrice,
      agreedUnitPrice,
      paymentType,
    } = req.body;

    const negotiated =
      negotiatedUnitPrice != null ? negotiatedUnitPrice : agreedUnitPrice;

    const result = await writeUpdateSaleById(
      req.params.id,
      {
        productId,
        clientId,
        quantity,
        paidAmount,
        paymentMethod,
        paymentType,
        negotiatedUnitPrice: negotiated,
      },
      req.user.id
    );

    if (!result.ok) {
      return res.status(result.status).json(result.body);
    }

    const { sale } = result;

    appendAudit(
      {
        userId: req.user.id,
        action: "SALE_UPDATED",
        entityType: "Sale",
        entityId: sale._id,
      },
      req
    );

    const role = roleFromReq(req);
    const safeSale = sanitizeSale(sale, role);
    const io = req.app.get("io");
    if (io) {
      io.emit("sale-updated", safeSale);
    }

    void notifyCashierAction(req, {
      type: "UPDATE",
      message: "Updated a sale",
      amount: Number(sale.total) || 0,
    });

    return res.json(safeSale);
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
};

// ======================
// PAY SALE
// ======================
exports.paySale = async (req, res, next) => {
  try {
    const { amount, method } = req.body;

    const result = await writeApplyPaymentToSale({
      saleId: req.params.id,
      amount,
      method: method || "CASH",
      type: "SALE_PAYMENT",
      recordedAt: req.body.date,
    });

    if (!result.ok) {
      return res.status(result.status).json(result.body);
    }

    appendAudit(
      {
        userId: req.user.id,
        action: "PAYMENT_RECORDED",
        entityType: "Sale",
        entityId: result.sale._id,
        meta: {
          paymentId: result.payment?._id,
          amount: result.payment?.amount,
        },
      },
      req
    );

    const role = roleFromReq(req);
    void notifyCashierAction(req, {
      type: "PAYMENT",
      message: "Recorded a sale payment",
      amount: Number(result.payment?.amount ?? amount) || 0,
    });
    return res.json({
      message: "Payment applied",
      sale: sanitizeSale(result.sale, role),
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
};

// ======================
// VOID SALE (DELETE route kept for API compatibility — no hard delete)
// ======================
exports.voidSale = async (req, res) => {
  try {
    const reasonRaw =
      (req.body && req.body.reason) != null
        ? req.body.reason
        : req.query && req.query.reason != null
          ? req.query.reason
          : "";
    const reason = String(reasonRaw).trim();
    if (!reason) {
      return res.status(400).json({ message: "Void reason is required" });
    }

    const result = await writeVoidSaleById(req.params.id, req.user.id, reason);
    if (!result.ok) {
      return res.status(result.status).json(result.body);
    }
    appendAudit(
      {
        userId: req.user.id,
        action: "SALE_VOIDED",
        entityType: "Sale",
        entityId: req.params.id,
        meta: { reason },
      },
      req
    );
    return res.json({ message: "Sale voided", voided: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ======================
// INVOICE PDF / THERMAL (same route; ?format=thermal for HTML receipt)
// ======================
exports.generateInvoice = async (req, res) => {
  try {
    const sale = await getSaleById(req.params.id);

    if (!sale) {
      return res.status(404).json({
        message: "Invoice not found",
      });
    }

    if (sale.voided === true || String(sale.status || "") === "VOID") {
      return res.status(410).json({
        message: "This sale has been voided; invoice is unavailable.",
      });
    }

    if (req.query.format === "thermal") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `inline; filename=receipt_${sale._id}.html`
      );
      return res.send(renderThermalInvoiceHtml(sale));
    }

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename=invoice_${sale._id}.pdf`
    );

    doc.pipe(res);
    renderProfessionalInvoicePdf(sale, doc);
    doc.end();
  } catch (err) {
    if (res.headersSent) {
      try {
        res.end();
      } catch (_) {
        /* ignore */
      }
      return;
    }
    const msg =
      err && typeof err.message === "string" ? err.message : "Server error";
    return res.status(500).json({
      message: msg,
    });
  }
};
