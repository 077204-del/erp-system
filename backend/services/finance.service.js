/**
 * @deprecated
 * This service is deprecated. Use `services/finance/ledger.service.js` instead.
 * Kept temporarily for backward compatibility only.
 */

const Client = require("../models/client.model");
const {
  getDashboardStats,
  getClosingStats,
  getClientBalance,
  getTotalOutstandingDebtFromLedger,
} = require("./finance/ledger.service");

function deprecatedStub() {
  throw new Error("Use ledger.service instead");
}

async function cashInForRange(query = {}) {
  const dashboard = await getDashboardStats(query.from, query.to);
  return {
    total: dashboard.cash.totalCashIn,
    fromPaymentsInRange: dashboard.cash.totalCashIn,
    fromUnrecordedSalePaymentsInRange: 0,
    byMethod: { CASH: 0, CARD: 0, BANK: 0 },
  };
}

async function salesMetricsForRange(query = {}) {
  const dashboard = await getDashboardStats(query.from, query.to);
  const totalDebtRemaining = await getTotalOutstandingDebtFromLedger();
  return {
    salesCount: dashboard.stats.sales,
    totalRevenue: dashboard.stats.revenue,
    totalProfit: dashboard.stats.profit,
    totalPaidOnSales: dashboard.cash.totalCashIn,
    totalDebtRemaining,
  };
}

async function clientBalance(clientId) {
  const client = await Client.findById(clientId).lean();
  if (!client) {
    return {
      client: null,
      summary: { totalSales: 0, totalPaid: 0, balance: 0 },
    };
  }

  const summary = await getClientBalance(clientId);
  return {
    client: {
      id: client._id,
      name: client.name,
      phone: client.phone || "",
    },
    summary,
  };
}

async function debtSummary(query = {}) {
  const closing = await getClosingStats(query.from, query.to);
  return {
    salesCount: closing.countSales,
    outstandingOnSalesInRange: closing.debt,
    debtCreatedOnSaleDay: 0,
  };
}

async function closingSummary(query = {}) {
  const closing = await getClosingStats(query.from, query.to);
  return {
    range: {
      from: query.from ?? null,
      to: query.to ?? null,
    },
    countSales: closing.countSales,
    countPayments: closing.countPayments,
    totalSalesAmount: closing.totalSales,
    totalPaidOnSales: closing.cashIn,
    totalDebtOutstandingOnLines: closing.debt,
    profit: closing.profit,
    cash: {
      total: closing.cashIn,
      fromPaymentsInRange: closing.cashIn,
      fromUnrecordedSalePaymentsInRange: 0,
      byMethod: { CASH: 0, CARD: 0, BANK: 0 },
    },
    cashIn: closing.cashIn,
    netCash: closing.netCash,
    debt: {
      salesCount: closing.countSales,
      outstandingOnSalesInRange: closing.debt,
      debtCreatedOnSaleDay: 0,
    },
  };
}

module.exports = {
  cashInForRange,
  salesMetricsForRange,
  clientBalance,
  debtSummary,
  closingSummary,

  parseRange: deprecatedStub,
  computeCashInFromData: deprecatedStub,
  computeSalesMetricsFromData: deprecatedStub,
  computeClientBalanceFromData: deprecatedStub,
  paymentCoverageBySaleId: deprecatedStub,
  uncoveredPaidForSales: deprecatedStub,
  sumPaymentsInRange: deprecatedStub,
};
