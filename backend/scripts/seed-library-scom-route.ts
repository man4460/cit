/**
 * เพิ่มเอกสารเส้นทางภารกิจ ศชม. ในคลังเอกสาร + คัดลอกไฟล์ไป uploads
 * รัน: npx tsx scripts/seed-library-scom-route.ts (จากโฟลเดอร์ backend)
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuidv4 } from "uuid";
import { runLibraryDocumentExtract } from "../src/lib/libraryDocumentExtract.js";
import { prisma } from "../src/lib/prisma.js";
import { ensureUploadDir, publicFileUrl } from "../src/lib/upload.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(scriptDir, "../seed-assets/scom-mission-route.png");

const TITLE =
  "เส้นทางภารกิจ ศชม. - ศูนย์พิทักษ์ประชากรไทย (ดอนหลวง) (เชียงใหม่)";
const DETAILS =
  "เอกสารสรุปเส้นทางและระยะทางรวมประมาณ 722 กม. (ตารางเส้นทาง ศชม.) — seed จากระบบ";

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error("ไม่พบไฟล์ seed:", SOURCE);
    process.exit(1);
  }

  ensureUploadDir();
  const uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
  const filename = `${uuidv4()}.png`;
  fs.copyFileSync(SOURCE, path.join(uploadDir, filename));

  const typeName = "เส้นทางภารกิจ";
  let docType = await prisma.documentType.findUnique({ where: { name: typeName } });
  if (!docType) {
    const maxSort = await prisma.documentType.aggregate({ _max: { sortOrder: true } });
    const sortOrder = (maxSort._max.sortOrder ?? 0) + 1;
    docType = await prisma.documentType.create({ data: { name: typeName, sortOrder } });
    console.log("สร้างประเภทเอกสาร:", typeName);
  }

  const dup = await prisma.libraryDocument.findFirst({ where: { title: TITLE } });
  if (dup) {
    console.log("มีรายการชื่อเดียวกันแล้ว — ข้าม:", TITLE);
    process.exit(0);
  }

  const created = await prisma.libraryDocument.create({
    data: {
      title: TITLE,
      details: DETAILS,
      documentTypeId: docType.id,
      fileUrl: publicFileUrl(filename),
      mimeType: "image/png",
      originalName: "scom-mission-route.png",
    },
  });

  await runLibraryDocumentExtract(created.id);
  console.log("เพิ่มคลังเอกสารแล้ว:", TITLE);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
