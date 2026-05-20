import { parseMoney, parseMoneyOptional, pickMoney } from "./financialIntegrity";



/**

 * Maps GET /api/reports/daily-register → display state (computeCore via API only).

 */

export function mapDailyRegisterApiToState(data) {

  if (!data || typeof data !== "object") return null;



  const cashBlock =

    data.cash && typeof data.cash === "object" ? data.cash : {};

  const cashSrc = { ...data, ...cashBlock };



  const cashIn = parseMoneyOptional(

    pickMoney(cashSrc, [

      "cashIn",

      "totalCashIn",

      "paymentsTotal",

      "netCash",

      "netCashFlow",

    ])

  );

  const cashSales = parseMoneyOptional(pickMoney(cashSrc, ["cashSales"]));

  const debtPayments = parseMoneyOptional(pickMoney(cashSrc, ["debtPayments"]));

  const netCash = parseMoneyOptional(

    pickMoney(cashSrc, ["netCash", "netCashFlow", "cashIn", "totalCashIn"])

  );

  const paymentsTotal = parseMoneyOptional(

    pickMoney(cashSrc, ["paymentsTotal", "cashIn", "totalCashIn"])

  );



  return {

    salesTotal: parseMoney(data.salesTotal),

    salesCount: parseMoney(data.salesCount),

    cashIn: cashIn ?? 0,

    totalCashIn: parseMoneyOptional(pickMoney(cashSrc, ["totalCashIn", "cashIn"])) ?? cashIn ?? 0,

    netCash: netCash ?? cashIn ?? 0,

    netCashFlow: parseMoneyOptional(pickMoney(cashSrc, ["netCashFlow"])) ?? netCash ?? cashIn ?? 0,

    paymentsTotal: paymentsTotal ?? cashIn ?? 0,

    cashSales: cashSales ?? 0,

    debtPayments: debtPayments ?? 0,

    expensesTotal: parseMoney(

      pickMoney(data, ["expensesTotal", "expenses"])

    ),

    grossProfit: parseMoney(data.grossProfit),

    netProfit: parseMoney(data.netProfit),

    hasCashKpis:

      cashSrc.cashIn != null ||

      cashSrc.totalCashIn != null ||

      cashSrc.paymentsTotal != null ||

      cashSrc.netCash != null ||

      cashSrc.netCashFlow != null,

    hasFinancialKpis:

      data.grossProfit != null ||

      data.netProfit != null ||

      data.expensesTotal != null ||

      data.expenses != null,

  };

}

