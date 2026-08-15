/**
 * สร้างรูปตัวอย่างให้รถที่ยังไม่มี PHOTO (การ์ดทะเบียน + ยี่ห้อ/รุ่น)
 * รัน: npm run seed:vehicle-photos
 *
 * ถ้ามีโฟลเดอร์รูปจริงภายหลัง ให้อัปโหลดทับผ่านหน้าเว็บได้
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { buildStoredUploadFileName } from "../src/lib/upload/storedFilename.js";
import { resolveModuleUploadSegment, resolveUserUploadSegment } from "../src/lib/upload/uploadSegments.js";
import { publicFileUrl } from "../src/lib/upload.js";

const prisma = new PrismaClient();
const uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function makePlateCard(opts: {
  plate: string;
  brandModel: string;
  status: string;
  disposed: boolean;
}): Promise<Buffer> {
  const bg = opts.disposed ? "#475569" : "#0000BF";
  const accent = opts.disposed ? "#94a3b8" : "#ec4899";
  const plate = escapeXml(opts.plate);
  const bm = escapeXml(opts.brandModel);
  const st = escapeXml(opts.status);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="960" height="600" viewBox="0 0 960 600" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="55%" stop-color="#8b5cf6"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
  </defs>
  <rect width="960" height="600" fill="url(#g)"/>
  <rect x="48" y="48" width="864" height="504" rx="28" fill="rgba(255,255,255,0.92)"/>
  <text x="480" y="200" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="42" font-weight="700" fill="#1e1b4b">${plate}</text>
  <text x="480" y="280" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="600" fill="#4d47b6">${bm}</text>
  <text x="480" y="360" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700" fill="${opts.disposed ? "#b45309" : "#047857"}">${st}</text>
  <text x="480" y="430" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="16" fill="#66638c">ตัวอย่างรูปรถ — อัปโหลดรูปจริงได้ภายหลัง</text>
</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
}

async function main() {
  const vehicles = await prisma.vehicle.findMany({
    include: {
      vehicleStatus: true,
      documents: { where: { kind: "PHOTO" }, select: { id: true } },
    },
    orderBy: { licensePlate: "asc" },
  });

  let added = 0;
  let skipped = 0;

  for (const v of vehicles) {
    if (v.documents.length > 0) {
      skipped++;
      continue;
    }

    const disposed = v.vehicleStatus?.excludesFromFleetCare === true;
    const statusName = v.vehicleStatus?.name ?? (disposed ? "จำหน่าย" : "ใช้งาน");
    const buf = await makePlateCard({
      plate: v.licensePlate,
      brandModel: v.brandModel || `${v.brand} ${v.model}`.trim(),
      status: statusName,
      disposed,
    });

    const moduleSeg = resolveModuleUploadSegment("vehicles");
    const userSeg = resolveUserUploadSegment("seed");
    const storedFileName = buildStoredUploadFileName({
      moduleSlug: "vehicles",
      ownerUserId: "seed",
      ext: "jpg",
      kind: "photo",
    });
    const dir = path.join(uploadDir, moduleSeg, userSeg);
    fs.mkdirSync(dir, { recursive: true });
    const relativePath = `${moduleSeg}/${userSeg}/${storedFileName}`;
    fs.writeFileSync(path.join(dir, storedFileName), buf);

    const maxSort = await prisma.vehicleDocument.aggregate({
      where: { vehicleId: v.id, kind: "PHOTO" },
      _max: { sortOrder: true },
    });

    await prisma.vehicleDocument.create({
      data: {
        vehicleId: v.id,
        fileUrl: publicFileUrl(relativePath),
        mimeType: "image/jpeg",
        originalName: `${v.licensePlate}.jpg`,
        kind: "PHOTO",
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });

    added++;
    console.log(`รูป: ${v.licensePlate} → ${relativePath}`);
  }

  console.log(`\nเสร็จ: เพิ่มรูป ${added} คัน, ข้าม (มีรูปแล้ว) ${skipped} คัน`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
