/**
 * ย้ายงบผูกพันที่หมายเหตุระบุปี 2571 จากปี 2569 → ปี 2571 (ตรงปีตาม seed)
 *   npx tsx scripts/fix-commitment-year-2571.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const y69 = await prisma.budgetFiscalYear.findUnique({ where: { yearBe: 2569 } });
  if (!y69) throw new Error("ไม่พบปี 2569");

  const y71 = await prisma.budgetFiscalYear.upsert({
    where: { yearBe: 2571 },
    create: { yearBe: 2571, status: "ACTIVE", notes: "งบผูกพันสิ้นสุดแผนงาน (คำขอปี 2571)" },
    update: { notes: "งบผูกพันสิ้นสุดแผนงาน (คำขอปี 2571)" },
  });

  const lines = await prisma.budgetYearLine.findMany({
    where: {
      fiscalYearId: y69.id,
      fundingType: "COMMITMENT",
      OR: [
        { notes: { contains: "2571" } },
        { notes: { contains: "สิ้นสุดแผนงาน" } },
      ],
    },
    include: { account: { select: { name: true, ciCode: true } } },
  });

  let moved = 0;
  let merged = 0;
  for (const line of lines) {
    const existing = await prisma.budgetYearLine.findUnique({
      where: {
        fiscalYearId_accountId_fundingType: {
          fiscalYearId: y71.id,
          accountId: line.accountId,
          fundingType: "COMMITMENT",
        },
      },
    });
    if (existing) {
      await prisma.budgetYearLine.update({
        where: { id: existing.id },
        data: {
          allocatedAmount: line.allocatedAmount,
          commitmentAmount: line.commitmentAmount,
          notes: line.notes,
        },
      });
      await prisma.budgetYearLine.delete({ where: { id: line.id } });
      merged += 1;
      continue;
    }
    await prisma.budgetYearLine.update({
      where: { id: line.id },
      data: { fiscalYearId: y71.id },
    });
    moved += 1;
  }

  const remain69 = await prisma.budgetYearLine.count({
    where: { fiscalYearId: y69.id, fundingType: "COMMITMENT" },
  });
  const on71 = await prisma.budgetYearLine.count({
    where: { fiscalYearId: y71.id, fundingType: "COMMITMENT" },
  });

  console.log({
    candidates: lines.length,
    moved,
    merged,
    commitmentLeftOn2569: remain69,
    commitmentOn2571: on71,
    sample: lines.slice(0, 3).map((l) => l.account.name),
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
