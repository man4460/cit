import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const fy = await p.budgetFiscalYear.findUnique({ where: { yearBe: 2569 } });
  const lines = await p.budgetYearLine.findMany({
    where: { fiscalYearId: fy!.id, fundingType: "ANNUAL" },
    include: { account: true },
    orderBy: { account: { sortOrder: "asc" } },
  });
  const byId = new Map(lines.map((l) => [l.accountId, l]));

  for (const kind of ["EXPENSE", "CAPEX"] as const) {
    console.log("\n====", kind);
    const section = lines.find(
      (l) => l.account.kind === kind && l.account.isSummary && /หมวด/.test(l.account.name),
    );
    console.log("section", section?.account.name, section?.accountId.slice(0, 8));
    const majors = lines.filter((l) => {
      if (l.account.kind !== kind) return false;
      if (!section) return !l.account.parentId;
      return l.account.parentId === section.accountId;
    });
    for (const m of majors) {
      const kids = lines.filter((l) => l.account.parentId === m.accountId);
      console.log(
        `MAJOR [${m.account.isSummary ? "S" : "L"}] ${m.account.ciCode || "-"} ${m.account.name.slice(0, 50)} kids=${kids.length} alloc=${Number(m.allocatedAmount)}`,
      );
      for (const k of kids.slice(0, 8)) {
        console.log(
          `   - [${k.account.isSummary ? "S" : "L"}] ${k.account.ciCode || "-"} ${k.account.name.slice(0, 45)}`,
        );
      }
      if (kids.length > 8) console.log(`   ... +${kids.length - 8}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
