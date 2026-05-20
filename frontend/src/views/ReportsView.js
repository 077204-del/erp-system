import { useEffect, useMemo, useState } from "react";
import api from "../api";
import { freshGetConfig, workspaceGetParams } from "../config/apiRequest";
import ErpModuleFooter from "../components/ErpModuleFooter";
import { useLocale } from "../context/LocaleContext";
import { groupSalesByDay, groupSalesByMonth } from "../utils/erpAggregates";
import { formatMoneyDZD, formatNumber, safeNum, safeText } from "../utils/erpFormat";
import { mapReportsApiToState } from "../utils/reportsFinance";

function parseRangeBounds(fromIso, toIso) {
  const a = new Date(`${fromIso}T00:00:00`);
  const b = new Date(`${toIso}T23:59:59.999`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return { start: a.getTime(), end: b.getTime() };
}

function paymentsInRange(payments, fromIso, toIso) {
  const b = parseRangeBounds(fromIso, toIso);
  if (!b || !Array.isArray(payments)) return [];
  return payments.filter((p) => {
    const t = new Date(p.recordedAt || p.createdAt || 0).getTime();
    if (Number.isNaN(t)) return false;
    return t >= b.start && t <= b.end;
  });
}

export default function ReportsView({
  sales,
  payments,
  from,
  to,
  canViewFinancialKpis = false,
  isAdmin = false,
  onFromChange,
  onToChange,
  onApplyDates,
  onReportPreset,
  cashierId = "",
  onCashierChange,
  cashiers = [],
}) {
  const { t } = useLocale();
  const todayIso = new Date().toISOString().slice(0, 10);
  const reportFrom =
    from && String(from).trim() ? String(from).trim() : todayIso;
  const reportTo = to && String(to).trim() ? String(to).trim() : reportFrom;
  const [serverReport, setServerReport] = useState(null);
  const showCashierDropdown = isAdmin === true;
  const showFinancialReportKpis = canViewFinancialKpis === true;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = workspaceGetParams({
          from: reportFrom,
          to: reportTo,
        });
        if (showCashierDropdown && cashierId) {
          params.cashierId = cashierId;
        }
        const res = await api.get("/api/reports", {
          ...freshGetConfig(),
          params,
        });
        if (!cancelled && res.data) {
          setServerReport(res.data);
        }
      } catch {
        if (!cancelled) setServerReport(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportFrom, reportTo, cashierId, showCashierDropdown]);

  const reportKpis = useMemo(
    () => mapReportsApiToState(serverReport),
    [serverReport]
  );

  const byDay = useMemo(() => groupSalesByDay(sales), [sales]);
  const byMonth = useMemo(() => groupSalesByMonth(sales), [sales]);

  const cashCredit = useMemo(() => {
    const cvc = reportKpis?.cashVsCredit;
    if (!cvc) return { cash: 0, credit: 0, mixed: 0 };
    return {
      cash: safeNum(cvc.cashSales),
      credit: safeNum(cvc.creditSales),
      mixed: safeNum(cvc.mixed),
    };
  }, [reportKpis]);

  const topProd = useMemo(() => {
    const tp = reportKpis?.topProducts;
    if (!Array.isArray(tp) || !tp.length) return [];
    return tp.slice(0, 6).map((p) => ({
      name: p.name,
      revenue: p.revenue,
    }));
  }, [reportKpis]);

  const topCli = useMemo(() => {
    const tc = reportKpis?.topClients;
    if (!Array.isArray(tc) || !tc.length) return [];
    return tc.slice(0, 6).map((c) => ({
      name: c.name,
      revenue: c.revenue,
    }));
  }, [reportKpis]);

  const payFiltered = useMemo(
    () => paymentsInRange(payments, reportFrom, reportTo),
    [payments, reportFrom, reportTo]
  );
  const payCount = payFiltered.length;

  const maxDayRev = useMemo(() => {
    if (!byDay.length) return 1;
    return Math.max(...byDay.map((d) => d.revenue), 1);
  }, [byDay]);

  const expDaily = reportKpis?.expensesBreakdown?.daily ?? 0;
  const expMonthly = reportKpis?.expensesBreakdown?.monthly ?? 0;
  const repCashIn = reportKpis?.cashIn ?? 0;
  const repNetProfit = reportKpis?.netProfit ?? 0;
  const cvc = reportKpis?.cashVsCredit;
  const cashPct =
    cvc && Number.isFinite(Number(cvc.ratioCash))
      ? Math.round(Number(cvc.ratioCash) * 100)
      : null;

  return (
    <section className="erp-section erp-section-flush-top">
      <h2 className="erp-section-title">{t("reports.title")}</h2>
      <p className="erp-page-lead">
        {t("reports.lead")}
        {!reportKpis ? (
          <span> {t("reports.unavailable")}</span>
        ) : null}
      </p>
      <p className="erp-card-hint" role="note">
        {t("reports.rangeHint")}
      </p>

      <section
        className="erp-page-toolbar erp-reports-toolbar"
        aria-label={t("dashboard.period")}
        style={{ marginBottom: "0.75rem" }}
      >
        <div className="erp-filter erp-filter--inline">
          <div className="erp-field">
            <label htmlFor="rep-from">{t("dashboard.from")}</label>
            <input
              id="rep-from"
              type="date"
              value={from}
              onChange={(e) =>
                typeof onFromChange === "function" &&
                onFromChange(e.target.value)
              }
            />
          </div>
          <div className="erp-field">
            <label htmlFor="rep-to">{t("dashboard.to")}</label>
            <input
              id="rep-to"
              type="date"
              value={to}
              onChange={(e) =>
                typeof onToChange === "function" &&
                onToChange(e.target.value)
              }
            />
          </div>
          {showCashierDropdown ? (
            <div className="erp-field">
              <label htmlFor="rep-cashier">{t("reports.cashierFilter")}</label>
              <select
                id="rep-cashier"
                value={cashierId || ""}
                onChange={(e) =>
                  typeof onCashierChange === "function" &&
                  onCashierChange(e.target.value)
                }
              >
                <option value="">{t("reports.allCashiers")}</option>
                {(Array.isArray(cashiers) ? cashiers : []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {safeText(c.username, c.id)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        <div className="erp-btn-row">
          <button
            type="button"
            className="erp-btn erp-btn-ghost erp-btn-sm"
            onClick={() =>
              typeof onReportPreset === "function" && onReportPreset("today")
            }
          >
            {t("reports.presetToday")}
          </button>
          <button
            type="button"
            className="erp-btn erp-btn-ghost erp-btn-sm"
            onClick={() =>
              typeof onReportPreset === "function" && onReportPreset("week")
            }
          >
            {t("reports.presetWeek")}
          </button>
          <button
            type="button"
            className="erp-btn erp-btn-primary erp-btn-sm"
            onClick={() =>
              typeof onApplyDates === "function" && onApplyDates()
            }
          >
            {t("reports.applyDates")}
          </button>
        </div>
      </section>
      {reportKpis && showFinancialReportKpis ? (
        <div className="erp-kpi-grid" style={{ marginBottom: "1rem" }}>
          <div className="erp-card erp-card-kpi">
            <p className="erp-card-label">{t("reports.expDaily")}</p>
            <p className="erp-card-value erp-num">
              {formatMoneyDZD(Number.isFinite(expDaily) ? expDaily : 0)}
            </p>
            <p className="erp-card-hint">{t("reports.kpiRangeHint")}</p>
          </div>
          <div className="erp-card erp-card-kpi">
            <p className="erp-card-label">{t("reports.expMonthly")}</p>
            <p className="erp-card-value erp-num">
              {formatMoneyDZD(Number.isFinite(expMonthly) ? expMonthly : 0)}
            </p>
            <p className="erp-card-hint">{t("reports.kpiAllocHint")}</p>
          </div>
          <div className="erp-card erp-card-kpi">
            <p className="erp-card-label">{t("dashboard.totalCashIn")}</p>
            <p className="erp-card-value erp-num">
              {formatMoneyDZD(Number.isFinite(repCashIn) ? repCashIn : 0)}
            </p>
            <p className="erp-card-hint">{t("dashboard.totalCashInHint")}</p>
          </div>
          <div className="erp-card erp-card-kpi">
            <p className="erp-card-label">{t("dashboard.realProfit")}</p>
            <p className="erp-card-value erp-num">
              {formatMoneyDZD(Number.isFinite(repNetProfit) ? repNetProfit : 0)}
            </p>
            <p className="erp-card-hint">{t("dashboard.realProfitHint")}</p>
          </div>
          <div className="erp-card erp-card-kpi">
            <p className="erp-card-label">{t("reports.cashShare")}</p>
            <p className="erp-card-value erp-num">
              {cashPct != null ? `${cashPct}%` : "—"}
            </p>
            <p className="erp-card-hint">{t("reports.kpiCashShareHint")}</p>
          </div>
        </div>
      ) : null}

      <div className="erp-reports-grid">
        <div className="erp-card erp-card-elevated">
          <p className="erp-card-label">{t("reports.cashVsCredit")}</p>
          <div className="erp-report-bars">
            <div className="erp-report-bar-row">
              <span>{t("reports.cashLike")}</span>
              <div className="erp-report-bar-track">
                <div
                  className="erp-report-bar-fill erp-report-bar-fill--primary"
                  style={{
                    width: `${pct(cashCredit.cash, cashCredit.cash + cashCredit.credit + cashCredit.mixed)}%`,
                  }}
                />
              </div>
              <span className="erp-report-bar-val erp-num">
                {formatMoneyDZD(cashCredit.cash)}
              </span>
            </div>
            <div className="erp-report-bar-row">
              <span>{t("reports.creditDebt")}</span>
              <div className="erp-report-bar-track">
                <div
                  className="erp-report-bar-fill erp-report-bar-fill--warn"
                  style={{
                    width: `${pct(cashCredit.credit, cashCredit.cash + cashCredit.credit + cashCredit.mixed)}%`,
                  }}
                />
              </div>
              <span className="erp-report-bar-val erp-num">
                {formatMoneyDZD(cashCredit.credit)}
              </span>
            </div>
            <div className="erp-report-bar-row">
              <span>{t("reports.other")}</span>
              <div className="erp-report-bar-track">
                <div
                  className="erp-report-bar-fill erp-report-bar-fill--muted"
                  style={{
                    width: `${pct(cashCredit.mixed, cashCredit.cash + cashCredit.credit + cashCredit.mixed)}%`,
                  }}
                />
              </div>
              <span className="erp-report-bar-val erp-num">
                {formatMoneyDZD(cashCredit.mixed)}
              </span>
            </div>
          </div>
          <p className="erp-card-hint">
            {t("reports.paymentsRegister")}{" "}
            <span className="erp-num">{formatNumber(payCount)}</span>
            {reportKpis && canViewFinancialKpis ? (
              <>
                {" "}
                · {t("reports.ledgerRev")}{" "}
                <span className="erp-num">
                  {formatMoneyDZD(reportKpis.revenue)}
                </span>{" "}
                · {t("reports.cashInSuffix")}{" "}
                <span className="erp-num">
                  {formatMoneyDZD(reportKpis.cashIn)}
                </span>
              </>
            ) : null}
          </p>
        </div>

        <div className="erp-card erp-card-elevated">
          <p className="erp-card-label">{t("reports.dailySales")}</p>
          <div className="erp-report-daily">
            {byDay.length === 0 ? (
              <p className="erp-card-hint">{t("reports.noData")}</p>
            ) : (
              byDay.slice(0, 10).map((d) => (
                <div key={d.date} className="erp-report-daily-row">
                  <span className="erp-mono">{d.date}</span>
                  <div className="erp-report-bar-track erp-report-bar-track--sm">
                    <div
                      className="erp-report-bar-fill erp-report-bar-fill--primary"
                      style={{
                        width: `${Math.round((d.revenue / maxDayRev) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="erp-report-bar-val erp-num">
                    {formatMoneyDZD(d.revenue)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="erp-card erp-card-elevated">
          <p className="erp-card-label">{t("reports.monthlySummary")}</p>
          <div className="erp-report-daily">
            {byMonth.length === 0 ? (
              <p className="erp-card-hint">{t("reports.noData")}</p>
            ) : (
              byMonth.slice(0, 6).map((m) => (
                <div key={m.month} className="erp-report-daily-row">
                  <span className="erp-mono">{m.month}</span>
                  <div className="erp-report-bar-track erp-report-bar-track--sm">
                    <div
                      className="erp-report-bar-fill erp-report-bar-fill--primary"
                      style={{
                        width: `${Math.round(
                          (m.revenue /
                            Math.max(
                              ...byMonth.map((x) => x.revenue),
                              1
                            )) *
                            100
                        )}%`,
                      }}
                    />
                  </div>
                  <span className="erp-report-bar-val erp-num">
                    {formatMoneyDZD(m.revenue)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="erp-card erp-card-elevated">
          <p className="erp-card-label">{t("reports.topProducts")}</p>
          <ul className="erp-report-rank">
            {topProd.length === 0 ? (
              <li className="erp-card-hint">{t("reports.noData")}</li>
            ) : (
              topProd.map((p, i) => (
                <li key={i} className="erp-report-rank-item">
                  <span className="erp-report-rank-idx">{i + 1}</span>
                  <span className="erp-report-rank-name">
                    {safeText(p.name, "—")}
                  </span>
                  <span className="erp-report-rank-num erp-num">
                    {formatMoneyDZD(p.revenue)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="erp-card erp-card-elevated">
          <p className="erp-card-label">{t("reports.topClients")}</p>
          <ul className="erp-report-rank">
            {topCli.length === 0 ? (
              <li className="erp-card-hint">{t("reports.noData")}</li>
            ) : (
              topCli.map((c, i) => (
                <li key={i} className="erp-report-rank-item">
                  <span className="erp-report-rank-idx">{i + 1}</span>
                  <span className="erp-report-rank-name">
                    {safeText(c.name, "—")}
                  </span>
                  <span className="erp-report-rank-num erp-num">
                    {formatMoneyDZD(c.revenue)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
      <ErpModuleFooter />
    </section>
  );
}

function pct(part, total) {
  const p = Number(part) || 0;
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  return Math.min(100, Math.round((p / t) * 100));
}
