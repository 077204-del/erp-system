/**
 * SINGLE SOURCE OF TRUTH for period financials.
 *
 * revenue = Σ sale.total (non-void)
 * cost = Σ (quantity × product.costPrice) — Product.costPrice only, never sale.profit
 * grossProfit = revenue - cost
 * expenses = Σ expenses in range
 * netProfit = grossProfit - expenses
 * cashIn = Σ payment.amount + orphan gap (sale.paidAmount − summed payments per sale).
 * Cashier sessions may restrict the orphan term to CASH-method lines only (see ledgerOptions).
 * netCashFlow = cashIn (legacy alias only; not cashIn − expenses)
 */

const { fetchPeriodLedgerData, fetchPaymentTotalsBySaleIds } = require("./finance/ledger.service");
const {
  sumExpensesForRange,
  sumAllExpenses,
  sumExpenseSplitForRange,
  rangeBoundsUTC,
} = require("./expenseQuery.service");
const {
  getTotalOutstandingDebtFromLedger,
  getInventoryCapital,
} = require("./finance/ledger.service");
const { normalizeRole } = require("./rbac.service");
const { resolveCashierFromTo } = require("./cashierWeekBound.service");
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

/** Set `ERP_TRACE_COMPUTE_CORE=1` or `ERP_TRACE_LEDGER=1` to log payments → cashIn. */
function traceComputeCoreEnabled() {
  const v = String(
    process.env.ERP_TRACE_COMPUTE_CORE || process.env.ERP_TRACE_LEDGER || ""
  ).trim();
  return v === "1";
}

function productCostPrice(sale) {
  const p = sale && sale.productId;
  if (p && typeof p === "object" && p.costPrice != null) {
    return toNumber(p.costPrice);
  }
  return 0;
}

function isValidYmd(s) {
  const raw = String(s || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [y, mo, da] = raw.split("-").map(Number);
  const dt = new Date(y, mo - 1, da);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === mo - 1 &&
    dt.getDate() === da
  );
}

/** Coerce query input to YYYY-MM-DD or empty string when not parseable. */
function normalizeYmdInput(v) {
  if (v == null) return "";
  const s = String(v).trim();
  if (isValidYmd(s)) return s;
  const prefix = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (prefix && isValidYmd(prefix[1])) return prefix[1];
  return "";
}

function orderYmdPair(from, to) {
  if (from <= to) return { from, to };
  return { from: to, to: from };
}

function hostLocalTodayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Missing/invalid YMD → local today (YYYY-MM-DD). */
function normalizeYmdOrToday(v) {
  const n = normalizeYmdInput(v);
  return n || hostLocalTodayYmd();
}

/** Final safety: always return valid inclusive YYYY-MM-DD pair. */
function ensureValidPeriodOutput(period) {
  let f = normalizeYmdOrToday(period && period.from);
  let t = normalizeYmdOrToday(period && period.to);
  if (f > t) {
    const swap = f;
    f = t;
    t = swap;
  }
  return { from: f, to: t };
}

/**
 * Raw period metrics — no role filtering.
 * @param {string} from
 * @param {string} to
 * @param {{ cashierId?: string, applyCashSalePaidFallback?: boolean }} [ledgerOptions]
 *   optional cashier scope; when applyCashSalePaidFallback is true (cashier-only API paths),
 *   paidAmount not yet reflected in Payment rows counts only for sales with paymentMethod CASH.
 */
