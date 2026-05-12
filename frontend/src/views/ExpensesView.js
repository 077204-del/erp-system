import { useCallback, useEffect, useState } from "react";
import api from "../api";
import ErpDataTable from "../components/ErpDataTable";
import ErpModuleFooter from "../components/ErpModuleFooter";
import { useErpUi } from "../context/ErpUiContext";
import { useLocale } from "../context/LocaleContext";
import { apiErrorMessage, formatNumber, safeText } from "../utils/erpFormat";

function readExpenseWriteAccess() {
  try {
    const raw = localStorage.getItem("user");
    const u = raw ? JSON.parse(raw) : null;
    if (!u) return false;
    if (String(u.role || "").toLowerCase() === "admin") return true;
    const p = u.permissions;
    if (p == null) return false;
    return p.canManageExpenses === true;
  } catch {
    return false;
  }
}

function monthBoundsISO(d) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const last = new Date(y, m + 1, 0);
  const to = `${y}-${String(m + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  return { from, to, monthKey: `${y}-${String(m + 1).padStart(2, "0")}` };
}

export default function ExpensesView() {
  const { toast, confirm } = useErpUi();
  const { t } = useLocale();
  const [canWriteExpenses] = useState(() => readExpenseWriteAccess());

  const [tab, setTab] = useState("monthly");
  const initRange = monthBoundsISO(new Date());
  const [monthKey, setMonthKey] = useState(initRange.monthKey);
  const [from, setFrom] = useState(initRange.from);
  const [to, setTo] = useState(initRange.to);

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({
    totalDaily: 0,
    totalMonthly: 0,
    totalExpenses: 0,
  });
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [formCategory, setFormCategory] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setUnavailable(false);
    const typeParam = tab === "monthly" ? "monthly" : "daily";
    try {
      const [listRes, sumRes] = await Promise.all([
        api.get("/api/expenses", {
          params: { type: typeParam, from, to },
        }),
        api.get("/api/expenses/summary", { params: { month: monthKey } }),
      ]);
      setRows(Array.isArray(listRes.data) ? listRes.data : []);
      const s = sumRes.data || {};
      setSummary({
        totalDaily: Number.isFinite(Number(s.totalDaily))
          ? Number(s.totalDaily)
          : 0,
        totalMonthly: Number.isFinite(Number(s.totalMonthly))
          ? Number(s.totalMonthly)
          : 0,
        totalExpenses: Number.isFinite(Number(s.totalExpenses))
          ? Number(s.totalExpenses)
          : 0,
      });
    } catch (e) {
      setRows([]);
      setSummary({ totalDaily: 0, totalMonthly: 0, totalExpenses: 0 });
      const st = e.response && e.response.status;
      if (st === 404 || st === 405) {
        setUnavailable(true);
      } else {
        setUnavailable(false);
        toast.error(apiErrorMessage(e), t("expenses.toastTitle"));
      }
    } finally {
      setLoading(false);
    }
  }, [tab, from, to, monthKey, toast, t]);

  useEffect(() => {
    load();
  }, [load]);

  const onCreate = async () => {
    const amt = Number(formAmount);
    if (!formDescription.trim()) {
      toast.warning(t("expenses.needDesc"));
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.warning(t("expenses.needAmount"));
      return;
    }

    const body = {
      type: tab === "monthly" ? "monthly" : "daily",
      category: formCategory.trim(),
      description: formDescription.trim(),
      amount: amt,
      date: formDate,
    };

    try {
      setSaving(true);
      await api.post("/api/expenses", body);
      toast.success(t("expenses.recorded"));
      setFormDescription("");
      setFormAmount("");
      setFormCategory("");
      await load();
    } catch (e) {
      toast.error(apiErrorMessage(e), t("expenses.toastTitle"));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (row) => {
    if (!row || !row.id) return;
    confirm({
      title: t("expenses.deleteTitle"),
      message: safeText(row.description, "—"),
      confirmLabel: t("expenses.deleteConfirm"),
      danger: true,
      onConfirm: async () => {
        try {
          await api.delete(`/api/expenses/${row.id}`);
          toast.success(t("expenses.deleted"));
          await load();
        } catch (e) {
          toast.error(apiErrorMessage(e), t("expenses.toastTitle"));
        }
      },
    });
  };

  if (unavailable) {
    return (
      <section className="erp-section erp-section-flush-top">
        <div className="erp-card erp-card-elevated erp-unavailable-panel">
          <h2 className="erp-section-title">{t("expenses.unavailableTitle")}</h2>
          <p className="erp-page-lead">{t("expenses.unavailableLead")}</p>
          <span className="erp-badge erp-badge--neutral">
            {t("expenses.unavailableBadge")}
          </span>
        </div>
        <ErpModuleFooter />
      </section>
    );
  }

  const columns = [
    {
      key: "category",
      header: t("expenses.colCategory"),
      searchAccessor: (r) => r.category,
      render: (r) => safeText(r.category, "—"),
    },
    {
      key: "amount",
      header: t("expenses.colAmount"),
      numeric: true,
      render: (r) => (
        <span className="erp-num">{formatNumber(r.amount)}</span>
      ),
    },
    {
      key: "date",
      header: t("expenses.colDate"),
      render: (r) =>
        r.date ? safeText(String(r.date).slice(0, 10), "—") : "—",
    },
    {
      key: "type",
      header: t("expenses.colType"),
      render: (r) => safeText(r.type, "—"),
    },
    {
      key: "description",
      header: t("expenses.colDesc"),
      searchAccessor: (r) => r.description,
      render: (r) => safeText(r.description, "—"),
    },
  ];

  if (canWriteExpenses) {
    columns.push({
      key: "actions",
      header: "",
      clip: false,
      render: (r) => (
        <button
          type="button"
          className="erp-btn erp-btn-ghost erp-btn-sm"
          onClick={() => onDelete(r)}
        >
          {t("expenses.deleteConfirm")}
        </button>
      ),
    });
  }

  return (
    <section className="erp-section erp-section-flush-top">
      <h2 className="erp-section-title">{t("expenses.title")}</h2>
      <p className="erp-page-lead">{t("expenses.lead")}</p>

      <div className="erp-btn-row" style={{ marginBottom: "0.75rem" }}>
        <button
          type="button"
          className={
            tab === "monthly"
              ? "erp-btn erp-btn-primary erp-btn-sm"
              : "erp-btn erp-btn-ghost erp-btn-sm"
          }
          onClick={() => setTab("monthly")}
        >
          {t("expenses.monthlyTab")}
        </button>
        <button
          type="button"
          className={
            tab === "daily"
              ? "erp-btn erp-btn-primary erp-btn-sm"
              : "erp-btn erp-btn-ghost erp-btn-sm"
          }
          onClick={() => setTab("daily")}
        >
          {t("expenses.dailyTab")}
        </button>
      </div>

      <div className="erp-page-toolbar" aria-label="Expense filters">
        <div className="erp-filter erp-filter--inline">
          <div className="erp-field">
            <label htmlFor="erp-exp-month-sum">{t("expenses.summaryMonth")}</label>
            <input
              id="erp-exp-month-sum"
              type="month"
              value={monthKey}
              onChange={(e) => {
                const mk = e.target.value;
                const d = new Date(`${mk}-01T12:00:00`);
                const b = monthBoundsISO(d);
                setMonthKey(mk);
                setFrom(b.from);
                setTo(b.to);
              }}
              disabled={loading}
            />
          </div>
          <div className="erp-field">
            <label htmlFor="erp-exp-from">{t("expenses.from")}</label>
            <input
              id="erp-exp-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="erp-field">
            <label htmlFor="erp-exp-to">{t("expenses.to")}</label>
            <input
              id="erp-exp-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="erp-btn-row">
            <button
              type="button"
              className="erp-btn erp-btn-ghost erp-btn-sm"
              onClick={() => load()}
              disabled={loading}
            >
              {t("expenses.refresh")}
            </button>
          </div>
        </div>
      </div>

      <div className="erp-kpi-grid" style={{ marginBottom: "1rem" }}>
        <div className="erp-card erp-card-kpi">
          <p className="erp-card-label">{t("expenses.dailyMonthKpi")}</p>
          <p className="erp-card-value erp-num">
            {formatNumber(summary.totalDaily)}
          </p>
        </div>
        <div className="erp-card erp-card-kpi">
          <p className="erp-card-label">{t("expenses.monthlyMonthKpi")}</p>
          <p className="erp-card-value erp-num">
            {formatNumber(summary.totalMonthly)}
          </p>
        </div>
        <div className="erp-card erp-card-kpi">
          <p className="erp-card-label">{t("expenses.totalMonthKpi")}</p>
          <p className="erp-card-value erp-num">
            {formatNumber(summary.totalExpenses)}
          </p>
        </div>
      </div>

      {canWriteExpenses ? (
        <div className="erp-card erp-card-elevated" style={{ marginBottom: "1rem" }}>
          <p className="erp-card-label">
            {t("expenses.addExpense")}{" "}
            {tab === "monthly"
              ? `(${t("expenses.monthlyTab")})`
              : `(${t("expenses.dailyTab")})`}
          </p>
          <div className="erp-filter erp-filter--inline">
            <div className="erp-field">
              <label htmlFor="exp-desc">{t("expenses.desc")}</label>
              <input
                id="exp-desc"
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder={
                  tab === "monthly"
                    ? t("expenses.phDescMonthly")
                    : t("expenses.phDescDaily")
                }
              />
            </div>
            <div className="erp-field">
              <label htmlFor="exp-amt">{t("expenses.amount")}</label>
              <input
                id="exp-amt"
                type="number"
                min="0"
                step="0.01"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
              />
            </div>
            <div className="erp-field">
              <label htmlFor="exp-cat">{t("expenses.category")}</label>
              <input
                id="exp-cat"
                type="text"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                placeholder={t("expenses.phCategory")}
              />
            </div>
            <div className="erp-field">
              <label htmlFor="exp-date">{t("expenses.date")}</label>
              <input
                id="exp-date"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>
            <div className="erp-btn-row" style={{ alignSelf: "flex-end" }}>
              <button
                type="button"
                className="erp-btn erp-btn-primary erp-btn-sm"
                onClick={onCreate}
                disabled={saving}
              >
                {saving ? t("expenses.saving") : t("expenses.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ErpDataTable
        title={t("expenses.records")}
        columns={columns}
        rows={rows}
        loading={loading}
        showSkeleton={loading}
        emptyHint={t("expenses.noExpenses")}
      />
      <ErpModuleFooter />
    </section>
  );
}
