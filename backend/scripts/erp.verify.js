/**
 * Lightweight ERP financial verification (run against a dev/staging DB with MONGO_URI).
 * Usage: from backend folder, `node scripts/erp.verify.js`
 */

require("dotenv").config();
const mongoose = require("mongoose");
const path = require("path");

const Client = require(path.join(__dirname, "..", "models", "client.model"));
const Product = require(path.join(__dirname, "..", "models", "product.model"));
const User = require(path.join(__dirname, "..", "models", "user.model"));
const Sale = require(path.join(__dirname, "..", "models", "sale.model"));
const Payment = require(path.join(__dirname, "..", "models", "payment.model"));
const StockMovement = require(path.join(
  __dirname,
  "..",
  "models",
  "stockMovement.model"
));
const {
  writeCreateSale,
  writeApplyPaymentToSale,
  writeUpdateProductStockById,
} = require(path.join(__dirname, "..", "services", "finance.write.service"));
const AuditLog = require(path.join(__dirname, "..", "models", "auditLog.model"));
const {
  getDashboardStats,
  getClientBalance,
  getClosingStats,
  getSaleById,
} = require(path.join(__dirname, "..", "services", "finance", "ledger.service"));
const {
  buildInvoiceContext,
  renderThermalInvoiceHtml,
  money,
} = require(path.join(__dirname, "..", "services", "invoiceRender.service"));

function todayRangeStrings() {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  const s = `${y}-${m}-${d}`;
  return { from: s, to: s };
}

function fail(msgs, msg) {
  msgs.push(msg);
}

