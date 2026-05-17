/**
 * Capacitor / mobile WebView UX helpers (no new API surface).
 * - Scroll focused inputs into view when the keyboard opens.
 * - Expose --erp-vvh from visualViewport for layouts that need it.
 */
export function initMobileBoot() {
  if (typeof document === "undefined") return undefined;

  try {
    document.documentElement.setAttribute("data-erp-build", "v3");
    const h0 =
      typeof window !== "undefined" && window.innerHeight
        ? window.innerHeight
        : 600;
    document.documentElement.style.setProperty(
      "--erp-vvh",
      `${Math.round(h0)}px`
    );
  } catch {
    /* ignore */
  }

  const scrollToField = (el) => {
    try {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch {
      /* ignore */
    }
  };

  const onFocusIn = (e) => {
    const t = e.target;
    if (!t || typeof t.matches !== "function") return;
    if (!t.matches("input, textarea, select, [contenteditable='true']"))
      return;
    const run = () => scrollToField(t);
    window.setTimeout(run, 280);
    window.requestAnimationFrame(() => window.requestAnimationFrame(run));
  };
  document.addEventListener("focusin", onFocusIn);

  let vvCleanup;
  if (typeof window !== "undefined" && window.visualViewport) {
    const vv = window.visualViewport;
    const sync = () => {
      try {
        const h = vv.height || window.innerHeight;
        document.documentElement.style.setProperty("--erp-vvh", `${Math.round(h)}px`);
      } catch {
        /* ignore */
      }
    };
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    sync();
    vvCleanup = () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  } else if (typeof window !== "undefined") {
    const syncInner = () => {
      try {
        const h = window.innerHeight || 600;
        document.documentElement.style.setProperty("--erp-vvh", `${Math.round(h)}px`);
      } catch {
        /* ignore */
      }
    };
    syncInner();
    window.addEventListener("resize", syncInner);
    vvCleanup = () => window.removeEventListener("resize", syncInner);
  }

  return () => {
    document.removeEventListener("focusin", onFocusIn);
    if (vvCleanup) vvCleanup();
  };
}
