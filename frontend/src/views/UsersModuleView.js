import { useCallback, useEffect, useState, useMemo } from "react";
import api from "../api";
import ErpDataTable from "../components/ErpDataTable";
import ErpModuleFooter from "../components/ErpModuleFooter";
import { useErpUi } from "../context/ErpUiContext";
import { useLocale } from "../context/LocaleContext";
import { apiErrorMessage, safeText } from "../utils/erpFormat";

function readSelfId() {
  try {
    const raw = localStorage.getItem("user");
    const u = raw ? JSON.parse(raw) : null;
    return u && u.id != null ? String(u.id) : "";
  } catch {
    return "";
  }
}

const CASHIER_PERM_KEYS = [
  "canCreateSales",
  "canEditSales",
  "canDeleteSales",
  "canCreatePayments",
  "canDeletePayments",
  "canViewReports",
  "canManageClients",
  "canManageProducts",
  "canManageExpenses",
  "canManageUsers",
];

const PERM_LABEL_I18N = {
  canCreateSales: "users.permCreateSales",
  canEditSales: "users.permEditSales",
  canDeleteSales: "users.permDeleteSales",
  canCreatePayments: "users.permCreatePayments",
  canDeletePayments: "users.permDeletePayments",
  canViewReports: "users.permViewReports",
  canManageClients: "users.permManageClients",
  canManageProducts: "users.permManageProducts",
  canManageExpenses: "users.permManageExpenses",
  canManageUsers: "users.permManageUsers",
};

function buildPermDraft(perm) {
  const src = perm && typeof perm === "object" ? perm : {};
  const d = {};
  CASHIER_PERM_KEYS.forEach((k) => {
    d[k] = src[k] === true;
  });
  return d;
}

