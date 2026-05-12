import { useCallback, useEffect, useState } from "react";
import api from "../api";
import ErpDataTable from "../components/ErpDataTable";
import ErpModuleFooter from "../components/ErpModuleFooter";
import { useErpUi } from "../context/ErpUiContext";
import { useLocale } from "../context/LocaleContext";
import { apiErrorMessage, safeText } from "../utils/erpFormat";

export default function AuditLogsView() {
  const { toast } = useErpUi();
  const { t } = useLocale();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/audit-logs", { params: { limit: 120 } });
      const list = Array.isArray(res.data?.items) ? res.data.items : [];
      setRows(list);
    } catch (e) {
      setRows([]);
      toast.error(apiErrorMessage(e), t("audit.title"));
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      key: "at",
      header: t("audit.colWhen"),
      searchAccessor: (r) => r.at,
      render: (r) => formatWhen(r.at),
    },
    {
      key: "action",
      header: t("audit.colAction"),
      searchAccessor: (r) => r.action,
      render: (r) => safeText(r.action, "—"),
    },
    {
      key: "entityType",
      header: t("audit.colEntity"),
      render: (r) => safeText(r.entityType, "—"),
    },
    {
      key: "entityId",
      header: t("audit.colId"),
      render: (r) =>
        r.entityId ? (
          <span className="erp-mono">{String(r.entityId).slice(-10)}</span>
        ) : (
          "—"
        ),
    },
    {
      key: "userId",
      header: t("audit.colUser"),
      render: (r) =>
        r.userId ? (
          <span className="erp-mono">{String(r.userId).slice(-8)}</span>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <section className="erp-section erp-section-flush-top">
      <div className="erp-btn-row" style={{ marginBottom: "1rem" }}>
        <button
          type="button"
          className="erp-btn erp-btn-ghost erp-btn-sm"
          onClick={load}
          disabled={loading}
        >
          {t("audit.refresh")}
        </button>
      </div>
      <h2 className="erp-section-title">{t("audit.title")}</h2>
      <p className="erp-page-lead">{t("audit.lead")}</p>
      <ErpDataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => (r.id != null ? String(r.id) : String(r.at))}
        pageSize={15}
        loading={loading}
        showSkeleton={loading}
        emptyTitle={t("audit.empty")}
        emptyHint={t("audit.emptyHint")}
        searchPlaceholder={t("audit.searchPh")}
      />
      <ErpModuleFooter />
    </section>
  );
}

function formatWhen(v) {
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
