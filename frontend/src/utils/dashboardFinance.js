/**
 * Maps GET /api/dashboard → UI state. Display only — no calculations or fallbacks.
 * Contract: meta.role drives visibility; financial.netProfit is the sole profit field.
 */
function finiteNumber(value) {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function isPrivilegedRole(role) {
  return role === "admin" || role === "manager";
}

export function mapDashboardApiToState(data) {
  const meta = data?.meta || {};
  const role = meta.role;
  const stats = data?.stats || {};
  const fin = data?.financial;
  const cash = data?.cash;

  const dashboard = {};
  const salesCount =
    finiteNumber(stats.salesCount) ?? finiteNumber(stats.sales);
  const totalSales = finiteNumber(stats.totalSales);
  const debt = finiteNumber(data?.debt);

  if (salesCount !== undefined) {
    dashboard.salesCount = salesCount;
    dashboard.sales = salesCount;
  }
  if (totalSales !== undefined) {
    dashboard.totalSales = totalSales;
  }
  if (debt !== undefined) {
    dashboard.debt = debt;
  }

  if (!isPrivilegedRole(role)) {
    return { meta, dashboard };
  }

  if (fin && typeof fin === "object") {
    const revenue = finiteNumber(fin.revenue);
    const grossProfit = finiteNumber(fin.grossProfit);
    const netProfit = finiteNumber(fin.netProfit);
    const expenses = finiteNumber(fin.expenses);
    if (revenue !== undefined) dashboard.totalSales = revenue;
    if (grossProfit !== undefined) dashboard.grossProfit = grossProfit;
    if (netProfit !== undefined) dashboard.netProfit = netProfit;
    if (expenses !== undefined) dashboard.totalExpenses = expenses;
  }

  const cashIn = finiteNumber(cash?.totalCashIn);
  if (cashIn !== undefined) {
    dashboard.netCashFlow = cashIn;
  }

  const inventoryCapital = finiteNumber(data?.inventoryCapital);
  if (role === "admin" && inventoryCapital !== undefined) {
    dashboard.inventoryCapital = inventoryCapital;
  }

  const cashOut = {};
  const cashInVal = finiteNumber(cash?.totalCashIn);
  const cashSalesVal = finiteNumber(cash?.cashSales);
  const debtPaymentsVal = finiteNumber(cash?.debtPayments);
  if (cashInVal !== undefined) cashOut.totalCashIn = cashInVal;
  if (cashSalesVal !== undefined) cashOut.cashSales = cashSalesVal;
  if (debtPaymentsVal !== undefined) cashOut.debtPayments = debtPaymentsVal;

  return {
    meta,
    dashboard,
    cash: Object.keys(cashOut).length > 0 ? cashOut : undefined,
  };
}
