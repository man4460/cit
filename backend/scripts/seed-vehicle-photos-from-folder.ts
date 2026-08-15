/**
 * นำเข้ารูปจริงจากโฟลเดอร์เก่า (D:\Data\cit\data\รูปรถ) แทนรูปตัวอย่าง
 * รัน: npm run seed:vehicle-photos:real
 *
 * VEHICLE_PHOTO_SRC=... เพื่อชี้โฟลเดอร์อื่น
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { buildStoredUploadFileName } from "../src/lib/upload/storedFilename.js";
import { resolveModuleUploadSegment, resolveUserUploadSegment } from "../src/lib/upload/uploadSegments.js";
import { publicFileUrl, unlinkUploadFile } from "../src/lib/upload.js";

const prisma = new PrismaClient();
const uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
const SRC = process.env.VEHICLE_PHOTO_SRC ?? "D:\\Data\\cit\\data\\รูปรถ";

/** จัดกลุ่มตามเลขทะเบียน — รูปแรกของแต่ละคันคือมุมเฉียงสามส่วนหน้า (รูปหลัก) */
const PLATE_DIGIT_TO_FILES: Record<string, string[]> = {
  "7137": [
    "S__50479112_0.jpg",
    "S__50479113_0.jpg",
    "S__50479111_0.jpg",
    "S__50479110_0.jpg",
    "S__50479109_0.jpg",
    "S__50479108_0.jpg",
  ],
  "7136": [
    "S__50479119_0.jpg",
    "S__50479120_0.jpg",
    "S__50479117_0.jpg",
    "S__50479116_0.jpg",
    "S__50479115_0.jpg",
    "S__50479114_0.jpg",
  ],
  "5805": [
    "S__50479125_0.jpg",
    "S__50479126_0.jpg",
    "S__50479124_0.jpg",
    "S__50479123_0.jpg",
    "S__50479122_0.jpg",
    "S__50479121_0.jpg",
  ],
  "5804": [
    "S__50479132_0.jpg",
    "S__50479133_0.jpg",
    "S__50479131_0.jpg",
    "S__50479130_0.jpg",
    "S__50479128_0.jpg",
    "S__50479127_0.jpg",
  ],
  "4830": [
    "S__50479137_0.jpg",
    "S__50479138_0.jpg",
    "S__50479139_0.jpg",
    "S__50479136_0.jpg",
    "S__50479135_0.jpg",
    "S__50479134_0.jpg",
  ],
  "5682": [
    "S__50479145_0.jpg",
    "S__50479146_0.jpg",
    "S__50479144_0.jpg",
    "S__50479143_0.jpg",
    "S__50479142_0.jpg",
    "S__50479141_0.jpg",
  ],
  "4933": [
    "S__50479152_0.jpg",
    "S__50479153_0.jpg",
    "S__50479150_0.jpg",
    "S__50479149_0.jpg",
    "S__50479148_0.jpg",
    "S__50479147_0.jpg",
  ],
  "4936": [
    "S__50479158_0.jpg",
    "S__50479159_0.jpg",
    "S__50479157_0.jpg",
    "S__50479156_0.jpg",
    "S__50479155_0.jpg",
    "S__50479154_0.jpg",
  ],
  "1165": [
    "S__50479165_0.jpg",
    "S__50479166_0.jpg",
    "S__50479164_0.jpg",
    "S__50479163_0.jpg",
    "S__50479162_0.jpg",
    "S__50479161_0.jpg",
  ],
  "1160": [
    "S__50479172_0.jpg",
    "S__50479173_0.jpg",
    "S__50479170_0.jpg",
    "S__50479169_0.jpg",
    "S__50479168_0.jpg",
    "S__50479167_0.jpg",
  ],
};

const MAX_EDGE = 1600;
const MAX_BYTES = Math.round(1.85 * 1024 * 1024);

function plateDigits(plate: string): string | null {
  const digits = plate.replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

function relativeFromFileUrl(fileUrl: string): string | null {
  const m = fileUrl.replace(/\\/g, "/").match(/\/uploads\/(.+)$/i);
  return m ? decodeURIComponent(m[1]) : null;
}

async function prepareJpeg(buf: Buffer): Promise<Buffer> {
  const meta = await sharp(buf).rotate().metadata();
  const needsResize =
    (meta.width ?? 0) > MAX_EDGE || (meta.height ?? 0) > MAX_EDGE;
  const pipeline = () => {
    let p = sharp(buf).rotate();
    if (needsResize) {
      p = p.resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    return p;
  };
  let quality = 85;
  let out = await pipeline().jpeg({ quality, mozjpeg: true }).toBuffer();
  while (out.length > MAX_BYTES && quality > 45) {
    quality -= 10;
    out = await pipeline().jpeg({ quality, mozjpeg: true }).toBuffer();
  }
  return out;
}

async function main() {
  if (!fs.existsSync(SRC)) {
    throw new Error(`ไม่พบโฟลเดอร์รูป: ${SRC}`);
  }

  const vehicles = await prisma.vehicle.findMany({
    include: {
      documents: { where: { kind: "PHOTO" } },
    },
  });

  let importedVehicles = 0;
  let importedFiles = 0;
  let skippedNoMap = 0;

  for (const v of vehicles) {
    const digit = plateDigits(v.licensePlate);
    const files = digit ? PLATE_DIGIT_TO_FILES[digit] : undefined;
    if (!files?.length) {
      skippedNoMap++;
      console.log(`ข้าม (ไม่มีรูปเก่า): ${v.licensePlate}`);
      continue;
    }

    // ลบรูปเดิม (รวม placeholder) ของคันนี้
    for (const d of v.documents) {
      const rel = relativeFromFileUrl(d.fileUrl);
      if (rel) unlinkUploadFile(rel);
      await prisma.vehicleDocument.delete({ where: { id: d.id } });
    }

    const moduleSeg = resolveModuleUploadSegment("vehicles");
    const userSeg = resolveUserUploadSegment("import");
    const dir = path.join(uploadDir, moduleSeg, userSeg);
    fs.mkdirSync(dir, { recursive: true });

    let sortOrder = 0;
    for (const name of files) {
      const srcPath = path.join(SRC, name);
      if (!fs.existsSync(srcPath)) {
        console.warn(`  หาย: ${name}`);
        continue;
      }
      const raw = fs.readFileSync(srcPath);
      const jpeg = await prepareJpeg(raw);
      const storedFileName = buildStoredUploadFileName({
        moduleSlug: "vehicles",
        ownerUserId: "import",
        ext: "jpg",
        kind: "photo",
      });
      fs.writeFileSync(path.join(dir, storedFileName), jpeg);
      const relativePath = `${moduleSeg}/${userSeg}/${storedFileName}`;
      await prisma.vehicleDocument.create({
        data: {
          vehicleId: v.id,
          fileUrl: publicFileUrl(relativePath),
          mimeType: "image/jpeg",
          originalName: name,
          kind: "PHOTO",
          sortOrder: sortOrder++,
        },
      });
      importedFiles++;
    }

    importedVehicles++;
    console.log(`นำเข้า ${v.licensePlate}: ${sortOrder} รูป`);
  }

  console.log(
    `\nเสร็จ: รถ ${importedVehicles} คัน / รูป ${importedFiles} ไฟล์ / คง placeholder ${skippedNoMap} คัน (ไม่มีในโฟลเดอร์เก่า)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
