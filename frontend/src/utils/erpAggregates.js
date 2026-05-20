import { safeNum, safeText } from "./erpFormat";

export function normalizeId(ref) {
  if (ref == null) return "";
  if (typeof ref === "object" && ref._id != null) return String(ref._id);
  return String(ref);
}

export function buildClientDebtRows(clients, sales, payments) {
  if (!Array.isArray(clients)) return [];
  const salesArr = Array.isArray(sales) ? sales : [];
  const payArr = Array.isArray(payments) ? payments : [];

  return clients.map((c) => {
    const id = normalizeId(c._id);
    const clientSales = salesArr.filter((s) => {
      const cid = normalizeId(s.clientId);
      return cid && cid === id;
    });
    const clientPays = payArr.filter((p) => {
      const cid = normalizeId(p.clientId);
      return cid && cid === id;
    });

    const totalSalesAmt = clientSales.reduce(
      (a, s) => a + safeNum(s.total, 0),
      0
    );
    const totalPaid = clientPays.reduce(
      (a, p) => a + safeNum(p.amount, 0),
      0
    );
    const debt = Math.max(
      0,
      safeNum(totalSalesAmt - totalPaid, 0)
    );

    const dates = [
      ...clientSales.map((s) => s.saleDate || s.createdAt),
      ...clientPays.map((p) => p.createdAt),
    ].filter(Boolean);
    let lastTs = null;
    dates.forEach((d) => {
      const t = new Date(d).getTime();
      if (!Number.isNaN(t) && (lastTs == null || t > lastTs)) lastTs = t;
    });

    return {
      _id: id,
      client: c,
      name: c.name,
      phone: c.phone,
      totalSalesAmt,
      totalPaid,
      debt,
      lastTransactionAt: lastTs != null ? new Date(lastTs) : null,
    };
  });
}

export function groupSalesByDay(sales) {
  const map = new Map();
  if (!Array.isArray(sales)) return [];
  sales.forEach((s) => {
    const d = s.saleDate || s.createdAt;
    if (!d) return;
    const day = new Date(d);
    if (Number.isNaN(day.getTime())) return;
    const key = day.toISOString().slice(0, 10);
    const cur = map.get(key) || { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += safeNum(s.total, 0);
    map.set(key, cur);
  });
  return Array.from(map.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** YYYY-MM buckets from loaded sales (client-side reports). */
export function groupSalesByMonth(sales) {
  const map = new Map();
  if (!Array.isArray(sales)) return [];
  sales.forEach((s) => {
    const d = s.saleDate || s.createdAt;
    if (!d) return;
    const day = new Date(d);
    if (Number.isNaN(day.getTime())) return;
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}`;
    const cur = map.get(key) || { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += safeNum(s.total, 0);
    map.set(key, cur);
  });
  return Array.from(map.entries())
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

export function cashVsCreditFromSales(sales) {
  if (!Array.isArray(sales)) {
    return { cash: 0, credit: 0, mixed: 0 };
  }
  let cash = 0;
  let credit = 0;
  let mixed = 0;
  sales.forEach((s) => {
    const m = String(s.paymentMethod || "").toUpperCase();
    const debt = safeNum(s.debt, 0);
    const paid = safeNum(s.paidAmount, 0);
    if (m === "DEBT" || debt > 0) {
      credit += 1;
    } else if (m === "CASH" || m === "CARD" || paid > 0) {
      cash += 1;
    } else {
      mixed += 1;
    }
  });
  return { cash, credit, mixed };
}

export function topProductsFromSales(sales, limit = 8) {
  if (!Array.isArray(sales)) return [];
  const map = new Map();
  sales.forEach((s) => {
    const pid = normalizeId(s.productId);
    const name =
      s.productId && typeof s.productId === "object" && s.productId.name
        ? String(s.productId.name)
        : pid || "—";
    const key = pid || name;
    const cur = map.get(key) || { name, qty: 0, revenue: 0 };
    cur.qty += safeNum(s.quantity, 0);
    cur.revenue += safeNum(s.total, 0);
    if (name && name !== "—") cur.name = name;
    map.set(key, cur);
  });
  return Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export function topClientsFromSales(sales, limit = 8) {
  if (!Array.isArray(sales)) return [];
  const map = new Map();
  sales.forEach((s) => {
    const cid = normalizeId(s.clientId);
    const name =
      s.clientId && typeof s.clientId === "object" && s.clientId.name
        ? String(s.clientId.name)
        : cid || "—";
    const key = cid || name;
    const cur = map.get(key) || { name, orders: 0, revenue: 0 };
    cur.orders += 1;
    cur.revenue += safeNum(s.total, 0);
    if (name && name !== "—") cur.name = name;
    map.set(key, cur);
  });
  return Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export function buildRegisterEvents(sales, payments) {
  const out = [];
  if (Array.isArray(sales)) {
    sales.forEach((s) => {
      const at = new Date(s.saleDate || s.createdAt || 0);
      if (Number.isNaN(at.getTime())) return;
      out.push({
        kind: "sale",
        at,
        id: normalizeId(s._id),
        label:
          s.productId && s.productId.name
            ? `Sale · ${s.productId.name}`
            : "Sale",
        detail: safeNum(s.quantity, 0) + " × " + safeNum(s.unitPrice, 0),
        amount: safeNum(s.total, 0),
        debt: safeNum(s.debt, 0),
        method: s.paymentMethod,
      });
    });
  }
  if (Array.isArray(payments)) {
    payments.forEach((p) => {
      const at = new Date(p.recordedAt || p.createdAt || 0);
      if (Number.isNaN(at.getTime())) return;
      const clientName =
        p.clientId && typeof p.clientId === "object" && p.clientId.name
          ? p.clientId.name
          : "";
      out.push({
        kind: "payment",
        at,
        id: normalizeId(p._id),
        label: "Payment" + (clientName ? ` · ${clientName}` : ""),
        detail: String(p.type || "") + " · " + String(p.method || ""),
        amount: safeNum(p.amount, 0),
        debt: 0,
        method: p.method,
      });
    });
  }
  out.sort((a, b) => b.at - a.at);
  return out;
}

export function expenseRowsToRegisterEvents(expenseList) {
  if (!Array.isArray(expenseList)) return [];
  const out = [];
  expenseList.forEach((e) => {
    if (!e || e.date == null) return;
    const at = new Date(e.date);
    if (Number.isNaN(at.getTime())) return;
    out.push({
      kind: "expense",
      at,
      id: String(e.id || ""),
      label: `Expense · ${safeText(e.type, "")} · ${safeText(e.category, "general")}`,
      detail: safeText(e.description, ""),
      amount: safeNum(e.amount, 0),
      debt: 0,
      expenseType: e.type,
    });
  });
  return out;
}
