const { normalizeRole } = require("./rbac.service");
const { parseMoney, lockMoneyFields } = require("./financialIntegrity.service");

/** Coerce to number when present — never invent 0 for missing computeCore fields. */
function formatMoneyField(value) {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Resolve role for sanitization. Unlike rbac.normalizeRole, unknown roles are NOT
 * coerced to "cashier" (that was downgrading admins when role strings were unexpected).
 */
function resolveRole(role) {
  if (role == null) return "";
  const r = String(role).trim().toLowerCase();
  if (!r) return "";
  if (
    r === "administrator" ||
    r === "administrateur" ||
    r === "superadmin" ||
    r === "super-admin" ||
    r === "owner"
  ) {
    return "admin";
  }
  if (r === "admin" || r === "manager" || r === "cashier") {
    return r;
  }
  return "";
}

function roleFromReq(req) {
  if (!req || !req.user) return "";
  const raw = req.user.role != null ? req.user.role : "";
  const resolved = resolveRole(raw);
  if (resolved) return resolved;
  return normalizeRole(raw);
}

function isAdmin(role) {
  return resolveRole(role) === "admin";
}

function isManager(role) {
  return resolveRole(role) === "manager";
}

function isCashier(role) {
  return resolveRole(role) === "cashier";
}

function canViewFinancialKpis(role) {
  return isAdmin(role) || isManager(role);
}

function canViewCostPrice(role) {
  return isAdmin(role) || isManager(role);
}

function canViewInventoryCapital(role) {
  return isAdmin(role);
}

const PRODUCT_SENSITIVE_KEYS = [
  "costPrice",
  "purchasePrice",
  "margin",
  "profit",
];
const SALE_SENSITIVE_KEYS = [
  "profit",
  "margin",
  "cost",
  "grossProfit",
  "netProfit",
  "realProfit",
];

function stripKeys(obj, keys) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((item) => stripKeys(item, keys));
  const o = { ...obj };
  keys.forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(o, k)) delete o[k];
  });
  return o;
}

function buildAccess(role) {
  const r = resolveRole(role);
  return {
    financialKpis: r === "admin" || r === "manager",
    inventoryCapital: r === "admin",
    costPrice: r === "admin",
    financial: r === "admin" || r === "manager",
  };
}

function toPlain(doc) {
  if (doc == null) return doc;
  if (typeof doc.toObject === "function") return doc.toObject();
  return doc;
}

function pickDebt(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const stats = p.stats && typeof p.stats === "object" ? p.stats : {};
  if (stats.totalDebt != null && Number.isFinite(Number(stats.totalDebt))) {
    return Number(stats.totalDebt);
  }
  if (p.debt != null && Number.isFinite(Number(p.debt))) {
    return Number(p.debt);
  }
  return undefined;
}

function sanitizeProduct(doc, role) {
  const o = toPlain(doc);
  if (!o) return o;
  if (isAdmin(role)) {
    return o;
  }
  if (!canViewCostPrice(role)) {
    return stripKeys(o, PRODUCT_SENSITIVE_KEYS);
  }
  return stripKeys(o, ["profit", "margin"]);
}

function sanitizeProductList(list, role) {
  if (!Array.isArray(list)) return list;
  return list.map((p) => sanitizeProduct(p, role));
}

function sanitizeSale(doc, role) {
  const o = toPlain(doc);
  if (!o) return o;
  if (isAdmin(role)) {
    return o;
  }
  let out = { ...o };
  if (!canViewFinancialKpis(role)) {
    out = stripKeys(out, SALE_SENSITIVE_KEYS);
  }
  if (out.productId && typeof out.productId === "object") {
    out.productId = sanitizeProduct(out.productId, role);
  }
  return out;
}

function sanitizeSaleList(list, role) {
  if (!Array.isArray(list)) return list;
  return list.map((s) => sanitizeSale(s, role));
}

function cashierOperationalStats(stats) {
  const s = stats && typeof stats === "object" ? stats : {};
  const salesCount =
    s.salesCount != null ? s.salesCount : s.sales;
  return {
    salesCount,
    totalSales: s.totalSales,
  };
}

