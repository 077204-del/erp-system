import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import api from "../api";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { apiErrorMessage, safeNum, safeText } from "../utils/erpFormat";

export default function ProductFormModal({
  open,
  mode,
  product,
  onClose,
  onSaved,
  toast,
  t,
}) {
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [category, setCategory] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [stock, setStock] = useState("");
  const [minimumStock, setMinimumStock] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    if (mode === "edit" && product) {
      setName(safeText(product.name, ""));
      setBarcode(safeText(product.barcode, ""));
      setCategory(safeText(product.category, ""));
      setPurchasePrice(String(safeNum(product.costPrice, 0)));
      setSellingPrice(String(safeNum(product.salePrice, 0)));
      setStock(String(safeNum(product.qty, 0)));
      const th =
        product.lowStockThreshold != null
          ? safeNum(product.lowStockThreshold, 5)
          : 5;
      setMinimumStock(String(th));
    } else {
      setName("");
      setBarcode("");
      setCategory("");
      setPurchasePrice("");
      setSellingPrice("");
      setStock("0");
      setMinimumStock("5");
    }
  }, [open, mode, product]);

  useBodyScrollLock(open);

  const submit = async () => {
    const n = name.trim();
    if (!n) {
      toast.warning(t("productForm.needName"));
      return;
    }
    const cp = safeNum(purchasePrice, NaN);
    const sp = safeNum(sellingPrice, NaN);
    const q = safeNum(stock, NaN);
    const minS = safeNum(minimumStock, NaN);
    if (!Number.isFinite(cp) || cp < 0) {
      toast.warning(t("productForm.needPurchase"));
      return;
    }
    if (!Number.isFinite(sp) || sp < 0) {
      toast.warning(t("productForm.needSelling"));
      return;
    }
    if (!Number.isFinite(q) || q < 0) {
      toast.warning(t("productForm.needStock"));
      return;
    }
    if (!Number.isFinite(minS) || minS < 0) {
      toast.warning(t("productForm.needMin"));
      return;
    }

    const body = {
      name: n,
      barcode: barcode.trim(),
      category: category.trim(),
      costPrice: cp,
      salePrice: sp,
      qty: q,
      lowStockThreshold: minS,
    };

    setSaving(true);
    try {
      if (mode === "edit" && product && product._id) {
        const res = await api.put(`/api/products/${product._id}`, body);
        if (res.data && res.data.offlineQueued) {
          toast.info(t("app.offlineQueued"), t("productForm.title"));
        } else {
          toast.success(t("productForm.updated"));
        }
      } else {
        const res = await api.post("/api/products", body);
        if (res.data && res.data.offlineQueued) {
          toast.info(t("app.offlineQueued"), t("productForm.title"));
        } else {
          toast.success(t("productForm.created"));
        }
      }
      onClose();
      if (typeof onSaved === "function") onSaved();
    } catch (err) {
      const st = err.response && err.response.status;
      const msg =
        st === 403
          ? t("productForm.forbidden")
          : st === 404
            ? t("productForm.notFound")
            : apiErrorMessage(err) || t("productForm.err");
      toast.error(msg, t("productForm.title"));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="erp-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="erp-modal erp-modal--wide erp-modal-form-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="erp-modal-form-shell__scroll">
          <h2 id="product-form-title" className="erp-modal__title">
            {mode === "edit" ? t("productForm.editTitle") : t("productForm.addTitle")}
          </h2>
          <div className="erp-sale-flow-grid">
          <div className="erp-field">
            <label htmlFor="pf-name">{t("productForm.name")}</label>
            <input
              id="pf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              autoComplete="off"
            />
          </div>
          <div className="erp-field">
            <label htmlFor="pf-barcode">{t("productForm.barcode")}</label>
            <input
              id="pf-barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              disabled={saving}
              autoComplete="off"
            />
          </div>
          <div className="erp-field">
            <label htmlFor="pf-cat">{t("productForm.category")}</label>
            <input
              id="pf-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={saving}
              autoComplete="off"
            />
          </div>
          <div className="erp-field">
            <label htmlFor="pf-cp">{t("productForm.purchasePrice")}</label>
            <input
              id="pf-cp"
              type="number"
              min={0}
              step="0.01"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="erp-field">
            <label htmlFor="pf-sp">{t("productForm.sellingPrice")}</label>
            <input
              id="pf-sp"
              type="number"
              min={0}
              step="0.01"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="erp-field">
            <label htmlFor="pf-qty">{t("productForm.stock")}</label>
            <input
              id="pf-qty"
              type="number"
              min={0}
              step="1"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="erp-field">
            <label htmlFor="pf-min">{t("productForm.minimumStock")}</label>
            <input
              id="pf-min"
              type="number"
              min={0}
              step="1"
              value={minimumStock}
              onChange={(e) => setMinimumStock(e.target.value)}
              disabled={saving}
            />
          </div>
        </div>
        </div>
        <div className="erp-modal__actions erp-modal-form-shell__actions">
          <button
            type="button"
            className="erp-btn erp-btn-ghost"
            onClick={onClose}
            disabled={saving}
          >
            {t("ui.cancel")}
          </button>
          <button
            type="button"
            className="erp-btn erp-btn-primary"
            onClick={submit}
            disabled={saving}
          >
            {saving ? (
              <>
                <span className="erp-spinner erp-spinner--sm" aria-hidden />
                {t("productForm.saving")}
              </>
            ) : mode === "edit" ? (
              t("productForm.save")
            ) : (
              t("productForm.create")
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
