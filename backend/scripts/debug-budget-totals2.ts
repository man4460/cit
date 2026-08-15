import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
function n(v: unknown) {
  return Number(String(v ?? 0));
}

async function main() {
  const fy = await p.budgetFiscalYear.findUnique({ where: { yearBe: 2569 } });
  const lines = await p.budgetYearLine.findMany({
    where: { fiscalYearId: fy!.id, fundingType: "ANNUAL" },
    include: {
      account: true,
      snapshots: { orderBy: { asOfDate: "desc" }, take: 1 },
    },
    orderBy: [{ account: { kind: "asc" } }, { account: { sortOrder: "asc" } }],
  });

  console.log("--- EXPENSE with CI ---");
  let se = 0;
  let ss = 0;
  for (const l of lines.filter((x) => !x.account.isSummary && x.account.ciCode && x.account.kind === "EXPENSE")) {
    const spent = l.snapshots[0] ? n(l.snapshots[0].spentAmount) : 0;
    se += n(l.allocatedAmount) + n(l.carryInAmount);
    ss += spent;
    console.log(
      (n(l.allocatedAmount) / 1e6).toFixed(3).padStart(8),
      (n(l.carryInAmount) / 1e6).toFixed(3).padStart(7),
      (spent / 1e6).toFixed(3).padStart(8),
      l.account.ciCode,
      l.account.name.slice(0, 45),
    );
  }
  console.log("SUM expense CI", (se / 1e6).toFixed(2), "spent", (ss / 1e6).toFixed(2));

  console.log("--- CAPEX with CI ---");
  let ce = 0;
  let cs = 0;
  for (const l of lines.filter((x) => !x.account.isSummary && x.account.ciCode && x.account.kind === "CAPEX")) {
    const spent = l.snapshots[0] ? n(l.snapshots[0].spentAmount) : 0;
    ce += n(l.allocatedAmount) + n(l.carryInAmount);
    cs += spent;
    console.log(
      (n(l.allocatedAmount) / 1e6).toFixed(3).padStart(8),
      (spent / 1e6).toFixed(3).padStart(8),
      l.account.ciCode,
      l.account.name.slice(0, 45),
    );
  }
  console.log("SUM capex CI", (ce / 1e6).toFixed(2), "spent", (cs / 1e6).toFixed(2));

  console.log("--- SUMMARY rows ---");
  for (const l of lines.filter((x) => x.account.isSummary)) {
    console.log((n(l.allocatedAmount) / 1e6).toFixed(2), l.account.kind, l.account.name.slice(0, 70));
  }

  // Only accounts whose parent is summary or null (top budget lines)
  const byId = new Map(lines.map((l) => [l.accountId, l]));
  const accountById = new Map(lines.map((l) => [l.account.id, l.account]));
  console.log("--- TOP-LEVEL (parent is summary/null) ---");
  let te = 0;
  let tc = 0;
  let tse = 0;
  let tsc = 0;
  for (const l of lines.filter((x) => !x.account.isSummary)) {
    const parent = l.account.parentId ? accountById.get(l.account.parentId) : null;
    const top = !l.account.parentId || parent?.isSummary;
    if (!top) continue;
    const spent = l.snapshots[0] ? n(l.snapshots[0].spentAmount) : 0;
    const amt = n(l.allocatedAmount) + n(l.carryInAmount);
    if (l.account.kind === "EXPENSE") {
      te += amt;
      tse += spent;
    } else {
      tc += amt;
      tsc += spent;
    }
  }
  console.log("top expense", (te / 1e6).toFixed(2), "spent", (tse / 1e6).toFixed(2));
  console.log("top capex", (tc / 1e6).toFixed(2), "spent", (tsc / 1e6).toFixed(2));
  console.log("top total", ((te + tc) / 1e6).toFixed(2), "spent", ((tse + tsc) / 1e6).toFixed(2));
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
