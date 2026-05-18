const mongoose = require("mongoose");
const { getSalesList } = require("../services/finance/ledger.service");
const financialEngine = require("../services/financialEngine.service");
const { roleFromReq } = require("../services/responseSanitize.service");
const { normalizeRole } = require("../services/rbac.service");
const User = require("../models/user.model");

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
    const { from, to, cashierId } = req.query;
    const today = new Date().toISOString().slice(0, 10);
    let f = safeString(from, "") || today;
    let t = safeString(to, "") || f;

    const role = normalizeRole(req.user && req.user.role ? req.user.role : "");
    const canFilterByCashier = role === "admin";
    const rawCid = cashierId != null ? String(cashierId).trim() : "";
    let listOpts = {};
    if (role === "cashier" && req.user && req.user.id) {
      listOpts = { cashierId: String(req.user.id) };
    } else if (
      canFilterByCashier &&
      rawCid &&
      mongoose.Types.ObjectId.isValid(rawCid)
    ) {
      listOpts = { cashierId: rawCid };
    }

    const sales = await getSalesList(f, t, listOpts);

    const products = new Map();
    const clients = new Map();

    for (const s of sales) {
      const p = s.productId;
      const c = s.clientId;
      const pid = p && p._id != null ? String(p._id) : "unknown";
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

    const reportCashierId =
      listOpts && listOpts.cashierId ? String(listOpts.cashierId) : "";

    const body = await financialEngine.buildReports(f, t, roleFromReq(req), {
      topProducts,
      topClients,
      cashVsCredit: cashVsCreditFromSalesList(sales),
      cashierId: reportCashierId || undefined,
    });

    let cashiers = [];
    if (role === "admin") {
      const rows = await User.find({ role: "cashier" })
        .select("username")
        .sort({ username: 1 })
        .lean();
      cashiers = rows.map((u) => ({
        id: String(u._id),
        username: safeString(u.username, ""),
      }));
    }

    return res.json({ ...body, cashiers });
  } catch (err) {
    return res.status(500).json({
      message: safeString(err && err.message, "Server error"),
      range: { from: "", to: "" },
      revenue: 0,
      cost: 0,
      expenses: 0,
      grossProfit: 0,
      netProfit: 0,
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
      netCashFlow: 0,
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
