const mongoose = require("mongoose");
const Sale = require("../../models/sale.model");
const Payment = require("../../models/payment.model");
const Client = require("../../models/client.model");
const Product = require("../../models/product.model");
const User = require("../../models/user.model");
const { rangeBoundsUTC } = require("../expenseQuery.service");

/** Set `ERP_TRACE_LEDGER=1` (or `ERP_TRACE_COMPUTE_CORE=1`) for ledger + computeCore traces. */
function traceLedgerEnabled() {
  const v = String(
    process.env.ERP_TRACE_LEDGER || process.env.ERP_TRACE_COMPUTE_CORE || ""
  ).trim();
  return v === "1";
}

function toNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n;
}

/**
 * Inclusive local-calendar range for saleDate / payment effective dates.
 * YYYY-MM-DD uses startOfDay(from) … endOfDay(to) — not UTC midnight from Date.parse.
 */
function getDateRange(from, to) {
  if (traceLedgerEnabled()) {
    console.log("[getDateRange] input", {
      from,
      to,
      fromType: typeof from,
      toType: typeof to,
    });
  }
  if (!from || !to) return null;

  const fromStr = String(from).trim();
  const toStr = String(to).trim();
  const ymdBounds = rangeBoundsUTC(fromStr, toStr);
  if (ymdBounds) {
    if (traceLedgerEnabled()) {
      console.log("[getDateRange] rangeBoundsUTC", {
        fromStr,
        toStr,
        startISO: ymdBounds.start.toISOString(),
        endISO: ymdBounds.end.toISOString(),
        startMs: ymdBounds.start.getTime(),
        endMs: ymdBounds.end.getTime(),
      });
    }
    return ymdBounds;
  }

  let start = new Date(from);
  let end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  if (start > end) {
    const t = start;
    start = end;
    end = t;
  }
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  if (traceLedgerEnabled()) {
    console.log("[getDateRange] parsed fallback", {
      fromStr,
      toStr,
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      startMs: start.getTime(),
      endMs: end.getTime(),
    });
  }

  return { start, end };
}

function matchSalesNotVoided() {
  return { voided: { $ne: true } };
}

function isCashierScope(cashierId) {
  const raw = cashierId != null ? String(cashierId).trim() : "";
  return raw.length > 0 && mongoose.Types.ObjectId.isValid(raw);
}

function saleDateInRangeClause(range) {
  const inclusive = { $gte: range.start, $lte: range.end };
  return { saleDate: inclusive };
}

/** Cashier KPIs: inclusive saleDate window + createdAt fallback for legacy rows. */
function cashierSaleDateInRangeClause(range) {
  const inclusive = { $gte: range.start, $lte: range.end };
  return {
    $or: [
      { saleDate: inclusive },
      {
        $and: [
          { $or: [{ saleDate: null }, { saleDate: { $exists: false } }] },
          { createdAt: inclusive },
        ],
      },
    ],
  };
}

function buildSalesFilter(range, cashierId) {
  const base = matchSalesNotVoided();
  const scoped = isCashierScope(cashierId);
  const and = [];

  if (scoped) {
    const raw = String(cashierId).trim();
    and.push({
      $or: [
        { cashierId: new mongoose.Types.ObjectId(raw) },
        { cashierId: raw },
      ],
    });
  }

  if (range) {
    and.push(
      scoped ? cashierSaleDateInRangeClause(range) : saleDateInRangeClause(range)
    );
  }

  if (!and.length) return base;
  return { $and: [base, ...and] };
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
 * Payments in range tied to sales recorded by a given cashier (sale.cashierId).
 * Omits payments with no saleId or voided / mismatched sale.
 *
 * Uses $lookup + $expr (not localField/foreignField + BSON equality) so cashier-scoped
 * payments still match when legacy docs store saleId/cashierId as strings or mixed types.
 */
async function fetchPaymentsInDashboardRangeForCashier(range, cashierOid) {
  const oid =
    cashierOid instanceof mongoose.Types.ObjectId
      ? cashierOid
      : new mongoose.Types.ObjectId(String(cashierOid));
  const oidStr = String(oid);

  const saleJoinPipeline = [
    {
      $match: {
        $expr: {
          $and: [
            {
              $or: [
                { $eq: ["$_id", "$$sid"] },
                {
                  $eq: [
                    { $toString: "$_id" },
                    { $toString: { $ifNull: ["$$sid", ""] } },
                  ],
                },
              ],
            },
            { $ne: ["$voided", true] },
            {
              $or: [
                { $eq: ["$cashierId", oid] },
                {
                  $eq: [
                    { $toString: { $ifNull: ["$cashierId", ""] } },
                    oidStr,
                  ],
                },
              ],
            },
          ],
        },
      },
    },
  ];

  const saleIdPresent = {
    saleId: { $exists: true, $nin: [null, ""] },
  };

  if (!range) {
    return Payment.aggregate([
      { $match: saleIdPresent },
      {
        $lookup: {
          from: "sales",
          let: { sid: "$saleId" },
          pipeline: saleJoinPipeline,
          as: "_sale",
        },
      },
      {
        $match: {
          "_sale.0": { $exists: true },
        },
      },
      { $project: { _sale: 0 } },
    ]);
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
        ...saleIdPresent,
      },
    },
    {
      $lookup: {
        from: "sales",
        let: { sid: "$saleId" },
        pipeline: saleJoinPipeline,
        as: "_sale",
      },
    },
    {
      $match: {
        "_sale.0": { $exists: true },
      },
    },
    { $project: { _sale: 0 } },
  ]);
}

