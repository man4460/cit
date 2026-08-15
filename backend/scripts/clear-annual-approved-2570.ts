/**
 * ปี 2570 ยังเป็นขั้นคำขอ — เคลียร์ยอดอนุมัติ (allocated) ของงบประจำปี
 * คง BudgetRequest ไว้เป็นยอดคำขอ
 *
 *   npx tsx scripts/clear-annual-approved-2570.ts
 */
import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const fy = await prisma.budgetFiscalYear.findUnique({ where: { yearBe: 2570 } });
  if (!fy) throw new Error("ไม่พบปี 2570");

  const before = await prisma.budgetYearLine.aggregate({
    where: { fiscalYearId: fy.id, fundingType: "ANNUAL" },
    _sum: { allocatedAmount: true },
    _count: true,
  });

  const result = await prisma.budgetYearLine.updateMany({
    where: { fiscalYearId: fy.id, fundingType: "ANNUAL" },
    data: { allocatedAmount: new Prisma.Decimal(0) },
  });

  const reqSum = await prisma.budgetRequest.aggregate({
    where: { targetYearBe: 2570 },
    _sum: { requestedAmount: true },
    _count: true,
  });

  console.log({
    clearedLines: result.count,
    allocatedBefore: Number(before._sum.allocatedAmount ?? 0),
    allocatedAfter: 0,
    requestCount: reqSum._count,
    requestSum: Number(reqSum._sum.requestedAmount ?? 0),
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
