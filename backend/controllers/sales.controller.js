const PDFDocument = require("pdfkit");
const {
  writeCreateSale,
  writeApplyPaymentToSale,
  writeDeleteSaleById,
} = require("../services/finance.write.service");
const { getSalesList, getSaleById } = require("../services/finance/ledger.service");
const { appendAudit } = require("../services/auditLog.service");
const {
  renderProfessionalInvoicePdf,
  renderThermalInvoiceHtml,
} = require("../services/invoiceRender.service");

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

    const io = req.app.get("io");
    if (io) {
      io.emit("new-sale", sale);
    }

    return res.status(201).json(sale);
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
    const { from, to } = req.query;
    const sales = await getSalesList(from, to);

    return res.json(sales);
  } catch (err) {
    return res.status(500).json({ error: err.message });
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

    return res.json({
      message: "Payment applied",
      sale: result.sale,
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
};

// ======================
// DELETE SALE (admin — reverses stock; removes linked payments)
// ======================
exports.deleteSale = async (req, res) => {
  try {
    const result = await writeDeleteSaleById(req.params.id, req.user.id);
    if (!result.ok) {
      return res.status(result.status).json(result.body);
    }
    appendAudit(
      {
        userId: req.user.id,
        action: "SALE_DELETED",
        entityType: "Sale",
        entityId: req.params.id,
      },
      req
    );
    return res.json({ message: "Sale deleted" });
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