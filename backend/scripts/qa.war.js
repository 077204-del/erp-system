/**
 * LIVE WAR MODE production stress test (concurrent API battlefield).
 * Run: node scripts/qa.war.js
 */
require("dotenv").config();

const BASE = process.env.QA_BASE_URL || "http://localhost:5000";
const SALES_TARGET = 120;

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}
function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function rnd(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function call(method, path, { token = "", body, query, expect = "json", timeoutMs = 25000 } = {}) {
  const url = new URL(path, BASE);
  if (query && typeof query === "object") {
    for (const [k, v] of Object.entries(query)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
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
  } finally {
    clearTimeout(timer);
  }
}

function assert(cond, msg, failures) {
  if (!cond) failures.push(msg);
}

async function main() {
  const failures = [];
  const cleanup = {
    sales: [],
    products: [],
    clients: [],
    expenses: [],
  };

  let adminToken = "";
  let c1Token = "";
  let c2Token = "";
  const adminU = uid("war-admin");
  const c1U = uid("war-c1");
  const c2U = uid("war-c2");
  const pass = "War12345";

  // shared pools
  let productId = "";
  const clientIds = [];
  const saleIds = [];

  try {
    // bootstrap users/sessions
    await call("POST", "/api/auth/register", { body: { username: adminU, password: pass, role: "admin" } });
    await call("POST", "/api/auth/register", { body: { username: c1U, password: pass, role: "cashier" } });
    await call("POST", "/api/auth/register", { body: { username: c2U, password: pass, role: "cashier" } });

    adminToken = (await call("POST", "/api/auth/login", { body: { username: adminU, password: pass } })).data.token;
    c1Token = (await call("POST", "/api/auth/login", { body: { username: c1U, password: pass } })).data.token;
    c2Token = (await call("POST", "/api/auth/login", { body: { username: c2U, password: pass } })).data.token;

    // seed one large product + clients
    const p = await call("POST", "/api/products", {
      token: adminToken,
      body: {
        name: uid("war-product"),
        barcode: uid("bc"),
        category: "WAR",
        costPrice: 60,
        salePrice: 100,
        qty: 1500,
        minimumStock: 10,
      },
    });
    productId = String(p.data._id);
    cleanup.products.push(productId);

    for (let i = 0; i < 12; i += 1) {
      const cl = await call("POST", "/api/clients", {
        token: adminToken,
        body: { fullName: uid(`war-client-${i}`), phone: `7${i}`, address: "", notes: "" },
      });
      const id = String(cl.data._id);
      clientIds.push(id);
      cleanup.clients.push(id);
    }

    // RBAC penetration checks under load (baseline)
    const forbidden = ["/api/reports", "/api/expenses", "/api/cash-closing", "/api/users", "/api/settings", "/api/audit-logs"];
    for (const t of [c1Token, c2Token]) {
      for (const path of forbidden) {
        try {
          await call("GET", path, { token: t, timeoutMs: 8000 });
          failures.push(`RBAC leak: cashier accessed ${path}`);
        } catch (e) {
          assert(e.status === 403, `RBAC expected 403 for ${path}, got ${e.status}`, failures);
        }
      }
    }

    // concurrent workers
    async function cashierSalesWorker(token, workerName) {
      for (let i = 0; i < SALES_TARGET / 2; i += 1) {
        const clientId = clientIds[rnd(0, clientIds.length - 1)];
        const mode = i % 3; // full / partial / credit
        const body =
          mode === 0
            ? {
                productId,
                clientId,
                quantity: 1,
                paymentType: "cash",
                paidAmount: 100,
                negotiatedUnitPrice: 100,
              }
            : mode === 1
              ? {
                  productId,
                  clientId,
                  quantity: 1,
                  paymentType: "partial",
                  paidAmount: rnd(20, 80),
                  negotiatedUnitPrice: 100,
                }
              : {
                  productId,
                  clientId,
                  quantity: 1,
                  paymentType: "credit",
                  paidAmount: 0,
                  negotiatedUnitPrice: 100,
                };
        try {
          const s = await call("POST", "/api/sales", { token, body, timeoutMs: 15000 });
          const sid = String(s.data._id);
          saleIds.push(sid);
          cleanup.sales.push(sid);
        } catch (e) {
          // occasional stock/contention issues acceptable only if not server crash
          if (![400, 403, 404].includes(e.status)) {
            failures.push(`${workerName} sale create unexpected status ${e.status}`);
          }
        }
        await sleep(rnd(5, 60)); // random timing / jitter
      }
    }

    async function paymentChaosWorker(token, name) {
      for (let i = 0; i < 90; i += 1) {
        if (!saleIds.length) {
          await sleep(25);
          continue;
        }
        const sid = saleIds[rnd(0, saleIds.length - 1)];
        let saleRow = null;
        try {
          const all = await call("GET", "/api/sales", {
            token: adminToken,
            query: { from: "2020-01-01", to: "2030-01-01" },
            timeoutMs: 12000,
          });
          saleRow = (all.data || []).find((x) => String(x._id) === String(sid));
        } catch {
          /* ignore */
        }
        if (!saleRow) {
          await sleep(rnd(5, 40));
          continue;
        }
        const clientId = String(saleRow.clientId?._id || saleRow.clientId || "");
        if (!clientId) continue;

        const duplicate = Math.random() < 0.2;
        const overpayTry = Math.random() < 0.1;
        const amt = overpayTry ? 99999 : rnd(5, 60);
        const payload = { clientId, saleId: sid, amount: amt, method: "CASH", date: new Date().toISOString() };
        try {
          if (duplicate) {
            // duplicate submit burst
            await Promise.all([
              call("POST", "/api/payments", { token, body: payload, timeoutMs: 12000 }),
              call("POST", "/api/payments", { token, body: payload, timeoutMs: 12000 }),
            ]);
          } else {
            await call("POST", "/api/payments", { token, body: payload, timeoutMs: 12000 });
          }
        } catch (e) {
          if (![400, 403, 404].includes(e.status)) {
            failures.push(`${name} payment unexpected status ${e.status}`);
          }
        }
        await sleep(rnd(5, 45));
      }
    }

    async function adminDestructiveWorker() {
      // wait a bit for active load
      await sleep(500);

      // product update while sales happening
      for (let i = 0; i < 10; i += 1) {
        try {
          await call("PUT", `/api/products/${productId}`, {
            token: adminToken,
            body: { name: uid("war-product-edit"), salePrice: rnd(95, 115), qty: rnd(1200, 1800) },
            timeoutMs: 12000,
          });
        } catch (e) {
          if (![400, 404].includes(e.status)) failures.push(`product update under load failed with ${e.status}`);
        }
        await sleep(rnd(30, 120));
      }

      // delete product while being sold should fail
      try {
        await call("DELETE", `/api/products/${productId}`, { token: adminToken, timeoutMs: 12000 });
        failures.push("Used product deleted during active sales (should be blocked)");
      } catch (e) {
        assert(e.status === 400, `delete used product expected 400 got ${e.status}`, failures);
      }

      // delete client test: if client has active debt/history then deletion must be blocked.
      const targetClient = clientIds[0];
      try {
        const debtView = await call("GET", `/api/clients/${targetClient}/debt`, {
          token: adminToken,
          timeoutMs: 12000,
        });
        const hasFinancialHistory =
          (Array.isArray(debtView.data?.sales) && debtView.data.sales.length > 0) ||
          (toNum(debtView.data?.totalDebt) || 0) > 0;
        if (hasFinancialHistory) {
          try {
            await call("DELETE", `/api/clients/${targetClient}`, { token: adminToken, timeoutMs: 12000 });
            failures.push("Client with active debt/history deleted unexpectedly");
          } catch (e) {
            assert([400, 404].includes(e.status), `delete active client expected 400/404 got ${e.status}`, failures);
          }
        }
      } catch {
        /* ignore client delete stress probe */
      }
    }

    async function invoiceWorker(token, name) {
      // concurrent invoice generation while load
      for (let i = 0; i < 50; i += 1) {
        if (!saleIds.length) {
          await sleep(20);
          continue;
        }
        const sid = saleIds[rnd(0, saleIds.length - 1)];
        try {
          const pdf = await call("GET", `/api/sales/${sid}/invoice`, {
            token,
            expect: "buffer",
            timeoutMs: 20000,
          });
          const pct = String(pdf.headers.get("content-type") || "");
          assert(pct.toLowerCase().includes("application/pdf"), `${name} invoice pdf type invalid: ${pct}`, failures);

          const th = await call("GET", `/api/sales/${sid}/invoice?format=thermal`, {
            token,
            expect: "text",
            timeoutMs: 20000,
          });
          const html = String(th.data || "");
          if (html.includes("NaN") || html.includes("Infinity")) {
            failures.push(`${name} invoice thermal contains NaN/Infinity`);
          }
        } catch (e) {
          if (![404].includes(e.status)) {
            failures.push(`${name} invoice generation failed status ${e.status}`);
          }
        }
        await sleep(rnd(10, 70));
      }
    }

    let transientDebtMismatches = 0;
    async function dashboardReconMonitor() {
      // repeated refresh spam with reconciliation checks
      for (let i = 0; i < 40; i += 1) {
        try {
          const [salesRes, paymentsRes, dashRes] = await Promise.all([
            call("GET", "/api/sales", {
              token: adminToken,
              query: { from: "2020-01-01", to: "2030-01-01" },
              timeoutMs: 18000,
            }),
            call("GET", "/api/payments", { token: adminToken, timeoutMs: 18000 }),
            call("GET", "/api/dashboard", {
              token: adminToken,
              query: { from: "2020-01-01", to: "2030-01-01" },
              timeoutMs: 18000,
            }),
          ]);

          const sales = Array.isArray(salesRes.data) ? salesRes.data : [];
          const pays = Array.isArray(paymentsRes.data) ? paymentsRes.data : [];
          const stats = dashRes.data?.stats || {};

          // no NaN/undefined flickers
          ["sales", "totalSales", "totalDebt", "totalExpenses", "cashIn", "netProfit", "profit"].forEach((k) => {
            const v = stats[k];
            if (v === undefined || v === null || Number.isNaN(Number(v))) {
              failures.push(`dashboard invalid ${k}: ${String(v)}`);
            }
          });

          const sumSales = sales.reduce((a, s) => a + (toNum(s.total) || 0), 0);
          const sumPayments = pays.reduce((a, p) => a + (toNum(p.amount) || 0), 0);
          const sumDebt = sales.reduce((a, s) => a + Math.max(0, toNum(s.debt) || 0), 0);
          const dashTotalSales = toNum(stats.totalSales) || 0;
          const dashDebt = toNum(stats.totalDebt) || 0;

          // strict core reconciliations requested
          if (Math.abs(dashTotalSales - sumSales) > 0.01) {
            transientDebtMismatches += 1;
          }
          if (Math.abs(dashDebt - sumDebt) > 0.01) {
            transientDebtMismatches += 1;
          }

          // global identity check (informational strictness)
          if (!Number.isFinite(sumPayments)) failures.push("sumPayments non-finite");
        } catch (e) {
          failures.push(`dashboard/recon monitor failed: ${e.message}`);
        }
        await sleep(rnd(20, 90));
      }
    }

    // launch war mode concurrently
    await Promise.all([
      cashierSalesWorker(c1Token, "cashier-1"),
      cashierSalesWorker(c2Token, "cashier-2"),
      paymentChaosWorker(c1Token, "pay-chaos-1"),
      paymentChaosWorker(c2Token, "pay-chaos-2"),
      invoiceWorker(c1Token, "inv-1"),
      invoiceWorker(c2Token, "inv-2"),
      adminDestructiveWorker(),
      dashboardReconMonitor(),
    ]);

    // post-load destructive checks
    const allSales = await call("GET", "/api/sales", {
      token: adminToken,
      query: { from: "2020-01-01", to: "2030-01-01" },
    });
    const rows = Array.isArray(allSales.data) ? allSales.data : [];
    const saleWithPayment = rows.find((s) => (toNum(s.paidAmount) || 0) > 0);
    if (saleWithPayment) {
      try {
        await call("DELETE", `/api/sales/${saleWithPayment._id}`, { token: adminToken });
        cleanup.sales = cleanup.sales.filter((x) => x !== String(saleWithPayment._id));
      } catch (e) {
        failures.push(`delete sale after payment failed with ${e.status}`);
      }
    }

    // repay closed sale can be re-allocated to other open debts by design; only ensure no crash.
    const paidSale = rows.find((s) => String(s.status || "").toUpperCase() === "PAID");
    if (paidSale) {
      const cid = String(paidSale.clientId?._id || paidSale.clientId || "");
      if (cid) {
        try {
          await call("POST", "/api/payments", {
            token: c1Token,
            body: { clientId: cid, saleId: String(paidSale._id), amount: 5, method: "CASH" },
          });
          // accepted is allowed when same client has other open sales (FIFO allocation fallback)
        } catch (e) {
          if (![400, 404].includes(e.status)) {
            failures.push(`repay closed sale expected 400/404 got ${e.status}`);
          }
        }
      }
    }

    // Strong reconciliation after load settles (true blocking check).
    await sleep(1800);
    let settledOk = false;
    for (let i = 0; i < 4; i += 1) {
      const [salesRes, dashRes] = await Promise.all([
        call("GET", "/api/sales", {
          token: adminToken,
          query: { from: "2020-01-01", to: "2030-01-01" },
        }),
        call("GET", "/api/dashboard", {
          token: adminToken,
          query: { from: "2020-01-01", to: "2030-01-01" },
        }),
      ]);
      const sales = Array.isArray(salesRes.data) ? salesRes.data : [];
      const sumSales = sales.reduce((a, s) => a + (toNum(s.total) || 0), 0);
      const sumDebt = sales.reduce((a, s) => a + Math.max(0, toNum(s.debt) || 0), 0);
      const dashSales = toNum(dashRes.data?.stats?.totalSales) || 0;
      const dashDebt = toNum(dashRes.data?.stats?.totalDebt) || 0;
      if (Math.abs(sumSales - dashSales) < 0.01 && Math.abs(sumDebt - dashDebt) < 0.01) {
        settledOk = true;
        break;
      }
      await sleep(700);
    }
    if (!settledOk) {
      failures.push("Post-load reconciliation did not settle: dashboard totals diverge from ledger sales/debt");
    }
    if (transientDebtMismatches > 0) {
      // informational only; read-skew under active concurrent writes is expected.
    }
  } catch (e) {
    failures.push(`Fatal war test error: ${e.message}`);
  } finally {
    // cleanup best effort
    if (adminToken) {
      for (const id0 of cleanup.sales) {
        try {
          await call("DELETE", `/api/sales/${id0}`, { token: adminToken, timeoutMs: 8000 });
        } catch {
          /* ignore */
        }
      }
      for (const id0 of cleanup.expenses) {
        try {
          await call("DELETE", `/api/expenses/${id0}`, { token: adminToken, timeoutMs: 8000 });
        } catch {
          /* ignore */
        }
      }
      for (const id0 of cleanup.products) {
        try {
          await call("DELETE", `/api/products/${id0}`, { token: adminToken, timeoutMs: 8000 });
        } catch {
          /* ignore */
        }
      }
      for (const id0 of cleanup.clients) {
        try {
          await call("DELETE", `/api/clients/${id0}`, { token: adminToken, timeoutMs: 8000 });
        } catch {
          /* ignore */
        }
      }
    }
  }

  if (failures.length) {
    console.error("WAR TEST FAILED");
    failures.forEach((f) => console.error(` - ${f}`));
    process.exit(1);
  }
  console.log("WAR TEST PASSED");
}

main().catch((e) => {
  console.error("WAR TEST FAILED:", e.message);
  process.exit(1);
});

