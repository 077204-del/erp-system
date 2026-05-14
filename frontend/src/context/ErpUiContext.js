import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useLocale } from "./LocaleContext";

const ErpUiContext = createContext(null);

let toastId = 0;

function ErpUiOverlays({
  globalLoading,
  toasts,
  dismissToast,
  confirmState,
  closeConfirm,
  handleConfirmOk,
}) {
  const { t } = useLocale();
  useBodyScrollLock(!!confirmState);
  return (
    <>
      <div
        className="erp-loading-overlay"
        aria-busy={globalLoading}
        aria-hidden={!globalLoading}
        data-visible={globalLoading ? "true" : "false"}
      >
        <div className="erp-loading-overlay__panel">
          <span className="erp-spinner erp-spinner--xl erp-spinner--dark" />
          <p className="erp-loading-overlay__text">{t("ui.syncing")}</p>
        </div>
      </div>
      <div className="erp-toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`erp-toast erp-toast--${toast.type}`}
            role="status"
          >
            {toast.title ? (
              <p className="erp-toast__title">{toast.title}</p>
            ) : null}
            <p className="erp-toast__msg">{toast.message}</p>
            <button
              type="button"
              className="erp-toast__close"
              aria-label={t("ui.cancel")}
              onClick={() => dismissToast(toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {confirmState
        ? createPortal(
            <div
              className="erp-modal-backdrop"
              role="presentation"
              onClick={() => closeConfirm(false)}
            >
              <div
                className="erp-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="erp-confirm-title"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="erp-confirm-title" className="erp-modal__title">
                  {confirmState.title}
                </h2>
                <p className="erp-modal__body">{confirmState.message}</p>
                <div className="erp-modal__actions">
                  <button
                    type="button"
                    className="erp-btn erp-btn-ghost"
                    onClick={() => closeConfirm(false)}
                  >
                    {t("ui.cancel")}
                  </button>
                  <button
                    type="button"
                    className={
                      confirmState.danger
                        ? "erp-btn erp-btn-danger"
                        : "erp-btn erp-btn-primary"
                    }
                    onClick={handleConfirmOk}
                  >
                    {confirmState.confirmLabel}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

export function ErpUiProvider({ children, globalLoading }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const confirmResolveRef = useRef(null);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast) => {
      const id = ++toastId;
      const entry = {
        id,
        type: toast.type || "info",
        message: toast.message || "",
        title: toast.title || "",
      };
      setToasts((prev) => [...prev, entry]);
      const ms = toast.duration ?? (entry.type === "error" ? 7000 : 4500);
      if (ms > 0) {
        setTimeout(() => dismissToast(id), ms);
      }
      return id;
    },
    [dismissToast]
  );

  const toastApi = useMemo(
    () => ({
      success: (message, title) =>
        pushToast({ type: "success", message, title }),
      error: (message, title) => pushToast({ type: "error", message, title }),
      warning: (message, title) =>
        pushToast({ type: "warning", message, title }),
      info: (message, title) => pushToast({ type: "info", message, title }),
    }),
    [pushToast]
  );

  const confirm = useCallback(
    ({ title, message, confirmLabel, danger, onConfirm }) => {
      return new Promise((resolve) => {
        confirmResolveRef.current = resolve;
        setConfirmState({
          title: title || "Confirm",
          message: message || "",
          confirmLabel: confirmLabel || "OK",
          danger: !!danger,
          onConfirm,
        });
      });
    },
    []
  );

  const closeConfirm = useCallback((result) => {
    setConfirmState(null);
    const r = confirmResolveRef.current;
    confirmResolveRef.current = null;
    if (r) r(!!result);
  }, []);

  const handleConfirmOk = useCallback(() => {
    const fn = confirmState?.onConfirm;
    closeConfirm(true);
    if (typeof fn === "function") fn();
  }, [confirmState, closeConfirm]);

  const value = useMemo(
    () => ({ toast: toastApi, confirm, dismissToast }),
    [toastApi, confirm, dismissToast]
  );

  return (
    <ErpUiContext.Provider value={value}>
      {children}
      <ErpUiOverlays
        globalLoading={globalLoading}
        toasts={toasts}
        dismissToast={dismissToast}
        confirmState={confirmState}
        closeConfirm={closeConfirm}
        handleConfirmOk={handleConfirmOk}
      />
    </ErpUiContext.Provider>
  );
}

export function useErpUi() {
  const ctx = useContext(ErpUiContext);
  if (!ctx) {
    throw new Error("useErpUi must be used within ErpUiProvider");
  }
  return ctx;
}

export function useErpUiSafe() {
  return useContext(ErpUiContext);
}
