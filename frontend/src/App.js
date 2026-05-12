import { useCallback, useEffect, useState } from "react";
import api from "./api";
import LayoutShell from "./components/LayoutShell";
import { ErpUiProvider, useErpUi } from "./context/ErpUiContext";
import { LocaleProvider, useLocale } from "./context/LocaleContext";
import Login from "./Login";
import { apiErrorMessage } from "./utils/erpFormat";
import CashClosingView from "./views/CashClosingView";
import ClientDebtView from "./views/ClientDebtView";
import DailyRegisterView from "./views/DailyRegisterView";
import InvoiceCenterView from "./views/InvoiceCenterView";
import ReportsView from "./views/ReportsView";
import SettingsView from "./views/SettingsView";
import UsersModuleView from "./views/UsersModuleView";
import AuditLogsView from "./views/AuditLogsView";
import ExpensesView from "./views/ExpensesView";
import {
  ClientsView,
  DashboardView,
  PaymentsView,
  ProductsView,
  SalesView,
} from "./views/WorkspaceViews";

/** Routes that only the admin role may open (granular permissions use separate gates). */
const ADMIN_ONLY_VIEWS = new Set(["users", "settings", "audit"]);

function safeText(v, fallback = "—") {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s.length ? s : fallback;
}

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

function MainWorkspace({ setToken, reportLoading }) {
  const { toast, confirm } = useErpUi();
  const { t } = useLocale();

  const [activeView, setActiveView] = useState("dashboard");

  const [dashboard, setDashboard] = useState({
    sales: 0,
    salesCount: 0,
    totalSales: 0,
    profit: 0,
    debt: 0,
    totalExpenses: 0,
    netProfit: 0,
  });

  const [cash, setCash] = useState({
    cashSales: 0,
    debtPayments: 0,
    totalCashIn: 0,
  });

  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [payments, setPayments] = useState([]);
  const [fetchError, setFetchError] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialSyncDone, setInitialSyncDone] = useState(false);

  const [from, setFrom] = useState("2020-01-01");
  const [to, setTo] = useState("2030-01-01");

  const storedUser = readStoredUser();
  const isAdmin =
    String(storedUser?.role || "").toLowerCase() === "admin";
  const permObj = storedUser?.permissions;
  const perms = permObj && typeof permObj === "object" ? permObj : {};
  const canViewReports =
    isAdmin || perms.canViewReports === true;
  const canManageExpenses =
    isAdmin || perms.canManageExpenses === true;
  const canManageProducts =
    isAdmin || perms.canManageProducts === true;
  const canManageClients =
    isAdmin || perms.canManageClients === true;
  const canCreateSales =
    isAdmin || String(storedUser?.role || "").toLowerCase() === "cashier" || perms.canCreateSales === true;
  const canCreatePayments =
    isAdmin || String(storedUser?.role || "").toLowerCase() === "cashier" || perms.canCreatePayments === true;

  useEffect(() => {
    reportLoading(loading);
  }, [loading, reportLoading]);

  const fetchAll = useCallback(async (fromDate, toDate) => {
    setFetchError("");
    setLoading(true);
    const errs = [];

    const [dashR, salesR, prodR, cliR, payR] = await Promise.allSettled([
      api.get("/api/dashboard", {
        params: { from: fromDate, to: toDate },
      }),
      api.get("/api/sales", {
        params: { from: fromDate, to: toDate },
      }),
      api.get("/api/products"),
      api.get("/api/clients"),
      api.get("/api/payments"),
    ]);

    if (dashR.status === "fulfilled") {
      const data = dashR.value.data;
      const salesCount = Number.isFinite(Number(data?.stats?.sales))
        ? Number(data.stats.sales)
        : 0;
      const totalSales = Number.isFinite(Number(data?.stats?.totalSales))
        ? Number(data.stats.totalSales)
        : 0;
      const debtVal = Number.isFinite(Number(data?.stats?.totalDebt))
        ? Number(data.stats.totalDebt)
        : Number.isFinite(Number(data?.stats?.debt))
          ? Number(data.stats.debt)
          : Number.isFinite(Number(data?.debt))
            ? Number(data.debt)
            : 0;
      setDashboard({
        sales: salesCount,
        salesCount,
        totalSales,
        profit: Number.isFinite(Number(data?.stats?.profit))
          ? Number(data.stats.profit)
          : 0,
        debt: debtVal,
        totalExpenses: Number.isFinite(Number(data?.stats?.totalExpenses))
          ? Number(data.stats.totalExpenses)
          : 0,
        netProfit: Number.isFinite(Number(data?.stats?.netProfit))
          ? Number(data.stats.netProfit)
          : 0,
      });
      const cashInVal = Number.isFinite(Number(data?.stats?.cashIn))
        ? Number(data.stats.cashIn)
        : Number.isFinite(Number(data?.cash?.totalCashIn))
          ? Number(data.cash.totalCashIn)
          : 0;
      setCash({
        cashSales: Number.isFinite(Number(data?.cash?.cashSales))
          ? Number(data.cash.cashSales)
          : 0,
        debtPayments: Number.isFinite(Number(data?.cash?.debtPayments))
          ? Number(data.cash.debtPayments)
          : 0,
        totalCashIn: cashInVal,
      });
    } else {
      errs.push(apiErrorMessage(dashR.reason));
      setDashboard({
        sales: 0,
        salesCount: 0,
        totalSales: 0,
        profit: 0,
        debt: 0,
        totalExpenses: 0,
        netProfit: 0,
      });
      setCash({
        cashSales: 0,
        debtPayments: 0,
        totalCashIn: 0,
      });
    }

    if (salesR.status === "fulfilled") {
      const data = salesR.value.data;
      setSales(Array.isArray(data) ? data : []);
    } else {
      errs.push(apiErrorMessage(salesR.reason));
      setSales([]);
    }

    if (prodR.status === "fulfilled") {
      const data = prodR.value.data;
      setProducts(Array.isArray(data) ? data : []);
    } else {
      errs.push(apiErrorMessage(prodR.reason));
      setProducts([]);
    }

    if (cliR.status === "fulfilled") {
      const data = cliR.value.data;
      setClients(Array.isArray(data) ? data : []);
    } else {
      errs.push(apiErrorMessage(cliR.reason));
      setClients([]);
    }

    if (payR.status === "fulfilled") {
      const data = payR.value.data;
      setPayments(Array.isArray(data) ? data : []);
    } else {
      errs.push(apiErrorMessage(payR.reason));
      setPayments([]);
    }

    setFetchError(errs.filter(Boolean).join(" · "));
    setInitialSyncDone(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onAuthLost = () => {
      toast.warning(t("app.sessionExpired"));
      setToken(null);
    };
    window.addEventListener("erp:unauthorized", onAuthLost);
    return () => window.removeEventListener("erp:unauthorized", onAuthLost);
  }, [setToken, toast, t]);

  useEffect(() => {
    if (!fetchError) return;
    toast.error(fetchError);
    setFetchError("");
  }, [fetchError, toast]);

  useEffect(() => {
    if (isAdmin) return;
    if (ADMIN_ONLY_VIEWS.has(activeView)) {
      setActiveView("dashboard");
      return;
    }
    if (activeView === "reports" && !canViewReports) {
      setActiveView("dashboard");
      return;
    }
    if (activeView === "expenses" && !canManageExpenses) {
      setActiveView("dashboard");
      return;
    }
    if (activeView === "cash-closing") {
      setActiveView("dashboard");
      return;
    }
    if (activeView === "register") {
      setActiveView("dashboard");
      return;
    }
    if (activeView === "client-debt") {
      setActiveView("dashboard");
    }
  }, [
    activeView,
    isAdmin,
    canViewReports,
    canManageExpenses,
  ]);

  const handleApply = () => fetchAll(from, to);

  const handleReset = () => {
    setFrom("2020-01-01");
    setTo("2030-01-01");
    fetchAll("2020-01-01", "2030-01-01");
  };

  const handleLogout = () => {
    confirm({
      title: t("app.signOutTitle"),
      message: t("app.signOutMsg"),
      confirmLabel: t("app.signOutConfirm"),
      danger: true,
      onConfirm: () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setToken(null);
        toast.info(t("app.signedOut"));
      },
    });
  };

  const userRaw = localStorage.getItem("user");
  let userLabel = "";
  let userRole = "";
  try {
    const u = userRaw ? JSON.parse(userRaw) : null;
    userLabel = u && u.username ? safeText(u.username, "") : "";
    userRole = u && u.role ? safeText(u.role, "") : "";
  } catch {
    userLabel = "";
    userRole = "";
  }

  const statusLabel =
    loading && initialSyncDone
      ? t("topbar.syncing")
      : fetchError
        ? t("topbar.checkData")
        : t("topbar.live");

  return (
    <LayoutShell
      activeView={activeView}
      onNavigate={setActiveView}
      userLabel={userLabel}
      userRole={userRole}
      statusLabel={statusLabel}
      navFlags={{ canViewReports, canManageExpenses }}
      onLogout={handleLogout}
    >
      <div className="erp-workspace-toolbar">
        <button
          type="button"
          className="erp-btn erp-btn-ghost erp-btn-sm"
          onClick={() => fetchAll(from, to)}
          disabled={loading}
        >
          {t("app.refreshData")}
        </button>
      </div>

      {activeView === "dashboard" ? (
        <DashboardView
          loading={loading}
          initialSyncDone={initialSyncDone}
          dashboard={dashboard}
          cash={cash}
          products={products}
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          onApply={handleApply}
          onReset={handleReset}
          canViewFinancial={isAdmin || canViewReports}
        />
      ) : null}

      {activeView === "sales" ? (
        <SalesView
          sales={sales}
          loading={loading}
          initialSyncDone={initialSyncDone}
          products={products}
          clients={clients}
          onRefreshWorkspace={() => fetchAll(from, to)}
          canCreateSales={canCreateSales}
        />
      ) : null}

      {activeView === "products" ? (
        <ProductsView
          products={products}
          loading={loading}
          initialSyncDone={initialSyncDone}
          isAdmin={isAdmin}
          canManageProducts={canManageProducts}
          onRefreshWorkspace={() => fetchAll(from, to)}
        />
      ) : null}

      {activeView === "clients" ? (
        <ClientsView
          clients={clients}
          loading={loading}
          initialSyncDone={initialSyncDone}
          isAdmin={isAdmin}
          canManageClients={canManageClients}
          onRefreshWorkspace={() => fetchAll(from, to)}
        />
      ) : null}

      {activeView === "payments" ? (
        <PaymentsView
          payments={payments}
          clients={clients}
          sales={sales}
          loading={loading}
          initialSyncDone={initialSyncDone}
          isAdmin={isAdmin}
          canCreatePayments={canCreatePayments}
          onRefreshWorkspace={() => fetchAll(from, to)}
          toast={toast}
        />
      ) : null}

      {activeView === "invoices" ? (
        <InvoiceCenterView
          sales={sales}
          loading={loading}
          initialSyncDone={initialSyncDone}
          toast={toast}
        />
      ) : null}

      {activeView === "client-debt" ? (
        <ClientDebtView
          clients={clients}
          sales={sales}
          payments={payments}
        />
      ) : null}

      {activeView === "reports" ? (
        <ReportsView
          sales={sales}
          payments={payments}
          from={from}
          to={to}
        />
      ) : null}

      {activeView === "cash-closing" ? (
        <CashClosingView
          cash={cash}
          dashboard={dashboard}
          from={from}
          to={to}
        />
      ) : null}

      {activeView === "register" ? (
        <DailyRegisterView
          sales={sales}
          payments={payments}
          loading={loading}
          onRefresh={() => fetchAll(from, to)}
        />
      ) : null}

      {activeView === "expenses" ? <ExpensesView /> : null}

      {activeView === "users" ? <UsersModuleView /> : null}

      {activeView === "audit" ? <AuditLogsView /> : null}

      {activeView === "settings" ? <SettingsView /> : null}
    </LayoutShell>
  );
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [globalLoading, setGlobalLoading] = useState(false);

  useEffect(() => {
    try {
      const t = localStorage.getItem("erp-theme") || "light";
      document.documentElement.setAttribute("data-erp-theme", t);
      const c = localStorage.getItem("erp-ui-compact") === "1";
      document.documentElement.setAttribute(
        "data-erp-compact",
        c ? "true" : "false"
      );
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <LocaleProvider>
      <ErpUiProvider globalLoading={globalLoading}>
        {!token ? (
          <Login
            onLogin={(payload) => {
              const tk = payload.token || payload;
              localStorage.setItem("token", tk);
              setToken(tk);
            }}
            onLoadingChange={setGlobalLoading}
          />
        ) : (
          <MainWorkspace setToken={setToken} reportLoading={setGlobalLoading} />
        )}
      </ErpUiProvider>
    </LocaleProvider>
  );
}
