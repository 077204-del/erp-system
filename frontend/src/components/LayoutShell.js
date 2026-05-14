import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { safeText } from "../utils/erpFormat";

const NAV = [
  { id: "dashboard", icon: "grid" },
  { id: "sales", icon: "cart" },
  { id: "products", icon: "box" },
  { id: "clients", icon: "users" },
  { id: "payments", icon: "card" },
  { id: "invoices", icon: "doc" },
  { id: "client-debt", icon: "scale" },
  { id: "reports", icon: "chart" },
  { id: "cash-closing", icon: "lock" },
  { id: "register", icon: "calendar" },
  { id: "expenses", icon: "receipt" },
  { id: "users", icon: "user-cog" },
  { id: "audit", icon: "scroll" },
  { id: "settings", icon: "gear" },
];

/** Cashier: POS + read-only catalog & balances; no admin modules. */
const CASHIER_NAV_IDS = new Set([
  "dashboard",
  "sales",
  "products",
  "clients",
  "payments",
  "invoices",
]);

function NavIcon({ name }) {
  const common = { width: 20, height: 20, fill: "none", stroke: "currentColor", strokeWidth: 1.6 };
  switch (name) {
    case "grid":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...common}>
          <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
        </svg>
      );
    case "cart":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...common}>
          <path d="M6 6h15l-1.5 9h-12L6 6zm0 0L5 3H2" />
          <circle cx="9" cy="20" r="1.5" />
          <circle cx="18" cy="20" r="1.5" />
        </svg>
      );
    case "box":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...common}>
          <path d="M12 3l8 4v10l-8 4-8-4V7l8-4z" />
          <path d="M12 12l8-4M12 12v9M12 12L4 8" />
        </svg>
      );
    case "users":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "card":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...common}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </svg>
      );
    case "doc":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </svg>
      );
    case "chart":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...common}>
          <path d="M4 19V5M9 19v-6M14 19V9M19 19v-9" />
        </svg>
      );
    case "scale":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...common}>
          <path d="M12 3v18M5 7l7-4 7 4M5 17l7 4 7-4" />
        </svg>
      );
    case "lock":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...common}>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      );
    case "calendar":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case "receipt":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...common}>
          <path d="M7 3h10v18l-2-1-2 1-2-1-2 1-2-1V3z" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </svg>
      );
    case "user-cog":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...common}>
          <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zM4 20a8 8 0 0 1 16 0" />
          <path d="M19 14l1.5 1M21 17h-2M19 20l-1.5-1M17 17l-1.5 1" />
        </svg>
      );
    case "gear":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...common}>
          <path d="M12 15a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM19 12l2-1-2-3.5-2.5.5-1.8-1.5L15 4h-6l-.7 2.5L6.5 8 4 7.5 2 11l2 1-2 1 2 3.5 2.5-.5 1.8 1.5L9 20h6l.7-2.5 1.8-1.5 2.5.5L22 13l-2-1z" />
        </svg>
      );
    case "scroll":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...common}>
          <path d="M8 4h12a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V6a2 2 0 0 1 2-2z" />
          <path d="M10 8h8M10 12h8M10 16h4" />
        </svg>
      );
    default:
      return null;
  }
}

export default function LayoutShell({
  activeView,
  onNavigate,
  userLabel,
  userRole,
  statusLabel,
  children,
  navFlags = {},
  onLogout,
}) {
  const { t } = useLocale();
  const isAdmin = String(userRole || "").toLowerCase() === "admin";
  const canViewReports = navFlags.canViewReports === true;
  const canManageExpenses = navFlags.canManageExpenses === true;
  const navItems = useMemo(() => {
    const filtered = NAV.filter((item) => {
      if (isAdmin) return true;
      if (item.id === "audit") return false;
      if (item.id === "reports" && canViewReports) return true;
      if (item.id === "expenses" && canManageExpenses) return true;
      return CASHIER_NAV_IDS.has(item.id);
    });
    return filtered.map((item) => ({
      ...item,
      label: t(`nav.${item.id}`),
    }));
  }, [t, isAdmin, canViewReports, canManageExpenses]);

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("erp-sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });

  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("erp-sidebar-collapsed", collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const layoutClass =
    "erp-layout" +
    (collapsed ? " erp-layout--sidebar-collapsed" : "") +
    (drawerOpen ? " erp-layout--drawer-open" : "");

  return (
    <div className={`erp-app ${layoutClass}`}>
      <aside className="erp-sidebar" aria-label="Main navigation">
        <div className="erp-sidebar__header">
          <div className="erp-sidebar__brand">
            {!collapsed ? (
              <>
                <span className="erp-sidebar__logo" aria-hidden>
                  EM
                </span>
                <div className="erp-sidebar__brand-text">
                  <span className="erp-sidebar__product">{t("brand.title")}</span>
                  <span className="erp-sidebar__tagline">{t("brand.tagline")}</span>
                </div>
              </>
            ) : (
              <span className="erp-sidebar__logo" aria-label={t("brand.title")}>
                E
              </span>
            )}
          </div>
          <button
            type="button"
            className="erp-sidebar__collapse"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <span className="erp-sidebar__collapse-icon" aria-hidden>
              {collapsed ? "»" : "«"}
            </span>
          </button>
        </div>
        <nav className="erp-sidebar__nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={
                "erp-nav-item" +
                (activeView === item.id ? " erp-nav-item--active" : "")
              }
              onClick={() => {
                onNavigate(item.id);
                setDrawerOpen(false);
              }}
            >
              <span className="erp-nav-item__icon">
                <NavIcon name={item.icon} />
              </span>
              <span className="erp-nav-item__label">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="erp-sidebar__footer">
          <div className="erp-sidebar-user-card">
            <div className="erp-sidebar-user-card__avatar" aria-hidden>
              {safeText(userLabel, "U").slice(0, 1).toUpperCase()}
            </div>
            <div className="erp-sidebar-user-card__meta">
              <p className="erp-sidebar-user-card__name">
                {safeText(userLabel, "User")}
              </p>
              <p className="erp-sidebar-user-card__role">
                {safeText(userRole, "cashier")}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="erp-sidebar-logout"
            onClick={() => {
              if (typeof onLogout === "function") onLogout();
            }}
          >
            {t("app.signOut")}
          </button>
        </div>
      </aside>

      <div
        className="erp-drawer-scrim"
        aria-hidden={!drawerOpen}
        onClick={closeDrawer}
      />

      <div className="erp-main">
        <header className="erp-topbar">
          <button
            type="button"
            className="erp-topbar__menu"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
          >
            <span className="erp-icon-hamburger" />
          </button>
          <div className="erp-topbar__titles">
            <h1 className="erp-topbar__title">
              {navItems.find((n) => n.id === activeView)?.label ||
                t("nav.dashboard")}
            </h1>
            <p className="erp-topbar__crumb">{t("topbar.crumb")}</p>
          </div>
          <div className="erp-topbar__right">
            <span className="erp-badge erp-badge--neutral erp-badge--pulse">
              {safeText(statusLabel, "Live")}
            </span>
            <div className="erp-topbar__user">
              <span className="erp-topbar__user-name">
                {safeText(userLabel, "User")}
              </span>
              {userRole ? (
                <span className="erp-topbar__user-role">{userRole}</span>
              ) : null}
            </div>
          </div>
        </header>
        <div className="erp-main__body">{children}</div>
      </div>
    </div>
  );
}
