import { safeNum } from "./erpFormat";

/**
 * Frontend financial semantics (aligned with API / ledger layer):
 * - Profit (Σ Sale.profit): margin fixed when each sale is created — never reduced by expenses.
 * - Cash in: Σ payments in range (real money received).
 * - Expenses: cash out — reduce net cash flow only.
 * - Net cash flow: cash in − expenses. UI state field is netCashFlow only; the API still
 *   returns this value as stats.netProfit — map here, never label as accrual profit.
 */
export function netCashFlowFromParts(cashIn, totalExpenses) {
  return safeNum(cashIn, 0) - safeNum(totalExpenses, 0);
}

/**
 * Single mapper from GET /api/dashboard payload → React workspace state.
 * Keeps profit / debt / expenses / net cash flow in separate buckets (no UI-side mixing).
 */
export function mapDashboardApiToState(data) {
  const stats = data?.stats || {};
  const cash = data?.cash || {};

  const salesCount = Number.isFinite(Number(stats.sales))
    ? Number(stats.sales)
    : 0;

  const debtVal = Number.isFinite(Number(stats.totalDebt))
    ? Number(stats.totalDebt)
    : Number.isFinite(Number(stats.debt))
      ? Number(stats.debt)
      : Number.isFinite(Number(data?.debt))
        ? Number(data.debt)
        : 0;

  const cashInVal = Number.isFinite(Number(stats.cashIn))
    ? Number(stats.cashIn)
    : Number.isFinite(Number(cash.totalCashIn))
      ? Number(cash.totalCashIn)
      : 0;

  const netCashFlow = Number.isFinite(Number(stats.netProfit))
    ? Number(stats.netProfit)
    : 0;

  const invCap =
    data?.access?.inventoryCapital === true &&
    Number.isFinite(Number(stats.inventoryCapital))
      ? Number(stats.inventoryCapital)
      : null;

  return {
    dashboard: {
      sales: salesCount,
      salesCount,
      totalSales: Number.isFinite(Number(stats.totalSales))
        ? Number(stats.totalSales)
        : 0,
      profit: Number.isFinite(Number(stats.profit)) ? Number(stats.profit) : 0,
      debt: debtVal,
      totalExpenses: Number.isFinite(Number(stats.totalExpenses))
        ? Number(stats.totalExpenses)
        : 0,
      netCashFlow,
      inventoryCapital: invCap,
    },
    cash: {
      cashSales: Number.isFinite(Number(cash.cashSales))
        ? Number(cash.cashSales)
        : 0,
      debtPayments: Number.isFinite(Number(cash.debtPayments))
        ? Number(cash.debtPayments)
        : 0,
      totalCashIn: cashInVal,
    },
  };
}
