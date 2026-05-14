import { useEffect, useMemo, useState } from "react";
import LayoutShell from "./LayoutShell";
import { LocaleProvider, useLocale } from "../context/LocaleContext";
import "../mobileLayoutPreview.css";

const HASHES = new Set(["/mobile-layout-preview", "mobile-layout-preview"]);

export function isMobileLayoutPreviewHash() {
  if (typeof window === "undefined") return false;
  const raw = (window.location.hash || "").replace(/^#/, "");
  return HASHES.has(raw);
}

const WIDTH_PRESETS = [
  { label: "360", width: 360 },
  { label: "390", width: 390 },
  { label: "414", width: 414 },
  { label: "428", width: 428 },
];

function MobileLayoutPreviewBody() {
  const { t, locale, setLocale } = useLocale();
  const [activeView, setActiveView] = useState("dashboard");
  const [frameWidth, setFrameWidth] = useState(390);

  useEffect(() => {
    document.documentElement.classList.add("erp-mobile-preview-active");
    return () => {
      document.documentElement.classList.remove("erp-mobile-preview-active");
    };
  }, []);

  const statusLabel = useMemo(
    () => `${frameWidth}px · ${locale.toUpperCase()}`,
    [frameWidth, locale]
  );

  return (
    <div className="erp-mobile-preview-page">
      <p className="erp-mobile-preview-page__hint">
        Mobile shell preview — same <code>LayoutShell</code> as production. Frame width simulates
        common Android logical widths; CSS is scoped so flex + drawer match{" "}
        <code>@media (max-width: 900px)</code> even on a wide monitor. URL:{" "}
        <code>#/mobile-layout-preview</code>
      </p>

      <div className="erp-mobile-preview-toolbar">
        <span className="erp-mobile-preview-toolbar__label">Device width</span>
        {WIDTH_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className={
              frameWidth === p.width ? "erp-mobile-preview-toolbar__btn--active" : ""
            }
            onClick={() => setFrameWidth(p.width)}
          >
            {p.label}px
          </button>
        ))}
        <span className="erp-mobile-preview-toolbar__label">Direction</span>
        <button
          type="button"
          className={locale === "ar" ? "erp-mobile-preview-toolbar__btn--active" : ""}
          onClick={() => setLocale("ar")}
        >
          RTL (AR)
        </button>
        <button
          type="button"
          className={locale === "en" ? "erp-mobile-preview-toolbar__btn--active" : ""}
          onClick={() => setLocale("en")}
        >
          LTR (EN)
        </button>
        <button type="button" onClick={() => setLocale("fr")}>
          FR
        </button>
        <button
          type="button"
          onClick={() => {
            window.location.hash = "";
          }}
        >
          Close preview
        </button>
      </div>

      <div className="erp-mobile-preview-chrome">
        <div className="erp-mobile-preview-chrome__speaker" aria-hidden />
        <div
          className="erp-mobile-preview-viewport"
          style={{ width: frameWidth, maxWidth: "100%" }}
        >
          <LayoutShell
            activeView={activeView}
            onNavigate={setActiveView}
            userLabel="Preview"
            userRole="admin"
            statusLabel={statusLabel}
            navFlags={{ canViewReports: true, canManageExpenses: true }}
            onLogout={() => {
              window.location.hash = "";
            }}
          >
            <div className="erp-kpi-grid">
              <article className="erp-card erp-card-kpi">
                <p className="erp-card-label">{t("nav.dashboard")}</p>
                <p className="erp-card-value erp-num">12 450</p>
                <p className="erp-card-hint">Mock KPI — scroll this area on a tall phone.</p>
              </article>
              <article className="erp-card erp-card-kpi">
                <p className="erp-card-label">{t("nav.sales")}</p>
                <p className="erp-card-value erp-num">842</p>
                <p className="erp-card-hint">No API calls in preview mode.</p>
              </article>
              <article className="erp-card erp-card-kpi">
                <p className="erp-card-label">{t("nav.clients")}</p>
                <p className="erp-card-value erp-num">128</p>
                <p className="erp-card-hint">Tap ☰ to open the drawer; scrim closes it.</p>
              </article>
            </div>
            <p className="erp-card-hint" style={{ marginTop: "1rem" }}>
              Check that the main column uses full width (no empty strip beside the sidebar in
              RTL) and that nothing overflows horizontally.
            </p>
          </LayoutShell>
        </div>
      </div>
    </div>
  );
}

/**
 * Standalone route: mount with providers so LayoutShell matches the real app.
 * Open: http://localhost:3000/#/mobile-layout-preview
 */
export default function MobileLayoutPreview() {
  return (
    <LocaleProvider>
      <MobileLayoutPreviewBody />
    </LocaleProvider>
  );
}
