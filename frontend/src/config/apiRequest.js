/**
 * GET params + axios flags for workspace reads (cache-bust + skip stale offline cache).
 */

/**
 * @param {Record<string, unknown>} [params]
 * @param {{ fresh?: boolean }} [opts]
 */
export function workspaceGetParams(params = {}, opts = {}) {
  const p = { ...params };
  if (opts.fresh !== false) {
    p._ts = Date.now();
  }
  return p;
}

/** Axios config: always hit network for dashboard/workspace when online. */
export function freshGetConfig() {
  return { __erpFresh: true };
}
