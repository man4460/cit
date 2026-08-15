import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const ys = await p.budgetFiscalYear.findMany({ orderBy: { yearBe: "asc" } });
  console.log(
    "years",
    ys.map((y) => y.yearBe),
  );
  for (const y of ys) {
    const annual = await p.budgetYearLine.count({
      where: { fiscalYearId: y.id, fundingType: "ANNUAL" },
    });
    const commit = await p.budgetYearLine.count({
      where: { fiscalYearId: y.id, fundingType: "COMMITMENT" },
    });
    console.log(`year ${y.yearBe}: annual=${annual} commitment=${commit}`);
  }
  const allCommit = await p.budgetYearLine.groupBy({
    by: ["fiscalYearId"],
    where: { fundingType: "COMMITMENT" },
    _count: true,
  });
  console.log("commitment by fy", allCommit);
}

main()
  .finally(() => p.$disconnect());
