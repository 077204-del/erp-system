/**
 * Downloads Cairo-Regular.ttf for PDFKit Arabic shaping (optional at install time).
 * Skips if file already exists and looks valid. Safe to fail offline.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const MIN_SIZE = 8000;
const DEST_DIR = path.join(__dirname, "..", "assets", "fonts");
const DEST = path.join(DEST_DIR, "Cairo-Regular.ttf");

const URLS = [
  "https://raw.githubusercontent.com/google/fonts/main/ofl/cairo/Cairo%5Bslnt%2Cwght%5D.ttf",
  "https://raw.githubusercontent.com/googlefonts/cairo/main/fonts/ttf/Cairo-Regular.ttf",
];

function fetchOne(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { timeout: 25000, headers: { "User-Agent": "erp-backend-font-fetch" } },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const loc = res.headers.location;
          res.resume();
          if (!loc) {
            reject(new Error("redirect without location"));
            return;
          }
          fetchOne(loc).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

async function main() {
  try {
    if (fs.existsSync(DEST)) {
      const st = fs.statSync(DEST);
      if (st.size >= MIN_SIZE) return;
    }
    fs.mkdirSync(DEST_DIR, { recursive: true });
    let buf = null;
    let lastErr = null;
    for (const url of URLS) {
      try {
        buf = await fetchOne(url);
        if (buf && buf.length >= MIN_SIZE) break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!buf || buf.length < MIN_SIZE) {
      if (lastErr) process.stderr.write(`fetch-cairo-font: ${lastErr.message}\n`);
      return;
    }
    fs.writeFileSync(DEST, buf);
  } catch (e) {
    process.stderr.write(`fetch-cairo-font: ${e.message || e}\n`);
  }
}

main();
