/**
 * Final stability QA simulation (API-level, backend-authoritative).
 * Usage: node scripts/qa.final.js
 */
require("dotenv").config();

const BASE = process.env.QA_BASE_URL || "http://localhost:5000";

function rand(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function assertFinite(name, v, failures) {
  if (!Number.isFinite(Number(v))) {
    failures.push(`${name} is not finite: ${String(v)}`);
  }
}

async function main() {
  const failures = [];
  const notes = [];
  const created = {
    productIds: [],
    clientIds: [],
    saleIds: [],
    paymentIds: [],
    expenseIds: [],
  };

  const adminUsername = rand("qa-admin");
  const cashierUsername = rand("qa-cashier");
  const password = "qa12345";

  let adminToken = "";
  let cashierToken = "";

  async function req(method, path, { token = "", body, query = null, expect = "json" } = {}) {
    const url = new URL(path, BASE);
    if (query && typeof query === "object") {
      Object.keys(query).forEach((k) => {
        if (query[k] != null) url.searchParams.set(k, String(query[k]));
      });
    }
    const res = await fetch(url, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let errBody = null;
      try {
        errBody = await res.json();
      } catch {
        try {
          errBody = await res.text();
        } catch {
          errBody = null;
        }
      }
      const e = new Error(`HTTP ${res.status} ${method} ${path}`);
      e.status = res.status;
      e.body = errBody;
      throw e;
    }
    if (expect === "buffer") return { data: await res.arrayBuffer(), headers: res.headers };
    if (expect === "text") return { data: await res.text(), headers: res.headers };
    return { data: await res.json(), headers: res.headers };
  }

  try {
    // --- bootstrap users ---
    await req("POST", "/api/auth/register", { body: {
      username: adminUsername,
      password,
      role: "admin",
    }});
    await req("POST", "/api/auth/register", { body: {
      username: cashierUsername,
      password,
      role: "cashier",
    }});

    const adminLogin = await req("POST", "/api/auth/login", { body: {
      username: adminUsername,
      password,
    }});
    const cashierLogin = await req("POST", "/api/auth/login", { body: {
      username: cashierUsername,
      password,
    }});
    adminToken = adminLogin.data.token;
    cashierToken = cashierLogin.data.token;

    // 1) ADMIN FLOW
    const adminDash = await req("GET", "/api/dashboard", { token: adminToken });
    const s = adminDash.data && adminDash.data.stats ? adminDash.data.stats : {};
    ["sales", "totalSales", "profit", "totalExpenses", "totalDebt", "cashIn", "netProfit"].forEach((k) =>
      assertFinite(`admin dashboard stats.${k}`, s[k], failures)
    );
    const c = adminDash.data && adminDash.data.cash ? adminDash.data.cash : {};
    ["cashSales", "debtPayments", "totalCashIn"].forEach((k) =>
      assertFinite(`admin dashboard cash.${k}`, c[k], failures)
    );

    // 2) CASHIER FLOW (restricted access)
    const checkForbidden = async (path) => {
      try {
        await req("GET", path, { token: cashierToken });
        failures.push(`cashier should be forbidden for GET ${path}`);
      } catch (e) {
        const st = e.status;
        if (st !== 403) failures.push(`expected 403 for ${path}, got ${st || "no-status"}`);
      }
    };
    await checkForbidden("/api/reports");
    await checkForbidden("/api/cash-closing");
    await checkForbidden("/api/expenses");
    await checkForbidden("/api/expenses/summary");

    const cashierDash = await req("GET", "/api/dashboard", { token: cashierToken });
    const cd = cashierDash.data && cashierDash.data.stats ? cashierDash.data.stats : {};
    ["profit", "totalExpenses", "totalDebt", "cashIn", "netProfit"].forEach((k) => {
      if (num(cd[k]) !== 0) {
        failures.push(`cashier dashboard should sanitize stats.${k} to 0, got ${String(cd[k])}`);
      }
    });

    // 5) PRODUCT MODULE admin create/edit/delete
    const productA = await req("POST", "/api/products", { token: adminToken, body: {
      name: rand("qa-product-a"),
      barcode: rand("bc"),
      category: "QA",
      costPrice: 100,
      salePrice: 150,
      qty: 40,
      minimumStock: 5,
    }});
    const productAId = String(productA.data._id);
    created.productIds.push(productAId);

    const productAEdit = await req("PUT", `/api/products/${productAId}`, { token: adminToken, body: {
      name: `${productA.data.name}-edit`,
      salePrice: 170,
      qty: 42,
      minimumStock: 6,
    }});
    if (num(productAEdit.data.qty) !== 42) {
      failures.push("product edit did not apply qty");
    }

    const productB = await req("POST", "/api/products", { token: adminToken, body: {
      name: rand("qa-product-b"),
      barcode: rand("bc"),
      category: "QA",
      costPrice: 20,
      salePrice: 35,
      qty: 5,
      minimumStock: 1,
    }});
    const productBId = String(productB.data._id);
    created.productIds.push(productBId);

    // 6) CLIENT MODULE admin create/edit/delete
    const clientA = await req("POST", "/api/clients", { token: adminToken, body: {
      fullName: rand("qa-client-a"),
      phone: "0000",
      address: "qa street",
      notes: "qa",
    }});
    const clientAId = String(clientA.data._id);
    created.clientIds.push(clientAId);

    const clientAEdit = await req("PUT", `/api/clients/${clientAId}`, { token: adminToken, body: {
      fullName: `${clientA.data.name}-edit`,
      phone: "1111",
      address: "qa street 2",
      notes: "qa edited",
    }});
    if ((clientAEdit.data && clientAEdit.data.phone) !== "1111") {
      failures.push("client edit did not apply phone");
    }

    const clientB = await req("POST", "/api/clients", { token: adminToken, body: {
      fullName: rand("qa-client-b"),
      phone: "2222",
      address: "",
      notes: "",
    }});
    const clientBId = String(clientB.data._id);
    created.clientIds.push(clientBId);

    // 3) SALES FLOW (cashier): full, partial, credit
    const fullSale = await req("POST", "/api/sales", { token: cashierToken, body: {
      productId: productAId,
      clientId: clientAId,
      quantity: 1,
      paymentType: "cash",
      paidAmount: 170,
      negotiatedUnitPrice: 170,
    }});
    const fullSaleId = String(fullSale.data._id);
    created.saleIds.push(fullSaleId);

    const partialSale = await req("POST", "/api/sales", { token: cashierToken, body: {
      productId: productAId,
      clientId: clientAId,
      quantity: 2,
      paymentType: "partial",
      paidAmount: 100,
      negotiatedUnitPrice: 170,
    }});
    const partialSaleId = String(partialSale.data._id);
    created.saleIds.push(partialSaleId);

    const creditSale = await req("POST", "/api/sales", { token: cashierToken, body: {
      productId: productAId,
      clientId: clientAId,
      quantity: 1,
      paymentType: "credit",
      paidAmount: 0,
      negotiatedUnitPrice: 170,
    }});
    const creditSaleId = String(creditSale.data._id);
    created.saleIds.push(creditSaleId);

    [fullSale.data, partialSale.data, creditSale.data].forEach((sale, idx) => {
      const total = num(sale.total);
      const paid = num(sale.paidAmount);
      const debt = num(sale.debt);
      if (!Number.isFinite(total) || !Number.isFinite(paid) || !Number.isFinite(debt)) {
        failures.push(`sale[${idx}] has non-finite totals`);
      } else if (Math.abs(total - paid - debt) > 0.001) {
        failures.push(`sale[${idx}] identity failed: total != paid + debt`);
      }
    });

    // 4) DEBT FLOW: partial then full payment for credit sale
    const p1 = await req("POST", "/api/payments", { token: cashierToken, body: {
      clientId: clientAId,
      saleId: creditSaleId,
      amount: 60,
      method: "CASH",
    }});
    const p1PaymentId = String((p1.data.payments && p1.data.payments[0] && p1.data.payments[0]._id) || "");
    if (p1PaymentId) created.paymentIds.push(p1PaymentId);

    const creditAfterP1 = await req("GET", `/api/sales`, { token: adminToken, query: { from: "2020-01-01", to: "2030-01-01" } });
    const creditRowP1 = (creditAfterP1.data || []).find((x) => String(x._id) === creditSaleId);
    if (!creditRowP1) failures.push("credit sale not found after partial payment");
    if (creditRowP1 && num(creditRowP1.debt) < 0) failures.push("credit sale debt became negative after partial payment");

    const remaining = creditRowP1 ? Math.max(num(creditRowP1.debt), 0) : 0;
    if (remaining > 0) {
      const p2 = await req("POST", "/api/payments", { token: cashierToken, body: {
        clientId: clientAId,
        saleId: creditSaleId,
        amount: remaining,
        method: "CASH",
      }});
      const p2PaymentId = String((p2.data.payments && p2.data.payments[0] && p2.data.payments[0]._id) || "");
      if (p2PaymentId) created.paymentIds.push(p2PaymentId);
    }

    const debtLedger = await req("GET", `/api/clients/${clientAId}/debt`, { token: adminToken });
    const debtRows = Array.isArray(debtLedger.data && debtLedger.data.sales) ? debtLedger.data.sales : [];
    const debtBad = debtRows.some((row) => num(row.debtAmount) < -0.001);
    if (debtBad) failures.push("client debt ledger has negative debtAmount");
    assertFinite("client totalDebt", debtLedger.data && debtLedger.data.totalDebt, failures);

    // 7) INVOICE SYSTEM
    const invPdf = await req("GET", `/api/sales/${partialSaleId}/invoice`, { token: cashierToken, expect: "buffer" });
    const pdfType = String(invPdf.headers.get("content-type") || "");
    if (!pdfType.toLowerCase().includes("application/pdf")) {
      failures.push(`invoice PDF content-type unexpected: ${pdfType}`);
    }

    const invThermal = await req("GET", `/api/sales/${partialSaleId}/invoice?format=thermal`, { token: cashierToken, expect: "text" });
    const thermalType = String(invThermal.headers.get("content-type") || "");
    if (!thermalType.toLowerCase().includes("text/html")) {
      failures.push(`invoice thermal content-type unexpected: ${thermalType}`);
    }
    if (String(invThermal.data).includes("NaN")) {
      failures.push("invoice thermal output contains NaN");
    }

    // 8) EXPENSE MODULE admin only + dashboard impact finite
    const beforeExp = await req("GET", "/api/dashboard", { token: adminToken, query: { from: "2020-01-01", to: "2030-01-01" } });
    const beforeTotalExpenses = num(beforeExp.data && beforeExp.data.stats && beforeExp.data.stats.totalExpenses);

    const exp = await req("POST", "/api/expenses", { token: adminToken, body: {
      type: "daily",
      category: "qa",
      amount: 13,
      description: "qa expense",
      date: new Date().toISOString().slice(0, 10),
    }});
    const expId = String(exp.data.id || exp.data._id || "");
    if (!expId) {
      failures.push("expense create did not return id");
    } else {
      created.expenseIds.push(expId);
    }

    const afterExp = await req("GET", "/api/dashboard", { token: adminToken, query: { from: "2020-01-01", to: "2030-01-01" } });
    const afterTotalExpenses = num(afterExp.data && afterExp.data.stats && afterExp.data.stats.totalExpenses);
    assertFinite("dashboard totalExpenses after expense create", afterTotalExpenses, failures);
    if (Number.isFinite(beforeTotalExpenses) && Number.isFinite(afterTotalExpenses) && afterTotalExpenses < beforeTotalExpenses) {
      failures.push("totalExpenses decreased after creating expense");
    }

    if (expId) {
      await req("DELETE", `/api/expenses/${expId}`, { token: adminToken });
    }

    // 2b) cashier cannot manage products/clients without explicit perms
    try {
      await req("POST", "/api/products", { token: cashierToken, body: {
        name: "forbidden",
        salePrice: 1,
        costPrice: 1,
        qty: 1,
      }});
      failures.push("cashier should be forbidden creating products");
    } catch (e) {
      const st = e.status;
      if (st !== 403) failures.push(`expected 403 for cashier POST /api/products, got ${st || "no-status"}`);
    }

    try {
      await req("DELETE", `/api/clients/${clientBId}`, { token: cashierToken });
      failures.push("cashier should be forbidden deleting clients");
    } catch (e) {
      const st = e.status;
      if (st !== 403) failures.push(`expected 403 for cashier DELETE /api/clients/:id, got ${st || "no-status"}`);
    }

    // admin delete flows for standalone entities
    await req("DELETE", `/api/products/${productBId}`, { token: adminToken });
    await req("DELETE", `/api/clients/${clientBId}`, { token: adminToken });
    created.productIds = created.productIds.filter((id) => id !== productBId);
    created.clientIds = created.clientIds.filter((id) => id !== clientBId);

    notes.push("QA simulation completed");
  } catch (e) {
    failures.push(`fatal qa error: ${e.message}`);
  } finally {
    // best-effort cleanup for created transactional rows
    try {
      for (const id of created.saleIds) {
        try {
          await req("DELETE", `/api/sales/${id}`, { token: adminToken });
        } catch (_) {
          /* ignore */
        }
      }
      for (const id of created.productIds) {
        try {
          await req("DELETE", `/api/products/${id}`, { token: adminToken });
        } catch (_) {
          /* ignore */
        }
      }
      for (const id of created.clientIds) {
        try {
          await req("DELETE", `/api/clients/${id}`, { token: adminToken });
        } catch (_) {
          /* ignore */
        }
      }
    } catch (_) {
      /* ignore */
    }
  }

  if (failures.length) {
    console.error("QA FINAL FAILED");
    failures.forEach((f) => console.error(" -", f));
    process.exit(1);
  }
  console.log("QA FINAL PASSED");
  notes.forEach((n) => console.log(" *", n));
}

main().catch((e) => {
  console.error("QA FINAL FAILED:", e.message);
  process.exit(1);
});

