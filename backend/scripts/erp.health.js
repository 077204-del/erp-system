/**
 * Operational health check (Mongo, transactions, collections, ledger, write txn, dashboard math).
 * Usage from backend: node scripts/erp.health.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const path = require("path");

const {
  probeMongoTransactionsSupported,
} = require(path.join(__dirname, "..", "config", "db"));
const Client = require(path.join(__dirname, "..", "models", "client.model"));
const Payment = require(path.join(__dirname, "..", "models", "payment.model"));
const Sale = require(path.join(__dirname, "..", "models", "sale.model"));
const StockMovement = require(path.join(
  __dirname,
  "..",
  "models",
  "stockMovement.model"
));
const {
  getDashboardStats,
  getClosingStats,
} = require(path.join(
  __dirname,
  "..",
  "services",
  "finance",
  "ledger.service"
));
const {
  buildInvoiceContext,
  renderThermalInvoiceHtml,
  money,
} = require(path.join(__dirname, "..", "services", "invoiceRender.service"));
const {
  resolveRequestContext,
} = require(path.join(__dirname, "..", "services", "auditLog.service"));

const REQUIRED_COLLECTIONS = ["sales", "payments", "clients", "products", "users"];

function todayRangeStrings() {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  const s = `${y}-${m}-${d}`;
  return { from: s, to: s };
}

async function main() {
  const failures = [];

  if (!process.env.MONGO_URI) {
    failures.push("MONGO_URI is not set");
    console.error("ERP HEALTH FAILED");
    failures.forEach((f) => console.error(" -", f));
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
  } catch (e) {
    console.error("ERP HEALTH FAILED");
    console.error(" - Mongo connection:", e.message);
    process.exit(1);
  }

  try {
    const cols = await mongoose.connection.db
      .listCollections()
      .toArray();
    const names = new Set(cols.map((c) => c.name));
    for (const need of REQUIRED_COLLECTIONS) {
      if (!names.has(need)) {
        failures.push(`Missing collection: ${need}`);
      }
    }
  } catch (e) {
    failures.push(`listCollections failed: ${e.message}`);
  }

  const txnOk = await probeMongoTransactionsSupported();
  if (!txnOk) {
    failures.push(
      "MongoDB multi-document transactions not available (replica set / sharded cluster required)"
    );
  }

  try {
    const { from, to } = todayRangeStrings();
    await getDashboardStats(from, to);
  } catch (e) {
    failures.push(`Ledger read (getDashboardStats) failed: ${e.message}`);
  }

  if (txnOk) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const [doc] = await Client.create(
          [{ name: "__erp_health__", phone: "", totalDebt: 0 }],
          { session }
        );
        await Client.deleteOne({ _id: doc._id }).session(session);
      });
    } catch (e) {
      failures.push(`Basic write transaction failed: ${e.message}`);
    } finally {
      session.endSession();
    }
  }

  try {
    const { from, to } = todayRangeStrings();
    const dash = await getDashboardStats(from, to);
    const rangeStart = new Date(from);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(to);
    rangeEnd.setHours(23, 59, 59, 999);

    const payments = await Payment.find({
      createdAt: { $gte: rangeStart, $lte: rangeEnd },
    }).lean();

    const sumPay = payments.reduce(
      (acc, p) => acc + (Number(p.amount) || 0),
      0
    );
    if (Math.abs(sumPay - Number(dash.cash.totalCashIn)) > 0.0001) {
      failures.push(
        `Dashboard cash ${dash.cash.totalCashIn} !== sum(Payment) ${sumPay} for today`
      );
    }

    const closing = await getClosingStats(from, to);
    if (
      Math.abs(Number(closing.cashIn) - Number(dash.cash.totalCashIn)) > 0.0001
    ) {
      failures.push(
        "getClosingStats.cashIn !== getDashboardStats.cash.totalCashIn"
      );
    }

    const salesToday = await Sale.find({
      saleDate: { $gte: rangeStart, $lte: rangeEnd },
    }).lean();
    const sumSaleTotals = salesToday.reduce(
      (acc, s) => acc + (Number(s.total) || 0),
      0
    );
    if (Math.abs(sumSaleTotals - Number(dash.stats.revenue)) > 0.0001) {
      failures.push(
        `Dashboard revenue ${dash.stats.revenue} !== sum(Sale.total) ${sumSaleTotals} for saleDate range`
      );
    }

    await StockMovement.findOne().limit(1).lean();

    const inv = buildInvoiceContext({
      _id: "health",
      quantity: 1,
      unitPrice: 1,
      total: 1,
      paidAmount: 1,
      debt: 0,
      status: "PAID",
      createdAt: new Date(),
      productId: null,
      clientId: null,
    });
    if (inv.debt !== "0.00" || money(NaN) !== "0.00") {
      failures.push("Invoice money / zero-debt sanity failed");
    }
    const th = renderThermalInvoiceHtml({
      _id: "health",
      quantity: 1,
      unitPrice: 1,
      total: 1,
      paidAmount: 1,
      debt: 0,
      status: "PAID",
      createdAt: new Date(),
      productId: null,
      clientId: null,
    });
    if (th.length < 60) {
      failures.push("Thermal invoice HTML too short");
    }

    const rctx = resolveRequestContext({
      headers: { "x-forwarded-for": "203.0.113.1" },
      ip: "10.0.0.1",
      get: () => "",
      socket: {},
    });
    if (!rctx.ip || !rctx.ip.includes("203.0.113")) {
      failures.push("resolveRequestContext did not prefer x-forwarded-for");
    }
  } catch (e) {
    failures.push(`Dashboard consistency check failed: ${e.message}`);
  }

  await mongoose.disconnect();

  if (failures.length) {
    console.error("ERP HEALTH FAILED");
    failures.forEach((f) => console.error(" -", f));
    process.exit(1);
  }

  console.log("ERP HEALTH OK");
}

main().catch((e) => {
  console.error("ERP HEALTH FAILED:", e.message);
  process.exit(1);
});
