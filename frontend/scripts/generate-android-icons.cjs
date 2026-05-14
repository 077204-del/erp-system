/**
 * Writes launcher PNGs into android/app/src/main/res/mipmap-* densities.
 * Priority (production):
 *   1) ../../assets/icon.png   — primary (erp-system/assets/icon.png)
 *   2) ../src/logo.svg
 *   3) ../../assets/icon.ico    — ICO fallback
 *   4) ../assets/icon.ico
 *   5) solid accent placeholder
 *
 * Run: npm run icons:android   (requires devDependency `sharp`)
 */
const fs = require("fs");
const path = require("path");

let sharp;
try {
  sharp = require("sharp");
} catch {
  console.error("Missing sharp. Run: npm install sharp --save-dev");
  process.exit(1);
}

const resRoot = path.join(__dirname, "..", "android", "app", "src", "main", "res");
const svgPath = path.join(__dirname, "..", "src", "logo.svg");
const iconIcoRepo = path.join(__dirname, "..", "..", "assets", "icon.ico");
const iconIcoFrontend = path.join(__dirname, "..", "assets", "icon.ico");
const iconPngRepo = path.join(__dirname, "..", "..", "assets", "icon.png");

const densities = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

async function rasterPipelineFromFile(filePath, px, { silent } = {}) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const img = sharp(filePath);
    await img.metadata();
    return img.resize(px, px, {
      fit: "contain",
      background: "#ffffff",
    });
  } catch (e) {
    if (!silent) {
      console.warn(
        "[icons:android] Skipping (unsupported or unreadable):",
        filePath,
        "-",
        e.message || e
      );
    }
    return null;
  }
}

/** Resolve which raster/SVG file to use once (avoid repeated ICO warnings). */
async function resolveRasterSource() {
  const fromPngRepo = await rasterPipelineFromFile(iconPngRepo, 48, {
    silent: false,
  });
  if (fromPngRepo) return { path: iconPngRepo, kind: "raster" };

  if (fs.existsSync(svgPath)) return { path: svgPath, kind: "svg" };

  const fromIcoRepo = await rasterPipelineFromFile(iconIcoRepo, 48, {
    silent: false,
  });
  if (fromIcoRepo) return { path: iconIcoRepo, kind: "raster" };

  const fromIcoFe = await rasterPipelineFromFile(iconIcoFrontend, 48, {
    silent: false,
  });
  if (fromIcoFe) return { path: iconIcoFrontend, kind: "raster" };

  return { path: null, kind: "placeholder" };
}

async function pipelineForSize(px, source) {
  if (source.kind === "raster" && source.path) {
    const p = await rasterPipelineFromFile(source.path, px, { silent: true });
    if (p) return { pipeline: p, sourceLabel: source.path };
  }
  if (source.kind === "svg" && source.path) {
    return {
      pipeline: sharp(source.path).resize(px, px, {
        fit: "contain",
        background: "#ffffff",
      }),
      sourceLabel: source.path,
    };
  }
  return {
    pipeline: sharp({
      create: {
        width: px,
        height: px,
        channels: 4,
        background: { r: 37, g: 99, b: 235, alpha: 1 },
      },
    }),
    sourceLabel: "placeholder blue square",
  };
}

async function main() {
  const source = await resolveRasterSource();
  let firstSource = null;
  for (const [folder, px] of Object.entries(densities)) {
    const dir = path.join(resRoot, folder);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const { pipeline, sourceLabel } = await pipelineForSize(px, source);
    if (firstSource == null) firstSource = sourceLabel;
    const buf = await pipeline.png().toBuffer();
    for (const name of ["ic_launcher.png", "ic_launcher_foreground.png", "ic_launcher_round.png"]) {
      fs.writeFileSync(path.join(dir, name), buf);
    }
  }
  console.log("Android mipmap icons updated under", resRoot);
  console.log("Source:", firstSource);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
