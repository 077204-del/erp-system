/**
 * Maps GET /api/dashboard → UI state. Display only — computeCore via API.
 */
import { parseMoneyOptional, pickMoney } from "./financialIntegrity";

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
  const salesCount = parseMoneyOptional(
    pickMoney(stats, ["salesCount", "sales"])
  );
  const totalSales = parseMoneyOptional(stats.totalSales);
  const debt = parseMoneyOptional(data?.debt);

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

  if (role === "cashier") {
    const cashInVal = parseMoneyOptional(
      pickMoney(cash, ["totalCashIn", "cashIn"])
    );
    if (cashInVal !== undefined) {
      dashboard.cashIn = cashInVal;
    }
    const cashOut = {};
    if (cashInVal !== undefined) cashOut.totalCashIn = cashInVal;
    const cashSalesVal = parseMoneyOptional(cash?.cashSales);
    const debtPaymentsVal = parseMoneyOptional(cash?.debtPayments);
    if (cashSalesVal !== undefined) cashOut.cashSales = cashSalesVal;
    if (debtPaymentsVal !== undefined) cashOut.debtPayments = debtPaymentsVal;
    return {
      meta,
      dashboard,
      cash: Object.keys(cashOut).length > 0 ? cashOut : undefined,
    };
  }

  if (!isPrivilegedRole(role)) {
    return { meta, dashboard };
  }

  if (fin && typeof fin === "object") {
    const revenue = parseMoneyOptional(fin.revenue);
    const grossProfit = parseMoneyOptional(fin.grossProfit);
    const netProfit = parseMoneyOptional(fin.netProfit);
    const expenses = parseMoneyOptional(fin.expenses);
    if (revenue !== undefined) dashboard.totalSales = revenue;
    if (grossProfit !== undefined) dashboard.grossProfit = grossProfit;
    if (netProfit !== undefined) dashboard.netProfit = netProfit;
    if (expenses !== undefined) dashboard.totalExpenses = expenses;
  }

  const cashIn = parseMoneyOptional(pickMoney(cash, ["totalCashIn", "cashIn"]));
  if (cashIn !== undefined) {
    dashboard.cashIn = cashIn;
  }

  const inventoryCapital = parseMoneyOptional(data?.inventoryCapital);
  if (role === "admin" && inventoryCapital !== undefined) {
    dashboard.inventoryCapital = inventoryCapital;
  }

  const cashOut = {};
  const cashInVal = parseMoneyOptional(pickMoney(cash, ["totalCashIn", "cashIn"]));
  const cashSalesVal = parseMoneyOptional(cash?.cashSales);
  const debtPaymentsVal = parseMoneyOptional(cash?.debtPayments);
  if (cashInVal !== undefined) cashOut.totalCashIn = cashInVal;
  if (cashSalesVal !== undefined) cashOut.cashSales = cashSalesVal;
  if (debtPaymentsVal !== undefined) cashOut.debtPayments = debtPaymentsVal;

  let breakdown;
  if (role === "admin") {
    breakdown = Array.isArray(data?.cashierWeeklyBreakdown)
      ? data.cashierWeeklyBreakdown
      : [];
  } else {
    breakdown = undefined;
  }

  const out = {
    meta,
    dashboard,
    cash: Object.keys(cashOut).length > 0 ? cashOut : undefined,
  };
  if (role === "admin") {
    out.cashierWeeklyBreakdown = breakdown;
  }
  return out;
}
