import { useMemo, useState } from "react";
import ErpDataTable from "../components/ErpDataTable";
import ErpModuleFooter from "../components/ErpModuleFooter";
import { useLocale } from "../context/LocaleContext";
import { buildClientDebtRows } from "../utils/erpAggregates";
import { formatNumber, safeText } from "../utils/erpFormat";

export default function ClientDebtView({ clients, sales, payments }) {
  const { t } = useLocale();
  const [debtFilter, setDebtFilter] = useState("all");

  const filters = useMemo(
    () => [
      { id: "all", label: t("clientDebt.filterAll") },
      { id: "high", label: t("clientDebt.filterHigh") },
      { id: "none", label: t("clientDebt.filterNone") },
    ],
    [t]
  );

  const rows = useMemo(() => {
    const base = buildClientDebtRows(clients, sales, payments);
    if (debtFilter === "high") {
      return base.filter((r) => r.debt > 500);
    }
    if (debtFilter === "none") {
      return base.filter((r) => r.debt <= 0);
    }
    return base;
  }, [clients, sales, payments, debtFilter]);

  const columns = [
    {
      key: "name",
      header: t("clientDebt.colClient"),
      searchAccessor: (r) => r.client?.name,
      render: (r) => safeText(r.client?.name, "—"),
    },
    {
      key: "phone",
      header: t("clientDebt.colPhone"),
      searchAccessor: (r) => r.client?.phone,
      render: (r) => safeText(r.client?.phone, "—"),
    },
    {
      key: "totalPaid",
      header: t("clientDebt.colPaid"),
      numeric: true,
      render: (r) => (
        <span className="erp-num">{formatNumber(r.totalPaid)}</span>
      ),
    },
    {
      key: "debt",
      header: t("clientDebt.colDebt"),
      numeric: true,
      clip: false,
      render: (r) => {
        const d = r.debt;
        const cls =
          d > 500
            ? "erp-badge erp-badge--danger-soft"
            : d > 0
              ? "erp-badge erp-badge--warning"
              : "erp-badge erp-badge--success";
        return (
          <span className={cls}>
            <span className="erp-num">{formatNumber(d)}</span>
          </span>
        );
      },
    },
    {
      key: "last",
      header: t("clientDebt.colLast"),
      searchAccessor: (r) =>
        r.lastTransactionAt ? r.lastTransactionAt.toISOString() : "",
      render: (r) =>
        r.lastTransactionAt
          ? r.lastTransactionAt.toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : "—",
    },
  ];

  return (
    <section className="erp-section erp-section-flush-top">
      <h2 className="erp-section-title">{t("clientDebt.title")}</h2>
      <p className="erp-page-lead">{t("clientDebt.lead")}</p>
      <div className="erp-debt-filters">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className={
              debtFilter === f.id
                ? "erp-btn erp-btn-primary erp-btn-sm"
                : "erp-btn erp-btn-ghost erp-btn-sm"
            }
            onClick={() => setDebtFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <ErpDataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r._id}
        pageSize={12}
        loading={false}
        showSkeleton={false}
        emptyTitle={t("clientDebt.emptyTitle")}
        emptyHint={t("clientDebt.emptyHint")}
        searchPlaceholder={t("clientDebt.searchPh")}
      />
      <ErpModuleFooter />
    </section>
  );
}
