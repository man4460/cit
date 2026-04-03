/**
 * ตัดพิกเซลพื้นหลังอ่อน/ขาวให้โปร่งใส + สร้าง favicon สำหรับแท็บเบราว์เซอร์
 * รัน: node scripts/process-logos.mjs (จากโฟลเดอร์ frontend)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

/** ระยะห่างจากสีขาวใน RGB — พิกเซลใกล้ขาวจะทำให้โปร่งใส */
const WHITE_FUZZ = 42;

function distanceToWhite(r, g, b) {
  return Math.hypot(255 - r, 255 - g, 255 - b);
}

async function removeLightBackground(inputPath, outputPath) {
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) throw new Error(`Expected 4 channels, got ${channels}`);

  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    const a = out[i + 3];
    if (a === 0) continue;
    if (distanceToWhite(r, g, b) <= WHITE_FUZZ) {
      out[i + 3] = 0;
    }
  }

  const tmp = `${outputPath}.tmp.png`;
  await sharp(out, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(tmp);
  const fs = await import("node:fs/promises");
  await fs.rename(tmp, outputPath);
}

/** ให้สี favicon ใกล้เคียง BrandLogo (themed) — ใช้ logo-stacked เหมือนหน้า login */
async function makeFavicon(sourcePng, size, outName) {
  await sharp(sourcePng)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .modulate({ brightness: 1.08, saturation: 0.82, hue: 26 })
    .linear(1.06, -(128 * (1.06 - 1)))
    .png()
    .toFile(path.join(publicDir, outName));
}

async function main() {
  const logos = ["logo-horizontal.png", "logo-stacked.png"];
  for (const name of logos) {
    const p = path.join(publicDir, name);
    console.log("Processing", name, "…");
    await removeLightBackground(p, p);
  }

  const stacked = path.join(publicDir, "logo-stacked.png");
  console.log("Creating favicon + apple-touch-icon from logo-stacked (เดียวกับ login) …");
  await makeFavicon(stacked, 32, "favicon-32.png");
  await makeFavicon(stacked, 16, "favicon-16.png");
  await makeFavicon(stacked, 180, "apple-touch-icon.png");

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
