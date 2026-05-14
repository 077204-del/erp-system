/**
 * Capacitor / WebView–friendly blob handling (no new native plugins).
 * Prefer programmatic <a target="_blank"> over window.open (often blocked on Android).
 */

function safeRevoke(href, ms) {
  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(href);
    } catch {
      /* ignore */
    }
  }, ms);
}

/**
 * @param {Blob} blob
 * @param {string} [filename]
 * @returns {boolean} true if a navigation/download was triggered
 */
export function downloadBlob(blob, filename = "download.bin") {
  let href;
  try {
    href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.rel = "noopener";
    if (blob && blob.type) {
      a.type = blob.type;
    }
    document.body.appendChild(a);
    a.click();
    a.remove();
    safeRevoke(href, 8000);
    return true;
  } catch (err) {
    console.error("[openBlobUrl] downloadBlob failed", err);
    try {
      if (href) URL.revokeObjectURL(href);
    } catch {
      /* ignore */
    }
    return false;
  }
}

/**
 * Open blob in a new browsing context (PDF / HTML preview).
 * @param {Blob} blob
 * @param {number} [revokeMs]
 * @returns {boolean}
 */
export function openBlobInNewContext(blob, revokeMs = 300_000) {
  let href;
  try {
    href = URL.createObjectURL(blob);
  } catch (err) {
    console.error("[openBlobUrl] createObjectURL failed", err);
    return false;
  }

  const cap =
    typeof window !== "undefined" && window.Capacitor?.getPlatform?.();
  const tryWindowOpenFirst = cap === "android" || cap === "ios";

  const tryWindow = () => {
    try {
      const w = window.open(href, "_blank", "noopener,noreferrer");
      if (w) {
        safeRevoke(href, revokeMs);
        return true;
      }
    } catch (err2) {
      console.error("[openBlobUrl] window.open failed", err2);
    }
    return false;
  };

  const tryAnchor = () => {
    try {
      const a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      if (blob && blob.type) {
        a.type = blob.type;
      }
      document.body.appendChild(a);
      a.click();
      a.remove();
      safeRevoke(href, revokeMs);
      return true;
    } catch (err) {
      console.error("[openBlobUrl] anchor preview failed", err);
      return false;
    }
  };

  if (tryWindowOpenFirst) {
    if (tryWindow()) return true;
    if (tryAnchor()) return true;
  } else {
    if (tryAnchor()) return true;
    if (tryWindow()) return true;
  }

  try {
    URL.revokeObjectURL(href);
  } catch {
    /* ignore */
  }
  return false;
}
