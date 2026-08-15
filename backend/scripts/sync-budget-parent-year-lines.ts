/**
 * สร้างบรรทัดปีว่างให้หัวข้อหลักที่มีลูกแล้ว — ให้ลิงก์ย่อยโชว์ครบทุกปี
 *
 *   npx tsx scripts/sync-budget-parent-year-lines.ts
 */
import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const years = await prisma.budgetFiscalYear.findMany({ orderBy: { yearBe: "asc" } });
  const parents = await prisma.budgetAccount.findMany({
    where: { children: { some: {} }, isSummary: false },
    select: { id: true, name: true },
  });

  let created = 0;
  for (const fundingType of ["ANNUAL", "COMMITMENT"] as const) {
    for (const parent of parents) {
      for (const fy of years) {
        const existing = await prisma.budgetYearLine.findUnique({
          where: {
            fiscalYearId_accountId_fundingType: {
              fiscalYearId: fy.id,
              accountId: parent.id,
              fundingType,
            },
          },
        });
        if (existing) continue;
        /** สร้างเฉพาะ ANNUAL เป็นหลัก — COMMITMENT เฉพาะเมื่อมีลูก commitment */
        if (fundingType === "COMMITMENT") {
          const childCommit = await prisma.budgetYearLine.count({
            where: {
              fundingType: "COMMITMENT",
              account: { parentId: parent.id },
            },
          });
          if (!childCommit) continue;
        }
        await prisma.budgetYearLine.create({
          data: {
            fiscalYearId: fy.id,
            accountId: parent.id,
            fundingType,
            allocatedAmount: new Prisma.Decimal(0),
          },
        });
        created += 1;
        console.log(`+ ${fundingType} ${fy.yearBe} ${parent.name.slice(0, 40)}`);
      }
    }
  }
  console.log({ parents: parents.length, created });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