/** Sum Payment.amount per saleId (all time) — reconciles legacy Sale.paidAmount vs Payment rows. */
async function fetchPaymentTotalsBySaleIds(saleIds) {
  const ids = (saleIds || []).filter((id) => id != null);
  if (!ids.length) return new Map();
  const rows = await Payment.aggregate([
    { $match: { saleId: { $in: ids } } },
    {
      $group: {
        _id: "$saleId",
        t: { $sum: { $ifNull: ["$amount", 0] } },
      },
    },
  ]);
  const m = new Map();
  for (const row of rows) {
    if (row && row._id) m.set(String(row._id), toNumber(row.t));
  }
  return m;
}

/**
 * Dashboard / closing financial definitions (read-only, centralized here):
 *
 * - stats.revenue (accrual): sum of Sale.total — invoice face value in range, NOT cash collected.
 *   Do not add Sale.paidAmount to Payment totals; paidAmount mirrors payments but cash metrics
 *   must use Payment.amount only to stay deterministic.
 *
 * - cash.totalCashIn (cash): sum of Payment.amount — primary “money in” for the period.
 *   Plus a small reconciliation term when Sale.paidAmount exceeds summed Payment rows for the
 *   same sale (legacy rows) so partial down-payments still count as cash.
 *
 * - cash.cashSales: subset of payments where type === SALE_PAYMENT (tied to a sale line).
 * - cash.debtPayments: subset where type === DIRECT_PAYMENT (standalone debt reduction, not
 *   from a new sale line). If unused in writes, this bucket stays 0 while cash is still correct.
 *
 * - totalDebt (global AR): use getTotalOutstandingDebtFromLedger() — Σ max(0, sales total − payments)
 *   per client. Do not mix with sum of Sale.debt snapshots in range.
 */
/**
 * Raw ledger reads for financialEngine (no financial formulas here).
 * @param {string} from
 * @param {string} to
 * @param {{ cashierId?: string }} [options]
 */
async function fetchPeriodLedgerData(from, to, options = {}) {
  const range = getDateRange(from, to);
  const cashierRaw =
    options && options.cashierId != null ? String(options.cashierId).trim() : "";
  const cashierOid =
    cashierRaw && mongoose.Types.ObjectId.isValid(cashierRaw)
      ? new mongoose.Types.ObjectId(cashierRaw)
      : null;

  const [sales, payments] = await Promise.all([
    Sale.find(buildSalesFilter(range, cashierRaw || undefined))
      .populate("productId", "costPrice")
      .populate("cashierId", "username role")
      .lean(),
    cashierOid
      ? fetchPaymentsInDashboardRangeForCashier(range, cashierOid)
      : fetchPaymentsInDashboardRange(range),
  ]);
  if (traceLedgerEnabled()) {
    const paymentFunction = cashierOid
      ? "fetchPaymentsInDashboardRangeForCashier"
      : "fetchPaymentsInDashboardRange";
    console.log("[fetchPeriodLedgerData]", {
      from,
      to,
      options: options && typeof options === "object" ? { ...options } : {},
      cashierFilterApplied: Boolean(cashierOid),
      cashierId: cashierRaw || null,
      paymentFunction,
      rangeStartISO: range && range.start ? range.start.toISOString() : null,
      rangeEndISO: range && range.end ? range.end.toISOString() : null,
      salesCount: sales.length,
      paymentsCount: payments.length,
    });
  }
  return {
    range: { from, to },
    sales,
    payments,
    paymentsCount: payments.length,
  };
}

async function getDashboardStats(from, to) {
  const { snapshotForLedger } = require("../financialEngine.service");
  return snapshotForLedger(from, to);
}

