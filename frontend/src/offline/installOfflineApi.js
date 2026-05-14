import axios from "axios";
import { getApiBaseUrl } from "../config/apiBase";
import {
  cacheSuccessfulGet,
  invalidateWorkspaceCaches,
  readCachedGet,
} from "./responseCache";
import { peekOfflineQueue, shiftOfflineQueue } from "./mutationQueue";

function maybeInvalidateWorkspaceCache(config, status) {
  if (status >= 400) return;
  const m = (config.method || "get").toLowerCase();
  if (!["post", "put", "patch", "delete"].includes(m)) return;
  const u = String(config.url || "").split("?")[0];
  if (
    u.includes("/api/products") ||
    u.includes("/api/clients") ||
    u.includes("/api/sales") ||
    u.includes("/api/payments") ||
    u.includes("/api/expenses") ||
    u.includes("/api/dashboard")
  ) {
    invalidateWorkspaceCaches();
  }
}

/**
 * Cache successful GETs (workspace + catalog).
 * @param {import("axios").AxiosInstance} client
 */
export function installOfflineApi(client) {
  client.interceptors.response.use(
    (res) => {
      const cfg = res.config;
      if (!cfg.__erpReplay && (cfg.method || "get").toLowerCase() === "get") {
        cacheSuccessfulGet(cfg, res.data, res.status);
      }
      maybeInvalidateWorkspaceCache(cfg, res.status);
      if (res.status === 202 && res.data && res.data.offlineQueued) {
        try {
          window.dispatchEvent(new CustomEvent("erp:offline-queued"));
        } catch {
          /* ignore */
        }
      }
      return res;
    },
    (err) => Promise.reject(err)
  );
}

let replayClient;

function getReplayClient() {
  if (!replayClient) {
    replayClient = axios.create({
      timeout: 120_000,
      baseURL: getApiBaseUrl(),
    });
    replayClient.interceptors.request.use((config) => {
      config.__erpReplay = true;
      const token = localStorage.getItem("token");
      if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }
  return replayClient;
}

export async function replayOfflineMutationQueue() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, reason: "offline", played: 0 };
  }
  const axiosReplay = getReplayClient();
  let played = 0;
  while (peekOfflineQueue().length > 0) {
    const item = peekOfflineQueue()[0];
    if (!item) break;
    try {
      await axiosReplay.request({
        method: item.method,
        url: item.url,
        data: item.data,
        params: item.params,
      });
      shiftOfflineQueue();
      played += 1;
    } catch {
      break;
    }
  }
  if (played > 0) {
    try {
      window.dispatchEvent(
        new CustomEvent("erp:offline-synced", { detail: { count: played } })
      );
    } catch {
      /* ignore */
    }
  }
  return { ok: true, played };
}

/**
 * @param {import("axios").AxiosError} err
 * @returns {import("axios").AxiosResponse|null}
 */
export function tryServeCachedGet(err) {
  if (!err || !err.config) return null;
  const config = err.config;
  if (config.__erpReplay) return null;
  if ((config.method || "get").toLowerCase() !== "get") return null;
  if (err.response) return null;
  const hit = readCachedGet(config);
  if (!hit) return null;
  return {
    data: hit.data,
    status: hit.status,
    statusText: "OK (cache)",
    headers: {},
    config,
  };
}
