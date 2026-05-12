import { useState } from "react";
import api from "../api";
import ErpDataTable from "../components/ErpDataTable";
import ErpModuleFooter from "../components/ErpModuleFooter";
import { useLocale } from "../context/LocaleContext";
import { apiErrorMessage, formatNumber, safeText } from "../utils/erpFormat";

async function invoiceErrorMessage(err, fallback) {
  if (!err || !err.response) return fallback;
  const d = err.response.data;
  if (d && typeof d === "object" && d.message) return String(d.message);
  if (d instanceof Blob) {
    try {
      const t = await d.text();
      const j = JSON.parse(t);
      if (j && j.message) return String(j.message);
    } catch {
      /* ignore */
    }
  }
  return apiErrorMessage(err) || fallback;
}

export default function InvoiceCenterView({
  sales,
  loading,
  initialSyncDone,
  toast,
}) {
  const { t } = useLocale();
  const [previewSale, setPreviewSale] = useState(null);
  const [busyKey, setBusyKey] = useState("");

  const saleIdStr = (r) =>
    r && r._id != null ? String(r._id) : "";

  const runInvoiceAction = async (saleId, mode) => {
    const key = `${saleId}:${mode}`;
    setBusyKey(key);
    try {
      const thermal = mode === "thermal";
      const pdf = mode === "pdf";
      const url = thermal
        ? `/api/sales/${saleId}/invoice?format=thermal`
        : `/api/sales/${saleId}/invoice`;

      const res = await api.get(url, { responseType: "blob" });
      const ct = (res.headers["content-type"] || "").toLowerCase();
      if (ct.includes("application/json")) {
        const text = await res.data.text();
        const j = JSON.parse(text);
        throw new Error(j.message || "Unexpected response");
      }

      const out = new Blob([res.data], {
        type: ct || (thermal ? "text/html" : "application/pdf"),
      });
      const href = URL.createObjectURL(out);

      if (pdf) {
        const a = document.createElement("a");
        a.href = href;
        a.download = `invoice_${saleId}.pdf`;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast.success(t("invoice.pdfStarted"));
        setTimeout(() => URL.revokeObjectURL(href), 5000);
      } else if (thermal) {
        window.open(href, "_blank", "noopener,noreferrer");
        toast.success(t("invoice.thermalStarted"));
        setTimeout(() => URL.revokeObjectURL(href), 120_000);
      } else {
        window.open(href, "_blank", "noopener,noreferrer");
        toast.success(t("invoice.opened"));
        setTimeout(() => URL.revokeObjectURL(href), 60_000);
      }
    } catch (err) {
      const msg = await invoiceErrorMessage(err, t("invoice.err"));
      toast.error(msg, t("invoice.title"));
    } finally {
      setBusyKey("");
    }
  };

  const columns = [
    {
      key: "product",
      header: t("invoice.colProductClient"),
      searchAccessor: (r) =>
        [
          r.productId && r.productId.name,
          r.clientId && r.clientId.name,
        ]
          .filter(Boolean)
          .join(" "),
      render: (r) => (
        <div>
          <div className="erp-cell-strong">
            {safeText(
              r.productId && r.productId.name ? r.productId.name : "",
              "—"
            )}
          </div>
          <div className="erp-cell-sub">
            {safeText(
              r.clientId && r.clientId.name ? r.clientId.name : "",
              "—"
            )}
          </div>
        </div>
      ),
    },
    { key: "quantity", header: t("invoice.qty"), numeric: true },
    {
      key: "total",
      header: t("invoice.total"),
      numeric: true,
      render: (r) => (
        <span className="erp-num">{formatNumber(r.total)}</span>
      ),
    },
    {
      key: "status",
      header: t("invoice.status"),
      clip: false,
      render: (r) => {
        const st = String(r.status || "").toUpperCase();
        const cls =
          st === "PAID"
            ? "erp-badge erp-badge--success"
            : st === "DEBT" || st === "UNPAID"
              ? "erp-badge erp-badge--warning"
              : "erp-badge erp-badge--neutral";
        return <span className={cls}>{safeText(r.status, "—")}</span>;
      },
    },
    {
      key: "debt",
      header: t("invoice.debt"),
      numeric: true,
      render: (r) => (
        <span className="erp-num">{formatNumber(r.debt)}</span>
      ),
    },
    {
      key: "actions",
      header: t("invoice.actions"),
      clip: false,
      render: (r) => {
        const sid = saleIdStr(r);
        const spinning = (mode) => busyKey === `${sid}:${mode}`;
        return (
          <div className="erp-btn-row erp-btn-row--tight">
            <button
              type="button"
              className="erp-btn erp-btn-ghost erp-btn-sm"
              disabled={!!busyKey}
              onClick={() => setPreviewSale(r)}
            >
              {t("invoice.preview")}
            </button>
            <button
              type="button"
              className="erp-btn erp-btn-ghost erp-btn-sm"
              disabled={!!busyKey}
              onClick={() => runInvoiceAction(sid, "pdf")}
            >
              {spinning("pdf") ? (
                <>
                  <span className="erp-spinner erp-spinner--sm" aria-hidden />
                  {t("invoice.spinningPdf")}
                </>
              ) : (
                t("invoice.pdf")
              )}
            </button>
            <button
              type="button"
              className="erp-btn erp-btn-ghost erp-btn-sm"
              disabled={!!busyKey}
              onClick={() => runInvoiceAction(sid, "thermal")}
            >
              {spinning("thermal") ? (
                <>
                  <span className="erp-spinner erp-spinner--sm" aria-hidden />
                  …
                </>
              ) : (
                t("invoice.thermal")
              )}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <section className="erp-section erp-section-flush-top">
      <h2 className="erp-section-title">{t("invoice.title")}</h2>
      <p className="erp-page-lead">{t("invoice.lead")}</p>
      <ErpDataTable
        columns={columns}
        rows={sales}
        getRowId={(r) => saleIdStr(r) || "unknown"}
        pageSize={10}
        loading={loading}
        showSkeleton={!initialSyncDone}
        emptyTitle={t("invoice.emptyTitle")}
        emptyHint={t("invoice.emptyHint")}
        searchPlaceholder={t("invoice.searchPh")}
      />

      {previewSale ? (
        <InvoicePreviewModal
          sale={previewSale}
          busyKey={busyKey}
          onClose={() => setPreviewSale(null)}
          onPrint={() => window.print()}
          onPdf={() => runInvoiceAction(saleIdStr(previewSale), "pdf")}
          onThermal={() => runInvoiceAction(saleIdStr(previewSale), "thermal")}
        />
      ) : null}

      <ErpModuleFooter />
    </section>
  );
}

function InvoicePreviewModal({
  sale,
  busyKey,
  onClose,
  onPrint,
  onPdf,
  onThermal,
}) {
  const { t } = useLocale();
  const sid = sale && sale._id != null ? String(sale._id) : "";
  const client =
    sale.clientId && typeof sale.clientId === "object" ? sale.clientId : null;
  const product =
    sale.productId && typeof sale.productId === "object"
      ? sale.productId
      : null;

  const spin = (mode) => busyKey === `${sid}:${mode}`;

  return (
    <div
      className="erp-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="erp-modal erp-modal--wide erp-invoice-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inv-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="erp-invoice-print" id="erp-invoice-print-area">
          <header className="erp-invoice-header">
            <div>
              <h2 id="inv-title" className="erp-invoice-title">
                {t("invoice.modalTitle")}
              </h2>
              <p className="erp-invoice-meta">
                {t("invoice.ref")}{" "}
                <span className="erp-mono">
                  {String(sale._id || "").slice(-10)}
                </span>
              </p>
            </div>
            <div className="erp-invoice-status">
              <span className="erp-badge erp-badge--neutral">
                {safeText(sale.status, "—")}
              </span>
            </div>
          </header>

          <section className="erp-invoice-block">
            <h3 className="erp-invoice-block-title">{t("invoice.billTo")}</h3>
            <p className="erp-invoice-line">
              <strong>{safeText(client?.name, "—")}</strong>
            </p>
            <p className="erp-invoice-line">{safeText(client?.phone, "")}</p>
          </section>

          <table className="erp-invoice-items">
            <thead>
              <tr>
                <th>{t("invoice.item")}</th>
                <th className="erp-table-num">{t("invoice.qty")}</th>
                <th className="erp-table-num">{t("invoice.unit")}</th>
                <th className="erp-table-num">{t("invoice.total")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{safeText(product?.name, "—")}</td>
                <td className="erp-table-num">
                  {formatNumber(sale.quantity)}
                </td>
                <td className="erp-table-num">
                  {formatNumber(sale.unitPrice)}
                </td>
                <td className="erp-table-num">{formatNumber(sale.total)}</td>
              </tr>
            </tbody>
          </table>

          <footer className="erp-invoice-totals">
            <div className="erp-invoice-totals-row">
              <span>{t("invoice.paid")}</span>
              <strong className="erp-num">{formatNumber(sale.paidAmount)}</strong>
            </div>
            <div className="erp-invoice-totals-row erp-invoice-totals-row--accent">
              <span>{t("invoice.debt")}</span>
              <strong className="erp-num">{formatNumber(sale.debt)}</strong>
            </div>
            <div className="erp-invoice-totals-row erp-invoice-totals-row--total">
              <span>{t("invoice.total")}</span>
              <strong className="erp-num">{formatNumber(sale.total)}</strong>
            </div>
          </footer>
        </div>

        <div className="erp-modal__actions erp-invoice-actions-no-print">
          <button
            type="button"
            className="erp-btn erp-btn-ghost"
            onClick={onClose}
            disabled={!!busyKey}
          >
            {t("invoice.close")}
          </button>
          <button
            type="button"
            className="erp-btn erp-btn-ghost"
            onClick={onPrint}
            disabled={!!busyKey}
          >
            {t("invoice.print")}
          </button>
          <button
            type="button"
            className="erp-btn erp-btn-ghost"
            onClick={onPdf}
            disabled={!!busyKey}
          >
            {spin("pdf") ? (
              <>
                <span className="erp-spinner erp-spinner--sm" aria-hidden />
                {t("invoice.spinningPdf")}
              </>
            ) : (
              t("invoice.downloadPdf")
            )}
          </button>
          <button
            type="button"
            className="erp-btn erp-btn-primary"
            onClick={onThermal}
            disabled={!!busyKey}
          >
            {spin("thermal") ? (
              <>
                <span className="erp-spinner erp-spinner--sm" aria-hidden />
                …
              </>
            ) : (
              t("invoice.thermalPrint")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