async function computeCore(from, to, ledgerOptions = {}) {
  const { sales, payments, range, paymentsCount } = await fetchPeriodLedgerData(
    from,
    to,
    ledgerOptions
  );

  if (traceComputeCoreEnabled()) {
    const scoped =
      ledgerOptions &&
      ledgerOptions.cashierId != null &&
      String(ledgerOptions.cashierId).trim();
    const paySource = scoped
      ? `fetchPaymentsInDashboardRangeForCashier(cashierId=${String(ledgerOptions.cashierId).trim()})`
      : "fetchPaymentsInDashboardRange(unscoped)";
    const payPreview = (payments || []).slice(0, 40).map((p) => ({
      amount: p && p.amount,
      saleId: p && p.saleId,
      type: p && p.type,
      recordedAt: p && p.recordedAt,
      createdAt: p && p.createdAt,
    }));
    console.log("[computeCore] enter", {
      from,
      to,
      ledgerOptions,
      paymentFetch: paySource,
      salesCount: sales.length,
      paymentsLength: payments.length,
    });
    console.log("[computeCore] payments (before reduce, first 40):", payPreview);
    if (payments.length > 40) {
      console.log("[computeCore] …truncated, total payments:", payments.length);
    }
  }

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
    if (rangeBoundsUTC(from, to)) {
      expenses = toNumber(await sumExpensesForRange(from, to));
    } else {
      expenses = toNumber(await sumAllExpenses());
    }
  } catch {
    expenses = 0;
  }

  const netProfit = toNumber(grossProfit - expenses);

  const saleIds = sales.map((s) => s && s._id).filter(Boolean);
  const paymentTotalsBySale = await fetchPaymentTotalsBySaleIds(saleIds);
  const applyCashSalePaidFallback = Boolean(
    ledgerOptions && ledgerOptions.applyCashSalePaidFallback
  );
  let orphanSaleCash = 0;
  for (const s of sales) {
    if (!s || !s._id) continue;
    const sid = String(s._id);
    const paidOnSale = toNumber(s.paidAmount);
    const recordedForSale = paymentTotalsBySale.get(sid) ?? 0;
    const gap = Math.max(0, paidOnSale - recordedForSale);
    if (applyCashSalePaidFallback) {
      const pm = String(s.paymentMethod || "CASH").toUpperCase();
      if (pm === "CASH") {
        orphanSaleCash += gap;
      }
    } else {
      orphanSaleCash += gap;
    }
  }

  if (traceComputeCoreEnabled()) {
    console.log("[computeCore] orphanSaleCash (after sale loop):", orphanSaleCash);
  }

  const cashInFromPayments = payments.reduce((acc, p) => acc + toNumber(p.amount), 0);
  const cashIn = toNumber(cashInFromPayments + orphanSaleCash);

  if (traceComputeCoreEnabled()) {
    console.log("[computeCore] cashInFromPayments (Σ payment.amount):", cashInFromPayments);
    console.log("[computeCore] cashIn (final):", cashIn, "=", cashInFromPayments, "+", orphanSaleCash);
    console.log("[computeCore] summary", {
      from,
      to,
      ledgerOptions,
      salesCount: sales.length,
      paymentsLength: payments.length,
      cashInFromPayments,
      orphanSaleCash,
      cashIn,
    });
  }

  const cashSalesFromPayments = payments
    .filter((p) => {
      const t = String(p.type || "SALE_PAYMENT").toUpperCase();
      if (t === "DIRECT_PAYMENT") return false;
      if (t === "SALE_PAYMENT") return true;
      return p.saleId != null;
    })
    .reduce((acc, p) => acc + toNumber(p.amount), 0);
  const cashSales = toNumber(cashSalesFromPayments + orphanSaleCash);

  const debtPayments = payments
    .filter((p) => {
      const t = String(p.type || "").toUpperCase();
      return t === "DIRECT_PAYMENT";
    })
    .reduce((acc, p) => acc + toNumber(p.amount), 0);

  return {
    range: range || { from, to },
    revenue,
    totalSales: revenue,
    cost,
    expenses,
    grossProfit,
    netProfit,
    salesCount: sales.length,
    cashIn,
    netCashFlow: cashIn,
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

/**
 * Ledger scope for computeCore — cashier session vs admin cashier filter.
 * @param {string} userRole
 * @param {string} [userId]
 * @param {string} [filterCashierId] admin/manager report filter only
 */
function ledgerOptionsForContext(userRole, userId, filterCashierId) {
  const role = resolveUserRole(userRole);
  const opts = {};
  if (role === "cashier" && userId != null && String(userId).trim()) {
    opts.cashierId = String(userId).trim();
    opts.applyCashSalePaidFallback = true;
    return opts;
  }
  const raw =
    filterCashierId != null ? String(filterCashierId).trim() : "";
  if (raw) {
    opts.cashierId = raw;
  }
  return opts;
}

function resolveQueryPeriod(userRole, from, to) {
  const role = resolveUserRole(userRole);

  let period;
  if (role === "cashier") {
    period = resolveCashierFromTo();
  } else {
    const f = normalizeYmdInput(from);
    const t = normalizeYmdInput(to);
    if (f && t) {
      period = orderYmdPair(f, t);
    } else {
      period = resolveCashierFromTo();
    }
    if (
      !period ||
      !isValidYmd(period.from) ||
      !isValidYmd(period.to)
    ) {
      period = resolveCashierFromTo();
    }
  }

  const resolved = ensureValidPeriodOutput(period);
  console.log("[resolveQueryPeriod] resolved", resolved);
  return resolved;
}

async function compute(from, to, userRole, ledgerOptions = {}) {
  const role = resolveUserRole(userRole);
  const core = await computeCore(from, to, ledgerOptions);
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

async function buildDashboard(from, to, userRole, attach = {}, ledgerOptions = {}) {
  const role = resolveUserRole(userRole);
  const core = await computeCore(from, to, ledgerOptions);
  const totalDebt = toNumber(await getTotalOutstandingDebtFromLedger());

  let inventoryCapitalValue;
  if (canViewInventoryCapital(role)) {
    try {
      inventoryCapitalValue = toNumber(await getInventoryCapital());
    } catch {
      inventoryCapitalValue = undefined;
    }
  }

  const payload = {
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
      cashIn: core.cashIn,
      cashSales: core.cashSales,
      debtPayments: core.debtPayments,
    },
    debt: totalDebt,
    inventoryCapital: inventoryCapitalValue,
    ...(attach && typeof attach === "object" ? attach : {}),
  };

  return sanitizeDashboardResponse(payload, role);
}

async function buildDailyRegister(from, to, userRole, ledgerOptions = {}) {
  const { role, core, financialAllowed } = await compute(
    from,
    to,
    userRole,
    ledgerOptions
  );
  const access = buildAccess(role);
  const cashBlock = {
    salesTotal: core.totalSales,
    salesCount: core.salesCount,
    cashIn: core.cashIn,
    netCashFlow: core.netCashFlow,
    cashSales: core.cashSales,
    debtPayments: core.debtPayments,
    paymentsTotal: core.cashIn,
    netCash: core.cashIn,
  };
  if (!financialAllowed) {
    return {
      date: from,
      ...cashBlock,
      access,
    };
  }
  return {
    date: from,
    ...cashBlock,
    revenue: core.revenue,
    cost: core.cost,
    expenses: core.expenses,
    expensesTotal: core.expenses,
    grossProfit: core.grossProfit,
    netProfit: core.netProfit,
    access,
  };
}

async function buildCashClosing(from, to, userRole, ledgerOptions = {}) {
  const { role, core, financialAllowed } = await compute(
    from,
    to,
    userRole,
    ledgerOptions
  );
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
      totalCashIn: core.cashIn,
      netCash: core.cashIn,
      netCashFlow: core.cashIn,
      countSales: core.salesCount,
    },
    role
  );
}

async function buildReports(from, to, userRole, reportExtras = {}) {
  const cashierRaw =
    reportExtras && reportExtras.cashierId != null
      ? String(reportExtras.cashierId).trim()
      : "";
  const ledgerOpts = ledgerOptionsForContext(
    userRole,
    reportExtras && reportExtras.sessionUserId,
    cashierRaw || undefined
  );
  const { role, core, financialAllowed } = await compute(
    from,
    to,
    userRole,
    ledgerOpts
  );
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
        cashIn: core.cashIn,
      },
      cashIn: core.cashIn,
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
  ledgerOptionsForContext,
  resolveQueryPeriod,
  buildDashboard,
  buildDailyRegister,
  buildCashClosing,
  buildReports,
  snapshotForLedger,
};
