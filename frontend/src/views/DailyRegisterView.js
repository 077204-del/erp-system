import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api";
import ErpModuleFooter from "../components/ErpModuleFooter";
import { useLocale } from "../context/LocaleContext";
import {
  buildRegisterEvents,
  expenseRowsToRegisterEvents,
} from "../utils/erpAggregates";
import { formatNumber, safeText } from "../utils/erpFormat";

function todayIso() {
  const t = new Date();
  return t.toISOString().slice(0, 10);
}

function parseDay(iso) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDayEnd(iso) {
  if (!iso) return null;
  const d = new Date(iso + "T23:59:59.999");
  return Number.isNaN(d.getTime()) ? null : d;
}

function isSameCalendarDay(iso, d) {
  if (!iso || !d) return false;
  try {
    return d.toISOString().slice(0, 10) === iso;
  } catch {
    return false;
  }
}

export default function DailyRegisterView({
  sales,
  payments,
  onRefresh,
  loading,
  canViewFinancial = false,
}) {
  const { t } = useLocale();
  const [registerDate, setRegisterDate] = useState(() => todayIso());
  const [summary, setSummary] = useState({
    salesTotal: 0,
    paymentsTotal: 0,
    expensesTotal: 0,
    cashIn: 0,
    netCash: 0,
  });
  const [expenseRows, setExpenseRows] = useState([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [summaryUnavailable, setSummaryUnavailable] = useState(false);

  const loadDay = useCallback(async () => {
    setApiLoading(true);
    setSummaryUnavailable(false);
    try {
      const [sumRes, expRes] = await Promise.allSettled([
        api.get("/api/reports/daily-register", {
          params: { date: registerDate },
        }),
        canViewFinancial
          ? api.get("/api/expenses", {
              params: { from: registerDate, to: registerDate },
            })
          : Promise.resolve({ status: "fulfilled", value: { data: [] } }),
      ]);

      if (sumRes.status === "fulfilled" && sumRes.value.data) {
        const d = sumRes.value.data;
        setSummary({
          salesTotal: Number.isFinite(Number(d.salesTotal))
            ? Number(d.salesTotal)
            : 0,
          paymentsTotal: Number.isFinite(Number(d.paymentsTotal))
            ? Number(d.paymentsTotal)
            : 0,
          expensesTotal: Number.isFinite(Number(d.expensesTotal))
            ? Number(d.expensesTotal)
            : 0,
          cashIn: Number.isFinite(Number(d.cashIn)) ? Number(d.cashIn) : 0,
          netCash: Number.isFinite(Number(d.netCash)) ? Number(d.netCash) : 0,
        });
      } else {
        setSummary({
          salesTotal: 0,
          paymentsTotal: 0,
          expensesTotal: 0,
          cashIn: 0,
          netCash: 0,
        });
        setSummaryUnavailable(true);
      }

      if (expRes.status === "fulfilled" && Array.isArray(expRes.value.data)) {
        setExpenseRows(expRes.value.data);
      } else {
        setExpenseRows([]);
      }
    } catch {
      setSummaryUnavailable(true);
      setExpenseRows([]);
    } finally {
      setApiLoading(false);
    }
  }, [registerDate, canViewFinancial]);

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  const dayStart = parseDay(registerDate);
  const dayEnd = parseDayEnd(registerDate);

  const filteredSales = useMemo(() => {
    if (!Array.isArray(sales) || !dayStart || !dayEnd) return [];
    return sales.filter((s) => {
      const at = new Date(s.saleDate || s.createdAt || 0);
      if (Number.isNaN(at.getTime())) return false;
      return at >= dayStart && at <= dayEnd;
    });
  }, [sales, dayStart, dayEnd]);

  const filteredPayments = useMemo(() => {
    if (!Array.isArray(payments) || !dayStart || !dayEnd) return [];
    return payments.filter((p) => {
      const at = new Date(p.createdAt || 0);
      if (Number.isNaN(at.getTime())) return false;
      return at >= dayStart && at <= dayEnd;
    });
  }, [payments, dayStart, dayEnd]);

  const events = useMemo(() => {
    const base = buildRegisterEvents(filteredSales, filteredPayments);
    const exp = canViewFinancial
      ? expenseRowsToRegisterEvents(expenseRows).filter((e) =>
          isSameCalendarDay(registerDate, e.at)
        )
      : [];
    return [...base, ...exp].sort((a, b) => b.at - a.at);
  }, [filteredSales, filteredPayments, expenseRows, registerDate, canViewFinancial]);

  const exportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      registerDate,
      summary,
      timeline: events.map((e) => ({
        kind: e.kind,
        at: e.at.toISOString(),
        label: e.label,
        detail: e.detail,
        amount: Number.isFinite(Number(e.amount)) ? Number(e.amount) : 0,
        expenseType: e.expenseType || null,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `daily-register-${registerDate}.json`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 3000);
  };

  return (
    <section className="erp-section erp-section-flush-top">
      <h2 className="erp-section-title">{t("register.title")}</h2>
      <p className="erp-page-lead">{t("register.lead")}</p>

      <div className="erp-filter erp-filter--inline erp-register-toolbar">
        <div className="erp-field">
          <label htmlFor="reg-day">{t("register.dateLabel")}</label>
          <input
            id="reg-day"
            type="date"
            value={registerDate}
            onChange={(e) => setRegisterDate(e.target.value)}
          />
        </div>
        <div className="erp-btn-row">
          <button
            type="button"
            className="erp-btn erp-btn-ghost erp-btn-sm"
            onClick={() => loadDay()}
            disabled={loading || apiLoading}
          >
            {apiLoading ? t("register.refreshing") : t("register.refreshDay")}
          </button>
          <button
            type="button"
            className="erp-btn erp-btn-ghost erp-btn-sm"
            onClick={onRefresh}
            disabled={loading}
          >
            {t("register.refreshWs")}
          </button>
          <button
            type="button"
            className="erp-btn erp-btn-primary erp-btn-sm"
            onClick={exportJson}
            disabled={apiLoading}
          >
            {t("register.exportJson")}
          </button>
        </div>
      </div>

      <div className="erp-kpi-grid" style={{ marginBottom: "1rem" }}>
        <div className="erp-card erp-card-kpi">
          <p className="erp-card-label">{t("register.salesTotal")}</p>
          <p className="erp-card-value erp-num">
            {formatNumber(summary.salesTotal)}
          </p>
          {summaryUnavailable ? (
            <p className="erp-card-hint">{t("register.apiUnavailable")}</p>
          ) : null}
        </div>
        <div className="erp-card erp-card-kpi">
          <p className="erp-card-label">{t("register.paymentsCash")}</p>
          <p className="erp-card-value erp-num">
            {formatNumber(summary.cashIn)}
          </p>
        </div>
        {canViewFinancial ? (
          <div className="erp-card erp-card-kpi">
            <p className="erp-card-label">{t("register.expensesDay")}</p>
            <p className="erp-card-value erp-num">
              {formatNumber(summary.expensesTotal)}
            </p>
          </div>
        ) : null}
        <div className="erp-card erp-card-kpi">
          <p className="erp-card-label">{t("register.netCash")}</p>
          <p className="erp-card-value erp-num">
            {formatNumber(summary.netCash)}
          </p>
        </div>
      </div>

      <div className="erp-timeline">
        {events.length === 0 ? (
          <div className="erp-card erp-card-elevated erp-timeline-empty">
            <p>{t("register.noMovements")}</p>
            <p className="erp-card-hint">{t("register.hintRefresh")}</p>
          </div>
        ) : (
          events.map((e) => (
            <div
              key={`${e.kind}-${e.id}-${e.at.getTime()}`}
              className={
                "erp-timeline-item" +
                (e.kind === "payment"
                  ? " erp-timeline-item--payment"
                  : e.kind === "expense"
                    ? " erp-timeline-item--muted"
                    : " erp-timeline-item--sale")
              }
            >
              <div className="erp-timeline-dot" aria-hidden />
              <div className="erp-timeline-body">
                <div className="erp-timeline-head">
                  <span className="erp-badge erp-badge--neutral">
                    {e.kind === "payment"
                      ? t("register.kindPayment")
                      : e.kind === "expense"
                        ? t("register.kindExpense")
                        : t("register.kindSale")}
                  </span>
                  <time className="erp-timeline-time">
                    {e.at.toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </div>
                <p className="erp-timeline-label">{safeText(e.label, "—")}</p>
                <p className="erp-timeline-detail">{safeText(e.detail, "")}</p>
                <div className="erp-timeline-amounts">
                  <span className="erp-timeline-amt">
                    {e.kind === "sale" ? t("register.total") : t("register.amount")}
                    <strong className="erp-num">{formatNumber(e.amount)}</strong>
                  </span>
                  {e.kind === "sale" && e.debt > 0 ? (
                    <span className="erp-timeline-debt">
                      {t("register.debt")}
                      <strong className="erp-num">{formatNumber(e.debt)}</strong>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <ErpModuleFooter />
    </section>
  );
}