function statsForRole(stats, role) {
  const s = { ...(stats || {}) };
  if (isAdmin(role)) {
    return s;
  }
  delete s.profit;
  delete s.realProfit;
  if (!canViewFinancialKpis(role)) {
    return cashierOperationalStats(s);
  }
  if (!canViewInventoryCapital(role)) {
    delete s.inventoryCapital;
  }
  return s;
}

function privilegedDashboardResponse(payload, role) {
  const r = resolveRole(role);
  const p = payload && typeof payload === "object" ? payload : {};
  const raw = p.stats && typeof p.stats === "object" ? p.stats : {};
  const salesCount =
    raw.salesCount != null ? raw.salesCount : raw.sales;
  const fin =
    p.financial && typeof p.financial === "object"
      ? p.financial
      : {
          revenue: raw.revenue,
          cost: raw.cost,
          expenses: raw.expenses ?? raw.totalExpenses,
          grossProfit: raw.grossProfit,
          netProfit: raw.netProfit,
        };

  const out = {
    meta: {
      role: r,
      range: p.range || null,
    },
    stats: {
      totalSales: raw.totalSales != null ? raw.totalSales : raw.revenue,
      salesCount,
    },
    financial: {
      revenue: fin.revenue,
      cost: fin.cost,
      expenses: fin.expenses,
      grossProfit: fin.grossProfit,
      netProfit: fin.netProfit,
    },
    cash: {
      totalCashIn:
        p.cash && p.cash.totalCashIn != null
          ? p.cash.totalCashIn
          : raw.cashIn,
      cashIn:
        p.cash && p.cash.cashIn != null
          ? p.cash.cashIn
          : p.cash && p.cash.totalCashIn != null
            ? p.cash.totalCashIn
            : raw.cashIn,
      cashSales:
        p.cash && p.cash.cashSales != null ? p.cash.cashSales : raw.cashSales,
      debtPayments:
        p.cash && p.cash.debtPayments != null
          ? p.cash.debtPayments
          : raw.debtPayments,
    },
  };

  const debt = pickDebt(p);
  if (debt !== undefined) out.debt = debt;

  if (isAdmin(r) && Array.isArray(p.cashierWeeklyBreakdown)) {
    out.cashierWeeklyBreakdown = p.cashierWeeklyBreakdown;
  }

  if (isAdmin(r) && raw.inventoryCapital != null) {
    out.inventoryCapital = raw.inventoryCapital;
  } else if (isAdmin(r) && p.inventoryCapital != null) {
    out.inventoryCapital = p.inventoryCapital;
  }

  return out;
}

function cashierOperationalCash(cash) {
  if (!cash || typeof cash !== "object") return undefined;
  const totalCashIn = formatMoneyField(cash.totalCashIn ?? cash.cashIn);
  if (totalCashIn === undefined) return undefined;
  const out = {
    totalCashIn,
    cashIn: totalCashIn,
  };
  const cs = formatMoneyField(cash.cashSales);
  const dp = formatMoneyField(cash.debtPayments);
  if (cs !== undefined) out.cashSales = cs;
  if (dp !== undefined) out.debtPayments = dp;
  return out;
}

/**
 * Dashboard contract — cashier: stats + debt + operational cash; admin/manager: full financial block.
 */
