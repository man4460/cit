/**
 * ลบข้อความ seed ค่าตอบแทนที่ซ้ำกับประวัติภารกิจออกจาก personnel.remarks
 * เก็บเฉพาะโน้ตสำคัญที่ผู้ใช้ใส่เอง
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** บรรทัด seed จากภารกิจ เช่น [มค69-…] [กพ69-…] */
const SEED_LINE = /^\s*\[[^\]]*\]\s*(ค่าตอบแทน|ค่าน้ำมัน)/;

function cleanRemarks(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const kept = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !SEED_LINE.test(l));
  const next = kept.join("\n").trim();
  return next || null;
}

async function main() {
  const rows = await prisma.personnel.findMany({
    where: { remarks: { not: null } },
    select: { id: true, fullName: true, remarks: true },
  });
  let updated = 0;
  for (const r of rows) {
    const next = cleanRemarks(r.remarks);
    if (next === r.remarks) continue;
    await prisma.personnel.update({ where: { id: r.id }, data: { remarks: next } });
    updated++;
    console.log(`ล้างโน้ต: ${r.fullName}`);
  }
  console.log(`เสร็จ — อัปเดต ${updated} คน`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
