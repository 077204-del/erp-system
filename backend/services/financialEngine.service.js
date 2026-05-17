/**
 * SINGLE SOURCE OF TRUTH for period financials.
 *
 * revenue = Σ sale.total (non-void)
 * cost = Σ (quantity × product.costPrice) — Product.costPrice only, never sale.profit
 * grossProfit = revenue - cost
 * expenses = Σ expenses in range
 * netProfit = grossProfit - expenses
 * cashIn = Σ payment.amount (expenses do NOT reduce cashIn)
 */

const { fetchPeriodLedgerData } = require("./finance/ledger.service");
const { sumExpensesForRange, sumExpenseSplitForRange } = require("./expenseQuery.service");
const {
  getTotalOutstandingDebtFromLedger,
  getInventoryCapital,
} = require("./finance/ledger.service");
const { normalizeRole } = require("./rbac.service");
const {
  resolveRole,
  canViewFinancialKpis,
  canViewInventoryCapital,
  buildAccess,
  sanitizeDashboardResponse,
  sanitizeReportsResponse,
  sanitizeCashClosingResponse,
} = require("./responseSanitize.service");

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function productCostPrice(sale) {
  const p = sale && sale.productId;
  if (p && typeof p === "object" && p.costPrice != null) {
    return toNumber(p.costPrice);
  }
  return 0;
}

/**
 * Raw period metrics — no role filtering.
 * @param {string} from
 * @param {string} to
 */
async function computeCore(from, to) {
  const { sales, payments, range, paymentsCount } = await fetchPeriodLedgerData(
    from,
    to
  );

  let revenue = 0;
  let cost = 0;
  for (const s of sales) {
    const qty = toNumber(s.quantity);
    revenue += toNumber(s.total);
    cost += productCostPrice(s) * qty;
  }

  const grossProfit = toNumber(revenue - cost);

  let expenses = 0;
  try {
    expenses = toNumber(await sumExpensesForRange(from, to));
  } catch {
    expenses = 0;
  }

  const netProfit = toNumber(grossProfit - expenses);

  const cashIn = payments.reduce((acc, p) => acc + toNumber(p.amount), 0);
  const cashSales = payments
    .filter((p) => {
      const t = String(p.type || "SALE_PAYMENT").toUpperCase();
      if (t === "DIRECT_PAYMENT") return false;
      if (t === "SALE_PAYMENT") return true;
      return p.saleId != null;
    })
    .reduce((acc, p) => acc + toNumber(p.amount), 0);
  const debtPayments = payments
    .filter((p) => {
      const t = String(p.type || "").toUpperCase();
      return t === "DIRECT_PAYMENT";
    })
    .reduce((acc, p) => acc + toNumber(p.amount), 0);

  return {
    range: range || { from, to },
    revenue,
    cost,
    expenses,
    grossProfit,
    netProfit,
    salesCount: sales.length,
    cashIn,
    cashSales,
    debtPayments,
    paymentsCount,
    sales,
  };
}

/**
 * @param {string} from
 * @param {string} to
 * @param {string} userRole
 */
function resolveUserRole(userRole) {
  return resolveRole(userRole) || normalizeRole(userRole);
}

async function compute(from, to, userRole) {
  const role = resolveUserRole(userRole);
  const core = await computeCore(from, to);
  return {
    role,
    core,
    financialAllowed: canViewFinancialKpis(role),
    inventoryAllowed: canViewInventoryCapital(role),
  };
}

function legacyStats(core, extras = {}) {
  return {
    salesCount: core.salesCount,
    sales: core.salesCount,
    totalSales: core.revenue,
    revenue: core.revenue,
    cost: core.cost,
    expenses: core.expenses,
    totalExpenses: core.expenses,
    totalProductCost: core.cost,
    grossProfit: core.grossProfit,
    netProfit: core.netProfit,
    cashIn: core.cashIn,
    netCashFlow: core.cashIn,
    totalDebt: toNumber(extras.totalDebt),
    inventoryCapital:
      extras.inventoryCapital != null ? extras.inventoryCapital : null,
  };
}

