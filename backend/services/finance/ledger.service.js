const Sale = require("../../models/sale.model");
const Payment = require("../../models/payment.model");
const Client = require("../../models/client.model");
const Product = require("../../models/product.model");
const User = require("../../models/user.model");

function toNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function getDateRange(from, to) {
  if (!from || !to) return null;

  let a = new Date(from);
  let b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    return null;
  }
  if (a > b) {
    const t = a;
    a = b;
    b = t;
  }
  a.setHours(0, 0, 0, 0);
  b.setHours(23, 59, 59, 999);

  return { start: a, end: b };
}

function matchSalesNotVoided() {
  return { voided: { $ne: true } };
}

function buildSalesFilter(range) {
  const base = matchSalesNotVoided();
  if (!range) return base;
  return {
    ...base,
    saleDate: {
      $gte: range.start,
      $lte: range.end,
    },
  };
}

/**
 * Payments in range by business date: recordedAt ?? createdAt.
 */
async function fetchPaymentsInDashboardRange(range) {
  if (!range) {
    return Payment.find({}).lean();
  }
  return Payment.aggregate([
    {
      $addFields: {
        _eff: { $ifNull: ["$recordedAt", "$createdAt"] },
      },
    },
    {
      $match: {
        _eff: { $gte: range.start, $lte: range.end },
      },
    },
  ]);
}

/**
 * Dashboard / closing financial definitions (read-only, centralized here):
 *
 * - stats.revenue (accrual): sum of Sale.total — invoice face value in range, NOT cash collected.
 *   Do not add Sale.paidAmount to Payment totals; paidAmount mirrors payments but cash metrics
 *   must use Payment.amount only to stay deterministic.
 *
 * - cash.totalCashIn (cash): sum of Payment.amount — sole source of “money in” for the period.
 *   revenue !== cashIn; mixing them double-counts economically if interpreted as one pool.
 *
 * - cash.cashSales: subset of payments where type === SALE_PAYMENT (tied to a sale line).
 * - cash.debtPayments: subset where type === DIRECT_PAYMENT (standalone debt reduction, not
 *   from a new sale line). If unused in writes, this bucket stays 0 while cash is still correct.
 *
 * - totalDebt (global AR): use getTotalOutstandingDebtFromLedger() — Σ max(0, sales total − payments)
 *   per client. Do not mix with sum of Sale.debt snapshots in range.
 */
async function getDashboardStats(from, to) {
  const range = getDateRange(from, to);

  const [sales, payments] = await Promise.all([
    Sale.find(buildSalesFilter(range)).lean(),
    fetchPaymentsInDashboardRange(range),
  ]);

  const salesCount = sales.length;
  const paymentsCount = payments.length;
  const totalSalesRevenue = sales.reduce((acc, s) => acc + toNumber(s.total), 0);
  const totalProfit = sales.reduce((acc, s) => acc + toNumber(s.profit), 0);
  const totalDebt = sales.reduce((acc, s) => acc + toNumber(s.debt), 0);

  // Cash movement: Payment documents only (never Sale.paidAmount).
  const totalCashIn = payments.reduce((acc, p) => acc + toNumber(p.amount), 0);

  const cashSales = payments
    .filter((p) => p.type === "SALE_PAYMENT")
    .reduce((acc, p) => acc + toNumber(p.amount), 0);

  const debtPayments = payments
    .filter((p) => p.type === "DIRECT_PAYMENT")
    .reduce((acc, p) => acc + toNumber(p.amount), 0);

  return {
    range: { from, to },
    stats: {
      sales: salesCount,
      revenue: totalSalesRevenue,
      profit: totalProfit,
    },
    cash: {
      cashSales,
      debtPayments,
      totalCashIn,
    },
    /** Sum of Sale.debt for lines with saleDate in range (informational only). */
    periodSaleDebtFieldSum: totalDebt,
    paymentsCount,
  };
}

async function getClosingStats(from, to) {
  const dashboard = await getDashboardStats(from, to);
  const totalDebtGlobal = await getTotalOutstandingDebtFromLedger();

  return {
    range: dashboard.range,
    countSales: dashboard.stats.sales,
    countPayments: dashboard.paymentsCount,
    totalSales: dashboard.stats.revenue,
    profit: dashboard.stats.profit,
    cashIn: dashboard.cash.totalCashIn,
    netCash: dashboard.cash.totalCashIn,
    debt: totalDebtGlobal,
    cashBreakdown: dashboard.cash,
  };
}

async function getDailyClosingStats(date) {
  const dashboard = await getDashboardStats(date, date);

  const debtCreated = Math.max(
    toNumber(dashboard.stats.revenue) - toNumber(dashboard.cash.cashSales),
    0
  );
  const debtRecovered = toNumber(dashboard.cash.debtPayments);
  const debtRemaining = Math.max(debtCreated - debtRecovered, 0);

  return {
    date,
    sales: {
      count: dashboard.stats.sales,
      profit: dashboard.stats.profit,
    },
    cash: {
      fromSales: dashboard.cash.cashSales,
      fromPayments: dashboard.cash.debtPayments,
      total: dashboard.cash.totalCashIn,
    },
    debt: {
      created: debtCreated,
      recovered: debtRecovered,
      remaining: debtRemaining,
    },
  };
}

