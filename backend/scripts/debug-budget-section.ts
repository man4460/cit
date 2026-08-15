import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
function n(v: unknown) {
  return Number(String(v ?? 0));
}

async function main() {
  for (const yearBe of [2569, 2570]) {
    const fy = await p.budgetFiscalYear.findUnique({ where: { yearBe } });
    if (!fy) continue;
    const lines = await p.budgetYearLine.findMany({
      where: { fiscalYearId: fy.id, fundingType: "ANNUAL" },
      include: {
        account: true,
        snapshots: { orderBy: { asOfDate: "desc" }, take: 1 },
      },
    });
    console.log("====", yearBe);
    for (const l of lines.filter((x) => /หมวดค่าใช้จ่าย|สินทรัพย์ถาวร/.test(x.account.name))) {
      const spent = l.snapshots[0] ? n(l.snapshots[0].spentAmount) : null;
      console.log({
        name: xName(l.account.name),
        kind: l.account.kind,
        isSummary: l.account.isSummary,
        alloc: n(l.allocatedAmount),
        allocM: +(n(l.allocatedAmount) / 1e6).toFixed(2),
        spent,
        spentM: spent != null ? +(spent / 1e6).toFixed(2) : null,
      });
    }
  }
}

function xName(s: string) {
  return s.slice(0, 40);
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
