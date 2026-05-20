import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api";
import { freshGetConfig, workspaceGetParams } from "../config/apiRequest";
import ErpModuleFooter from "../components/ErpModuleFooter";
import { useLocale } from "../context/LocaleContext";
import { mapCashClosingApiToState } from "../utils/cashClosingFinance";
import { parseMoney } from "../utils/financialIntegrity";
import { apiErrorMessage, formatMoneyDZD, formatNumber } from "../utils/erpFormat";

function hasDisplayAmount(v) {
  return v !== undefined && v !== null && Number.isFinite(Number(v));
}

export default function CashClosingView({
  from,
  to,
  canViewFinancial = false,
}) {
  const { t } = useLocale();
  const [closing, setClosing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadClosing = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/api/cash-closing", {
        ...freshGetConfig(),
        params: workspaceGetParams({ from, to }),
      });
      setClosing(mapCashClosingApiToState(res.data));
    } catch (err) {
      setClosing(null);
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    loadClosing();
  }, [loadClosing]);

  const showFinancial =
    canViewFinancial && closing?.hasFinancialKpis === true;

  const cashSales = parseMoney(closing?.cashSales);
  const debtPayments = parseMoney(closing?.debtPayments);
  const cashIn = parseMoney(closing?.cashIn);
  const profitDelta = closing?.profitIdentityDelta;
  const profitConsistent =
    profitDelta == null || Math.abs(Number(profitDelta)) < 0.01;

  const recon = useMemo(() => {
    const sum = cashSales + debtPayments;
    return { sum, total: cashIn, diff: cashIn - sum };
  }, [cashSales, debtPayments, cashIn]);

  const exportClosing = () => {
    if (!closing) return;
    const lines = [
      t("cashClosing.title"),
      `${t("cashClosing.rangeHint")} ${from} → ${to}`,
      new Date().toISOString(),
      "",
      `${t("cashClosing.cashSales")}: ${formatMoneyDZD(cashSales)}`,
      `${t("cashClosing.debtPay")}: ${formatMoneyDZD(debtPayments)}`,
      `${t("cashClosing.rowSum")}: ${formatMoneyDZD(recon.sum)}`,
      `${t("cashClosing.rowTotal")}: ${formatMoneyDZD(recon.total)}`,
      `${t("cashClosing.rowDiff")}: ${formatMoneyDZD(recon.diff)}`,
      "",
      `${t("cashClosing.saleCount")}: ${formatNumber(
        hasDisplayAmount(closing.countSales) ? Number(closing.countSales) : 0
      )}`,
      ...(showFinancial
        ? [
            ...(hasDisplayAmount(closing.totalExpenses)
              ? [
                  `${t("cashClosing.totalExpenses")}: ${formatMoneyDZD(Number(closing.totalExpenses))}`,
                ]
              : []),
            ...(hasDisplayAmount(closing.grossProfit)
              ? [
                  `${t("cashClosing.grossProfit")}: ${formatMoneyDZD(Number(closing.grossProfit))}`,
                ]
              : []),
            ...(hasDisplayAmount(closing.netProfit)
              ? [
                  `${t("cashClosing.netProfit")}: ${formatMoneyDZD(Number(closing.netProfit))}`,
                ]
              : []),
            ...(hasDisplayAmount(closing.totalDebt)
              ? [
                  `${t("cashClosing.debt")}: ${formatMoneyDZD(Number(closing.totalDebt))}`,
                ]
              : []),
          ]
        : []),
      "",
      "Created by Habbal Hakim",
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `cash-closing-${from}-${to}.txt`;
    a.click();
    URL.revokeObjectURL(href);
  };

  if (loading && !closing) {
    return (
      <section className="erp-section erp-section-flush-top">
        <h2 className="erp-section-title">{t("cashClosing.title")}</h2>
        <p className="erp-page-lead">{t("cashClosing.loading")}</p>
        <ErpModuleFooter />
      </section>
    );
  }

  if (error && !closing) {
    return (
      <section className="erp-section erp-section-flush-top">
        <h2 className="erp-section-title">{t("cashClosing.title")}</h2>
        <p className="erp-page-lead erp-rbac-banner" role="alert">
          {error}
        </p>
        <button
          type="button"
          className="erp-btn erp-btn-primary erp-btn-sm"
          onClick={loadClosing}
        >
          {t("cashClosing.retry")}
        </button>
        <ErpModuleFooter />
      </section>
    );
  }

  if (!closing) {
    return (
      <section className="erp-section erp-section-flush-top">
        <h2 className="erp-section-title">{t("cashClosing.title")}</h2>
        <p className="erp-page-lead">{t("cashClosing.unavailable")}</p>
        <button
          type="button"
          className="erp-btn erp-btn-primary erp-btn-sm"
          onClick={loadClosing}
        >
          {t("cashClosing.retry")}
        </button>
        <ErpModuleFooter />
      </section>
    );
  }

  return (
    <section className="erp-section erp-section-flush-top">
      <h2 className="erp-section-title">{t("cashClosing.title")}</h2>
      <p className="erp-page-lead">{t("cashClosing.lead")}</p>
      <div className="erp-btn-row" style={{ marginBottom: "0.75rem" }}>
        <button
          type="button"
          className="erp-btn erp-btn-ghost erp-btn-sm"
          onClick={loadClosing}
          disabled={loading}
        >
          {loading ? t("cashClosing.refreshing") : t("cashClosing.refresh")}
        </button>
      </div>

      <div className="erp-closing-grid">
        <div className="erp-card erp-card-elevated">
          <p className="erp-card-label">{t("cashClosing.cashSales")}</p>
          <p className="erp-card-value erp-num">
            {formatMoneyDZD(cashSales)}
          </p>
        </div>
        <div className="erp-card erp-card-elevated">
          <p className="erp-card-label">{t("cashClosing.debtPay")}</p>
          <p className="erp-card-value erp-num">
            {formatMoneyDZD(debtPayments)}
          </p>
        </div>
        <div className="erp-card erp-card-elevated">
          <p className="erp-card-label">{t("cashClosing.totalCashIn")}</p>
          <p className="erp-card-value erp-num">{formatMoneyDZD(cashIn)}</p>
          <p className="erp-card-hint">{t("cashClosing.cashInHint")}</p>
        </div>
        {showFinancial && hasDisplayAmount(closing.grossProfit) ? (
          <div className="erp-card erp-card-elevated">
            <p className="erp-card-label">{t("cashClosing.grossProfit")}</p>
            <p className="erp-card-value erp-num">
              {formatMoneyDZD(Number(closing.grossProfit))}
            </p>
            <p className="erp-card-hint">{t("cashClosing.grossProfitHint")}</p>
          </div>
        ) : null}
        {showFinancial && hasDisplayAmount(closing.totalExpenses) ? (
          <div className="erp-card erp-card-elevated">
            <p className="erp-card-label">{t("cashClosing.totalExpenses")}</p>
            <p className="erp-card-value erp-num">
              {formatMoneyDZD(Number(closing.totalExpenses))}
            </p>
            <p className="erp-card-hint">{t("cashClosing.expensesHint")}</p>
          </div>
        ) : null}
        {showFinancial && hasDisplayAmount(closing.netProfit) ? (
          <div className="erp-card erp-card-elevated">
            <p className="erp-card-label">{t("cashClosing.netProfit")}</p>
            <p className="erp-card-value erp-num">
              {formatMoneyDZD(Number(closing.netProfit))}
            </p>
            <p className="erp-card-hint">{t("cashClosing.netProfitHint")}</p>
          </div>
        ) : null}
      </div>

      <div className="erp-card erp-card-elevated erp-closing-recon">
        <p className="erp-card-label">{t("cashClosing.reconLabel")}</p>
        <div className="erp-table-wrap">
          <table className="erp-table erp-table--plain">
            <tbody>
              <tr>
                <td>{t("cashClosing.rowSum")}</td>
                <td className="erp-table-num erp-num">
                  {formatMoneyDZD(recon.sum)}
                </td>
              </tr>
              <tr>
                <td>{t("cashClosing.rowTotal")}</td>
                <td className="erp-table-num erp-num">
                  {formatMoneyDZD(recon.total)}
                </td>
              </tr>
              <tr className="erp-closing-diff-row">
                <td>{t("cashClosing.rowDiff")}</td>
                <td className="erp-table-num erp-num">
                  <span
                    className={
                      Math.abs(recon.diff) < 0.01
                        ? "erp-badge erp-badge--success"
                        : "erp-badge erp-badge--warning"
                    }
                  >
                    {formatMoneyDZD(recon.diff)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="erp-card-hint">
          {t("cashClosing.rangeHint")} {from} → {to}.{" "}
          {t("cashClosing.saleCount")}{" "}
          <span className="erp-num">
            {formatNumber(
              hasDisplayAmount(closing.countSales)
                ? Number(closing.countSales)
                : 0
            )}
          </span>
          {showFinancial && !profitConsistent ? (
            <>
              {" "}
              · <span className="erp-badge erp-badge--warning">Δ profit</span>{" "}
              <span className="erp-num">{formatMoneyDZD(profitDelta)}</span>
            </>
          ) : null}
          {showFinancial && hasDisplayAmount(closing.netProfit) ? (
            <>
              {" "}
              · {t("cashClosing.netProfit")}{" "}
              <span className="erp-num">
                {formatMoneyDZD(Number(closing.netProfit))}
              </span>
            </>
          ) : null}
          {showFinancial && hasDisplayAmount(closing.totalDebt) ? (
            <>
              {" "}
              · {t("cashClosing.debt")}{" "}
              <span className="erp-num">
                {formatMoneyDZD(Number(closing.totalDebt))}
              </span>
            </>
          ) : null}
        </p>
        <button
          type="button"
          className="erp-btn erp-btn-primary"
          onClick={exportClosing}
        >
          {t("cashClosing.exportBtn")}
        </button>
      </div>
      <ErpModuleFooter />
    </section>
  );
}
