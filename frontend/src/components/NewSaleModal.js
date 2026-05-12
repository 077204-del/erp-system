import { useEffect, useMemo, useState } from "react";
import api from "../api";
import { useLocale } from "../context/LocaleContext";
import { apiErrorMessage, formatNumber, safeNum, safeText } from "../utils/erpFormat";

/**
 * POST /api/sales with optional negotiatedUnitPrice (agreed unit price after negotiation).
 */
export default function NewSaleModal({
  open,
  onClose,
  products,
  clients,
  onSuccess,
  toast,
}) {
  const { t } = useLocale();
  const [productId, setProductId] = useState("");
  const [clientId, setClientId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [agreedPrice, setAgreedPrice] = useState("");
  const [payMode, setPayMode] = useState("full_cash");
  const [partialPay, setPartialPay] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProductId("");
    setClientId("");
    setQuantity("1");
    setAgreedPrice("");
    setPayMode("full_cash");
    setPartialPay("");
    setSaving(false);
  }, [open]);

  const product = useMemo(() => {
    if (!productId || !Array.isArray(products)) return null;
    return products.find((p) => String(p._id) === String(productId)) || null;
  }, [productId, products]);

  const listPrice = product ? safeNum(product.salePrice, 0) : 0;
  const stock = product ? safeNum(product.qty, 0) : 0;
  const qtyNum = Math.floor(safeNum(quantity, 0));

  useEffect(() => {
    if (!product) {
      setAgreedPrice("");
      return;
    }
    setAgreedPrice(String(safeNum(product.salePrice, 0)));
  }, [productId, product]);

  const agreedNum = safeNum(agreedPrice, 0);
  const lineTotal =
    agreedNum > 0 && qtyNum > 0 ? agreedNum * qtyNum : 0;
  const partialNum = safeNum(partialPay, 0);

  const partialOk =
    payMode !== "partial" ||
    (partialNum > 0 &&
      partialNum < lineTotal &&
      Number.isFinite(partialNum));

  const canSubmit =
    Boolean(productId) &&
    Boolean(clientId) &&
    qtyNum > 0 &&
    qtyNum <= stock &&
    stock > 0 &&
    agreedNum > 0 &&
    Number.isFinite(lineTotal) &&
    lineTotal > 0 &&
    partialOk &&
    !saving;

  const submit = async () => {
    if (!productId) {
      toast.warning(t("saleFlow.needProduct"));
      return;
    }
    if (!(qtyNum > 0) || qtyNum > stock) {
      toast.warning(t("saleFlow.needQty"));
      return;
    }
    if (!(agreedNum > 0)) {
      toast.warning(t("saleFlow.needAgreedPrice"));
      return;
    }
    if (!clientId) {
      toast.warning(t("saleFlow.needClient"));
      return;
    }
    if (payMode === "partial") {
      if (!(partialNum > 0) || partialNum >= lineTotal) {
        toast.warning(t("saleFlow.needPartialAmount"));
        return;
      }
    }

    let paymentType = "cash";
    let paidAmount = lineTotal;
    if (payMode === "credit") {
      paymentType = "credit";
      paidAmount = 0;
    } else if (payMode === "partial") {
      paymentType = "partial";
      paidAmount = partialNum;
    }

    const body = {
      productId,
      clientId,
      quantity: qtyNum,
      paidAmount,
      paymentType,
      negotiatedUnitPrice: agreedNum,
    };

    setSaving(true);
    try {
      await api.post("/api/sales", body);
      toast.success(t("saleFlow.success"), t("saleFlow.title"));
      onClose();
      if (typeof onSuccess === "function") onSuccess();
    } catch (err) {
      const st = err.response && err.response.status;
      const msg =
        st === 403 ? t("saleFlow.forbidden") : apiErrorMessage(err);
      toast.error(msg, t("saleFlow.title"));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="erp-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="erp-modal erp-modal--wide erp-sale-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-sale-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="new-sale-title" className="erp-modal__title">
          {t("saleFlow.title")}
        </h2>
        <p className="erp-modal__body erp-sale-flow-lead">{t("saleFlow.lead")}</p>
        <p className="erp-card-hint" style={{ marginTop: "-0.5rem" }}>
          {t("saleFlow.agreedHint")}
        </p>

        <div className="erp-sale-flow-grid">
          <div className="erp-field">
            <label htmlFor="sale-product">{t("saleFlow.product")}</label>
            <select
              id="sale-product"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              disabled={saving}
            >
              <option value="">{t("saleFlow.pickProduct")}</option>
              {(Array.isArray(products) ? products : []).map((p) => (
                <option key={p._id} value={p._id}>
                  {safeText(p.name, "—")} · {formatNumber(p.salePrice)} ·{" "}
                  {t("saleFlow.stock")}: {formatNumber(p.qty)}
                </option>
              ))}
            </select>
          </div>

          <div className="erp-field">
            <label htmlFor="sale-client">{t("saleFlow.client")}</label>
            <select
              id="sale-client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={saving}
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
            <label htmlFor="sale-qty">{t("saleFlow.quantity")}</label>
            <input
              id="sale-qty"
              type="number"
              min={1}
              max={stock > 0 ? stock : undefined}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={saving || !productId}
            />
            {product ? (
              <p className="erp-card-hint">
                {t("saleFlow.stock")}:{" "}
                <span className="erp-num">{formatNumber(stock)}</span>
              </p>
            ) : null}
          </div>

          <div className="erp-field">
            <span className="erp-card-label">{t("saleFlow.listPrice")}</span>
            <p className="erp-sale-flow-num erp-num">{formatNumber(listPrice)}</p>
          </div>

          <div className="erp-field">
            <label htmlFor="sale-agreed">{t("saleFlow.agreedPrice")}</label>
            <input
              id="sale-agreed"
              type="number"
              min={0}
              step="0.01"
              value={agreedPrice}
              onChange={(e) => setAgreedPrice(e.target.value)}
              disabled={saving || !productId}
            />
          </div>

          <div className="erp-field erp-sale-flow-total">
            <span className="erp-card-label">{t("saleFlow.lineTotal")}</span>
            <p className="erp-sale-flow-num erp-num erp-sale-flow-total-val">
              {formatNumber(lineTotal)}
            </p>
          </div>

          <fieldset className="erp-sale-flow-pay" disabled={saving}>
            <legend className="erp-card-label">{t("saleFlow.payment")}</legend>
            <label className="erp-sale-flow-radio">
              <input
                type="radio"
                name="payMode"
                checked={payMode === "full_cash"}
                onChange={() => setPayMode("full_cash")}
              />
              {t("saleFlow.payFullCash")}
            </label>
            <label className="erp-sale-flow-radio">
              <input
                type="radio"
                name="payMode"
                checked={payMode === "credit"}
                onChange={() => setPayMode("credit")}
              />
              {t("saleFlow.payCredit")}
            </label>
            <label className="erp-sale-flow-radio">
              <input
                type="radio"
                name="payMode"
                checked={payMode === "partial"}
                onChange={() => setPayMode("partial")}
              />
              {t("saleFlow.payPartial")}
            </label>
            {payMode === "partial" ? (
              <div className="erp-field erp-sale-flow-partial">
                <label htmlFor="sale-partial-amt">{t("saleFlow.partialAmount")}</label>
                <input
                  id="sale-partial-amt"
                  type="number"
                  min={0}
                  step="0.01"
                  value={partialPay}
                  onChange={(e) => setPartialPay(e.target.value)}
                  disabled={saving || !productId}
                />
              </div>
            ) : null}
          </fieldset>
        </div>

        <div className="erp-modal__actions">
          <button
            type="button"
            className="erp-btn erp-btn-ghost"
            onClick={onClose}
            disabled={saving}
          >
            {t("saleFlow.close")}
          </button>
          <button
            type="button"
            className="erp-btn erp-btn-primary"
            onClick={submit}
            disabled={!canSubmit}
          >
            {saving ? (
              <>
                <span className="erp-spinner erp-spinner--sm" aria-hidden />
                {t("saleFlow.saving")}
              </>
            ) : (
              t("saleFlow.submit")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
