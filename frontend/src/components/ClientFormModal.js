import { useEffect, useState } from "react";
import api from "../api";
import { apiErrorMessage, safeText } from "../utils/erpFormat";

export default function ClientFormModal({
  open,
  mode,
  client,
  onClose,
  onSaved,
  toast,
  t,
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    if (mode === "edit" && client) {
      setFullName(safeText(client.name, ""));
      setPhone(safeText(client.phone, ""));
      setAddress(safeText(client.address, ""));
      setNotes(safeText(client.notes, ""));
    } else {
      setFullName("");
      setPhone("");
      setAddress("");
      setNotes("");
    }
  }, [open, mode, client]);

  const submit = async () => {
    const n = fullName.trim();
    if (!n) {
      toast.warning(t("clientForm.needName"));
      return;
    }
    const body = {
      name: n,
      phone: phone.trim(),
      address: address.trim(),
      notes: notes.trim(),
    };

    setSaving(true);
    try {
      if (mode === "edit" && client && client._id) {
        await api.put(`/api/clients/${client._id}`, body);
        toast.success(t("clientForm.updated"));
      } else {
        await api.post("/api/clients", body);
        toast.success(t("clientForm.created"));
      }
      onClose();
      if (typeof onSaved === "function") onSaved();
    } catch (err) {
      const st = err.response && err.response.status;
      const msg =
        st === 403
          ? t("clientForm.forbidden")
          : st === 404
            ? t("clientForm.notFound")
            : apiErrorMessage(err) || t("clientForm.err");
      toast.error(msg, t("clientForm.title"));
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
        className="erp-modal erp-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="client-form-title" className="erp-modal__title">
          {mode === "edit" ? t("clientForm.editTitle") : t("clientForm.addTitle")}
        </h2>
        <div className="erp-sale-flow-grid">
          <div className="erp-field">
            <label htmlFor="cf-name">{t("clientForm.fullName")}</label>
            <input
              id="cf-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={saving}
              autoComplete="name"
            />
          </div>
          <div className="erp-field">
            <label htmlFor="cf-phone">{t("clientForm.phone")}</label>
            <input
              id="cf-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={saving}
              autoComplete="tel"
            />
          </div>
          <div className="erp-field erp-field--full">
            <label htmlFor="cf-addr">{t("clientForm.address")}</label>
            <input
              id="cf-addr"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={saving}
              autoComplete="street-address"
            />
          </div>
          <div className="erp-field erp-field--full">
            <label htmlFor="cf-notes">{t("clientForm.notes")}</label>
            <textarea
              id="cf-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={saving}
            />
          </div>
        </div>
        <div className="erp-modal__actions">
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
                {t("clientForm.saving")}
              </>
            ) : mode === "edit" ? (
              t("clientForm.save")
            ) : (
              t("clientForm.create")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
