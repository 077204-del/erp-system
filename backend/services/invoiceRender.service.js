/**
 * Invoice rendering from populated Sale documents only (ledger-safe reads).
 * Guards: no NaN/undefined in output strings.
 * Arabic: optional local TTF (postinstall fetch) + shaping for PDFKit LTR pipeline.
 */

const fs = require("fs");
const path = require("path");
let reshaper;
try {
  reshaper = require("arabic-persian-reshaper");
} catch {
  reshaper = null;
}

function money(n) {
  let x = Number(n);
  if (!Number.isFinite(x)) x = 0;
  if (x > 1e15) x = 1e15;
  if (x < -1e15) x = -1e15;
  return x.toFixed(2);
}

function safeStr(v, fallback = "") {
  if (v == null || v === "") return fallback;
  return String(v);
}

function escapeHtml(s) {
  return safeStr(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hasArabicScript(s) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(safeStr(s));
}

/** Prepare Arabic for PDFKit (shaped + visual order for LTR drawing). */
function pdfArabicText(s) {
  const str = safeStr(s);
  if (!str) return str;
  if (!hasArabicScript(str)) return str;
  if (!reshaper || !reshaper.ArabicShaper) return str;
  try {
    const shaped = reshaper.ArabicShaper.convertArabic(str);
    return shaped.split("").reverse().join("");
  } catch {
    return str;
  }
}

function resolveArabicFontPath() {
  const envPath = process.env.INVOICE_AR_FONT_PATH;
  const candidates = [
    envPath && String(envPath).trim(),
    path.join(__dirname, "..", "assets", "fonts", "Cairo-Regular.ttf"),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).size > 8000) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

const PDF_LABELS = {
  invoice: "فاتورة",
  invoiceNo: "رقم الفاتورة",
  date: "التاريخ",
  billTo: "العميل",
  phone: "الهاتف",
  lineItems: "البنود",
  qty: "الكمية",
  unit: "السعر",
  lineTotal: "المجموع",
  subtotalTotal: "الإجمالي",
  paid: "المدفوع",
  balanceDue: "المتبقي",
  status: "الحالة",
  walkIn: "زبون مباشر",
  product: "صنف",
  client: "عميل",
};

function buildInvoiceContext(sale) {
  const qty = Number(sale.quantity);
  const unitPrice = Number(sale.unitPrice);
  const lineTotal = Number(sale.total);

  return {
    companyName: safeStr(process.env.COMPANY_NAME || "Company"),
    invoiceNo: safeStr(sale._id),
    generatedAt: new Date(
      sale.createdAt || sale.saleDate || Date.now()
    ).toLocaleString("ar-SA", { numberingSystem: "latn" }),
    clientName: sale.clientId
      ? safeStr(sale.clientId.name, PDF_LABELS.client)
      : PDF_LABELS.walkIn,
    clientPhone: sale.clientId ? safeStr(sale.clientId.phone, "") : "",
    productName: sale.productId
      ? safeStr(sale.productId.name, PDF_LABELS.product)
      : PDF_LABELS.product,
    quantity: Number.isFinite(qty) ? qty : 0,
    unitPrice: money(unitPrice),
    lineTotal: money(lineTotal),
    total: money(sale.total),
    paid: money(sale.paidAmount),
    debt: money(sale.debt),
    status: safeStr(sale.status, ""),
  };
}

/**
 * @param {object} sale — populated sale from getSaleById
 * @param {object} doc — PDFKit document instance
 */
function renderProfessionalInvoicePdf(sale, doc) {
  const ctx = buildInvoiceContext(sale);
  const pageWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left = doc.page.margins.left;
  const fontPath = resolveArabicFontPath();
  const useArabicFont = Boolean(fontPath);
  const bodyFont = useArabicFont ? fontPath : "Helvetica";
  const bodyBold = useArabicFont ? fontPath : "Helvetica-Bold";

  doc.fillColor("#666666").font(bodyFont).fontSize(9);
  doc.text("[ LOGO PLACEHOLDER ]", left, 50, {
    width: pageWidth,
    align: "center",
  });

  doc.moveDown(2);
  doc.fillColor("#000000").font(bodyBold).fontSize(20);
  doc.text(
    useArabicFont ? pdfArabicText(PDF_LABELS.invoice) : "INVOICE",
    { align: "center" }
  );
  doc.moveDown();
  doc.font(bodyFont).fontSize(11);
  doc.text(
    useArabicFont ? pdfArabicText(ctx.companyName) : ctx.companyName,
    { align: "center" }
  );
  doc.moveDown(1.5);

  doc.fontSize(10).font(bodyFont);
  doc.text(
    `${useArabicFont ? pdfArabicText(PDF_LABELS.invoiceNo) : "Invoice #"}: ${ctx.invoiceNo}`,
    left
  );
  doc.text(
    `${useArabicFont ? pdfArabicText(PDF_LABELS.date) : "Date"}: ${ctx.generatedAt}`,
    left
  );
  doc.moveDown();

  doc.fontSize(11).font(bodyBold);
  doc.text(
    useArabicFont ? pdfArabicText(PDF_LABELS.billTo) : "Bill to:",
    left
  );
  doc.font(bodyFont).fontSize(10);
  doc.text(
    useArabicFont ? pdfArabicText(ctx.clientName) : ctx.clientName,
    left
  );
  if (ctx.clientPhone) {
    doc.text(
      `${useArabicFont ? pdfArabicText(PDF_LABELS.phone) : "Phone"}: ${ctx.clientPhone}`,
      left
    );
  }
  doc.moveDown();

  doc.fontSize(11).font(bodyBold);
  doc.text(
    useArabicFont ? pdfArabicText(PDF_LABELS.lineItems) : "Line items",
    left
  );
  doc.moveDown(0.5);
  doc.font(bodyFont).fontSize(10);
  const lineParts = [
    useArabicFont ? pdfArabicText(ctx.productName) : ctx.productName,
    `| ${useArabicFont ? pdfArabicText(PDF_LABELS.qty) : "Qty"}: ${ctx.quantity}`,
    `@ ${ctx.unitPrice}`,
    `= ${ctx.lineTotal}`,
  ];
  doc.text(lineParts.join("  "), left);
  doc.moveDown(1.5);

  doc.fontSize(11).font(bodyFont);
  doc.text(
    `${useArabicFont ? pdfArabicText(PDF_LABELS.subtotalTotal) : "Subtotal / Total"}: ${ctx.total}`,
    left
  );
  doc.text(
    `${useArabicFont ? pdfArabicText(PDF_LABELS.paid) : "Paid"}: ${ctx.paid}`,
    left
  );
  doc.text(
    `${useArabicFont ? pdfArabicText(PDF_LABELS.balanceDue) : "Balance due"}: ${ctx.debt}`,
    left
  );
  doc.text(
    `${useArabicFont ? pdfArabicText(PDF_LABELS.status) : "Status"}: ${ctx.status}`,
    left
  );
}

const TH_LABELS = {
  inv: "فاتورة",
  thanks: "شكراً لزيارتكم",
  paid: "مدفوع",
  due: "متبقي",
  st: "الحالة",
};

/** DD/MM/YYYY for thermal header only (display). */
function formatThermalDateDmy(sale) {
  const d = new Date(sale.createdAt || sale.saleDate || Date.now());
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Compact thermal-friendly HTML (browser print). RTL + Cairo/Tajawal; numbers LTR.
 * @param {object} sale — populated sale from getSaleById
 */
function renderThermalInvoiceHtml(sale) {
  const ctx = buildInvoiceContext(sale);
  const esc = escapeHtml;
  const dateDmy = esc(formatThermalDateDmy(sale));

  const rows = [
    `<tr><td colspan="2" class="th-gap"></td></tr>`,
    `<tr><td colspan="2" class="th-section">${esc("العميل")}</td></tr>`,
    `<tr><td colspan="2" class="th-wrap">${esc(ctx.clientName)}</td></tr>`,
    `<tr><td colspan="2" class="th-section">${esc("الصنف")}</td></tr>`,
    `<tr><td colspan="2" class="th-wrap">${esc(ctx.productName)}</td></tr>`,
    `<tr><td>${esc("الكمية")}</td><td class="th-num ltr">×${esc(String(ctx.quantity))}</td></tr>`,
    `<tr><td>${esc("سعر الوحدة")}</td><td class="th-num ltr">${esc(ctx.unitPrice)}</td></tr>`,
    `<tr class="th-strong"><td>${esc("الإجمالي")}</td><td class="th-num ltr">${esc(ctx.total)}</td></tr>`,
    `<tr><td>${esc(TH_LABELS.paid)}</td><td class="th-num ltr">${esc(ctx.paid)}</td></tr>`,
    `<tr><td>${esc(TH_LABELS.due)}</td><td class="th-num ltr">${esc(ctx.debt)}</td></tr>`,
    `<tr><td>${esc(TH_LABELS.st)}</td><td class="th-num ltr">${esc(ctx.status)}</td></tr>`,
  ].join("");

  const body = `
<div class="page">
  <div class="receipt" role="document">
    <div class="receipt__logo" aria-hidden="true"></div>
    <div class="receipt__brand">Eco Meuble</div>
    <div class="receipt__tagline">الأثاث والتأثيث</div>
    <div class="receipt__rule"></div>
    <div class="receipt__meta">
      <div class="receipt__meta-line ltr">Invoice: #<span class="receipt__invid">${esc(ctx.invoiceNo)}</span></div>
      <div class="receipt__meta-line ltr">Date: ${dateDmy}</div>
    </div>
    <div class="receipt__rule"></div>
    <table class="receipt__table" cellpadding="0" cellspacing="0">${rows}</table>
    <div class="receipt__rule"></div>
    <p class="receipt__thanks">${esc(TH_LABELS.thanks)}</p>
    <div class="receipt__rule receipt__rule--heavy"></div>
    <div class="receipt__footer">
      <div class="receipt__footer-line">Phone:</div>
      <div class="receipt__footer-line ltr">0771266804</div>
      <div class="receipt__footer-line ltr">0771890642</div>
    </div>
    <div class="receipt__qr" aria-hidden="true"></div>
  </div>
</div>`;

  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><title>${esc(TH_LABELS.inv)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Tajawal:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 100%; min-height: 100%; background: var(--bg, #e8ecf2); }
  .page {
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: max(12px, env(safe-area-inset-top, 0px)) max(12px, env(safe-area-inset-right, 0px)) max(12px, env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px));
  }
  .receipt {
    width: 100%;
    max-width: min(80mm, 100%);
    margin: 0 auto;
    background: #fff;
    color: #0f2242;
    border: 1px solid #c5ced9;
    border-radius: 10px;
    padding: 12px 14px 14px;
    box-shadow: 0 6px 22px rgba(15, 34, 66, 0.1);
    font-family: Cairo, Tajawal, Arial, sans-serif;
    font-size: 13px;
    line-height: 1.45;
  }
  .receipt__logo {
    min-height: 28px;
    margin: 0 auto 10px;
    max-width: 72mm;
    border: 1px dashed #b8c4d6;
    border-radius: 6px;
    background: #fafbfd;
  }
  .receipt__brand {
    font-weight: 700;
    font-size: 16px;
    text-align: center;
    letter-spacing: 0.02em;
    margin: 0;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  .receipt__tagline {
    font-weight: 600;
    font-size: 13px;
    text-align: center;
    margin: 4px 0 0;
    color: #1e3a5f;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  .receipt__meta {
    text-align: center;
    font-size: 12px;
    line-height: 1.55;
    padding: 2px 0;
  }
  .receipt__meta-line {
    margin: 2px 0;
    word-break: break-all;
  }
  .receipt__invid { font-weight: 600; }
  .receipt__rule {
    height: 1px;
    background: #dbe4f0;
    margin: 10px 0;
  }
  .receipt__rule--heavy {
    margin-top: 14px;
    margin-bottom: 10px;
    height: 2px;
    background: #0f2242;
    opacity: 0.2;
  }
  .receipt__table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .receipt__table td {
    padding: 6px 2px;
    vertical-align: top;
    border-bottom: 1px solid #eef2f8;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  .th-title { font-weight: 700; font-size: 14px; text-align: center; border-bottom: none !important; }
  .th-muted { color: #5a6b85; font-size: 12px; width: 38%; }
  .th-num { text-align: end; }
  .th-wrap { font-weight: 600; }
  .th-gap td { border: none !important; padding: 2px 0 !important; }
  .th-section { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #5a6b85; background: #f4f7fc; }
  .th-strong td { font-weight: 700; font-size: 14px; border-bottom: 2px solid #dbe4f0; }
  .ltr { direction: ltr; unicode-bidi: isolate; }
  .receipt__thanks {
    margin: 12px 0 0;
    text-align: center;
    font-size: 12px;
    color: #5a6b85;
  }
  .receipt__footer {
    text-align: center;
    font-size: 10px;
    line-height: 1.55;
    color: #3d4f66;
    padding: 0 2px 4px;
  }
  .receipt__footer-line { margin: 1px 0; }
  .receipt__qr {
    min-height: 52px;
    margin: 10px auto 0;
    max-width: 52mm;
    border: 1px dashed #b8c4d6;
    border-radius: 6px;
    background: repeating-linear-gradient(
      90deg,
      #f4f7fc,
      #f4f7fc 2px,
      #eef2f8 2px,
      #eef2f8 4px
    );
  }
  @media print {
    html, body { background: #fff; }
    .page { padding: 0; display: block; }
    .receipt { box-shadow: none; border-radius: 0; border: none; max-width: 80mm; margin: 0 auto; padding: 8mm 6mm; }
    .receipt__logo { min-height: 24px; }
    .receipt__qr { min-height: 48px; }
  }
</style></head><body>${body}</body></html>`;
}

module.exports = {
  buildInvoiceContext,
  renderProfessionalInvoicePdf,
  renderThermalInvoiceHtml,
  money,
  resolveArabicFontPath,
};
