import { safeNum } from "./erpFormat";

/**
 * Cash in = Σ Payment.amount in period (never reduced by expenses).
 * Gross profit = Σ sale revenue − Σ (qty × product costPrice) — computed on server.
 * Net / real profit = gross profit − expenses.
 */
export function netCashFlowFromParts(cashIn) {
  return safeNum(cashIn, 0);
}

export function realProfitFromParts(grossProfit, totalExpenses) {
  return safeNum(grossProfit, 0) - safeNum(totalExpenses, 0);
}

/**
 * Single mapper from GET /api/dashboard payload → React workspace state.
 */
export function mapDashboardApiToState(data) {
  const stats = data?.stats || {};
  const cash = data?.cash || {};
  const financial = data?.access?.financialKpis === true;

  const salesCount = Number.isFinite(Number(stats.sales))
    ? Number(stats.sales)
    : 0;

  const debtVal = financial
    ? Number.isFinite(Number(stats.totalDebt))
      ? Number(stats.totalDebt)
      : Number.isFinite(Number(data?.debt))
        ? Number(data.debt)
        : 0
    : 0;

  const cashInVal = financial
    ? Number.isFinite(Number(stats.cashIn))
      ? Number(stats.cashIn)
      : Number.isFinite(Number(stats.netCashFlow))
        ? Number(stats.netCashFlow)
        : Number.isFinite(Number(cash.totalCashIn))
          ? Number(cash.totalCashIn)
          : 0
    : 0;

  const totalExpenses = financial
    ? Number.isFinite(Number(stats.totalExpenses))
      ? Number(stats.totalExpenses)
      : 0
    : 0;

  const grossProfit = financial
    ? Number.isFinite(Number(stats.grossProfit))
      ? Number(stats.grossProfit)
      : 0
    : 0;

  const realProfit = financial
    ? Number.isFinite(Number(stats.realProfit))
      ? Number(stats.realProfit)
      : Number.isFinite(Number(stats.netProfit))
        ? Number(stats.netProfit)
        : realProfitFromParts(grossProfit, totalExpenses)
    : 0;

  let invCap = null;
  if (data?.access?.inventoryCapital === true) {
    const n = Number(stats.inventoryCapital);
    invCap = Number.isFinite(n) ? n : 0;
  }

  return {
    dashboard: {
      sales: salesCount,
      salesCount,
      totalSales: Number.isFinite(Number(stats.totalSales))
        ? Number(stats.totalSales)
        : 0,
      profit: realProfit,
      grossProfit,
      realProfit,
      debt: debtVal,
      totalExpenses,
      netCashFlow: cashInVal,
      inventoryCapital: invCap,
    },
    cash: {
      cashSales: financial
        ? Number.isFinite(Number(cash.cashSales))
          ? Number(cash.cashSales)
          : 0
        : 0,
      debtPayments: financial
        ? Number.isFinite(Number(cash.debtPayments))
          ? Number(cash.debtPayments)
          : 0
        : 0,
      totalCashIn: cashInVal,
    },
  };
}
