import { useState } from "react";
import api from "./api";
import ErpModuleFooter from "./components/ErpModuleFooter";
import { useErpUi } from "./context/ErpUiContext";
import { useLocale } from "./context/LocaleContext";

function loginErrorMessage(err) {
  if (!err) return "Login failed. Please try again.";
  const d = err.response && err.response.data;
  if (!d) return err.message || "Login failed. Please try again.";
  return d.message || d.error || err.message || "Login failed. Please try again.";
}

function normalizeStoredRole(role) {
  let r = String(role || "").trim().toLowerCase();
  if (r === "administrator" || r === "superadmin" || r === "owner") r = "admin";
  if (r === "admin" || r === "manager" || r === "cashier") return r;
  return r;
}

function Login({ onLogin, onLoadingChange }) {
  const { toast } = useErpUi();
  const { t } = useLocale();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setError("");
    if (!username || !password) {
      setError(t("login.needBoth"));
      return;
    }

    try {
      setLoading(true);
      if (onLoadingChange) onLoadingChange(true);

      const res = await api.post("/api/auth/login", {
        username,
        password,
      });

      const token = res.data?.token;
      const user = res.data?.user ? { ...res.data.user } : null;

      if (!token) {
        setError(t("login.noToken"));
        return;
      }

      if (user && user.role != null) {
        user.role = normalizeStoredRole(user.role);
      }

      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));

      toast.success(t("login.welcome"));
      onLogin({ token, user });
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setLoading(false);
      if (onLoadingChange) onLoadingChange(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <div className="erp-app">
      <div className="erp-login-page">
        <div className="erp-login-card">
          <h1 className="erp-login-title">{t("login.title")}</h1>
          <p className="erp-login-sub">{t("login.subtitle")}</p>

          {error ? (
            <div className="erp-alert erp-alert--error" role="alert">
              <div>
                <p className="erp-alert-title">{t("login.couldNotSignIn")}</p>
                <p className="erp-alert-msg">{error}</p>
              </div>
            </div>
          ) : null}

          <div className="erp-login-fields">
            <div className="erp-field">
              <label htmlFor="login-user">{t("login.user")}</label>
              <input
                id="login-user"
                type="text"
                autoComplete="username"
                placeholder={t("login.user")}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={onKeyDown}
              />
            </div>

            <div className="erp-field">
              <label htmlFor="login-pass">{t("login.pass")}</label>
              <input
                id="login-pass"
                type="password"
                autoComplete="current-password"
                placeholder={t("login.pass")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={onKeyDown}
              />
            </div>
          </div>

          <div className="erp-login-actions">
            <button
              type="button"
              className="erp-btn erp-btn-primary"
              onClick={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="erp-spinner erp-spinner--sm" aria-hidden />
                  {t("login.signingIn")}
                </>
              ) : (
                t("login.submit")
              )}
            </button>
          </div>
        </div>
        <ErpModuleFooter />
      </div>
    </div>
  );
}

export default Login;
