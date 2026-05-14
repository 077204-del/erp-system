/**
 * Normalize server blob + Content-Type so WebView PDF/HTML viewers open reliably
 * (avoids blank tabs when the server sends application/octet-stream, etc.).
 *
 * @param {Blob|ArrayBuffer} raw
 * @param {string} contentTypeHeader
 * @param {{ thermal?: boolean, pdf?: boolean }} mode
 * @returns {Promise<Blob>}
 */
function isPdfMagic(buf) {
  if (!buf || buf.byteLength < 5) return false;
  const u = new Uint8Array(buf);
  return u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46;
}

function tryParseJsonErrorMessage(buf) {
  try {
    const slice = buf.byteLength > 4000 ? buf.slice(0, 4000) : buf;
    const t = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    const s = t.trim();
    if (!s.startsWith("{") && !s.startsWith("[")) return null;
    const j = JSON.parse(s);
    if (j && typeof j === "object") {
      if (j.message != null) return String(j.message);
      if (j.error != null) return String(j.error);
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function toInvoiceBlob(raw, contentTypeHeader, mode) {
  const { thermal } = mode;

  const buf = raw instanceof Blob ? await raw.arrayBuffer() : raw;
  if (!buf || buf.byteLength === 0) {
    throw new Error("empty");
  }

  if (thermal) {
    const ct = String(contentTypeHeader || "").toLowerCase();
    const mime = ct.includes("html")
      ? ct.split(";")[0].trim()
      : "text/html;charset=utf-8";
    return new Blob([buf], { type: mime });
  }

  /** PDF: always use strict application/pdf MIME for WebView / embed viewers */
  if (!isPdfMagic(buf)) {
    const jm = tryParseJsonErrorMessage(buf);
    throw new Error(jm || "invalid_pdf");
  }

  return new Blob([buf], { type: "application/pdf" });
}
