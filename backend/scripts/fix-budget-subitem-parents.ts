/**
 * ผูกรายการย่อยไว้ใต้รายการหลัก (CI) ตามโครงสร้างคำของบ
 * และตั้งรายการหลักให้ parent = null เพื่อเลือกในฟอร์มได้
 *
 *   npx tsx scripts/fix-budget-subitem-parents.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

const RULES: { mainCi: string; childNameRe: RegExp }[] = [
  {
    mainCi: "5031116000", // 6. ค่าจ้างงานรักษาความปลอดภัย
    childNameRe: /^\d+\.\s*กลุ่ม\s*\d/i,
  },
  {
    mainCi: "5031214000", // 8. ค่าซ่อมแซม…คอมฯ
    childNameRe: /^\d+\.\s*(ค่าซ่อมบำรุง CCTV|จ้างบำรุงรักษา)/i,
  },
  {
    mainCi: "5031134000", // 13. ค่าใช้จ่ายเดินทาง
    childNameRe: /^\d+\.\s*(ศปภ\.|ผู้บริหาร|งานสืบสวน)/i,
  },
];

async function main() {
  const summaryIds = new Set(
    (await prisma.budgetAccount.findMany({ where: { isSummary: true }, select: { id: true } })).map((s) => s.id),
  );

  const accounts = await prisma.budgetAccount.findMany({
    where: { kind: "EXPENSE", isSummary: false },
    select: { id: true, name: true, ciCode: true, parentId: true, categoryId: true },
  });

  let linked = 0;
  let clearedMain = 0;

  for (const rule of RULES) {
    const main = accounts.find((a) => a.ciCode === rule.mainCi);
    if (!main) {
      console.warn("ไม่พบรายการหลัก", rule.mainCi);
      continue;
    }

    if (main.parentId != null) {
      await prisma.budgetAccount.update({ where: { id: main.id }, data: { parentId: null } });
      main.parentId = null;
      clearedMain += 1;
    }

    const children = accounts.filter(
      (a) => a.id !== main.id && a.categoryId === main.categoryId && rule.childNameRe.test(a.name),
    );
    for (const child of children) {
      if (child.parentId === main.id) continue;
      await prisma.budgetAccount.update({ where: { id: child.id }, data: { parentId: main.id } });
      child.parentId = main.id;
      linked += 1;
      console.log(`link: ${child.name.slice(0, 48)} → ${main.name.slice(0, 36)}`);
    }
  }

  /** รายการที่มีรหัส CI และยังอยู่ใต้แถวสรุปหมวด → ตั้งเป็นรายการหลัก (parent null) */
  for (const a of accounts) {
    if (!a.ciCode) continue;
    if (a.parentId == null) continue;
    if (!summaryIds.has(a.parentId)) continue;
    await prisma.budgetAccount.update({ where: { id: a.id }, data: { parentId: null } });
    a.parentId = null;
    clearedMain += 1;
  }

  /** รายการไม่มี CI ที่ยังอยู่ใต้สรุป และไม่ได้ถูกผูกใต้ CI หลัก → คงไว้ใต้สรุปไม่ได้เลือกเป็นหลัก
   *  (ไม่แตะ — ให้โชว์เป็นรายการหลักในหมวดผ่าน topLevelChildren) */

  const after = await prisma.budgetAccount.findMany({
    where: { kind: "EXPENSE", isSummary: false },
    select: { id: true, name: true, ciCode: true, parentId: true },
  });
  console.log({
    linked,
    clearedMain,
    topLevel: after.filter((a) => !a.parentId).length,
    nested: after.filter((a) => a.parentId).length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
