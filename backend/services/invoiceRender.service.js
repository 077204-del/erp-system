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

/**
 * Compact thermal-friendly HTML (browser print). RTL + Cairo/Tajawal; numbers LTR.
 * @param {object} sale — populated sale from getSaleById
 */
function renderThermalInvoiceHtml(sale) {
  const ctx = buildInvoiceContext(sale);
  const esc = escapeHtml;

  const bodyLines = [
    `<div class="line">${esc(ctx.companyName)}</div>`,
    `<div class="sep">────────────────────────</div>`,
    `<div class="line">${esc(TH_LABELS.inv)} <span class="ltr">${esc(ctx.invoiceNo)}</span></div>`,
    `<div class="line muted">${esc(ctx.generatedAt)}</div>`,
    `<div class="sep">────────────────────────</div>`,
    `<div class="line">${esc(ctx.clientName)}</div>`,
    `<div class="line">${esc(ctx.productName)}</div>`,
    `<div class="line"><span class="ltr">×${ctx.quantity}</span> @ <span class="ltr">${esc(ctx.unitPrice)}</span></div>`,
    `<div class="line"><b>${esc("الإجمالي")}</b> <span class="ltr">${esc(ctx.total)}</span></div>`,
    `<div class="line">${esc(TH_LABELS.paid)} <span class="ltr">${esc(ctx.paid)}</span></div>`,
    `<div class="line">${esc(TH_LABELS.due)} <span class="ltr">${esc(ctx.debt)}</span></div>`,
    `<div class="line">${esc(TH_LABELS.st)} <span class="ltr">${esc(ctx.status)}</span></div>`,
    `<div class="sep">────────────────────────</div>`,
    `<div class="line center">${esc(TH_LABELS.thanks)}</div>`,
  ];

  const body = bodyLines.join("\n");

  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(TH_LABELS.inv)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600&family=Tajawal:wght@400;500&display=swap" rel="stylesheet">
<style>
  body { font-family: Cairo, Tajawal, Arial, sans-serif; font-size: 14px; max-width: 360px; margin: 12px auto; line-height: 1.45; }
  .sep { text-align: center; color: #666; letter-spacing: -1px; margin: 0.35rem 0; }
  .line { margin: 0.2rem 0; word-break: break-word; }
  .muted { color: #555; font-size: 12px; }
  .center { text-align: center; margin-top: 0.5rem; }
  .ltr { direction: ltr; unicode-bidi: isolate; display: inline-block; }
  @media print { body { margin: 0; max-width: none; } }
</style></head><body>${body}</body></html>`;
}

module.exports = {
  buildInvoiceContext,
  renderProfessionalInvoicePdf,
  renderThermalInvoiceHtml,
  money,
  resolveArabicFontPath,
};
