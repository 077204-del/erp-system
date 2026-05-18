import { useCallback, useEffect, useRef, useState } from "react";
import api from "./api";
import MobileLayoutPreview, {
  isMobileLayoutPreviewHash,
} from "./components/MobileLayoutPreview";
import LayoutShell from "./components/LayoutShell";
import { ErpUiProvider, useErpUi } from "./context/ErpUiContext";
import { LocaleProvider, useLocale } from "./context/LocaleContext";
import Login from "./Login";
import { apiErrorMessage } from "./utils/erpFormat";
import { freshGetConfig, workspaceGetParams } from "./config/apiRequest";
import { mapDashboardApiToState } from "./utils/dashboardFinance";
import { normalizeRoleClient } from "./utils/rbacClient";
import { purgeApiCachesOnBoot } from "./offline/responseCache";
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

/** Decode JWT payload (no signature verify) — align UI with token when localStorage.user lags. */
function decodeJwtPayloadUnsafe() {
  try {
    const t = localStorage.getItem("token");
    if (!t) return null;
    const parts = t.split(".");
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (b64.length % 4)) % 4;
    if (pad) b64 += "=".repeat(pad);
    const json = JSON.parse(atob(b64));
    return json && typeof json === "object" ? json : null;
  } catch {
    return null;
  }
}

/**
 * Merge `localStorage.user` with JWT role/permissions when they differ (post-deploy / admin edits).
 * Persists only when a patch is applied.
 */
function readStoredUserWithJwtSync() {
  const u = readStoredUser();
  const jwt = decodeJwtPayloadUnsafe();
  if (!jwt) return u;

  const jwtRole = jwt.role != null ? normalizeRoleClient(jwt.role) : "";
  const storedRole = u != null ? normalizeRoleClient(u.role) : "";
  const jwtPerms =
    jwt.permissions != null && typeof jwt.permissions === "object"
      ? jwt.permissions
      : null;

  if (!jwtRole || jwtRole === storedRole) return u;

  const merged = {
    ...(u && typeof u === "object" ? u : {}),
    role: jwtRole,
    ...(jwtPerms ? { permissions: jwtPerms } : {}),
  };
  if (merged.id == null && jwt.id != null) merged.id = String(jwt.id);
  try {
    localStorage.setItem("user", JSON.stringify(merged));
  } catch {
    /* ignore */
  }
  return merged;
}

function initialRangeForRole() {
  try {
    const u = readStoredUserWithJwtSync();
    if (String(u?.role || "").toLowerCase() === "cashier") {
      const t = new Date().toISOString().slice(0, 10);
      return { from: t, to: t };
    }
  } catch {
    /* ignore */
  }
  return { from: "2020-01-01", to: "2030-01-01" };
}