function sanitizeDashboardResponse(payload, role) {
  const r = resolveRole(role) || normalizeRole(role);
  const p = payload && typeof payload === "object" ? payload : {};

  if (isCashier(r)) {
    const out = {
      meta: { role: "cashier", range: p.range || null },
      stats: cashierOperationalStats(p.stats || {}),
    };
    const debt = pickDebt(p);
    if (debt !== undefined) out.debt = debt;
    const opCash = cashierOperationalCash(p.cash);
    if (opCash) out.cash = opCash;
    return out;
  }

  if (canViewFinancialKpis(r)) {
    return privilegedDashboardResponse(p, r);
  }

  const out = {
    meta: { role: r || "cashier" },
    stats: cashierOperationalStats(p.stats || {}),
  };
  const debt = pickDebt(p);
  if (debt !== undefined) out.debt = debt;
  return out;
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const CLOSING_MONEY_KEYS = [
  "totalSales",
  "revenue",
  "cost",
  "expenses",
  "totalExpenses",
  "grossProfit",
  "netProfit",
  "cashIn",
  "totalCashIn",
  "totalPaid",
  "netCash",
  "netCashFlow",
  "cashSales",
  "debtPayments",
  "totalDebt",
];

function sanitizeCashClosingResponse(payload, role) {
  const r = resolveRole(role);
  const p =
    payload && typeof payload === "object"
      ? lockMoneyFields({ ...payload }, CLOSING_MONEY_KEYS)
      : {};
  const access = buildAccess(r);

  if (isAdmin(r) || canViewFinancialKpis(r)) {
    return { ...p, access };
  }

  if (isCashier(r)) {
    return {
      date: p.date,
      totalSales: p.totalSales,
      countSales: p.countSales,
      cashIn: p.cashIn,
      totalCashIn: p.totalCashIn,
      totalPaid: p.totalPaid,
      netCash: p.netCash,
      netCashFlow: p.netCashFlow,
      cashSales: p.cashSales,
      debtPayments: p.debtPayments,
      access,
    };
  }

  return { ...p, access };
}

function registerOperationalCashSource(p) {
  const nest = p.cash && typeof p.cash === "object" ? p.cash : {};
  return {
    totalCashIn:
      p.totalCashIn ??
      p.cashIn ??
      p.paymentsTotal ??
      nest.totalCashIn ??
      nest.cashIn,
    cashIn:
      p.cashIn ??
      p.totalCashIn ??
      p.paymentsTotal ??
      nest.cashIn ??
      nest.totalCashIn,
    cashSales: p.cashSales ?? nest.cashSales,
    debtPayments: p.debtPayments ?? nest.debtPayments,
    netCash:
      p.netCash ??
      p.netCashFlow ??
      p.cashIn ??
      p.paymentsTotal ??
      nest.totalCashIn ??
      nest.cashIn,
    netCashFlow:
      p.netCashFlow ??
      p.netCash ??
      p.cashIn ??
      nest.totalCashIn ??
      nest.cashIn,
    paymentsTotal:
      p.paymentsTotal ??
      p.cashIn ??
      p.totalCashIn ??
      nest.totalCashIn ??
      nest.cashIn,
  };
}

function sanitizeDailyRegisterResponse(payload, role) {
  const r = resolveRole(role) || normalizeRole(role);
  const p = payload && typeof payload === "object" ? { ...payload } : {};
  const access = buildAccess(r);
  const src = registerOperationalCashSource(p);

  const base = {
    date: p.date,
    salesCount: p.salesCount,
    salesTotal: formatMoneyField(p.salesTotal),
    range: p.range || null,
  };

  // Daily Register: always emit operational cash fields for every role (cashiers
  // must match admin contract). Use safeNum so null/invalid from upstream never
  // drops keys — Express JSON omits undefined properties.
  const cashIn = safeNum(
    src.cashIn ?? src.totalCashIn ?? src.paymentsTotal ?? src.netCash
  );
  const totalCashIn = safeNum(src.totalCashIn ?? src.cashIn ?? cashIn);
  const paymentsTotal = safeNum(src.paymentsTotal ?? src.cashIn ?? cashIn);
  const netCash = safeNum(src.netCash ?? src.cashIn ?? cashIn);
  const netCashFlow = safeNum(
    src.netCashFlow ?? src.netCash ?? src.cashIn ?? cashIn
  );
  const cashSales = safeNum(src.cashSales);
  const debtPayments = safeNum(src.debtPayments);

  base.cashIn = cashIn;
  base.totalCashIn = totalCashIn;
  base.paymentsTotal = paymentsTotal;
  base.netCash = netCash;
  base.netCashFlow = netCashFlow;
  base.cashSales = cashSales;
  base.debtPayments = debtPayments;
  base.cash = {
    totalCashIn,
    cashIn,
    cashSales,
    debtPayments,
  };

  if (!canViewFinancialKpis(r)) {
    return { ...base, access };
  }

  return {
    ...base,
    expensesTotal: formatMoneyField(p.expensesTotal ?? p.expenses),
    expenses: formatMoneyField(p.expenses),
    revenue: formatMoneyField(p.revenue),
    cost: formatMoneyField(p.cost),
    grossProfit: formatMoneyField(p.grossProfit),
    netProfit: formatMoneyField(p.netProfit),
    access,
  };
}

function sanitizeCashSessionResponse(session, role) {
  const r = resolveRole(role);
  const s = session && typeof session === "object" ? { ...session } : {};
  const access = buildAccess(r);

  if (isAdmin(r)) {
    return { session: s, access };
  }

  if (isCashier(r) || !canViewFinancialKpis(r)) {
    return {
      session: null,
      access,
    };
  }

  return {
    session: {
      cashSales: safeNum(s.cashSales),
      debtPayments: safeNum(s.debtPayments),
      totalCashIn: safeNum(s.totalCashIn),
      grossProfit: safeNum(s.grossProfit),
      netProfit: safeNum(s.netProfit),
    },
    access,
  };
}

function sanitizeReportsResponse(payload, role) {
  const r = resolveRole(role);
  const raw = payload && typeof payload === "object" ? payload : {};
  const p = lockMoneyFields({ ...raw }, [
    "revenue",
    "cost",
    "expenses",
    "grossProfit",
    "netProfit",
    "cashIn",
    "netCashFlow",
  ]);
  const access = buildAccess(r);

  if (isCashier(r) || !canViewFinancialKpis(r)) {
    const rev = parseMoney(p.revenue);
    const cvc = p.cashVsCredit && typeof p.cashVsCredit === "object"
      ? lockMoneyFields({ ...p.cashVsCredit }, [
          "cashSales",
          "creditSales",
          "mixed",
          "ratioCash",
          "ratioCredit",
        ])
      : {
          cashSales: 0,
          creditSales: 0,
          mixed: 0,
          ratioCash: 0,
          ratioCredit: 0,
        };
    const opCash =
      p.cash && typeof p.cash === "object"
        ? lockMoneyFields({ ...p.cash }, [
            "totalCashIn",
            "cashIn",
            "cashSales",
            "debtPayments",
          ])
        : null;
    const out = {
      range: p.range || null,
      salesCount: p.salesCount,
      totalSales: rev,
      cashIn: p.cashIn,
      netCashFlow: p.netCashFlow,
      topProducts: p.topProducts || [],
      topClients: p.topClients || [],
      cashVsCredit: cvc,
      access,
    };
    if (opCash) out.cash = opCash;
    return out;
  }

  if (p.cash && typeof p.cash === "object") {
    p.cash = lockMoneyFields({ ...p.cash }, [
      "totalCashIn",
      "cashIn",
      "cashSales",
      "debtPayments",
    ]);
  }
  if (p.expensesBreakdown && typeof p.expensesBreakdown === "object") {
    p.expensesBreakdown = lockMoneyFields({ ...p.expensesBreakdown }, [
      "daily",
      "monthly",
    ]);
  }
  return { ...p, access };
}

function sanitizeClientLedger(summary, role) {
  const s = summary && typeof summary === "object" ? summary : {};
  if (isAdmin(role)) {
    return { ...s };
  }
  return {
    ...s,
    sales: sanitizeSaleList(s.sales, role),
    payments: Array.isArray(s.payments)
      ? s.payments.map((pay) => {
          const o = toPlain(pay);
          if (!o || typeof o !== "object") return o;
          if (o.saleId && typeof o.saleId === "object") {
            return { ...o, saleId: sanitizeSale(o.saleId, role) };
          }
          return o;
        })
      : [],
  };
}

module.exports = {
  roleFromReq,
  isCashier,
  isAdmin,
  canViewCostPrice,
  canViewFinancialKpis,
  canViewInventoryCapital,
  sanitizeProduct,
  sanitizeProductList,
  sanitizeSale,
  sanitizeSaleList,
  sanitizeDashboardResponse,
  sanitizeReportsResponse,
  sanitizeCashClosingResponse,
  sanitizeDailyRegisterResponse,
  sanitizeCashSessionResponse,
  sanitizeClientLedger,
  buildAccess,
  resolveRole,
};
