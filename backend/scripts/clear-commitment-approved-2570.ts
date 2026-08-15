/**
 * ปี 2570 งบผูกพันยังเป็นขั้นคำขอ — sync planEnd จากยอดปัจจุบัน แล้วเคลียร์อนุมัติ
 *
 *   npx tsx scripts/clear-commitment-approved-2570.ts
 */
import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const fy = await prisma.budgetFiscalYear.findUnique({ where: { yearBe: 2570 } });
  if (!fy) throw new Error("ไม่พบปี 2570");

  const lines = await prisma.budgetYearLine.findMany({
    where: { fiscalYearId: fy.id, fundingType: "COMMITMENT" },
    include: { account: { select: { name: true, isSummary: true } } },
  });

  let synced = 0;
  for (const line of lines) {
    const amt = Number(line.allocatedAmount);
    if (amt === 0) continue;
    const existing = await prisma.budgetRequest.findUnique({
      where: { accountId_targetYearBe: { accountId: line.accountId, targetYearBe: 2570 } },
    });
    const planEnd = existing?.planEndAmount != null ? Number(existing.planEndAmount) : null;
    if (planEnd == null || planEnd === 0) {
      await prisma.budgetRequest.upsert({
        where: { accountId_targetYearBe: { accountId: line.accountId, targetYearBe: 2570 } },
        create: {
          accountId: line.accountId,
          targetYearBe: 2570,
          requestedAmount: new Prisma.Decimal(0),
          planEndAmount: line.allocatedAmount,
        },
        update: { planEndAmount: line.allocatedAmount },
      });
      synced += 1;
    }
  }

  const before = await prisma.budgetYearLine.aggregate({
    where: { fiscalYearId: fy.id, fundingType: "COMMITMENT" },
    _sum: { allocatedAmount: true, commitmentAmount: true },
    _count: true,
  });

  const result = await prisma.budgetYearLine.updateMany({
    where: { fiscalYearId: fy.id, fundingType: "COMMITMENT" },
    data: {
      allocatedAmount: new Prisma.Decimal(0),
      commitmentAmount: new Prisma.Decimal(0),
    },
  });

  const pe = await prisma.budgetRequest.aggregate({
    where: { targetYearBe: 2570, planEndAmount: { not: null } },
    _sum: { planEndAmount: true },
    _count: true,
  });

  const section = await prisma.budgetRequest.findFirst({
    where: {
      targetYearBe: 2570,
      account: { isSummary: true, name: { contains: "หมวดค่าใช้จ่าย" } },
    },
  });

  console.log({
    clearedLines: result.count,
    syncedPlanEnd: synced,
    allocatedBefore: Number(before._sum.allocatedAmount ?? 0),
    allocatedAfter: 0,
    planEndCount: pe._count,
    planEndSum: Number(pe._sum.planEndAmount ?? 0),
    sectionPlanEnd: section?.planEndAmount != null ? Number(section.planEndAmount) : null,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