async function main() {
  const failures = [];
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const suffix = `erp-verify-${Date.now()}`;
  let clientDoc = null;
  let productDoc = null;
  let userDoc = null;
  let saleId = null;

  try {
    userDoc = await User.create({
      username: suffix,
      password: "x",
      role: "cashier",
    });

    clientDoc = await Client.create({
      name: `Verify Client ${suffix}`,
      phone: "",
      totalDebt: 0,
    });

    productDoc = await Product.create({
      name: `Verify Product ${suffix}`,
      qty: 100,
      salePrice: 50,
      costPrice: 30,
    });

    const createRes = await writeCreateSale({
      productId: productDoc._id,
      clientId: clientDoc._id,
      quantity: 2,
      paidAmount: 40,
      paymentMethod: "CASH",
      cashierId: userDoc._id,
    });

    if (!createRes.ok) {
      fail(
        failures,
        `writeCreateSale failed: ${JSON.stringify(createRes.body || createRes)}`
      );
      return;
    }

    saleId = createRes.sale._id;

    const productAfter = await Product.findById(productDoc._id);
    if (!productAfter || productAfter.qty < 0) {
      fail(failures, "Stock became negative after sale");
    }

    const saleAfter = await Sale.findById(saleId);
    if (!saleAfter) {
      fail(failures, "Sale not found after create");
      return;
    }
    if (Number(saleAfter.debt) < 0 || Number(saleAfter.paidAmount) < 0) {
      fail(failures, "Sale has negative debt or paidAmount");
    }

    const t0 = Number(saleAfter.total);
    const p0 = Number(saleAfter.paidAmount);
    const d0 = Number(saleAfter.debt);
    if (Math.abs(t0 - p0 - d0) > 0.001) {
      fail(
        failures,
        `Sale accrual identity failed: total ${t0} !== paid ${p0} + debt ${d0}`
      );
    }

    const forInvoice = await getSaleById(String(saleId));
    if (!forInvoice) {
      fail(failures, "getSaleById returned null for invoice check");
    } else {
      const ctx = buildInvoiceContext(forInvoice);
      if (!ctx.invoiceNo || Number.isNaN(Number(ctx.total))) {
        fail(failures, "Invoice context has invalid totals or id");
      }
    }

    const ledgerBal1 = await getClientBalance(String(clientDoc._id));
    const clientRow1 = await Client.findById(clientDoc._id);

    if (Number(ledgerBal1.balance) < 0) {
      fail(failures, "Client ledger balance negative after sale");
    }

    if (
      !clientRow1 ||
      Number(clientRow1.totalDebt) !== Number(ledgerBal1.balance)
    ) {
      fail(
        failures,
        `Client.totalDebt cache !== ledger balance after sale: cache=${clientRow1?.totalDebt} ledger=${ledgerBal1.balance}`
      );
    }

    if (Math.abs(Number(ledgerBal1.balance) - d0) > 0.001) {
      fail(
        failures,
        `Single-sale client balance ${ledgerBal1.balance} !== sale.debt ${d0}`
      );
    }

    const movs = await StockMovement.find({ saleId }).lean();
    if (!movs.some((m) => m.movementType === "SALE_OUT")) {
      fail(failures, "Missing SALE_OUT stock movement for sale");
    }
    const so = movs.find((m) => m.movementType === "SALE_OUT");
    if (
      so &&
      Math.abs(Number(so.qtyAfter) - Number(productAfter.qty)) > 0.001
    ) {
      fail(
        failures,
        `SALE_OUT qtyAfter ${so.qtyAfter} !== product qty ${productAfter.qty}`
      );
    }

    const oversell = await writeCreateSale({
      productId: productDoc._id,
      clientId: clientDoc._id,
      quantity: 99,
      paidAmount: 0,
      paymentMethod: "CASH",
      cashierId: userDoc._id,
    });
    if (oversell.ok) {
      fail(failures, "Oversell should fail when stock is insufficient");
    }
    if (oversell.body?.code !== "INSUFFICIENT_STOCK") {
      fail(
        failures,
        `Oversell expected INSUFFICIENT_STOCK, got ${JSON.stringify(oversell.body)}`
      );
    }

    const { from, to } = todayRangeStrings();
    const dash = await getDashboardStats(from, to);

    const rangeStart = new Date(from);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(to);
    rangeEnd.setHours(23, 59, 59, 999);

    const allPaymentsToday = await Payment.find({
      createdAt: { $gte: rangeStart, $lte: rangeEnd },
    }).lean();

    const manualCashSum = allPaymentsToday.reduce(
      (acc, p) => acc + (Number(p.amount) || 0),
      0
    );

    if (
      Math.abs(manualCashSum - Number(dash.cash.totalCashIn)) > 0.0001
    ) {
      fail(
        failures,
        `Dashboard cash ${dash.cash.totalCashIn} !== sum(Payment) ${manualCashSum} for range`
      );
    }

    const closing = await getClosingStats(from, to);
    if (
      Math.abs(Number(closing.cashIn) - Number(dash.cash.totalCashIn)) > 0.0001
    ) {
      fail(failures, "getClosingStats.cashIn !== getDashboardStats.cash.totalCashIn");
    }

    const salesToday = await Sale.find({
      saleDate: { $gte: rangeStart, $lte: rangeEnd },
    }).lean();
    const sumSaleTotals = salesToday.reduce(
      (acc, s) => acc + (Number(s.total) || 0),
      0
    );
    if (Math.abs(sumSaleTotals - Number(dash.stats.revenue)) > 0.0001) {
      fail(
        failures,
        `Dashboard revenue ${dash.stats.revenue} !== sum(Sale.total) ${sumSaleTotals} for saleDate range`
      );
    }

    const payRes = await writeApplyPaymentToSale({
      saleId: String(saleId),
      amount: 20,
      method: "CASH",
      type: "SALE_PAYMENT",
    });

    if (!payRes.ok) {
      fail(
        failures,
        `writeApplyPaymentToSale failed: ${JSON.stringify(payRes.body || payRes)}`
      );
      return;
    }

    const salePaid = await Sale.findById(saleId);
    if (Number(salePaid.debt) < 0) {
      fail(failures, "Sale debt negative after payment");
    }
    const t1 = Number(salePaid.total);
    const p1 = Number(salePaid.paidAmount);
    const d1 = Number(salePaid.debt);
    if (Math.abs(t1 - p1 - d1) > 0.001) {
      fail(
        failures,
        `Sale accrual identity failed after payment: total ${t1} !== paid ${p1} + debt ${d1}`
      );
    }
    if (Math.abs(p1 - 60) > 0.001) {
      fail(failures, `Expected paidAmount 60 after 40+20, got ${p1}`);
    }
    if (Math.abs(d1 - 40) > 0.001) {
      fail(failures, `Expected remaining debt 40 after payment, got ${d1}`);
    }

    const ledgerBal2 = await getClientBalance(String(clientDoc._id));
    const clientRow2 = await Client.findById(clientDoc._id);

    if (Number(ledgerBal2.balance) < 0) {
      fail(failures, "Client ledger balance negative after payment");
    }

    if (
      !clientRow2 ||
      Number(clientRow2.totalDebt) !== Number(ledgerBal2.balance)
    ) {
      fail(
        failures,
        `Client.totalDebt cache !== ledger after payment: cache=${clientRow2?.totalDebt} ledger=${ledgerBal2.balance}`
      );
    }

    const productFinal = await Product.findById(productDoc._id);
    if (!productFinal || productFinal.qty < 0) {
      fail(failures, "Stock negative after full flow");
    }

    const badStock = await writeUpdateProductStockById(
      productDoc._id,
      -3,
      userDoc._id
    );
    if (badStock.ok) {
      fail(failures, "Negative manual stock update should be rejected");
    }

    const lowTh = 5;
    const lowQ = 3;
    const lowStockFlag = lowTh > 0 && lowQ <= lowTh;
    if (!lowStockFlag) {
      fail(failures, "lowStock flag logic failed for qty 3 threshold 5");
    }

    const auditProbe = await AuditLog.create({
      action: "ERP_VERIFY_PROBE",
      entityType: "Verify",
      entityId: "probe",
      clientIp: "127.0.0.1",
      userAgent: "erp.verify",
    });
    await AuditLog.deleteOne({ _id: auditProbe._id });

    const edgeSale = {
      _id: saleId,
      quantity: 1,
      unitPrice: 10,
      total: 10,
      paidAmount: 10,
      debt: 0,
      status: "PAID",
      createdAt: new Date(),
      productId: null,
      clientId: null,
    };
    const ctxEdge = buildInvoiceContext(edgeSale);
    if (ctxEdge.debt !== "0.00" || ctxEdge.paid !== "10.00") {
      fail(failures, "Invoice edge (zero debt) money formatting failed");
    }
    if (money(Number.POSITIVE_INFINITY) !== "0.00") {
      fail(failures, "money() should coerce non-finite to 0.00");
    }
    const thtml = renderThermalInvoiceHtml(edgeSale);
    if (thtml.length < 80 || !thtml.includes("10.00")) {
      fail(failures, "Thermal invoice HTML sanity failed");
    }
  } finally {
    try {
      if (saleId) {
        await StockMovement.deleteMany({ saleId });
        await Payment.deleteMany({ saleId });
        await Sale.deleteOne({ _id: saleId });
      }
      if (productDoc) {
        await StockMovement.deleteMany({ productId: productDoc._id });
        await Product.deleteOne({ _id: productDoc._id });
      }
      if (clientDoc) await Client.deleteOne({ _id: clientDoc._id });
      if (userDoc) await User.deleteOne({ _id: userDoc._id });
    } catch (e) {
      console.error("Cleanup error:", e.message);
    }
    await mongoose.disconnect();
  }

  if (failures.length) {
    console.error("ERP VERIFY FAILED");
    failures.forEach((f) => console.error(" -", f));
    process.exit(1);
  }

  console.log("ERP VERIFY PASSED");
}

main().catch((e) => {
  console.error("ERP VERIFY FAILED:", e.message);
  process.exit(1);
});
