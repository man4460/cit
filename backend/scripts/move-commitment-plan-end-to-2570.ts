/**
 * ย้ายงบผูกพันจากคอลัมน์ «ถึงสิ้นสุดแผน» ในคำขอปี 70
 * ที่เคยอยู่ปี 2571 → ปี 2570 (ตรงปีที่ผู้ใช้ดูงบผูกพัน)
 *
 *   npx tsx scripts/move-commitment-plan-end-to-2570.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const NOTE = "งบผูกพันปี 2570 ถึงสิ้นสุดแผน (คำขอปี 70)";

async function main() {
  const y70 = await prisma.budgetFiscalYear.findUnique({ where: { yearBe: 2570 } });
  const y71 = await prisma.budgetFiscalYear.findUnique({ where: { yearBe: 2571 } });
  if (!y70) throw new Error("ไม่พบปี 2570");
  if (!y71) {
    console.log("ไม่มีปี 2571 — ข้าม");
    return;
  }

  const lines = await prisma.budgetYearLine.findMany({
    where: { fiscalYearId: y71.id, fundingType: "COMMITMENT" },
    include: { account: { select: { name: true, ciCode: true, isSummary: true } } },
  });

  let moved = 0;
  let merged = 0;
  for (const line of lines) {
    const existing = await prisma.budgetYearLine.findUnique({
      where: {
        fiscalYearId_accountId_fundingType: {
          fiscalYearId: y70.id,
          accountId: line.accountId,
          fundingType: "COMMITMENT",
        },
      },
    });
    if (existing) {
      // ค่าจากคำขอปี 70 (ถึงสิ้นสุด) ทับยอดจากชีตผลพิที่มีอยู่
      await prisma.budgetYearLine.update({
        where: { id: existing.id },
        data: {
          allocatedAmount: line.allocatedAmount,
          commitmentAmount: line.commitmentAmount,
          notes: NOTE,
        },
      });
      await prisma.budgetYearLine.delete({ where: { id: line.id } });
      merged += 1;
      continue;
    }
    await prisma.budgetYearLine.update({
      where: { id: line.id },
      data: { fiscalYearId: y70.id, notes: NOTE },
    });
    moved += 1;
  }

  const left71 = await prisma.budgetYearLine.count({ where: { fiscalYearId: y71.id } });
  if (left71 === 0) {
    await prisma.budgetRequest.deleteMany({ where: { targetYearBe: 2571 } });
    await prisma.budgetFiscalYear.delete({ where: { id: y71.id } });
  }

  const on70 = await prisma.budgetYearLine.findMany({
    where: { fiscalYearId: y70.id, fundingType: "COMMITMENT" },
    include: { account: { select: { name: true, isSummary: true } } },
  });
  const summary = on70.find((l) => l.account.isSummary && /หมวดค่าใช้จ่าย/.test(l.account.name));
  const leafSum = on70
    .filter((l) => !l.account.isSummary)
    .reduce((s, l) => s + Number(l.allocatedAmount), 0);

  console.log({
    candidates: lines.length,
    moved,
    merged,
    deletedYear2571: left71 === 0,
    commitmentOn2570: on70.length,
    summaryหมวดค่าใช้จ่าย: summary ? Number(summary.allocatedAmount) : null,
    leafSum,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
