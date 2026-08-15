import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

function num(v: unknown): number {
  if (v == null) return 0;
  return Number(String(v));
}

async function main() {
  const fy69 = await p.budgetFiscalYear.findUnique({ where: { yearBe: 2569 } });
  const fy70 = await p.budgetFiscalYear.findUnique({ where: { yearBe: 2570 } });
  if (!fy69 || !fy70) throw new Error("missing years");

  const lines69 = await p.budgetYearLine.findMany({
    where: { fiscalYearId: fy69.id, fundingType: "ANNUAL" },
    include: {
      account: true,
      snapshots: { orderBy: { asOfDate: "desc" }, take: 1 },
    },
  });
  const lines70 = await p.budgetYearLine.findMany({
    where: { fiscalYearId: fy70.id, fundingType: "ANNUAL" },
    include: { account: true },
  });

  const spentOf = (l: (typeof lines69)[0]) => (l.snapshots[0] ? num(l.snapshots[0].spentAmount) : 0);

  const groups = {
    all: lines69,
    leaf: lines69.filter((l) => !l.account.isSummary),
    summary: lines69.filter((l) => l.account.isSummary),
    withCi: lines69.filter((l) => !l.account.isSummary && l.account.ciCode),
    expenseLeaf: lines69.filter((l) => !l.account.isSummary && l.account.kind === "EXPENSE"),
    capexLeaf: lines69.filter((l) => !l.account.isSummary && l.account.kind === "CAPEX"),
    expenseCi: lines69.filter((l) => !l.account.isSummary && l.account.kind === "EXPENSE" && l.account.ciCode),
    capexCi: lines69.filter((l) => !l.account.isSummary && l.account.kind === "CAPEX" && l.account.ciCode),
  };

  console.log("PDF targets (ลบ.): total69=109.21 expense=79.58 capex=29.63 spent=61.95");
  console.log("PDF 70: total=110.37 expense=83.73 capex=26.64");
  console.log("---");

  for (const [name, arr] of Object.entries(groups)) {
    const alloc = arr.reduce((s, l) => s + num(l.allocatedAmount) + num(l.carryInAmount), 0);
    const spent = arr.reduce((s, l) => s + spentOf(l), 0);
    console.log(
      `69 ${name.padEnd(12)} n=${String(arr.length).padStart(3)} alloc=${(alloc / 1e6).toFixed(2)} spent=${(spent / 1e6).toFixed(2)}`,
    );
  }

  console.log("--- 70 ---");
  const g70 = {
    leaf: lines70.filter((l) => !l.account.isSummary),
    withCi: lines70.filter((l) => !l.account.isSummary && l.account.ciCode),
    expenseCi: lines70.filter((l) => !l.account.isSummary && l.account.kind === "EXPENSE" && l.account.ciCode),
    capexCi: lines70.filter((l) => !l.account.isSummary && l.account.kind === "CAPEX" && l.account.ciCode),
  };
  for (const [name, arr] of Object.entries(g70)) {
    const alloc = arr.reduce((s, l) => s + num(l.allocatedAmount), 0);
    console.log(`70 ${name.padEnd(12)} n=${String(arr.length).padStart(3)} alloc=${(alloc / 1e6).toFixed(2)}`);
  }

  // show largest leaf expense without CI (likely sublines double count)
  const noCi = lines69
    .filter((l) => !l.account.isSummary && !l.account.ciCode)
    .sort((a, b) => num(b.allocatedAmount) - num(a.allocatedAmount))
    .slice(0, 15);
  console.log("--- top leaf WITHOUT ciCode (double-count suspects) ---");
  for (const l of noCi) {
    console.log(
      `${(num(l.allocatedAmount) / 1e6).toFixed(2)} | ${l.account.kind} | parent=${l.account.parentId?.slice(0, 8)} | ${l.account.name.slice(0, 60)}`,
    );
  }

  // withCi only totals by kind
  const expCi = lines69.filter((l) => !l.account.isSummary && l.account.kind === "EXPENSE" && l.account.ciCode);
  const capCi = lines69.filter((l) => !l.account.isSummary && l.account.kind === "CAPEX" && l.account.ciCode);
  console.log("--- withCi only ---");
  console.log(
    "exp",
    (expCi.reduce((s, l) => s + num(l.allocatedAmount) + num(l.carryInAmount), 0) / 1e6).toFixed(2),
    "spent",
    (expCi.reduce((s, l) => s + spentOf(l), 0) / 1e6).toFixed(2),
  );
  console.log(
    "cap",
    (capCi.reduce((s, l) => s + num(l.allocatedAmount) + num(l.carryInAmount), 0) / 1e6).toFixed(2),
    "spent",
    (capCi.reduce((s, l) => s + spentOf(l), 0) / 1e6).toFixed(2),
  );
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
