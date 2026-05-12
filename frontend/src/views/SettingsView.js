import { useEffect, useState } from "react";
import api from "../api";
import { apiErrorMessage } from "../utils/erpFormat";
import ErpModuleFooter from "../components/ErpModuleFooter";
import { useErpUi } from "../context/ErpUiContext";
import { useLocale } from "../context/LocaleContext";
import { safeText } from "../utils/erpFormat";

const APP_VERSION = "1.0.0";

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 8000);
}

export default function SettingsView() {
  const { toast } = useErpUi();
  const { t, locale, setLocale } = useLocale();
  const [backendOk, setBackendOk] = useState(null);
  const [serverSettings, setServerSettings] = useState(null);
  const [compact, setCompact] = useState(() => {
    try {
      return localStorage.getItem("erp-ui-compact") === "1";
    } catch {
      return false;
    }
  });
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("erp-theme") || "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-erp-theme", theme);
    try {
      localStorage.setItem("erp-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem("erp-ui-compact", compact ? "1" : "0");
    } catch {
      /* ignore */
    }
    document.documentElement.setAttribute(
      "data-erp-compact",
      compact ? "true" : "false"
    );
  }, [compact]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/");
        if (cancelled) return;
        setBackendOk(
          res.data && (res.data.status === "OK" || res.data.message)
        );
      } catch {
        if (!cancelled) setBackendOk(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/api/settings");
        if (!cancelled && res.data) setServerSettings(res.data);
      } catch {
        if (!cancelled) setServerSettings(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runExport = async (label, path, filePrefix) => {
    try {
      const res = await api.get(path);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      downloadJson(`${filePrefix}_${stamp}.json`, res.data);
      toast.success(t("settings.exportStarted"), label);
    } catch (e) {
      toast.error(apiErrorMessage(e) || t("settings.exportFail"), label);
    }
  };

  const pingBackend = async () => {
    try {
      const res = await api.get("/");
      const ok = res.data && (res.data.status === "OK" || res.data.message);
      setBackendOk(!!ok);
      toast.success(ok ? t("settings.pingOk") : t("settings.pingUnexpected"));
    } catch {
      setBackendOk(false);
      toast.error(t("settings.pingFail"), t("settings.backend"));
    }
  };

  return (
    <section className="erp-section erp-section-flush-top">
      <div className="erp-btn-row" style={{ marginBottom: "0.5rem" }}>
        <span className="erp-badge erp-badge--neutral">
          {t("settings.erpBadge")} v{APP_VERSION}
        </span>
        {serverSettings && serverSettings.appVersion ? (
          <span className="erp-badge erp-badge--success">
            {t("settings.apiBadge")}{" "}
            {safeText(serverSettings.appVersion, "")}
          </span>
        ) : null}
      </div>
      <h2 className="erp-section-title">{t("settings.title")}</h2>
      <p className="erp-page-lead">{t("settings.lead")}</p>

      <div className="erp-settings-grid">
        <div className="erp-card erp-card-elevated">
          <p className="erp-card-label">{t("settings.lang")}</p>
          <div className="erp-btn-row">
            <button
              type="button"
              className={
                locale === "ar"
                  ? "erp-btn erp-btn-primary erp-btn-sm"
                  : "erp-btn erp-btn-ghost erp-btn-sm"
              }
              onClick={() => setLocale("ar")}
            >
              {t("settings.langAr")}
            </button>
            <button
              type="button"
              className={
                locale === "fr"
                  ? "erp-btn erp-btn-primary erp-btn-sm"
                  : "erp-btn erp-btn-ghost erp-btn-sm"
              }
              onClick={() => setLocale("fr")}
            >
              {t("settings.langFr")}
            </button>
            <button
              type="button"
              className={
                locale === "en"
                  ? "erp-btn erp-btn-primary erp-btn-sm"
                  : "erp-btn erp-btn-ghost erp-btn-sm"
              }
              onClick={() => setLocale("en")}
            >
              {t("settings.langEn")}
            </button>
          </div>
        </div>

        <div className="erp-card erp-card-elevated">
          <p className="erp-card-label">{t("settings.company")}</p>
          <p className="erp-settings-readonly">
            {serverSettings && serverSettings.companyName ? (
              <>
                <strong>{serverSettings.companyName}</strong>
                <br />
              </>
            ) : null}
            <span className="erp-mono">GET /api/settings</span>
          </p>
        </div>

        <div className="erp-card erp-card-elevated">
          <p className="erp-card-label">{t("settings.uiPrefs")}</p>
          <label className="erp-settings-toggle">
            <input
              type="checkbox"
              checked={compact}
              onChange={(e) => setCompact(e.target.checked)}
            />
            <span>{t("settings.compact")}</span>
          </label>
        </div>

        <div className="erp-card erp-card-elevated">
          <p className="erp-card-label">{t("settings.theme")}</p>
          <div className="erp-btn-row">
            <button
              type="button"
              className={
                theme === "light"
                  ? "erp-btn erp-btn-primary erp-btn-sm"
                  : "erp-btn erp-btn-ghost erp-btn-sm"
              }
              onClick={() => setTheme("light")}
            >
              {t("settings.light")}
            </button>
            <button
              type="button"
              className={
                theme === "dark"
                  ? "erp-btn erp-btn-primary erp-btn-sm"
                  : "erp-btn erp-btn-ghost erp-btn-sm"
              }
              onClick={() => setTheme("dark")}
            >
              {t("settings.dark")}
            </button>
          </div>
        </div>

        <div className="erp-card erp-card-elevated">
          <p className="erp-card-label">{t("settings.exportTitle")}</p>
          <div className="erp-btn-row" style={{ flexWrap: "wrap" }}>
            <button
              type="button"
              className="erp-btn erp-btn-ghost erp-btn-sm"
              onClick={() =>
                runExport(
                  t("settings.exportTitle"),
                  "/api/products",
                  "products"
                )
              }
            >
              {t("settings.exportProducts")}
            </button>
            <button
              type="button"
              className="erp-btn erp-btn-ghost erp-btn-sm"
              onClick={() =>
                runExport(
                  t("settings.exportTitle"),
                  "/api/clients",
                  "clients"
                )
              }
            >
              {t("settings.exportClients")}
            </button>
            <button
              type="button"
              className="erp-btn erp-btn-ghost erp-btn-sm"
              onClick={() =>
                runExport(
                  t("settings.exportTitle"),
                  "/api/payments",
                  "payments"
                )
              }
            >
              {t("settings.exportPayments")}
            </button>
            <button
              type="button"
              className="erp-btn erp-btn-ghost erp-btn-sm"
              onClick={() =>
                runExport(
                  t("settings.exportTitle"),
                  "/api/sales?from=2000-01-01&to=2100-01-01",
                  "sales"
                )
              }
            >
              {t("settings.exportSales")}
            </button>
          </div>
        </div>

        <div className="erp-card erp-card-elevated">
          <p className="erp-card-label">{t("settings.system")}</p>
          <ul className="erp-settings-list">
            <li>
              <span>{t("settings.feVersion")}</span>
              <strong className="erp-mono">{APP_VERSION}</strong>
            </li>
            {serverSettings && serverSettings.appVersion ? (
              <li>
                <span>{t("settings.beVersion")}</span>
                <strong className="erp-mono">
                  {serverSettings.appVersion}
                </strong>
              </li>
            ) : null}
            {serverSettings && serverSettings.environment ? (
              <li>
                <span>{t("settings.env")}</span>
                <strong className="erp-mono">
                  {serverSettings.environment}
                </strong>
              </li>
            ) : null}
            <li>
              <span>{t("settings.backend")}</span>
              <span className="erp-btn-row">
                {backendOk === null ? (
                  <span className="erp-badge erp-badge--neutral">
                    {t("settings.checking")}
                  </span>
                ) : backendOk ? (
                  <span className="erp-badge erp-badge--success">
                    {t("settings.online")}
                  </span>
                ) : (
                  <span className="erp-badge erp-badge--warning">
                    {t("settings.offline")}
                  </span>
                )}
                <button
                  type="button"
                  className="erp-btn erp-btn-ghost erp-btn-sm"
                  onClick={pingBackend}
                >
                  {t("settings.ping")}
                </button>
              </span>
            </li>
          </ul>
        </div>
      </div>
      <ErpModuleFooter />
    </section>
  );
}
