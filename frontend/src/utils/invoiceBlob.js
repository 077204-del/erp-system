/**
 * Normalize server blob + Content-Type so WebView PDF/HTML viewers open reliably
 * (avoids blank tabs when the server sends application/octet-stream, etc.).
 *
 * @param {Blob|ArrayBuffer} raw
 * @param {string} contentTypeHeader
 * @param {{ thermal?: boolean, pdf?: boolean }} mode
 * @returns {Promise<Blob>}
 */
export async function toInvoiceBlob(raw, contentTypeHeader, mode) {
  const ct = String(contentTypeHeader || "").toLowerCase();
  const { thermal, pdf } = mode;

  let mime;
  if (pdf) {
    mime = ct.includes("pdf")
      ? ct.split(";")[0].trim()
      : "application/pdf";
  } else if (thermal) {
    mime = ct.includes("html")
      ? ct.split(";")[0].trim()
      : "text/html;charset=utf-8";
  } else {
    mime = ct.includes("pdf")
      ? ct.split(";")[0].trim()
      : "application/pdf";
  }

  const buf =
    raw instanceof Blob ? await raw.arrayBuffer() : raw;
  if (!buf || buf.byteLength === 0) {
    throw new Error("empty");
  }
  return new Blob([buf], { type: mime });
}
