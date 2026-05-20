import { parseMoney, parseMoneyOptional, pickMoney } from "./financialIntegrity";

/**
 * Maps GET /api/reports → display KPIs (computeCore via API only).
 */
export function mapReportsApiToState(data) {
  if (!data || typeof data !== "object") return null;

  const cash = data.cash && typeof data.cash === "object" ? data.cash : {};
  const cashIn =
    parseMoneyOptional(
      pickMoney(cash, ["totalCashIn", "cashIn"]) ??
        pickMoney(data, ["cashIn", "netCashFlow"])
    ) ?? 0;

  const cvc =
    data.cashVsCredit && typeof data.cashVsCredit === "object"
      ? data.cashVsCredit
      : null;

  return {
    revenue: parseMoney(data.revenue),
    netProfit: parseMoney(data.netProfit),
    grossProfit: parseMoney(data.grossProfit),
    cashIn,
    cashSales: parseMoney(cash.cashSales ?? cvc?.cashSales),
    debtPayments: parseMoney(cash.debtPayments),
    expensesBreakdown:
      data.expensesBreakdown && typeof data.expensesBreakdown === "object"
        ? {
            daily: parseMoney(data.expensesBreakdown.daily),
            monthly: parseMoney(data.expensesBreakdown.monthly),
          }
        : { daily: 0, monthly: 0 },
    cashVsCredit: cvc
      ? {
          cashSales: parseMoney(cvc.cashSales),
          creditSales: parseMoney(cvc.creditSales),
          mixed: parseMoney(cvc.mixed),
          ratioCash: parseMoney(cvc.ratioCash),
          ratioCredit: parseMoney(cvc.ratioCredit),
        }
      : null,
    topProducts: Array.isArray(data.topProducts) ? data.topProducts : [],
    topClients: Array.isArray(data.topClients) ? data.topClients : [],
    salesCount: parseMoney(data.salesCount),
    hasFinancialKpis:
      data.netProfit != null ||
      data.grossProfit != null ||
      cashIn > 0 ||
      data.cashIn != null,
  };
}
