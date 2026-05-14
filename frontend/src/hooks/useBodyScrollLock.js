import { useEffect } from "react";

/**
 * Prevents the workspace (.erp-main) from scrolling behind fixed overlays
 * (modals, confirm). Reduces WebView scroll chaining and layout jump.
 */
export function useBodyScrollLock(locked) {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [locked]);
}
