import { useMemo } from "react";
import ErpModuleFooter from "../components/ErpModuleFooter";
import { useLocale } from "../context/LocaleContext";
import { formatMoneyDZD, formatNumber, safeNum } from "../utils/erpFormat";
export default function CashClosingView({
  cash,
  dashboard,
  from,
  to,
  canViewFinancial = false,
}) {
  const { t } = useLocale();
  const recon = useMemo(() => {
    const a = safeNum(cash.cashSales, 0);
    const b = safeNum(cash.debtPayments, 0);
    const sum = a + b;
    const total = safeNum(cash.totalCashIn, 0);
    const diff = total - sum;
    return { sum, total, diff };
  }, [cash]);

  const exportClosing = () => {
    const lines = [
      t("cashClosing.title"),
      `${t("cashClosing.rangeHint")} ${from} → ${to}`,
      new Date().toISOString(),
      "",
      `${t("cashClosing.cashSales")}: ${formatMoneyDZD(cash.cashSales)}`,
      `${t("cashClosing.debtPay")}: ${formatMoneyDZD(cash.debtPayments)}`,
      `${t("cashClosing.rowSum")}: ${formatMoneyDZD(recon.sum)}`,
      `${t("cashClosing.rowTotal")}: ${formatMoneyDZD(recon.total)}`,
      `${t("cashClosing.rowDiff")}: ${formatMoneyDZD(recon.diff)}`,
      "",
      `${t("cashClosing.saleCount")}: ${formatNumber(dashboard.sales)}`,
      ...(canViewFinancial
        ? [
            `${t("cashClosing.profit")}: ${formatMoneyDZD(dashboard.realProfit ?? dashboard.profit)}`,
            `${t("cashClosing.debt")}: ${formatMoneyDZD(dashboard.debt)}`,
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

  return (
    <section className="erp-section erp-section-flush-top">
      <h2 className="erp-section-title">{t("cashClosing.title")}</h2>
      <p className="erp-page-lead">{t("cashClosing.lead")}</p>

      <div className="erp-closing-grid">
        <div className="erp-card erp-card-elevated">
          <p className="erp-card-label">{t("cashClosing.cashSales")}</p>
          <p className="erp-card-value erp-num">
            {formatMoneyDZD(cash.cashSales)}
          </p>
        </div>
        <div className="erp-card erp-card-elevated">
          <p className="erp-card-label">{t("cashClosing.debtPay")}</p>
          <p className="erp-card-value erp-num">
            {formatMoneyDZD(cash.debtPayments)}
          </p>
        </div>
        <div className="erp-card erp-card-elevated">
          <p className="erp-card-label">{t("cashClosing.totalCashIn")}</p>
          <p className="erp-card-value erp-num">
            {formatMoneyDZD(cash.totalCashIn)}
          </p>
        </div>
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
          <span className="erp-num">{formatNumber(dashboard.sales)}</span>
          {canViewFinancial ? (
            <>
              {" "}
              · {t("cashClosing.profit")}{" "}
              <span className="erp-num">
                {formatMoneyDZD(dashboard.realProfit ?? dashboard.profit)}
              </span>{" "}
              · {t("cashClosing.debt")}{" "}
              <span className="erp-num">{formatMoneyDZD(dashboard.debt)}</span>
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
