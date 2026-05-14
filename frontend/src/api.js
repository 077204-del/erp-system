import axios from "axios";
import { getApiBaseUrl } from "./config/apiBase";
import { applyOfflineMutationGate } from "./offline/offlineRequestGate";
import { installOfflineApi, tryServeCachedGet } from "./offline/installOfflineApi";

const api = axios.create({
  timeout: 60_000,
});

let apiBaseLogged = false;

api.interceptors.request.use((config) => {
  const baseURL = getApiBaseUrl();
  config.baseURL = baseURL;
  if (!apiBaseLogged) {
    apiBaseLogged = true;
    if (process.env.NODE_ENV !== "production") {
      console.log("API BASE:", baseURL);
    }
  }
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return applyOfflineMutationGate(config);
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const cached = tryServeCachedGet(err);
    if (cached) return Promise.resolve(cached);
    if (err.response && err.response.status === 401) {
      localStorage.removeItem("token");
      try {
        localStorage.removeItem("user");
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new Event("erp:unauthorized"));
    } else if (!err.response) {
      const hint =
        err.code === "ECONNABORTED"
          ? "Request timed out"
          : err.message || "Network error (no response from server)";
      console.error(
        "[API]",
        hint,
        err.config?.method,
        err.config?.baseURL,
        err.config?.url
      );
    }
    return Promise.reject(err);
  }
);

installOfflineApi(api);

export default api;
