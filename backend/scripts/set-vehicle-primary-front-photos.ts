/**
 * ตั้งรูปมุมเฉียงสามส่วนหน้า เป็นรูปหลัก (sortOrder = 0)
 * และแก้รูปที่จัดคันผิด (21→5805, 27→5804)
 * รัน: npm run seed:vehicle-photos:primary-front
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** รูปมุมเฉียงสามส่วนหน้า — ใช้เป็นรูปหลักการ์ด/popup */
const PRIMARY_FRONT: Record<string, string> = {
  "7137": "S__50479112_0.jpg",
  "7136": "S__50479119_0.jpg",
  "5805": "S__50479125_0.jpg",
  "5804": "S__50479132_0.jpg",
  "4830": "S__50479137_0.jpg",
  "5682": "S__50479145_0.jpg",
  "4933": "S__50479152_0.jpg",
  "4936": "S__50479158_0.jpg",
  "1165": "S__50479165_0.jpg",
  "1160": "S__50479172_0.jpg",
};

/** ไฟล์ที่จัดคันผิดตอนนำเข้า → เลขทะเบียนปลายทาง */
const REASSIGN: Record<string, string> = {
  "S__50479121_0.jpg": "5805",
  "S__50479127_0.jpg": "5804",
};

function plateDigits(plate: string): string | null {
  const digits = plate.replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

async function main() {
  const vehicles = await prisma.vehicle.findMany({
    include: {
      documents: { where: { kind: "PHOTO" }, orderBy: { sortOrder: "asc" } },
    },
  });

  const byDigit = new Map<string, (typeof vehicles)[0]>();
  for (const v of vehicles) {
    const d = plateDigits(v.licensePlate);
    if (d) byDigit.set(d, v);
  }

  // 1) ย้ายรูปที่จัดคันผิด
  for (const [fileName, targetDigit] of Object.entries(REASSIGN)) {
    const target = byDigit.get(targetDigit);
    if (!target) {
      console.warn(`ไม่พบรถปลายทาง ${targetDigit} สำหรับ ${fileName}`);
      continue;
    }
    const owner = vehicles.find((v) => v.documents.some((d) => d.originalName === fileName));
    const doc = owner?.documents.find((d) => d.originalName === fileName);
    if (!doc) {
      console.warn(`ไม่พบไฟล์ ${fileName}`);
      continue;
    }
    if (owner!.id === target.id) {
      console.log(`อยู่ถูกคันแล้ว: ${fileName} → ${target.licensePlate}`);
      continue;
    }
    await prisma.vehicleDocument.update({
      where: { id: doc.id },
      data: { vehicleId: target.id },
    });
    console.log(`ย้าย ${fileName}: ${owner!.licensePlate} → ${target.licensePlate}`);
  }

  // reload
  const refreshed = await prisma.vehicle.findMany({
    include: {
      documents: { where: { kind: "PHOTO" }, orderBy: { sortOrder: "asc" } },
    },
  });

  // 2) ตั้งรูปหน้าเป็น sortOrder 0 ที่เหลือเรียงต่อ
  for (const v of refreshed) {
    const digit = plateDigits(v.licensePlate);
    if (!digit) continue;
    const primaryName = PRIMARY_FRONT[digit];
    if (!primaryName) continue;

    const docs = [...v.documents];
    const primary = docs.find((d) => d.originalName === primaryName);
    if (!primary) {
      console.warn(`ไม่มีรูปหน้า ${primaryName} ของ ${v.licensePlate}`);
      continue;
    }

    const rest = docs.filter((d) => d.id !== primary.id);
    // รูปหน้าอื่นๆ (สามส่วนหน้า) ให้มาก่อนรูปท้าย — ตามเลขไฟล์จากมาก→น้อยมักเป็นหน้า
    rest.sort((a, b) => {
      const na = Number(/S__(\d+)/.exec(a.originalName ?? "")?.[1] ?? 0);
      const nb = Number(/S__(\d+)/.exec(b.originalName ?? "")?.[1] ?? 0);
      return nb - na;
    });

    const ordered = [primary, ...rest];
    for (let i = 0; i < ordered.length; i++) {
      if (ordered[i].sortOrder === i) continue;
      await prisma.vehicleDocument.update({
        where: { id: ordered[i].id },
        data: { sortOrder: i },
      });
    }
    console.log(`รูปหลัก ${v.licensePlate}: ${primaryName} (+${rest.length} รูป)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
