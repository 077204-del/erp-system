import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import api from "../api";
import ErpDataTable from "../components/ErpDataTable";
import ErpModuleFooter from "../components/ErpModuleFooter";
import NewSaleModal from "../components/NewSaleModal";
import ProductFormModal from "../components/ProductFormModal";
import ClientFormModal from "../components/ClientFormModal";
import { useErpUi } from "../context/ErpUiContext";
import { useLocale } from "../context/LocaleContext";
import {
  apiErrorMessage,
  formatMoneyDZD,
  formatNumber,
  safeNum,
  safeText,
} from "../utils/erpFormat";

function StatCardSkeleton() {
  return (
    <div className="erp-card erp-card-stat erp-skeleton" aria-hidden>
      <div className="erp-skeleton-line erp-skeleton-line--short" />
      <div className="erp-skeleton-line erp-skeleton-line--value" />
    </div>
  );
}

function KpiCard({ label, value, hint, tone = "blue" }) {
  return (
    <div className="erp-card erp-card-kpi">
      <div className="erp-kpi-head">
        <span className={`erp-kpi-icon erp-kpi-icon--${tone}`} aria-hidden />
        <p className="erp-card-label">{label}</p>
      </div>
      <p className="erp-card-value">{value}</p>
      <p className="erp-card-hint">{hint}</p>
    </div>
  );
}

