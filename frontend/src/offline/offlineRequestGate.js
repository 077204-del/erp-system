import { enqueueOfflineMutation } from "./mutationQueue";

function isAuthRoute(url) {
  return String(url || "").includes("/api/auth/");
}

function shouldQueueMutation(method, url) {
  if (isAuthRoute(url)) return false;
  const m = (method || "").toLowerCase();
  if (!["post", "put", "patch", "delete"].includes(m)) return false;
  const u = String(url || "").split("?")[0];
  return (
    u.includes("/api/sales") ||
    u.includes("/api/expenses") ||
    u.endsWith("/api/payments") ||
    u.includes("/api/products") ||
    u.includes("/api/clients")
  );
}

function offlineQueuedResponse(config) {
  return Promise.resolve({
    data: { offlineQueued: true, queuedAt: Date.now() },
    status: 202,
    statusText: "Queued",
    headers: {},
    config,
  });
}

/**
 * @param {import("axios").InternalAxiosRequestConfig} config
 * @returns {import("axios").InternalAxiosRequestConfig}
 */
export function applyOfflineMutationGate(config) {
  if (config.__erpReplay) return config;
  const method = (config.method || "get").toLowerCase();
  const url = config.url || "";
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    if (shouldQueueMutation(method, url)) {
      enqueueOfflineMutation({
        method,
        url,
        data: config.data,
        params: config.params,
      });
      return { ...config, adapter: () => offlineQueuedResponse(config) };
    }
  }
  return config;
}