async function buildDashboard(from, to, userRole) {
  const role = resolveUserRole(userRole);
  const core = await computeCore(from, to);
  const totalDebt = toNumber(await getTotalOutstandingDebtFromLedger());

  let inventoryCapitalValue;
  if (canViewInventoryCapital(role)) {
    try {
      inventoryCapitalValue = toNumber(await getInventoryCapital());
    } catch {
      inventoryCapitalValue = undefined;
    }
  }

  return sanitizeDashboardResponse(
    {
      range: core.range,
      stats: legacyStats(core, {
        totalDebt,
        inventoryCapital: inventoryCapitalValue,
      }),
      financial: {
        revenue: core.revenue,
        cost: core.cost,
        expenses: core.expenses,
        grossProfit: core.grossProfit,
        netProfit: core.netProfit,
      },
      cash: {
        totalCashIn: core.cashIn,
        cashSales: core.cashSales,
        debtPayments: core.debtPayments,
      },
      debt: totalDebt,
      inventoryCapital: inventoryCapitalValue,
    },
    role
  );
}

async function buildDailyRegister(from, to, userRole) {
  const { role, core, financialAllowed } = await compute(from, to, userRole);
  const access = buildAccess(role);
  if (!financialAllowed) {
    return {
      date: from,
      salesTotal: core.revenue,
      salesCount: core.salesCount,
      access,
    };
  }
  return {
    date: from,
    salesTotal: core.revenue,
    salesCount: core.salesCount,
    paymentsTotal: core.cashIn,
    cashIn: core.cashIn,
    netCash: core.cashIn,
    revenue: core.revenue,
    cost: core.cost,
    expenses: core.expenses,
    expensesTotal: core.expenses,
    grossProfit: core.grossProfit,
    netProfit: core.netProfit,
    access,
  };
}

async function buildCashClosing(from, to, userRole) {
  const { role, core, financialAllowed } = await compute(from, to, userRole);
  const totalDebt = financialAllowed
    ? toNumber(await getTotalOutstandingDebtFromLedger())
    : 0;

  return sanitizeCashClosingResponse(
    {
      date: from || "ALL",
      totalSales: core.revenue,
      revenue: core.revenue,
      cost: core.cost,
      expenses: core.expenses,
      grossProfit: core.grossProfit,
      netProfit: core.netProfit,
      totalExpenses: core.expenses,
      totalPaid: core.cashIn,
      totalDebt,
      cashSales: core.cashSales,
      debtPayments: core.debtPayments,
      cashIn: core.cashIn,
      netCash: core.cashIn,
      countSales: core.salesCount,
    },
    role
  );
}

async function buildReports(from, to, userRole, reportExtras = {}) {
  const { role, core, financialAllowed } = await compute(from, to, userRole);
  const expenseSplit = await sumExpenseSplitForRange(from, to);
  const totalDebtGlobal = toNumber(await getTotalOutstandingDebtFromLedger());

  return sanitizeReportsResponse(
    {
      range: core.range,
      revenue: core.revenue,
      cost: core.cost,
      expenses: core.expenses,
      grossProfit: core.grossProfit,
      netProfit: core.netProfit,
      totalProductCost: core.cost,
      salesCount: core.salesCount,
      cash: {
        cashSales: core.cashSales,
        debtPayments: core.debtPayments,
        totalCashIn: core.cashIn,
      },
      debt: totalDebtGlobal,
      topProducts: reportExtras.topProducts || [],
      topClients: reportExtras.topClients || [],
      expensesBreakdown: {
        daily: toNumber(expenseSplit.daily),
        monthly: toNumber(expenseSplit.monthly),
      },
      netCashFlow: core.cashIn,
      cashVsCredit: reportExtras.cashVsCredit || {
        cashSales: 0,
        creditSales: 0,
        mixed: 0,
        ratioCash: 0,
        ratioCredit: 0,
      },
    },
    role
  );
}

/** Backward compat for ledger / health scripts */
async function snapshotForLedger(from, to) {
  const core = await computeCore(from, to);
  return {
    range: core.range,
    stats: {
      sales: core.salesCount,
      revenue: core.revenue,
      grossProfit: core.grossProfit,
      totalProductCost: core.cost,
    },
    cash: {
      cashSales: core.cashSales,
      debtPayments: core.debtPayments,
      totalCashIn: core.cashIn,
    },
    paymentsCount: core.paymentsCount,
  };
}

module.exports = {
  toNumber,
  computeCore,
  compute,
  buildDashboard,
  buildDailyRegister,
  buildCashClosing,
  buildReports,
  snapshotForLedger,
};