async function getClientBalance(clientId, options = {}) {
  const {
    includeLedger = false,
    populateSalesProduct = false,
    populatePaymentsSale = false,
  } = options;

  let salesQuery = Sale.find({ clientId, ...matchSalesNotVoided() });
  let paymentsQuery = Payment.find({ clientId });

  if (populateSalesProduct) {
    salesQuery = salesQuery.populate("productId");
  }
  if (populatePaymentsSale) {
    paymentsQuery = paymentsQuery.populate("saleId");
  }

  const [sales, payments] = await Promise.all([salesQuery, paymentsQuery]);

  const totalSales = sales.reduce((acc, s) => acc + toNumber(s.total), 0);
  const totalPaid = payments.reduce((acc, p) => acc + toNumber(p.amount), 0);
  const balance = Math.max(totalSales - totalPaid, 0);

  const result = {
    totalSales,
    totalPaid,
    balance,
  };

  if (includeLedger) {
    result.sales = sales;
    result.payments = payments;
  }

  return result;
}

async function getSalesList(from, to) {
  const range = getDateRange(from, to);
  const filter = buildSalesFilter(range);

  return Sale.find(filter)
    .populate("productId")
    .populate("clientId")
    .sort({ createdAt: -1 });
}

async function getPaymentsList() {
  return Payment.find()
    .populate("clientId")
    .populate("saleId")
    .sort({ createdAt: -1 });
}

async function getSaleById(id) {
  return Sale.findById(id).populate("productId").populate("clientId");
}

async function getClientById(id) {
  return Client.findById(id);
}

/**
 * Global outstanding AR: Σ per client max(0, sum(Sale.total) − sum(Payment.amount)).
 * Single source of truth for totalDebt on dashboards (not Client.totalDebt cache).
 */
async function getTotalOutstandingDebtFromLedger() {
  const [saleGroups, payGroups] = await Promise.all([
    Sale.aggregate([
      {
        $match: {
          clientId: { $exists: true, $ne: null },
          voided: { $ne: true },
        },
      },
      {
        $group: {
          _id: "$clientId",
          t: { $sum: { $ifNull: ["$total", 0] } },
        },
      },
    ]),
    Payment.aggregate([
      { $match: { clientId: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: "$clientId",
          t: { $sum: { $ifNull: ["$amount", 0] } },
        },
      },
    ]),
  ]);

  const payMap = new Map(
    payGroups.map((g) => [String(g._id), toNumber(g.t)])
  );

  let total = 0;
  for (const g of saleGroups) {
    if (!g._id) continue;
    const sold = toNumber(g.t);
    const paid = payMap.get(String(g._id)) ?? 0;
    total += Math.max(sold - paid, 0);
  }

  return toNumber(total);
}

/** @deprecated Prefer getTotalOutstandingDebtFromLedger; kept for compatibility. */
async function getSumAllClientsDebt() {
  return getTotalOutstandingDebtFromLedger();
}

/**
 * Debt summary derived from sales + payments (same source as getClientBalance).
 */
async function getClientDebtLedger(clientId) {
  const client = await getClientById(clientId);
  if (!client) return null;

  const balance = await getClientBalance(clientId, {
    includeLedger: true,
    populateSalesProduct: true,
  });

  const history = balance.sales.filter((s) => {
    const st = s.status;
    const d = toNumber(s.debt);
    return (
      d > 0 ||
      st === "PARTIAL" ||
      st === "DEBT" ||
      st === "UNPAID"
    );
  });

  history.sort(
    (a, b) =>
      new Date(b.saleDate || b.createdAt) - new Date(a.saleDate || a.createdAt)
  );

  return {
    clientId,
    totalDebt: balance.balance,
    totalPaid: balance.totalPaid,
    sales: history,
  };
}

async function getClientsSorted() {
  return Client.find().sort({ createdAt: -1 });
}

async function getUserByUsername(username) {
  return User.findOne({ username });
}

async function getProductsSorted() {
  return Product.find().sort({ createdAt: -1 });
}

async function getProductById(id) {
  return Product.findById(id);
}

/**
 * Σ (costPrice × qty) across all products — inventory capital at cost (admin KPI).
 * Updates automatically whenever product qty or costPrice changes in the DB.
 */
async function getInventoryCapital() {
  const rows = await Product.aggregate([
    {
      $project: {
        line: {
          $multiply: [
            { $ifNull: ["$costPrice", 0] },
            { $ifNull: ["$qty", 0] },
          ],
        },
      },
    },
    { $group: { _id: null, total: { $sum: "$line" } } },
  ]);
  if (!rows || !rows.length) return 0;
  return toNumber(rows[0].total);
}

module.exports = {
  getDashboardStats,
  getClosingStats,
  getDailyClosingStats,
  getClientBalance,
  getTotalOutstandingDebtFromLedger,
  getSumAllClientsDebt,
  getClientDebtLedger,
  getSalesList,
  getPaymentsList,
  getSaleById,
  getClientById,
  getClientsSorted,
  getUserByUsername,
  getProductsSorted,
  getProductById,
  getInventoryCapital,
};
