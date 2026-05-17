const { normalizeRole } = require("./rbac.service");

/**
 * Resolve role for sanitization. Unlike rbac.normalizeRole, unknown roles are NOT
 * coerced to "cashier" (that was downgrading admins when role strings were unexpected).
 */
function resolveRole(role) {
  if (role == null) return "";
  const r = String(role).trim().toLowerCase();
  if (!r) return "";
  if (r === "administrator" || r === "superadmin" || r === "owner") {
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

/** Product cost: admin only (managers see financial KPIs, not purchase price on products). */
function canViewCostPrice(role) {
  return isAdmin(role);
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
  return {
    sales: s.sales,
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

function financialFromStats(stats) {
  const s = stats || {};
  return {
    revenue: s.revenue,
    cost: s.cost,
    expenses: s.expenses ?? s.totalExpenses,
    grossProfit: s.grossProfit,
    netProfit: s.netProfit,
    profit: s.profit ?? s.netProfit,
    realProfit: s.realProfit ?? s.netProfit,
  };
}

/**
 * Dashboard — identical top-level keys; restricted blocks only for cashier / unknown.
 */
function sanitizeDashboardResponse(payload, role) {
  const r = resolveRole(role);
  const p = payload && typeof payload === "object" ? payload : {};
  const access = buildAccess(r);
  const range = p.range || null;

  if (isAdmin(r)) {
    const stats = { ...(p.stats || {}) };
    return {
      range,
      stats,
      financial: p.financial != null ? p.financial : financialFromStats(stats),
      cash: p.cash
        ? {
            cashSales: p.cash.cashSales,
            debtPayments: p.cash.debtPayments,
            totalCashIn: p.cash.totalCashIn,
          }
        : null,
      debt: stats.totalDebt != null ? stats.totalDebt : p.debt ?? null,
      access,
    };
  }

  if (isCashier(r) || !canViewFinancialKpis(r)) {
    return {
      range,
      stats: cashierOperationalStats(p.stats || {}),
      financial: null,
      cash: null,
      debt: null,
      access,
    };
  }

  const stats = statsForRole(p.stats || {}, r);
  const cash = p.cash
    ? {
        cashSales: p.cash.cashSales,
        debtPayments: p.cash.debtPayments,
        totalCashIn: p.cash.totalCashIn,
      }
    : null;

  let financial = p.financial;
  if (financial == null) {
    financial = financialFromStats(stats);
  }

  return {
    range,
    stats,
    financial,
    cash,
    debt: stats.totalDebt != null ? stats.totalDebt : p.debt ?? null,
    access,
  };
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sanitizeCashClosingResponse(payload, role) {
  const r = resolveRole(role);
  const p = payload && typeof payload === "object" ? { ...payload } : {};
  const access = buildAccess(r);

  if (isAdmin(r)) {
    return { ...p, access };
  }

  if (isCashier(r) || !canViewFinancialKpis(r)) {
    return {
      date: p.date,
      totalSales: safeNum(p.totalSales),
      countSales: p.countSales,
      access,
    };
  }

  return { ...p, access };
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
  const p = payload && typeof payload === "object" ? { ...payload } : {};
  const access = buildAccess(r);

  if (isAdmin(r)) {
    return { ...p, access };
  }

  if (isCashier(r) || !canViewFinancialKpis(r)) {
    const rev = safeNum(p.revenue);
    return {
      range: p.range || null,
      salesCount: p.salesCount,
      totalSales: rev,
      topProducts: p.topProducts || [],
      topClients: p.topClients || [],
      cashVsCredit: p.cashVsCredit || {
        cashSales: 0,
        creditSales: 0,
        mixed: 0,
        ratioCash: 0,
        ratioCredit: 0,
      },
      access,
    };
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
  sanitizeCashSessionResponse,
  sanitizeClientLedger,
  buildAccess,
  resolveRole,
};