export function DashboardView({
  loading,
  initialSyncDone,
  dashboard,
  cash,
  products,
  from,
  to,
  onFromChange,
  onToChange,
  onApply,
  onReset,
  canViewFinancial = false,
}) {
  const { t } = useLocale();
  const showKpiSkeleton = loading && !initialSyncDone;
  const totalSalesKpi = safeNum(dashboard?.totalSales, 0);
  const salesCountKpi = safeNum(
    dashboard?.salesCount ?? dashboard?.sales,
    0
  );

  const lowStockItems = Array.isArray(products)
    ? products.filter((p) => p.lowStock === true)
    : [];

  return (
    <>
      {lowStockItems.length > 0 ? (
        <div
          className="erp-card erp-card-elevated erp-dashboard-warn"
          role="status"
          style={{ marginBottom: "1rem" }}
        >
          <p className="erp-card-label">{t("dashboard.stockAlertTitle")}</p>
          <p className="erp-page-lead" style={{ margin: "0.25rem 0 0" }}>
            {t("dashboard.stockAlertLead")}{" "}
            <strong className="erp-mono">{lowStockItems.length}</strong>
          </p>
        </div>
      ) : null}
      <section className="erp-page-toolbar" aria-label={t("dashboard.period")}>
        <div className="erp-filter erp-filter--inline">
          <div className="erp-field">
            <label htmlFor="erp-from">{t("dashboard.from")}</label>
            <input
              id="erp-from"
              type="date"
              value={from}
              onChange={(e) => onFromChange(e.target.value)}
            />
          </div>
          <div className="erp-field">
            <label htmlFor="erp-to">{t("dashboard.to")}</label>
            <input
              id="erp-to"
              type="date"
              value={to}
              onChange={(e) => onToChange(e.target.value)}
            />
          </div>
          <div className="erp-btn-row">
            <button
              type="button"
              className="erp-btn erp-btn-primary"
              onClick={onApply}
              disabled={loading}
            >
              {t("dashboard.apply")}
            </button>
            <button
              type="button"
              className="erp-btn erp-btn-ghost"
              onClick={onReset}
              disabled={loading}
            >
              {t("dashboard.reset")}
            </button>
          </div>
        </div>
      </section>

      <section className="erp-section" aria-label={t("dashboard.performance")}>
        <h2 className="erp-section-title">{t("dashboard.performance")}</h2>
        <div className="erp-kpi-grid">
          {showKpiSkeleton ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : (
            <>
              <KpiCard
                label={t("dashboard.totalSales")}
                value={formatMoneyDZD(totalSalesKpi)}
                hint={t("dashboard.totalSalesHint")}
                tone="blue"
              />
              <KpiCard
                label={t("dashboard.revenue")}
                value={formatNumber(salesCountKpi)}
                hint={t("dashboard.revenueHint")}
                tone="mint"
              />
              {canViewFinancial ? (
                <>
                  <KpiCard
                    label={t("dashboard.profit")}
                    value={formatMoneyDZD(safeNum(dashboard?.profit, 0))}
                    hint={t("dashboard.profitHint")}
                    tone="violet"
                  />
                  <KpiCard
                    label={t("dashboard.debt")}
                    value={formatMoneyDZD(safeNum(dashboard?.debt, 0))}
                    hint={t("dashboard.debtHint")}
                    tone="amber"
                  />
                  <KpiCard
                    label={t("dashboard.totalExpenses")}
                    value={formatMoneyDZD(dashboard.totalExpenses ?? 0)}
                    hint={t("dashboard.totalExpensesHint")}
                    tone="slate"
                  />
                  <KpiCard
                    label={t("dashboard.netCashFlow")}
                    value={formatMoneyDZD(
                      safeNum(dashboard?.netCashFlow, 0)
                    )}
                    hint={t("dashboard.netCashFlowHint")}
                    tone="cyan"
                  />
                </>
              ) : null}
            </>
          )}
        </div>
      </section>

      <section className="erp-section erp-section-tight-top">
        <div className="erp-two-col">
          {canViewFinancial ? (
            <div className="erp-card erp-card-elevated">
              <p className="erp-card-label">{t("dashboard.cashFlow")}</p>
              <div className="erp-cash-flow">
                <div>
                  <p className="erp-cash-flow__label">{t("dashboard.fromSales")}</p>
                  <p className="erp-cash-flow__value">
                    {formatMoneyDZD(cash.cashSales)}
                  </p>
                </div>
                <div>
                  <p className="erp-cash-flow__label">
                    {t("dashboard.debtPayments")}
                  </p>
                  <p className="erp-cash-flow__value">
                    {formatMoneyDZD(cash.debtPayments)}
                  </p>
                </div>
                <div className="erp-cash-flow__total">
                  <p className="erp-cash-flow__label">
                    {t("dashboard.totalCashIn")}
                  </p>
                  <p className="erp-cash-flow__value erp-cash-flow__value--lg">
                    {formatMoneyDZD(cash.totalCashIn)}
                  </p>
                </div>
              </div>
              <p className="erp-card-hint">{t("dashboard.cashPeriodHint")}</p>
            </div>
          ) : null}
          <div className="erp-card erp-card-elevated erp-card-alerts">
            <p className="erp-card-label">{t("dashboard.lowStock")}</p>
            {lowStockItems.length === 0 ? (
              <div className="erp-mini-empty">
                <span className="erp-badge erp-badge--success">
                  {t("dashboard.allClear")}
                </span>
                <p className="erp-mini-empty__text">
                  {t("dashboard.lowStockHint")}
                </p>
              </div>
            ) : (
              <ul className="erp-alert-list">
                {lowStockItems.slice(0, 8).map((p) => (
                  <li key={p._id} className="erp-alert-list__item">
                    <span className="erp-alert-list__name">
                      {safeText(p.name, "—")}
                    </span>
                    <span className="erp-badge erp-badge--warning">
                      {t("dashboard.qtyAbbr")} {formatNumber(p.qty)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {lowStockItems.length > 8 ? (
              <p className="erp-card-hint">
                +{lowStockItems.length - 8} {t("dashboard.moreProducts")}
              </p>
            ) : null}
          </div>
        </div>
      </section>
      <ErpModuleFooter />
    </>
  );
}

export function SalesView({
  sales,
  loading,
  initialSyncDone,
  products,
  clients,
  onRefreshWorkspace,
  canCreateSales = true,
  canEditSales = false,
  canDeleteSales = false,
}) {
  const { t } = useLocale();
  const { toast, confirm } = useErpUi();
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState(null);

  const columns = [
    {
      key: "product",
      header: "Product",
      searchAccessor: (r) =>
        r.productId && r.productId.name != null ? r.productId.name : "",
      titleAccessor: (r) =>
        r.productId && r.productId.name != null ? r.productId.name : "",
      render: (r) =>
        safeText(
          r.productId && r.productId.name != null ? r.productId.name : "",
          "—"
        ),
    },
    { key: "quantity", header: "Qty", numeric: true },
    { key: "status", header: "Status", render: (r) => safeText(r.status, "—") },
    { key: "debt", header: "Debt", numeric: true, currency: true },
    { key: "total", header: "Total", numeric: true, currency: true },
    ...(canEditSales || canDeleteSales
      ? [
          {
            key: "actions",
            header: "",
            clip: false,
            render: (r) => (
              <div className="erp-table-actions">
                {canEditSales ? (
                  <button
                    type="button"
                    className="erp-btn erp-btn-ghost erp-btn-sm"
                    onClick={() => {
                      setEditingSale(r);
                      setSaleModalOpen(true);
                    }}
                  >
                    {t("saleFlow.edit")}
                  </button>
                ) : null}
                {canDeleteSales ? (
                  <button
                    type="button"
                    className="erp-btn erp-btn-danger erp-btn-sm"
                    onClick={() => {
                      confirm({
                        title: t("saleFlow.deleteTitle"),
                        message: safeText(
                          r.productId && r.productId.name != null
                            ? r.productId.name
                            : r._id,
                          "—"
                        ),
                        danger: true,
                        confirmLabel: t("saleFlow.deleteConfirm"),
                        onConfirm: async () => {
                          try {
                            await api.delete(
                            `/api/sales/${encodeURIComponent(String(r._id))}`
                          );
                            toast.success(t("saleFlow.deleted"));
                            if (typeof onRefreshWorkspace === "function") {
                              onRefreshWorkspace();
                            }
                          } catch (err) {
                            const st = err.response && err.response.status;
                            const msg =
                              st === 403
                                ? t("saleFlow.deleteForbidden")
                                : apiErrorMessage(err);
                            toast.error(msg, t("saleFlow.deleteTitle"));
                          }
                        },
                      });
                    }}
                  >
                    {t("saleFlow.delete")}
                  </button>
                ) : null}
              </div>
            ),
          },
        ]
      : []),
  ];

  const rows = sales.map((s) => ({
    ...s,
    product: s.productId?.name,
  }));

  const fab =
    canCreateSales &&
    createPortal(
      <button
        type="button"
        className="erp-fab erp-fab--sales"
        onClick={() => {
          setEditingSale(null);
          setSaleModalOpen(true);
        }}
        disabled={loading && !initialSyncDone}
        aria-haspopup="dialog"
        aria-expanded={saleModalOpen}
      >
        {t("saleFlow.fab")}
      </button>,
      document.body
    );

  return (
    <section className="erp-section erp-section-flush-top erp-sales-module erp-sales-view-shell">
      {canCreateSales ? fab : (
        <p className="erp-page-lead erp-rbac-banner" role="note">
          {t("rbac.noCreateSales")}
        </p>
      )}
      {!canEditSales && !canDeleteSales ? (
        <p className="erp-card-hint erp-sales-perm-hint" role="note">
          {t("saleFlow.readOnlyOpsHint")}
        </p>
      ) : null}
      <ErpDataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => String(r?._id ?? "")}
        pageSize={10}
        loading={loading}
        showSkeleton={!initialSyncDone}
        emptyTitle="No sales in this range"
        emptyHint="Adjust the reporting period on the Dashboard tab, then Apply."
        searchPlaceholder="Search sales…"
      />
      <NewSaleModal
        open={
          saleModalOpen &&
          ((canCreateSales && !editingSale) || (canEditSales && editingSale))
        }
        onClose={() => {
          setSaleModalOpen(false);
          setEditingSale(null);
        }}
        products={products}
        clients={clients}
        onSuccess={onRefreshWorkspace}
        toast={toast}
        mode={editingSale ? "edit" : "create"}
        editSale={editingSale}
      />
      <ErpModuleFooter />
    </section>
  );
}

export function ProductsView({
  products,
  loading,
  initialSyncDone,
  isAdmin = true,
  canManageProducts = false,
  onRefreshWorkspace,
}) {
  const { t } = useLocale();
  const { toast, confirm } = useErpUi();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [editing, setEditing] = useState(null);

  const columns = [
    {
      key: "name",
      header: t("productForm.colName"),
      searchAccessor: (r) => r.name,
      titleAccessor: (r) => r.name,
      render: (r) => safeText(r.name, "—"),
    },
    {
      key: "barcode",
      header: t("productForm.barcode"),
      searchAccessor: (r) => r.barcode,
      render: (r) => safeText(r.barcode, "—"),
    },
    {
      key: "category",
      header: t("productForm.category"),
      searchAccessor: (r) => r.category,
      render: (r) => safeText(r.category, "—"),
    },
    { key: "qty", header: t("productForm.stock"), numeric: true },
    { key: "salePrice", header: t("productForm.sellingPrice"), numeric: true, currency: true },
    { key: "costPrice", header: t("productForm.purchasePrice"), numeric: true, currency: true },
    {
      key: "lowStockThreshold",
      header: t("productForm.minimumStock"),
      numeric: true,
      render: (r) =>
        r.lowStockThreshold != null ? safeNum(r.lowStockThreshold, 0) : "—",
    },
    {
      key: "lowStock",
      header: t("productForm.colLowFlag"),
      clip: false,
      render: (r) =>
        r.lowStock === true ? (
          <span className="erp-badge erp-badge--warning">{t("productForm.yes")}</span>
        ) : r.lowStock === false ? (
          <span className="erp-badge erp-badge--neutral">{t("productForm.no")}</span>
        ) : (
          "—"
        ),
    },
    ...(canManageProducts
      ? [
          {
            key: "actions",
            header: "",
            clip: false,
            render: (r) => (
              <div className="erp-table-actions">
                <button
                  type="button"
                  className="erp-btn erp-btn-ghost erp-btn-sm"
                  onClick={() => {
                    setEditing(r);
                    setModalMode("edit");
                    setModalOpen(true);
                  }}
                >
                  {t("productForm.edit")}
                </button>
                <button
                  type="button"
                  className="erp-btn erp-btn-danger erp-btn-sm"
                  onClick={() => {
                    confirm({
                      title: t("productForm.deleteTitle"),
                      message: safeText(r.name, "—"),
                      danger: true,
                      confirmLabel: t("productForm.deleteConfirm"),
                      onConfirm: async () => {
                        try {
                          await api.delete(
                            `/api/products/${encodeURIComponent(String(r._id))}`
                          );
                          toast.success(t("productForm.deleted"));
                          if (typeof onRefreshWorkspace === "function") {
                            onRefreshWorkspace();
                          }
                        } catch (err) {
                          const st = err.response && err.response.status;
                          const data = err.response && err.response.data;
                          const msg =
                            st === 400 && data && data.message
                              ? String(data.message)
                              : st === 403
                                ? t("productForm.forbidden")
                                : apiErrorMessage(err);
                          toast.error(msg, t("productForm.title"));
                        }
                      },
                    });
                  }}
                >
                  {t("productForm.delete")}
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <section className="erp-section erp-section-flush-top">
      {!isAdmin && !canManageProducts ? (
        <p className="erp-page-lead erp-rbac-banner" role="note">
          {t("rbac.readOnlyCatalog")}
        </p>
      ) : null}
      {canManageProducts ? (
        <div className="erp-btn-row" style={{ marginBottom: "1rem" }}>
          <button
            type="button"
            className="erp-btn erp-btn-primary"
            onClick={() => {
              setEditing(null);
              setModalMode("create");
              setModalOpen(true);
            }}
          >
            {t("productForm.addButton")}
          </button>
        </div>
      ) : null}
      <ErpDataTable
        columns={columns}
        rows={products}
        getRowId={(r) => String(r?._id ?? "")}
        pageSize={12}
        loading={loading}
        showSkeleton={!initialSyncDone}
        emptyTitle={t("productForm.emptyTitle")}
        emptyHint={
          canManageProducts
            ? t("productForm.emptyHint")
            : t("rbac.readOnlyCatalog")
        }
        searchPlaceholder={t("productForm.searchPh")}
      />
      <ProductFormModal
        open={modalOpen}
        mode={modalMode}
        product={editing}
        t={t}
        toast={toast}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          if (typeof onRefreshWorkspace === "function") onRefreshWorkspace();
        }}
      />
      <ErpModuleFooter />
    </section>
  );
}

export function ClientsView({
  clients,
  loading,
  initialSyncDone,
  isAdmin = true,
  canManageClients = false,
  onRefreshWorkspace,
}) {
  const { t } = useLocale();
  const { toast, confirm } = useErpUi();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [editing, setEditing] = useState(null);

  const columns = [
    {
      key: "name",
      header: t("clientForm.fullName"),
      searchAccessor: (r) => r.name,
      titleAccessor: (r) => r.name,
      render: (r) => safeText(r.name, "—"),
    },
    {
      key: "phone",
      header: t("clientForm.phone"),
      searchAccessor: (r) => r.phone,
      titleAccessor: (r) => r.phone,
      render: (r) => safeText(r.phone, "—"),
    },
    {
      key: "address",
      header: t("clientForm.address"),
      searchAccessor: (r) => r.address,
      render: (r) => safeText(r.address, "—"),
    },
    {
      key: "notes",
      header: t("clientForm.notes"),
      searchAccessor: (r) => r.notes,
      render: (r) => {
        const n = safeText(r.notes, "");
        return n.length > 40 ? `${n.slice(0, 40)}…` : n || "—";
      },
    },
    { key: "totalDebt", header: t("clientForm.colDebt"), numeric: true, currency: true },
    ...(canManageClients
      ? [
          {
            key: "actions",
            header: "",
            clip: false,
            render: (r) => (
              <div className="erp-table-actions">
                <button
                  type="button"
                  className="erp-btn erp-btn-ghost erp-btn-sm"
                  onClick={() => {
                    setEditing(r);
                    setModalMode("edit");
                    setModalOpen(true);
                  }}
                >
                  {t("clientForm.edit")}
                </button>
                <button
                  type="button"
                  className="erp-btn erp-btn-danger erp-btn-sm"
                  onClick={() => {
                    confirm({
                      title: t("clientForm.deleteTitle"),
                      message: safeText(r.name, "—"),
                      danger: true,
                      confirmLabel: t("clientForm.deleteConfirm"),
                      onConfirm: async () => {
                        try {
                          await api.delete(
                            `/api/clients/${encodeURIComponent(String(r._id))}`
                          );
                          toast.success(t("clientForm.deleted"));
                          if (typeof onRefreshWorkspace === "function") {
                            onRefreshWorkspace();
                          }
                        } catch (err) {
                          const st = err.response && err.response.status;
                          const data = err.response && err.response.data;
                          const msg =
                            st === 400 && data && data.message
                              ? String(data.message)
                              : st === 403
                                ? t("clientForm.forbidden")
                                : apiErrorMessage(err);
                          toast.error(msg, t("clientForm.title"));
                        }
                      },
                    });
                  }}
                >
                  {t("clientForm.delete")}
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <section className="erp-section erp-section-flush-top">
      {!isAdmin && !canManageClients ? (
        <p className="erp-page-lead erp-rbac-banner" role="note">
          {t("rbac.readOnlyClients")}
        </p>
      ) : null}
      {canManageClients ? (
        <div className="erp-btn-row" style={{ marginBottom: "1rem" }}>
          <button
            type="button"
            className="erp-btn erp-btn-primary"
            onClick={() => {
              setEditing(null);
              setModalMode("create");
              setModalOpen(true);
            }}
          >
            {t("clientForm.addButton")}
          </button>
        </div>
      ) : null}
      <ErpDataTable
        columns={columns}
        rows={clients}
        getRowId={(r) => String(r?._id ?? "")}
        pageSize={12}
        loading={loading}
        showSkeleton={!initialSyncDone}
        emptyTitle={t("clientForm.emptyTitle")}
        emptyHint={
          canManageClients
            ? t("clientForm.emptyHint")
            : t("rbac.readOnlyClients")
        }
        searchPlaceholder={t("clientForm.searchPh")}
      />
      <ClientFormModal
        open={modalOpen}
        mode={modalMode}
        client={editing}
        t={t}
        toast={toast}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          if (typeof onRefreshWorkspace === "function") onRefreshWorkspace();
        }}
      />
      <ErpModuleFooter />
    </section>
  );
}

export function PaymentsView({
  payments,
  clients,
  sales,
  loading,
  initialSyncDone,
  isAdmin: _isAdmin = true,
  canCreatePayments = true,
  onRefreshWorkspace,
  toast,
}) {
  void _isAdmin;
  const { t } = useLocale();
  const [collectClientId, setCollectClientId] = useState("");
  const [collectSaleId, setCollectSaleId] = useState("");
  const [collectAmount, setCollectAmount] = useState("");
  const [collectDate, setCollectDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [collectSaving, setCollectSaving] = useState(false);

  const openSalesForClient = useMemo(() => {
    if (!collectClientId || !Array.isArray(sales)) return [];
    return sales.filter((s) => {
      const cid = s.clientId && s.clientId._id ? s.clientId._id : s.clientId;
      return String(cid) === String(collectClientId) && safeNum(s.debt, 0) > 0;
    });
  }, [sales, collectClientId]);

  const submitDebtPayment = async () => {
    if (!toast) return;
    if (!collectClientId) {
      toast.warning(t("paymentCollect.needClient"));
      return;
    }
    const amt = safeNum(collectAmount, 0);
    if (!(amt > 0)) {
      toast.warning(t("paymentCollect.needAmount"));
      return;
    }
    setCollectSaving(true);
    try {
      const body = {
        clientId: collectClientId,
        amount: amt,
        method: "CASH",
      };
      if (collectDate) {
        const d = new Date(collectDate);
        if (!Number.isNaN(d.getTime())) body.date = d.toISOString();
      }
      if (collectSaleId) body.saleId = collectSaleId;
      const res = await api.post("/api/payments", body);
      if (res.data && res.data.offlineQueued) {
        toast.info(t("app.offlineQueued"), t("paymentCollect.title"));
      } else {
        toast.success(t("paymentCollect.success"), t("paymentCollect.title"));
      }
      setCollectAmount("");
      setCollectSaleId("");
      if (typeof onRefreshWorkspace === "function") onRefreshWorkspace();
    } catch (err) {
      const st = err.response && err.response.status;
      toast.error(
        st === 403 ? t("paymentCollect.forbidden") : apiErrorMessage(err),
        t("paymentCollect.title")
      );
    } finally {
      setCollectSaving(false);
    }
  };

  const columns = [
    {
      key: "createdAt",
      header: "Date",
      searchAccessor: (r) => r.recordedAt || r.createdAt,
      render: (r) => formatDate(r.recordedAt || r.createdAt),
    },
    { key: "amount", header: "Amount", numeric: true, currency: true },
    {
      key: "method",
      header: "Method",
      render: (r) => safeText(r.method, "—"),
    },
    {
      key: "type",
      header: "Type",
      render: (r) => safeText(r.type, "—"),
    },
    {
      key: "sale",
      header: "Sale",
      searchAccessor: (r) =>
        r.saleId && r.saleId._id ? String(r.saleId._id) : "",
      render: (r) =>
        r.saleId && r.saleId._id ? (
          <span className="erp-mono">{String(r.saleId._id).slice(-8)}</span>
        ) : (
          "—"
        ),
    },
    {
      key: "client",
      header: "Client",
      searchAccessor: (r) =>
        r.clientId && r.clientId.name ? r.clientId.name : "",
      titleAccessor: (r) =>
        r.clientId && r.clientId.name ? r.clientId.name : "",
      render: (r) =>
        safeText(r.clientId && r.clientId.name ? r.clientId.name : "", "—"),
    },
  ];

  return (
    <section className="erp-section erp-section-flush-top">
      <div
        className={
          "erp-card erp-card-elevated erp-payment-collect" +
          (!canCreatePayments ? " erp-card--muted" : "")
        }
      >
        <h3 className="erp-card-label">{t("paymentCollect.title")}</h3>
        {!canCreatePayments ? (
          <p className="erp-page-lead erp-rbac-banner" role="note">
            {t("rbac.noCreatePayments")}
          </p>
        ) : null}
        <div className="erp-sale-flow-grid">
          <div className="erp-field">
            <label htmlFor="pay-collect-client">{t("paymentCollect.client")}</label>
            <select
              id="pay-collect-client"
              value={collectClientId}
              onChange={(e) => {
                setCollectClientId(e.target.value);
                setCollectSaleId("");
              }}
              disabled={collectSaving || !canCreatePayments}
            >
              <option value="">{t("saleFlow.pickClient")}</option>
              {(Array.isArray(clients) ? clients : []).map((c) => (
                <option key={c._id} value={c._id}>
                  {safeText(c.name, "—")}
                </option>
              ))}
            </select>
          </div>
          <div className="erp-field">
            <label htmlFor="pay-collect-sale">{t("paymentCollect.saleOptional")}</label>
            <select
              id="pay-collect-sale"
              value={collectSaleId}
              onChange={(e) => setCollectSaleId(e.target.value)}
              disabled={
                collectSaving || !collectClientId || !canCreatePayments
              }
            >
              <option value="">{t("paymentCollect.anySale")}</option>
              {openSalesForClient.map((s) => (
                <option key={s._id} value={s._id}>
                  {safeText(s.productId?.name, "—")} ·{" "}
                  {formatMoneyDZD(s.debt)} {t("dashboard.debt")}
                </option>
              ))}
            </select>
          </div>
          <div className="erp-field">
            <label htmlFor="pay-collect-amt">{t("paymentCollect.amount")}</label>
            <input
              id="pay-collect-amt"
              type="number"
              min={0}
              step="0.01"
              value={collectAmount}
              onChange={(e) => setCollectAmount(e.target.value)}
              disabled={collectSaving || !canCreatePayments}
            />
          </div>
          <div className="erp-field">
            <label htmlFor="pay-collect-date">{t("paymentCollect.date")}</label>
            <input
              id="pay-collect-date"
              type="date"
              value={collectDate}
              onChange={(e) => setCollectDate(e.target.value)}
              disabled={collectSaving || !canCreatePayments}
            />
          </div>
        </div>
        <div className="erp-modal__actions" style={{ marginTop: "0.75rem" }}>
          <button
            type="button"
            className="erp-btn erp-btn-primary"
            onClick={submitDebtPayment}
            disabled={
              collectSaving ||
              !canCreatePayments ||
              !collectClientId ||
              !(safeNum(collectAmount, 0) > 0)
            }
          >
            {collectSaving ? (
              <>
                <span className="erp-spinner erp-spinner--sm" aria-hidden />
                {t("paymentCollect.saving")}
              </>
            ) : (
              t("paymentCollect.submit")
            )}
          </button>
        </div>
      </div>

      <p className="erp-page-lead erp-rbac-banner" role="note">
        {t("rbac.paymentsViewOnly")}
      </p>
      <ErpDataTable
        columns={columns}
        rows={payments}
        getRowId={(r) => String(r?._id ?? "")}
        pageSize={12}
        loading={loading}
        showSkeleton={!initialSyncDone}
        emptyTitle="No payments loaded"
        emptyHint={"Payments appear as they are recorded against sales."}
        searchPlaceholder="Search payments…"
      />
      <ErpModuleFooter />
    </section>
  );
}

function formatDate(v) {
  if (v == null) return "—";
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}
