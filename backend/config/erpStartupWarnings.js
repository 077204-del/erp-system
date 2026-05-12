/**
 * Non-fatal ERP startup diagnostics (warnings only; never process.exit).
 */

function normalizePath(p) {
  return String(p).replace(/\\/g, "/");
}

function warnErpEnvironment() {
  if (!process.env.NODE_ENV) {
    console.warn(
      "[ERP WARNING] NODE_ENV is not set; set to development, production, or test."
    );
  }
  if (!process.env.JWT_SECRET) {
    console.warn(
      "[ERP WARNING] JWT_SECRET is missing; authentication signing may be insecure or invalid."
    );
  }
  if (!process.env.COMPANY_NAME) {
    console.warn(
      "[ERP WARNING] COMPANY_NAME is not set; invoices/receipts will use the default label."
    );
  }
}

/**
 * After the full module graph is loaded, detect if deprecated finance.service.js
 * was required (should use services/finance/ledger.service.js instead).
 */
function warnIfDeprecatedFinanceServiceLoaded() {
  const hits = Object.keys(require.cache).filter((k) => {
    const n = normalizePath(k);
    return (
      n.endsWith("/services/finance.service.js") &&
      !n.includes("node_modules")
    );
  });
  if (hits.length) {
    console.warn(
      "[ERP WARNING] Deprecated services/finance.service.js is loaded:",
      hits.map((h) => normalizePath(h)).join(", ")
    );
  }
}

module.exports = {
  warnErpEnvironment,
  warnIfDeprecatedFinanceServiceLoaded,
};
