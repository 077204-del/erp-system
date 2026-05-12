/**
 * Writes branded launcher PNGs into android/app/src/main/res/mipmap-* densities.
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

const densities = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

async function renderSize(px) {
  let pipeline;
  if (fs.existsSync(svgPath)) {
    pipeline = sharp(svgPath).resize(px, px, { fit: "contain", background: "#ffffff" });
  } else {
    pipeline = sharp({
      create: {
        width: px,
        height: px,
        channels: 4,
        background: { r: 37, g: 99, b: 235, alpha: 1 },
      },
    });
  }
  return pipeline.png().toBuffer();
}

async function main() {
  for (const [folder, px] of Object.entries(densities)) {
    const dir = path.join(resRoot, folder);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const buf = await renderSize(px);
    for (const name of ["ic_launcher.png", "ic_launcher_foreground.png", "ic_launcher_round.png"]) {
      fs.writeFileSync(path.join(dir, name), buf);
    }
  }
  console.log("Android mipmap icons updated under", resRoot);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