async function getClosingStats(from, to) {
  const dashboard = await getDashboardStats(from, to);
  const totalDebtGlobal = await getTotalOutstandingDebtFromLedger();

  return {
    range: dashboard.range,
    countSales: dashboard.stats.sales,
    countPayments: dashboard.paymentsCount,
    totalSales: dashboard.stats.revenue,
    grossProfit: dashboard.stats.grossProfit,
    totalProductCost: dashboard.stats.totalProductCost,
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
      grossProfit: dashboard.stats.grossProfit,
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
    salesQuery = salesQuery.populate(
      "productId",
      "name salePrice qty barcode category lowStockThreshold"
    );
  }
  if (populatePaymentsSale) {
    paymentsQuery = paymentsQuery.populate({
      path: "saleId",
      populate: {
        path: "productId",
        select: "name salePrice qty barcode category lowStockThreshold",
      },
    });
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

/**
 * @param {string} from
 * @param {string} to
 * @param {{ cashierId?: string }} [options]
 */
async function getSalesList(from, to, options = {}) {
  const range = getDateRange(from, to);
  const cashierRaw =
    options && options.cashierId != null ? String(options.cashierId).trim() : "";
  const filter = buildSalesFilter(
    range,
    cashierRaw && mongoose.Types.ObjectId.isValid(cashierRaw)
      ? cashierRaw
      : undefined
  );

  return Sale.find(filter)
    .populate(
      "productId",
      "name salePrice qty barcode category lowStockThreshold"
    )
    .populate("clientId")
    .populate("cashierId", "username role")
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
  return Client.find({ isArchived: { $ne: true } }).sort({ createdAt: -1 });
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

/**
 * All-time per-client debt table (not scoped by workspace dates) — read-only rollups.
 */
async function getClientsDebtSummaryTable() {
  const [saleGroups, payGroups, clients] = await Promise.all([
    Sale.aggregate([
      {
        $match: {
          voided: { $ne: true },
          clientId: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: "$clientId",
          totalSales: { $sum: { $ifNull: ["$total", 0] } },
          lastSale: { $max: "$saleDate" },
        },
      },
    ]),
    Payment.aggregate([
      { $match: { clientId: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: "$clientId",
          totalPaid: { $sum: { $ifNull: ["$amount", 0] } },
          lastPay: { $max: { $ifNull: ["$recordedAt", "$createdAt"] } },
        },
      },
    ]),
    Client.find({ isArchived: { $ne: true } }).select("name phone").lean(),
  ]);

  const saleMap = new Map(saleGroups.map((g) => [String(g._id), g]));
  const payMap = new Map(payGroups.map((g) => [String(g._id), g]));

  const clientIds = new Set([
    ...saleGroups.map((g) => String(g._id)),
    ...payGroups.map((g) => String(g._id)),
  ]);

  const rows = [];
  for (const cid of clientIds) {
    const c = clients.find((x) => String(x._id) === cid);
    if (!c) continue;
    const sg = saleMap.get(cid) || { totalSales: 0, lastSale: null };
    const pg = payMap.get(cid) || { totalPaid: 0, lastPay: null };
    const debt = Math.max(0, toNumber(sg.totalSales) - toNumber(pg.totalPaid));
    let lastTs = null;
    for (const d of [sg.lastSale, pg.lastPay]) {
      if (!d) continue;
      const t = new Date(d).getTime();
      if (!Number.isNaN(t) && (lastTs == null || t > lastTs)) lastTs = t;
    }
    rows.push({
      _id: cid,
      client: c,
      name: c.name,
      phone: c.phone,
      totalSalesAmt: toNumber(sg.totalSales),
      totalPaid: toNumber(pg.totalPaid),
      debt,
      lastTransactionAt: lastTs != null ? new Date(lastTs) : null,
    });
  }
  rows.sort((a, b) => b.debt - a.debt);
  return rows;
}

/**
 * Admin analytics: per-cashier totals in a date range (ISO from/to). Read-only rollups.
 */
async function aggregateCashierPerformance(from, to) {
  const range = getDateRange(from, to);
  if (!range) return [];

  const saleMatch = {
    voided: { $ne: true },
    saleDate: { $gte: range.start, $lte: range.end },
  };

  const bySale = await Sale.aggregate([
    { $match: saleMatch },
    {
      $group: {
        _id: "$cashierId",
        revenue: { $sum: { $ifNull: ["$total", 0] } },
        salesCount: { $sum: 1 },
        linesDebt: { $sum: { $ifNull: ["$debt", 0] } },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "_u",
      },
    },
    {
      $project: {
        cashierId: "$_id",
        username: { $arrayElemAt: ["$_u.username", 0] },
        revenue: 1,
        salesCount: 1,
        linesDebt: 1,
      },
    },
  ]);

  const byPay = await Payment.aggregate([
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
    {
      $lookup: {
        from: "sales",
        localField: "saleId",
        foreignField: "_id",
        as: "_s",
      },
    },
    {
      $match: {
        "_s.0": { $exists: true },
        "_s.0.voided": { $ne: true },
      },
    },
    {
      $group: {
        _id: { $arrayElemAt: ["$_s.cashierId", 0] },
        paymentsTotal: { $sum: { $ifNull: ["$amount", 0] } },
      },
    },
  ]);

  const payBy = new Map(
    byPay.map((r) => [r._id == null ? "" : String(r._id), toNumber(r.paymentsTotal)])
  );

  return bySale.map((row) => {
    const key = row.cashierId == null ? "" : String(row.cashierId);
    return {
      cashierId: row.cashierId,
      username:
        row.username != null && String(row.username).trim()
          ? String(row.username).trim()
          : key ? "—" : "Unassigned",
      salesCount: toNumber(row.salesCount),
      revenue: toNumber(row.revenue),
      linesDebt: toNumber(row.linesDebt),
      paymentsTotal: payBy.get(key) ?? 0,
    };
  });
}

module.exports = {
  fetchPeriodLedgerData,
  fetchPaymentTotalsBySaleIds,
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
  getClientsDebtSummaryTable,
  aggregateCashierPerformance,
};
