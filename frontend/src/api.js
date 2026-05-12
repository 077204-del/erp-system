import axios from "axios";
import { getApiBaseUrl } from "./config/apiBase";

const api = axios.create();

let apiBaseLogged = false;

api.interceptors.request.use((config) => {
  const baseURL = getApiBaseUrl();
  config.baseURL = baseURL;
  if (!apiBaseLogged) {
    apiBaseLogged = true;
    console.log("API BASE:", baseURL);
  }
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      localStorage.removeItem("token");
      try {
        localStorage.removeItem("user");
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new Event("erp:unauthorized"));
    }
    return Promise.reject(err);
  }
);

export default api;
