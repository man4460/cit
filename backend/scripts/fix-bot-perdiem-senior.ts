/**
 * ปรับเบี้ยเลี้ยงบุคลากร ธปท. ชั้น 7(ควบ) / 8 ขึ้นไป ที่เก็บไว้ให้เป็น 550 บาท/วัน
 * ใช้: npx tsx scripts/fix-bot-perdiem-senior.ts [--apply]
 */
import { Prisma } from "@prisma/client";
import { BOT_PER_DIEM_SENIOR, botPerDiemDailyRate } from "../src/lib/botPerDiem.js";
import { prisma } from "../src/lib/prisma.js";

const apply = process.argv.includes("--apply");

const rows = await prisma.personnel.findMany({
  where: { personnelCategory: { name: "ธปท." } },
  select: { id: true, fullName: true, gradeLevel: true, perDiemRate: true },
  orderBy: { fullName: "asc" },
});

let changed = 0;
for (const p of rows) {
  const grade = p.gradeLevel?.trim() ?? "";
  const expected = botPerDiemDailyRate(grade);
  const current = p.perDiemRate == null ? null : Number(p.perDiemRate);
  const senior = expected === BOT_PER_DIEM_SENIOR;
  console.log(`${senior ? "*" : " "} ${p.fullName} · ชั้น ${grade || "—"} · เก็บไว้ ${current ?? "—"} · ตามชั้น ${expected}`);
  if (!senior || current === expected) continue;
  changed++;
  if (apply) {
    await prisma.personnel.update({ where: { id: p.id }, data: { perDiemRate: new Prisma.Decimal(expected) } });
  }
}
console.log(`${apply ? "updated" : "would update"}: ${changed} (ธปท. ทั้งหมด ${rows.length})`);
await prisma.$disconnect();
