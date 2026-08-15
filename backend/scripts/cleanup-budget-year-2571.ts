/**
 * ย้ายงบผูกพันจากปี 2571 → 2569 แล้วลบปี 2571 (ยังไม่ถึง)
 *   npx tsx scripts/cleanup-budget-year-2571.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const y69 = await prisma.budgetFiscalYear.findUnique({ where: { yearBe: 2569 } });
  const y71 = await prisma.budgetFiscalYear.findUnique({ where: { yearBe: 2571 } });
  if (!y71) {
    console.log("ไม่มีปี 2571 — ข้าม");
    return;
  }
  if (!y69) throw new Error("ไม่พบปี 2569");

  const commits = await prisma.budgetYearLine.findMany({
    where: { fiscalYearId: y71.id, fundingType: "COMMITMENT" },
  });

  let moved = 0;
  let skipped = 0;
  for (const line of commits) {
    const existing = await prisma.budgetYearLine.findUnique({
      where: {
        fiscalYearId_accountId_fundingType: {
          fiscalYearId: y69.id,
          accountId: line.accountId,
          fundingType: "COMMITMENT",
        },
      },
    });
    if (existing) {
      skipped += 1;
      await prisma.budgetYearLine.delete({ where: { id: line.id } });
      continue;
    }
    await prisma.budgetYearLine.update({
      where: { id: line.id },
      data: { fiscalYearId: y69.id },
    });
    moved += 1;
  }

  // ลบปี 2571 (cascade annual/request leftovers)
  await prisma.budgetRequest.deleteMany({ where: { targetYearBe: 2571 } });
  await prisma.budgetFiscalYear.delete({ where: { id: y71.id } });

  console.log(`moved commitment→2569: ${moved}, skipped(dup deleted): ${skipped}`);
  console.log("deleted fiscal year 2571");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
