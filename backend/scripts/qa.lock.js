/**
 * Final production lock test (destructive QA phase).
 * Usage: node scripts/qa.lock.js
 */
require("dotenv").config();

const BASE = process.env.QA_BASE_URL || "http://localhost:5000";

function id(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : NaN;
}

async function req(method, path, { token = "", body, query, expect = "json" } = {}) {
  const url = new URL(path, BASE);
  if (query && typeof query === "object") {
    for (const [k, v] of Object.entries(query)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
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
    let out = null;
    try {
      out = await res.json();
    } catch {
      try {
        out = await res.text();
      } catch {
        out = null;
      }
    }
    const e = new Error(`HTTP ${res.status} ${method} ${path}`);
    e.status = res.status;
    e.body = out;
    throw e;
  }
  if (expect === "text") return { data: await res.text(), headers: res.headers };
  if (expect === "buffer") return { data: await res.arrayBuffer(), headers: res.headers };
  return { data: await res.json(), headers: res.headers };
}

function must(cond, msg, failures) {
  if (!cond) failures.push(msg);
}

async function main() {
  const failures = [];
  const cleanup = {
    saleIds: [],
    productIds: [],
    clientIds: [],
    expenseIds: [],
  };

  const adminUser = id("lock-admin");
  const cashierUser = id("lock-cashier");
  const pass = "Lock12345";
  let adminToken = "";
  let cashierToken = "";

  try {
    // bootstrap users
    await req("POST", "/api/auth/register", {
      body: { username: adminUser, password: pass, role: "admin" },
    });
    await req("POST", "/api/auth/register", {
      body: { username: cashierUser, password: pass, role: "cashier" },
    });
    const a = await req("POST", "/api/auth/login", {
      body: { username: adminUser, password: pass },
    });
    const c = await req("POST", "/api/auth/login", {
      body: { username: cashierUser, password: pass },
    });
    adminToken = a.data.token;
    cashierToken = c.data.token;

    // ===== RBAC SECURITY TEST (cashier bypass attempts)
    const forbiddenGet = ["/api/reports", "/api/expenses", "/api/expenses/summary", "/api/cash-closing", "/api/users"];
    for (const path of forbiddenGet) {
      try {
        await req("GET", path, { token: cashierToken });
        failures.push(`RBAC leak: cashier accessed ${path}`);
      } catch (e) {
        must(e.status === 403, `RBAC expected 403 for ${path}, got ${e.status}`, failures);
      }
    }

    // cashier should still create sale/payment
    const p = await req("POST", "/api/products", {
      token: adminToken,
      body: {
        name: id("lock-product"),
        barcode: id("bc"),
        category: "LOCK",
        costPrice: 50,
        salePrice: 100,
        qty: 300,
        minimumStock: 2,
      },
    });
    const productId = String(p.data._id);
    cleanup.productIds.push(productId);

    const cl = await req("POST", "/api/clients", {
      token: adminToken,
      body: {
        fullName: id("lock-client"),
        phone: "555",
        address: "",
        notes: "",
      },
    });
    const clientId = String(cl.data._id);
    cleanup.clientIds.push(clientId);

    // ===== SALES STRESS TEST
    // rapid mixed sales
    const saleBodies = [];
    for (let i = 0; i < 18; i += 1) {
      const mod = i % 3;
      if (mod === 0) {
        saleBodies.push({
          productId,
          clientId,
          quantity: 1,
          paymentType: "cash",
          paidAmount: 100,
          negotiatedUnitPrice: 100,
        });
      } else if (mod === 1) {
        saleBodies.push({
          productId,
          clientId,
          quantity: 1,
          paymentType: "partial",
          paidAmount: 40,
          negotiatedUnitPrice: 100,
        });
      } else {
        saleBodies.push({
          productId,
          clientId,
          quantity: 1,
          paymentType: "credit",
          paidAmount: 0,
          negotiatedUnitPrice: 100,
        });
      }
    }
    const createdSales = await Promise.all(
      saleBodies.map((body) => req("POST", "/api/sales", { token: cashierToken, body }))
    );
    createdSales.forEach((x) => cleanup.saleIds.push(String(x.data._id)));

    // pick one credit sale and test split/delayed/concurrent payments + overpay attempt
    const salesList = await req("GET", "/api/sales", {
      token: adminToken,
      query: { from: "2020-01-01", to: "2030-01-01" },
    });
    const credit = (salesList.data || []).find((s) => String(s.clientId?._id || s.clientId) === clientId && n(s.debt) > 0);
    must(!!credit, "No credit sale found for payment stress", failures);
    if (credit) {
      const creditId = String(credit._id);
      // split payment
      await req("POST", "/api/payments", {
        token: cashierToken,
        body: { clientId, saleId: creditId, amount: 20, method: "CASH" },
      });
      // delayed payment (explicit date)
      await req("POST", "/api/payments", {
        token: cashierToken,
        body: { clientId, saleId: creditId, amount: 15, method: "CASH", date: new Date().toISOString() },
      });

      // concurrent payments on same sale
      await Promise.all([
        req("POST", "/api/payments", {
          token: cashierToken,
          body: { clientId, saleId: creditId, amount: 10, method: "CASH" },
        }),
        req("POST", "/api/payments", {
          token: cashierToken,
          body: { clientId, saleId: creditId, amount: 12, method: "CASH" },
        }),
      ]);

      // overpayment attempt should fail or not produce negative debt
      try {
        await req("POST", "/api/payments", {
          token: cashierToken,
          body: { clientId, saleId: creditId, amount: 999999, method: "CASH" },
        });
      } catch (e) {
        // acceptable: rejected
      }

      const after = await req("GET", "/api/sales", {
        token: adminToken,
        query: { from: "2020-01-01", to: "2030-01-01" },
      });
      const row = (after.data || []).find((s) => String(s._id) === creditId);
      must(!!row, "Credit sale missing after payment stress", failures);
      if (row) {
        must(n(row.debt) >= -0.001, `Negative debt after payment stress: ${row.debt}`, failures);
      }
    }

    // ===== ACCOUNTING RECONCILIATION
    const allSales = await req("GET", "/api/sales", {
      token: adminToken,
      query: { from: "2020-01-01", to: "2030-01-01" },
    });
    const allPayments = await req("GET", "/api/payments", { token: adminToken });
    const dash = await req("GET", "/api/dashboard", {
      token: adminToken,
      query: { from: "2020-01-01", to: "2030-01-01" },
    });
    const dash2BeforeMutations = await req("GET", "/api/dashboard", {
      token: adminToken,
      query: { from: "2020-01-01", to: "2030-01-01" },
    });

    const sumSales = (allSales.data || []).reduce((a0, s) => a0 + (n(s.total) || 0), 0);
    const sumPayments = (allPayments.data || []).reduce((a0, p0) => a0 + (n(p0.amount) || 0), 0);
    const debtFromSales = (allSales.data || []).reduce((a0, s) => a0 + Math.max(0, n(s.debt) || 0), 0);

    // strict checks for finite/no NaN
    [sumSales, sumPayments, debtFromSales, n(dash.data?.stats?.totalSales), n(dash.data?.stats?.totalDebt)].forEach((x, i) =>
      must(Number.isFinite(x), `Reconciliation contains non-finite value idx=${i}`, failures)
    );

    // dashboard totalSales should match sales list sum in same range
    must(
      Math.abs((n(dash.data?.stats?.totalSales) || 0) - sumSales) < 0.01,
      `Mismatch totalSales dashboard=${dash.data?.stats?.totalSales} listSum=${sumSales}`,
      failures
    );

    // dashboard debt must match debt from sales ledger aggregation
    must(
      Math.abs((n(dash.data?.stats?.totalDebt) || 0) - debtFromSales) < 0.01,
      `Mismatch totalDebt dashboard=${dash.data?.stats?.totalDebt} salesDebt=${debtFromSales}`,
      failures
    );

    // client debt reconciliation
    const cDebt = await req("GET", `/api/clients/${clientId}/debt`, { token: adminToken });
    const cDebtRows = Array.isArray(cDebt.data?.sales) ? cDebt.data.sales : [];
    const cDebtSum = cDebtRows.reduce((a0, s) => a0 + Math.max(0, n(s.debtAmount) || 0), 0);
    must(
      Math.abs((n(cDebt.data?.totalDebt) || 0) - cDebtSum) < 0.01,
      `Client debt mismatch totalDebt=${cDebt.data?.totalDebt} sumRows=${cDebtSum}`,
      failures
    );

    // ===== EDGE CASES
    // invalid payments
    const invalidPayloads = [
      { clientId, amount: "abc", method: "CASH" },
      { clientId, amount: -5, method: "CASH" },
      { amount: 10, method: "CASH" }, // missing clientId
    ];
    for (const payload of invalidPayloads) {
      try {
        await req("POST", "/api/payments", { token: cashierToken, body: payload });
        failures.push(`Invalid payment unexpectedly accepted: ${JSON.stringify(payload)}`);
      } catch (e) {
        must(e.status === 400, `Invalid payment expected 400 got ${e.status}`, failures);
      }
    }

    // delete product used in sales must fail
    try {
      await req("DELETE", `/api/products/${productId}`, { token: adminToken });
      failures.push("Product used in sales was deleted (should be blocked)");
    } catch (e) {
      must(e.status === 400, `Delete used product expected 400 got ${e.status}`, failures);
    }

    // delete sale after payments exist should work and stay consistent
    const saleWithPayment = (allSales.data || []).find((s) => String(s.clientId?._id || s.clientId) === clientId && n(s.paidAmount) > 0);
    if (saleWithPayment) {
      await req("DELETE", `/api/sales/${saleWithPayment._id}`, { token: adminToken });
      cleanup.saleIds = cleanup.saleIds.filter((x) => x !== String(saleWithPayment._id));
    }

    // invoice generation robustness (pdf + thermal)
    const remainingSales = await req("GET", "/api/sales", {
      token: adminToken,
      query: { from: "2020-01-01", to: "2030-01-01" },
    });
    const target = (remainingSales.data || []).find((s) => String(s.clientId?._id || s.clientId) === clientId);
    must(!!target, "No remaining sale found for invoice checks", failures);
    if (target) {
      const pdf = await req("GET", `/api/sales/${target._id}/invoice`, {
        token: cashierToken,
        expect: "buffer",
      });
      must(
        String(pdf.headers.get("content-type") || "").toLowerCase().includes("application/pdf"),
        "Invoice PDF content-type invalid",
        failures
      );
      const thermal = await req("GET", `/api/sales/${target._id}/invoice?format=thermal`, {
        token: cashierToken,
        expect: "text",
      });
      const html = String(thermal.data || "");
      must(!html.includes("NaN") && !html.includes("Infinity"), "Invoice thermal contains NaN/Infinity", failures);
    }

    // dashboard integrity / empty range fallback
    const futureDash = await req("GET", "/api/dashboard", {
      token: adminToken,
      query: { from: "2099-01-01", to: "2099-01-02" },
    });
    const fs = futureDash.data?.stats || {};
    ["sales", "totalSales", "totalExpenses", "totalDebt", "cashIn", "netProfit", "profit"].forEach((k) => {
      must(Number.isFinite(n(fs[k])), `Future dashboard stats.${k} not finite`, failures);
    });

    const ds1 = n(dash.data?.stats?.totalSales) || 0;
    const ds2 = n(dash2BeforeMutations.data?.stats?.totalSales) || 0;
    must(Math.abs(ds1 - ds2) < 0.01, `Dashboard refresh inconsistency: ${ds1} vs ${ds2}`, failures);
  } catch (e) {
    failures.push(`Fatal lock test error: ${e.message}`);
  } finally {
    // cleanup best effort
    if (adminToken) {
      for (const id0 of cleanup.saleIds) {
        try {
          await req("DELETE", `/api/sales/${id0}`, { token: adminToken });
        } catch {
          /* ignore */
        }
      }
      for (const id0 of cleanup.expenseIds) {
        try {
          await req("DELETE", `/api/expenses/${id0}`, { token: adminToken });
        } catch {
          /* ignore */
        }
      }
      for (const id0 of cleanup.productIds) {
        try {
          await req("DELETE", `/api/products/${id0}`, { token: adminToken });
        } catch {
          /* ignore */
        }
      }
      for (const id0 of cleanup.clientIds) {
        try {
          await req("DELETE", `/api/clients/${id0}`, { token: adminToken });
        } catch {
          /* ignore */
        }
      }
    }
  }

  if (failures.length) {
    console.error("LOCK TEST FAILED");
    failures.forEach((f) => console.error(` - ${f}`));
    process.exit(1);
  }
  console.log("LOCK TEST PASSED");
}

main().catch((e) => {
  console.error("LOCK TEST FAILED:", e.message);
  process.exit(1);
});

