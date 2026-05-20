/**
 * Maps GET /api/cash-closing → display state. API / computeCore only.
 */
import {
  parseMoney,
  parseMoneyOptional,
  pickMoney,
  profitIdentityDelta,
} from "./financialIntegrity";

export function mapCashClosingApiToState(data) {
  if (!data || typeof data !== "object") return null;

  const netProfit = parseMoneyOptional(data.netProfit);
  const grossProfit = parseMoneyOptional(data.grossProfit);
  const totalExpenses = parseMoneyOptional(
    pickMoney(data, ["totalExpenses", "expenses"])
  );
  const cashIn =
    parseMoneyOptional(
      pickMoney(data, ["cashIn", "totalCashIn", "totalPaid", "netCash", "netCashFlow"])
    ) ?? 0;
  const cashSales = parseMoneyOptional(data.cashSales);
  const debtPayments = parseMoneyOptional(data.debtPayments);

  const hasFinancialKpis =
    netProfit !== undefined ||
    grossProfit !== undefined ||
    totalExpenses !== undefined;

  const profitDelta =
    hasFinancialKpis && grossProfit !== undefined && totalExpenses !== undefined
      ? profitIdentityDelta(grossProfit, totalExpenses, netProfit ?? 0)
      : null;

  return {
    cashIn,
    cashSales,
    debtPayments,
    netProfit,
    grossProfit,
    totalExpenses,
    revenue: parseMoneyOptional(pickMoney(data, ["revenue", "totalSales"])),
    countSales: parseMoneyOptional(data.countSales),
    totalDebt: parseMoneyOptional(data.totalDebt),
    hasFinancialKpis,
    profitIdentityDelta: profitDelta,
  };
}
