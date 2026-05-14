const {
  getDashboardStats,
  getTotalOutstandingDebtFromLedger,
  getInventoryCapital,
} = require("../services/finance/ledger.service");
const { sumExpensesForRange } = require("../services/expenseQuery.service");

function safeNum(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function safeString(v, fallback = "") {
  if (v == null) return fallback;
  return String(v);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function canViewFinancialDashboard(req) {
  const user = req && req.user ? req.user : null;
  if (!user) return false;
  const role = String(user.role || "").toLowerCase();
  if (role === "admin" || role === "manager") return true;
  const perms =
    user.permissions && typeof user.permissions === "object"
      ? user.permissions
      : {};
  if (perms.canViewReports === true) return true;
  return role === "cashier";
}

function isAdminUser(req) {
  const user = req && req.user ? req.user : null;
  if (!user) return false;
  return String(user.role || "").toLowerCase() === "admin";
}

/**
 * Unified model (selected range):
 * - totalSales = Σ Sale.total (saleDate in range)
 * - cashIn = Σ Payment.amount (effective date recordedAt ?? createdAt in range)
 * - totalExpenses = dailyExpenses + monthlyExpenses (allocated to range)
 * - totalDebt = global Σ max(0, per-client sale totals − payments) — ledger only
 * - netProfit = cashIn − totalExpenses
 * - sales = sale line count in range
 * - profit (accrual) = Σ Sale.profit in range (display only; not net profit)
 */
exports.getDashboard = async (req, res) => {
  try {
    let { from, to } = req.query;
    const role = String(req.user && req.user.role ? req.user.role : "").toLowerCase();
    if (role === "cashier") {
      const day = todayISO();
      from = day;
      to = day;
    }

    const dashboard = await getDashboardStats(from, to);

    const rangeFrom = safeString(
      dashboard.range && dashboard.range.from,
      safeString(from, "")
    );
    const rangeTo = safeString(
      dashboard.range && dashboard.range.to,
      safeString(to, "")
    );

    let totalExpensesRaw = 0;
    try {
      totalExpensesRaw = await sumExpensesForRange(rangeFrom, rangeTo);
    } catch {
      totalExpensesRaw = 0;
    }

    const dbStats = dashboard.stats || {};
    const cash = dashboard.cash || {};

    const sales = safeNum(dbStats.sales);
    const totalSales = safeNum(dbStats.revenue);
    const accrualProfit = safeNum(dbStats.profit);
    const cashIn = safeNum(cash.totalCashIn);
    const totalExpenses = safeNum(totalExpensesRaw);
    const totalDebt = safeNum(await getTotalOutstandingDebtFromLedger());
    const netProfit = safeNum(cashIn - totalExpenses);

    const cashSales = safeNum(cash.cashSales);
    const debtPayments = safeNum(cash.debtPayments);

    const financialAllowed = canViewFinancialDashboard(req);
    const adminUser = isAdminUser(req);
    let inventoryCapital = null;
    if (adminUser) {
      try {
        inventoryCapital = safeNum(await getInventoryCapital());
      } catch {
        inventoryCapital = 0;
      }
    }

    const responseStats = {
      sales,
      totalSales,
      totalExpenses: financialAllowed ? totalExpenses : 0,
      totalDebt: financialAllowed ? totalDebt : 0,
      cashIn: financialAllowed ? cashIn : 0,
      netProfit: financialAllowed ? netProfit : 0,
      profit: financialAllowed ? accrualProfit : 0,
    };
    if (adminUser) {
      responseStats.inventoryCapital = inventoryCapital;
    }

    const response = {
      range: dashboard.range || {
        from: safeString(from, ""),
        to: safeString(to, ""),
      },
      stats: responseStats,
      cash: {
        cashSales: financialAllowed ? cashSales : 0,
        debtPayments: financialAllowed ? debtPayments : 0,
        totalCashIn: financialAllowed ? cashIn : 0,
      },
      debt: financialAllowed ? totalDebt : 0,
      access: {
        financial: financialAllowed,
        inventoryCapital: adminUser,
      },
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error("DASHBOARD ERROR:", err && err.message ? err.message : err);

    return res.status(200).json({
      error: safeString(err && err.message, "Server error"),
      range: {
        from: safeString(req.query && req.query.from, ""),
        to: safeString(req.query && req.query.to, ""),
      },
      stats: {
        sales: 0,
        totalSales: 0,
        totalExpenses: 0,
        totalDebt: 0,
        cashIn: 0,
        netProfit: 0,
        profit: 0,
      },
      cash: {
        cashSales: 0,
        debtPayments: 0,
        totalCashIn: 0,
      },
      debt: 0,
      access: {
        financial: false,
        inventoryCapital: false,
      },
    });
  }
};

exports.getDashboardFiltered = exports.getDashboard;
