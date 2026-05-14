const {
  getDashboardStats,
  getSalesList,
  getTotalOutstandingDebtFromLedger,
} = require("../services/finance/ledger.service");
const { sumExpenseSplitForRange } = require("../services/expenseQuery.service");

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function safeString(v, fallback = "") {
  if (v == null) return fallback;
  return String(v);
}

function cashVsCreditFromSalesList(sales) {
  let cash = 0;
  let credit = 0;
  let mixed = 0;
  if (!Array.isArray(sales)) {
    return {
      cashSales: 0,
      creditSales: 0,
      mixed: 0,
      ratioCash: 0,
      ratioCredit: 0,
    };
  }
  for (const s of sales) {
    const m = String(s.paymentMethod || "").toUpperCase();
    const debt = toNumber(s.debt);
    const paid = toNumber(s.paidAmount);
    if (m === "DEBT" || debt > 0) {
      credit += 1;
    } else if (m === "CASH" || m === "CARD" || paid > 0) {
      cash += 1;
    } else {
      mixed += 1;
    }
  }
  const total = cash + credit + mixed;
  return {
    cashSales: cash,
    creditSales: credit,
    mixed,
    ratioCash: total > 0 ? cash / total : 0,
    ratioCredit: total > 0 ? credit / total : 0,
  };
}

exports.getReports = async (req, res) => {
  try {
    const { from, to } = req.query;
    const today = new Date().toISOString().slice(0, 10);
    let f = safeString(from, "") || today;
    let t = safeString(to, "") || f;

    const role = String(req.user && req.user.role ? req.user.role : "").toLowerCase();
    if (role === "cashier" && (f !== today || t !== today)) {
      return res.status(403).json({
        message:
          "Cashiers may only run reports for the current business day.",
        allowedRange: { from: today, to: today },
      });
    }

    const dash = await getDashboardStats(f, t);
    const sales = await getSalesList(f, t);

    const products = new Map();
    const clients = new Map();

    for (const s of sales) {
      const p = s.productId;
      const c = s.clientId;
      const pid =
        p && p._id != null ? String(p._id) : "unknown";
      const pname = p && p.name != null ? safeString(p.name, "—") : "—";

      const curP = products.get(pid) || {
        productId: pid,
        name: pname,
        qty: 0,
        revenue: 0,
      };
      curP.qty += toNumber(s.quantity);
      curP.revenue += toNumber(s.total);
      if (pname && pname !== "—") curP.name = pname;
      products.set(pid, curP);

      if (c && c._id != null) {
        const cid = String(c._id);
        const cname = c.name != null ? safeString(c.name, "—") : "—";
        const curC = clients.get(cid) || {
          clientId: cid,
          name: cname,
          orders: 0,
          revenue: 0,
        };
        curC.orders += 1;
        curC.revenue += toNumber(s.total);
        if (cname && cname !== "—") curC.name = cname;
        clients.set(cid, curC);
      }
    }

    const topProducts = Array.from(products.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((x) => ({
        productId: x.productId,
        name: x.name,
        qty: toNumber(x.qty),
        revenue: toNumber(x.revenue),
      }));

    const topClients = Array.from(clients.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((x) => ({
        clientId: x.clientId,
        name: x.name,
        orders: toNumber(x.orders),
        revenue: toNumber(x.revenue),
      }));

    const stats = dash.stats || {};
    const cash = dash.cash || {};
    const totalCashIn = toNumber(cash.totalCashIn);
    const expenseSplit = await sumExpenseSplitForRange(f, t);
    const totalExpenses = toNumber(expenseSplit.total);
    const netProfit = toNumber(totalCashIn - totalExpenses);
    const totalDebtGlobal = toNumber(await getTotalOutstandingDebtFromLedger());

    return res.json({
      range: dash.range || { from: f, to: t },
      revenue: toNumber(stats.revenue),
      profit: toNumber(stats.profit),
      salesCount: toNumber(stats.sales),
      cash: {
        cashSales: toNumber(cash.cashSales),
        debtPayments: toNumber(cash.debtPayments),
        totalCashIn,
      },
      debt: totalDebtGlobal,
      topProducts,
      topClients,
      expensesBreakdown: {
        daily: toNumber(expenseSplit.daily),
        monthly: toNumber(expenseSplit.monthly),
      },
      netProfit: Number.isFinite(netProfit) ? netProfit : 0,
      cashVsCredit: cashVsCreditFromSalesList(sales),
    });
  } catch (err) {
    return res.status(500).json({
      message: safeString(err && err.message, "Server error"),
      range: { from: "", to: "" },
      revenue: 0,
      profit: 0,
      salesCount: 0,
      cash: {
        cashSales: 0,
        debtPayments: 0,
        totalCashIn: 0,
      },
      debt: 0,
      topProducts: [],
      topClients: [],
      expensesBreakdown: { daily: 0, monthly: 0 },
      netProfit: 0,
      cashVsCredit: {
        cashSales: 0,
        creditSales: 0,
        mixed: 0,
        ratioCash: 0,
        ratioCredit: 0,
      },
    });
  }
};
