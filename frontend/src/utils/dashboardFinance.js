/**

 * Maps GET /api/dashboard → UI state. Display only — no financial math.

 */

export function mapDashboardApiToState(data) {

  const stats = data?.stats || {};

  const fin = data?.financial;

  const cash = data?.cash || {};

  const access = data?.access || {};

  const financial = access.financialKpis === true;



  const salesCount = Number(stats.sales) || 0;

  const totalSales = Number(stats.totalSales) || 0;



  if (!financial) {

    return {

      access,

      dashboard: {

        sales: salesCount,

        salesCount,

        totalSales,

      },

    };

  }



  const netProfit = Number(fin?.netProfit ?? stats.netProfit);

  const expenses = Number(fin?.expenses ?? stats.expenses ?? stats.totalExpenses);



  return {

    access,

    dashboard: {

      sales: salesCount,

      salesCount,

      totalSales: Number(fin?.revenue ?? stats.totalSales ?? stats.revenue) || 0,

      grossProfit: Number(fin?.grossProfit ?? stats.grossProfit) || 0,

      realProfit: Number.isFinite(netProfit) ? netProfit : 0,

      totalExpenses: Number.isFinite(expenses) ? expenses : 0,

      debt: Number(stats.totalDebt) || Number(data.debt) || 0,

      netCashFlow: Number(cash.totalCashIn ?? stats.cashIn ?? stats.netCashFlow) || 0,

      inventoryCapital:

        access.inventoryCapital === true &&

        Number.isFinite(Number(stats.inventoryCapital))

          ? Number(stats.inventoryCapital)

          : null,

    },

    cash: {

      cashSales: Number(cash.cashSales) || 0,

      debtPayments: Number(cash.debtPayments) || 0,

      totalCashIn: Number(cash.totalCashIn) || 0,

    },

  };

}


