import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const ys = await p.budgetFiscalYear.findMany({ orderBy: { yearBe: "asc" } });
  for (const y of ys) {
    const commits = await p.budgetYearLine.findMany({
      where: { fiscalYearId: y.id, fundingType: "COMMITMENT" },
      include: { account: { select: { name: true, ciCode: true } } },
      orderBy: { account: { sortOrder: "asc" } },
    });
    if (!commits.length) continue;
    console.log(`\n=== COMMIT year ${y.yearBe} (${commits.length}) ===`);
    for (const c of commits) {
      console.log(`- ${c.account.ciCode ?? "-"} ${c.account.name.slice(0, 70)} alloc=${c.allocatedAmount}`);
    }
  }
}

main().finally(() => p.$disconnect());