function MainWorkspace({ setToken, reportLoading }) {
  const { toast, confirm } = useErpUi();
  const { t } = useLocale();

  const [activeView, setActiveView] = useState("dashboard");

  const [dashboard, setDashboard] = useState({
    sales: 0,
    salesCount: 0,
    totalSales: 0,
  });
  const [dashboardMeta, setDashboardMeta] = useState({ role: "" });

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
  /** Admin/manager: filter workspace sales (and server reports) by cashier */
  const [workspaceCashierId, setWorkspaceCashierId] = useState("");
  const [saleCashiers, setSaleCashiers] = useState([]);
  const rangeInit = initialRangeForRole();
  const [from, setFrom] = useState(rangeInit.from);
  const [to, setTo] = useState(rangeInit.to);

  const initialFetchRef = useRef(false);
  const storedUser = readStoredUserWithJwtSync();
  const roleLower = normalizeRoleClient(storedUser?.role);
  const isAdmin = roleLower === "admin";
  const isManager = roleLower === "manager";
  const isCashier = roleLower === "cashier";
  const permObj = storedUser?.permissions;
  const perms = permObj && typeof permObj === "object" ? permObj : {};
  const canViewReports =
    isAdmin || isManager || perms.canViewReports === true;
  const canManageExpenses =
    isAdmin || isManager || perms.canManageExpenses === true;
  const canManageProducts =
    isAdmin || isManager || perms.canManageProducts === true;
  const canManageClients =
    isAdmin || isManager || isCashier || perms.canManageClients === true;
  const canCreateSales =
    isAdmin ||
    isManager ||
    isCashier ||
    perms.canCreateSales === true;
  const canCreatePayments =
    isAdmin ||
    isManager ||
    isCashier ||
    perms.canCreatePayments === true;
  const canEditSales =
    isAdmin || isManager || isCashier || perms.canEditSales === true;
  const canVoidSales = isAdmin || isManager;
  const apiRole = dashboardMeta.role || "";
  const canViewFinancialKpis =
    apiRole === "admin" || apiRole === "manager";
  const canViewCostPrice = apiRole === "admin";

  useEffect(() => {
    reportLoading(loading);
  }, [loading, reportLoading]);

  useEffect(() => {
    purgeApiCachesOnBoot();
  }, []);

  useEffect(() => {
    if (!isAdmin && !isManager) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/api/sales/cashiers/list", freshGetConfig());
        if (!cancelled && Array.isArray(res.data)) {
          setSaleCashiers(res.data);
        }
      } catch {
        if (!cancelled) setSaleCashiers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, isManager]);

  const fetchAll = useCallback(async (fromDate, toDate, opts = {}) => {
    setFetchError("");
    setLoading(true);
    const errs = [];

    const fresh = freshGetConfig();
    const cashierForSales =
      opts && Object.prototype.hasOwnProperty.call(opts, "cashierId")
        ? opts.cashierId
        : workspaceCashierId;
    const salesParams = workspaceGetParams({ from: fromDate, to: toDate });
    if (
      cashierForSales &&
      (isAdmin || isManager) &&
      typeof cashierForSales === "string"
    ) {
      salesParams.cashierId = cashierForSales;
    }
    const [dashR, salesR, prodR, cliR, payR] = await Promise.allSettled([
      api.get("/api/dashboard", {
        ...fresh,
        params: workspaceGetParams({ from: fromDate, to: toDate }),
      }),
      api.get("/api/sales", {
        ...fresh,
        params: salesParams,
      }),
      api.get("/api/products", {
        ...fresh,
        params: workspaceGetParams(),
      }),
      api.get("/api/clients", {
        ...fresh,
        params: workspaceGetParams(),
      }),
      api.get("/api/payments", {
        ...fresh,
        params: workspaceGetParams(),
      }),
    ]);

    if (dashR.status === "fulfilled") {
      const mapped = mapDashboardApiToState(dashR.value.data);
      setDashboardMeta(mapped.meta || { role: "" });
      setDashboard(mapped.dashboard);
      setCash(
        mapped.cash || {
          cashSales: undefined,
          debtPayments: undefined,
          totalCashIn: undefined,
        }
      );
    } else {
      errs.push(apiErrorMessage(dashR.reason));
      setDashboardMeta({ role: "" });
      setDashboard({
        sales: 0,
        salesCount: 0,
        totalSales: 0,
      });
      setCash({});
    }

    if (salesR.status === "fulfilled") {
      const data = salesR.value.data;
      const list = Array.isArray(data) ? data : [];
      setSales(list);
    } else {
      errs.push(apiErrorMessage(salesR.reason));
      setSales([]);
    }

    if (prodR.status === "fulfilled") {
      const data = prodR.value.data;
      const list = Array.isArray(data) ? data : [];
      setProducts(list);
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
  }, [workspaceCashierId, isAdmin, isManager]);

  useEffect(() => {
    if (initialFetchRef.current) return;
    initialFetchRef.current = true;
    fetchAll(from, to);
  }, [fetchAll, from, to]);

  useEffect(() => {
    const onQueued = () => {
      toast.info(t("app.offlineQueued"), t("app.offlineQueuedTitle"));
    };
    const onSynced = () => {
      toast.success(t("app.offlineSynced"));
      fetchAll(from, to);
    };
    window.addEventListener("erp:offline-queued", onQueued);
    window.addEventListener("erp:offline-synced", onSynced);
    return () => {
      window.removeEventListener("erp:offline-queued", onQueued);
      window.removeEventListener("erp:offline-synced", onSynced);
    };
  }, [fetchAll, from, to, toast, t]);

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
    if (activeView === "cash-closing" && !isAdmin && !isManager) {
      setActiveView("dashboard");
    }
  }, [
    activeView,
    isAdmin,
    isManager,
    canViewReports,
    canManageExpenses,
  ]);

  const handleApply = () => fetchAll(from, to);

  const applyReportPreset = (key) => {
    const today = new Date().toISOString().slice(0, 10);
    if (key === "today") {
      setFrom(today);
      setTo(today);
      fetchAll(today, today);
      return;
    }
    if (key === "week") {
      const d = new Date(`${today}T12:00:00`);
      const dow = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - dow);
      const start = d.toISOString().slice(0, 10);
      d.setDate(d.getDate() + 6);
      const end = d.toISOString().slice(0, 10);
      setFrom(start);
      setTo(end);
      fetchAll(start, end);
    }
  };

  const handleReset = () => {
    if (isCashier) {
      const t = new Date().toISOString().slice(0, 10);
      setFrom(t);
      setTo(t);
      setWorkspaceCashierId("");
      fetchAll(t, t, { cashierId: "" });
      return;
    }
    setFrom("2020-01-01");
    setTo("2030-01-01");
    setWorkspaceCashierId("");
    fetchAll("2020-01-01", "2030-01-01", { cashierId: "" });
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
          dashboardMeta={dashboardMeta}
          canViewFinancial={canViewFinancialKpis}
          isAdmin={apiRole === "admin"}
          isCashier={apiRole === "cashier"}
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
          canEditSales={canEditSales}
          canVoidSales={canVoidSales}
          showCashierFilter={isAdmin || isManager}
          cashiers={saleCashiers}
          cashierId={workspaceCashierId}
          onCashierChange={(id) => {
            setWorkspaceCashierId(id);
            fetchAll(from, to, { cashierId: id });
          }}
        />
      ) : null}

      {activeView === "products" ? (
        <ProductsView
          products={products}
          loading={loading}
          initialSyncDone={initialSyncDone}
          isAdmin={isAdmin}
          canManageProducts={canManageProducts}
          canViewCostPrice={canViewCostPrice}
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
          canViewFinancialKpis={canViewFinancialKpis}
          isAdmin={isAdmin}
          isManager={isManager}
          onFromChange={setFrom}
          onToChange={setTo}
          onApplyDates={() => fetchAll(from, to)}
          onReportPreset={applyReportPreset}
          cashierId={workspaceCashierId}
          onCashierChange={(id) => {
            setWorkspaceCashierId(id);
            fetchAll(from, to, { cashierId: id });
          }}
          cashiers={saleCashiers}
        />
      ) : null}

      {activeView === "cash-closing" ? (
        <CashClosingView
          cash={cash}
          dashboard={dashboard}
          from={from}
          to={to}
          canViewFinancial={canViewFinancialKpis}
        />
      ) : null}

      {activeView === "register" ? (
        <DailyRegisterView
          sales={sales}
          payments={payments}
          loading={loading}
          onRefresh={() => fetchAll(from, to)}
          canViewFinancial={canViewFinancialKpis}
        />
      ) : null}

      {activeView === "expenses" ? (
        <ExpensesView onWorkspaceSync={() => fetchAll(from, to)} />
      ) : null}

      {activeView === "users" ? <UsersModuleView /> : null}

      {activeView === "audit" ? <AuditLogsView /> : null}

      {activeView === "settings" ? <SettingsView /> : null}
    </LayoutShell>
  );
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [globalLoading, setGlobalLoading] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(() =>
    isMobileLayoutPreviewHash()
  );

  useEffect(() => {
    const onHash = () => setMobilePreview(isMobileLayoutPreviewHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

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

  if (mobilePreview) {
    return <MobileLayoutPreview />;
  }

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
