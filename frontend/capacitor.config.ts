import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Hosted React UI (Render static site). NOT the Express API host.
 * Override with CAPACITOR_SERVER_URL before `npx cap sync android`.
 */
const DEFAULT_FRONTEND_ORIGIN = "https://erp-system-3-jyk9.onrender.com";

const serverUrl = (
  process.env.CAPACITOR_SERVER_URL ||
  process.env.CAPACITOR_WEB_APP_URL ||
  process.env.REACT_APP_WEB_ORIGIN ||
  DEFAULT_FRONTEND_ORIGIN
).trim();

const config: CapacitorConfig = {
  appId: "com.erp.store",
  appName: "ERP Store",
  webDir: "build",
  android: {
    backgroundColor: "#ffffff",
    allowMixedContent: true,
  },
  server: {
    url: serverUrl.replace(/\/+$/, ""),
    cleartext: false,
    androidScheme: "https",
    errorPath: "index.html",
  },
};

export default config;