function CashierPermissionCard({ row, t, toast, onReload }) {
  const [draft, setDraft] = useState(() => buildPermDraft(row.permissions));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(buildPermDraft(row.permissions));
  }, [row.id, row.permissions]);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/users/${row.id}/permissions`, draft);
      toast.success(t("users.permSaved"));
      await onReload();
    } catch (e) {
      toast.error(apiErrorMessage(e), t("users.toastTitle"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="erp-card erp-card-elevated"
      style={{ marginTop: "0.75rem" }}
    >
      <p className="erp-card-label">
        {safeText(row.username, "—")} · {t("users.permSection")}
      </p>
      <p className="erp-card-hint">{t("users.permHint")}</p>
      <div className="erp-perm-grid">
        {CASHIER_PERM_KEYS.map((key) => (
          <label key={key} className="erp-settings-toggle">
            <input
              type="checkbox"
              checked={draft[key] === true}
              onChange={(e) =>
                setDraft((d) => ({ ...d, [key]: e.target.checked }))
              }
              disabled={saving}
            />
            <span>{t(PERM_LABEL_I18N[key] || key)}</span>
          </label>
        ))}
      </div>
      <button
        type="button"
        className="erp-btn erp-btn-primary erp-btn-sm"
        onClick={save}
        disabled={saving}
      >
        {saving ? t("users.permSaving") : t("users.permSave")}
      </button>
    </div>
  );
}

export default function UsersModuleView() {
  const { toast, confirm } = useErpUi();
  const { t } = useLocale();
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState(null);
  const [rows, setRows] = useState([]);
  const [selfId] = useState(() => readSelfId());

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("cashier");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/users");
      const data = res.data;
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.users)
          ? data.users
          : [];
      setRows(list);
      setAccess("admin");
    } catch (e) {
      const st = e.response && e.response.status;
      setRows([]);
      if (st === 403 || st === 404 || st === 405) {
        setAccess("denied");
      } else {
        setAccess("denied");
        toast.error(apiErrorMessage(e), t("users.toastTitle"));
      }
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    load();
  }, [load]);

  const cashierRows = useMemo(
    () =>
      rows.filter((r) => String(r.role || "").toLowerCase() === "cashier"),
    [rows]
  );

  const onCreate = async () => {
    const u = newUsername.trim();
    if (!u) {
      toast.warning(t("users.needUsername"));
      return;
    }
    if (!newPassword || newPassword.length < 4) {
      toast.warning(t("users.passwordLen"));
      return;
    }
    try {
      setSaving(true);
      await api.post("/api/users", {
        username: u,
        password: newPassword,
        role: newRole,
      });
      toast.success(t("users.created"));
      setNewUsername("");
      setNewPassword("");
      setNewRole("cashier");
      await load();
    } catch (e) {
      toast.error(apiErrorMessage(e), t("users.toastTitle"));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (row) => {
    const id = row && row.id != null ? String(row.id) : "";
    if (!id) return;
    if (selfId && id === selfId) {
      toast.warning(t("users.cannotDeleteSelf"));
      return;
    }
    confirm({
      title: t("users.deleteTitle"),
      message: safeText(row.username, "—"),
      confirmLabel: t("users.deleteConfirm"),
      danger: true,
      onConfirm: async () => {
        try {
          await api.delete(`/api/users/${id}`);
          toast.success(t("users.deleted"));
          await load();
        } catch (e) {
          toast.error(apiErrorMessage(e), t("users.toastTitle"));
        }
      },
    });
  };

  if (loading && access == null) {
    return (
      <section className="erp-section erp-section-flush-top">
        <h2 className="erp-section-title">{t("users.adminOnlyTitle")}</h2>
        <p className="erp-page-lead erp-card-hint">{t("users.loading")}</p>
        <ErpModuleFooter />
      </section>
    );
  }

  if (access === "denied") {
    return (
      <section className="erp-section erp-section-flush-top">
        <div className="erp-card erp-card-elevated erp-unavailable-panel">
          <h2 className="erp-section-title">{t("users.adminOnlyTitle")}</h2>
          <p className="erp-page-lead">{t("users.adminOnlyLead")}</p>
          <span className="erp-badge erp-badge--neutral">
            {t("users.adminOnlyBadge")}
          </span>
        </div>
        <ErpModuleFooter />
      </section>
    );
  }

  const columns = [
    {
      key: "username",
      header: t("users.colUsername"),
      searchAccessor: (r) => r.username,
      render: (r) => safeText(r.username, "—"),
    },
    {
      key: "role",
      header: t("users.colRole"),
      clip: false,
      searchAccessor: (r) => r.role,
      render: (r) => {
        const role = String(r.role || "").toLowerCase();
        const cls =
          role === "admin"
            ? "erp-badge erp-badge--warning"
            : "erp-badge erp-badge--neutral";
        return <span className={cls}>{safeText(r.role, "—")}</span>;
      },
    },
    {
      key: "createdAt",
      header: t("users.colCreated"),
      render: (r) =>
        r.createdAt ? safeText(String(r.createdAt).slice(0, 10), "—") : "—",
    },
    {
      key: "actions",
      header: "",
      clip: false,
      render: (r) => {
        const id = r && r.id != null ? String(r.id) : "";
        const disabled = selfId && id === selfId;
        return (
          <button
            type="button"
            className="erp-btn erp-btn-ghost erp-btn-sm"
            disabled={disabled}
            onClick={() => onDelete(r)}
          >
            {t("users.delete")}
          </button>
        );
      },
    },
  ];

  return (
    <section className="erp-section erp-section-flush-top">
      <h2 className="erp-section-title">{t("users.title")}</h2>
      <p className="erp-page-lead">{t("users.lead")}</p>

      <div className="erp-card erp-card-elevated" style={{ marginBottom: "1rem" }}>
        <p className="erp-card-label">{t("users.newUser")}</p>
        <div className="erp-filter erp-filter--inline">
          <div className="erp-field">
            <label htmlFor="nu-user">{t("users.username")}</label>
            <input
              id="nu-user"
              type="text"
              autoComplete="off"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
            />
          </div>
          <div className="erp-field">
            <label htmlFor="nu-pass">{t("users.password")}</label>
            <input
              id="nu-pass"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="erp-field">
            <label htmlFor="nu-role">{t("users.role")}</label>
            <select
              id="nu-role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
            >
              <option value="cashier">{t("users.cashier")}</option>
              <option value="admin">{t("users.admin")}</option>
            </select>
          </div>
          <div className="erp-btn-row" style={{ alignSelf: "flex-end" }}>
            <button
              type="button"
              className="erp-btn erp-btn-primary erp-btn-sm"
              onClick={onCreate}
              disabled={saving}
            >
              {saving ? t("users.saving") : t("users.create")}
            </button>
          </div>
        </div>
      </div>

      <ErpDataTable
        columns={columns}
        rows={rows}
        getRowId={(r) =>
          r.id != null ? String(r.id) : `u-${safeText(r.username, "unknown")}`
        }
        pageSize={12}
        loading={loading}
        showSkeleton={loading}
        emptyTitle={t("users.noUsers")}
        emptyHint={t("users.emptyHint")}
        searchPlaceholder={t("users.searchPh")}
      />

      {cashierRows.length ? (
        <div style={{ marginTop: "1.25rem" }}>
          {cashierRows.map((r) => (
            <CashierPermissionCard
              key={r.id}
              row={r}
              t={t}
              toast={toast}
              onReload={load}
            />
          ))}
        </div>
      ) : null}

      <ErpModuleFooter />
    </section>
  );
}
