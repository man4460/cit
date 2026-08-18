/**
 * Seed งบประมาณ — แยกปี 2569 / 2570 / งบผูกพัน
 *
 *   npx tsx scripts/seed-budget-from-xlsx.ts [path-to-xlsx]
 *
 * ชีต: คำขอปึ70, สรุปใช้งบ 31กค, ผลพิ69-สรุป
 */
import "dotenv/config";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_XLSX = path.join(__dirname, "..", "data", "budget-fy70.xlsx");
const FALLBACK_XLSX =
  String.raw`C:\Users\LENOVO\Downloads\Telegram Desktop\final-ฝรภ--คำของบปี 70.xlsx`;
const EXTRACT_PY = path.join(__dirname, "extract-budget-xlsx.py");

type Row = {
  row: number;
  kind: "EXPENSE" | "CAPEX";
  note: string | null;
  codeOrSection: string | null;
  fileRef: string | null;
  nameA: string | null;
  nameB: string | null;
  definition: string | null;
  superiorCi: string | null;
  buyerName: string | null;
  requestingUnit: string | null;
  y69: number | null;
  carryIn: number | null;
  spent: number | null;
  y70: number | null;
  delta: number | null;
  deltaPct: number | null;
  dir: string | null;
  reason: string | null;
  y71: number | null;
  commitReq70: number | null;
  commitAppr70: number | null;
};

type Payload = { requestRows: Row[]; spendRows: Row[]; resultRows: Row[] };

function d(n: number | null | undefined): Prisma.Decimal {
  return new Prisma.Decimal(n ?? 0);
}

function isCiCode(s: string | null | undefined): boolean {
  return Boolean(s && /^\d{7,12}$/.test(s.trim()));
}

function isSectionHeader(s: string | null | undefined): boolean {
  return Boolean(s && /หมวด|รวมงบประมาณ/.test(s));
}

function resolveName(row: Row): string {
  return (
    row.nameB?.trim() ||
    row.nameA?.trim() ||
    row.definition?.trim()?.split("\n")[0]?.trim() ||
    row.codeOrSection?.trim() ||
    `แถว ${row.row}`
  );
}

function extractViaPython(xlsxPath: string): Payload {
  const out = execFileSync("python", [EXTRACT_PY, xlsxPath], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(out) as Payload;
}

async function main() {
  const xlsxPath = process.argv[2] || (fs.existsSync(DEFAULT_XLSX) ? DEFAULT_XLSX : FALLBACK_XLSX);
  if (!fs.existsSync(xlsxPath)) throw new Error(`ไม่พบไฟล์: ${xlsxPath}`);
  if (!fs.existsSync(EXTRACT_PY)) throw new Error(`ไม่พบสคริปต์: ${EXTRACT_PY}`);
  console.log(`อ่านไฟล์: ${xlsxPath}`);

  const payload = extractViaPython(xlsxPath);

  const fy69 = await prisma.budgetFiscalYear.upsert({
    where: { yearBe: 2569 },
    create: { yearBe: 2569, status: "ACTIVE", notes: "งบประจำปี 2569" },
    update: { notes: "งบประจำปี 2569" },
  });
  const fy70 = await prisma.budgetFiscalYear.upsert({
    where: { yearBe: 2570 },
    create: { yearBe: 2570, status: "ACTIVE", notes: "งบประจำปี 2570 + งบผูกพัน" },
    update: { notes: "งบประจำปี 2570 + งบผูกพัน" },
  });

  await prisma.budgetTransaction.deleteMany({});
  await prisma.budgetSpendSnapshot.deleteMany({});
  await prisma.budgetRequest.deleteMany({});
  await prisma.budgetYearLine.deleteMany({});
  await prisma.budgetAccount.deleteMany({});

  let kind: "EXPENSE" | "CAPEX" = "EXPENSE";
  let parentExpenseId: string | null = null;
  let parentCapexId: string | null = null;
  let currentGroupId: string | null = null;
  let sortOrder = 0;

  const accountByCi = new Map<string, string>();
  const accountByName = new Map<string, string>();
  const line69 = new Map<string, string>();
  const line70 = new Map<string, string>();
  const snapshotDate = new Date(Date.UTC(2026, 6, 31));

  async function upsertSnapshot(yearLineId: string, spent: number, notes: string) {
    const amount = d(spent);
    const existing = await prisma.budgetSpendSnapshot.findFirst({
      where: { yearLineId, asOfDate: snapshotDate },
    });
    if (existing) {
      if (amount.greaterThan(existing.spentAmount)) {
        await prisma.budgetSpendSnapshot.update({
          where: { id: existing.id },
          data: { spentAmount: amount, notes },
        });
      }
      return;
    }
    await prisma.budgetSpendSnapshot.create({
      data: {
        yearLineId,
        asOfDate: snapshotDate,
        spentAmount: amount,
        source: "IMPORT",
        notes,
      },
    });
  }

  async function ensureAccount(row: Row): Promise<string> {
    if (row.codeOrSection && /หมวดค่าใช้จ่าย/.test(row.codeOrSection)) kind = "EXPENSE";
    if (row.codeOrSection && /สินทรัพย์ถาวร/.test(row.codeOrSection)) kind = "CAPEX";
    if (row.kind === "CAPEX") kind = "CAPEX";

    const name =
      row.codeOrSection && isSectionHeader(row.codeOrSection) ? row.codeOrSection.trim() : resolveName(row);
    if (/รวมงบประมาณ/.test(name)) throw new Error("skip-total");

    const ci = isCiCode(row.codeOrSection) ? row.codeOrSection!.trim() : null;
    if (ci && accountByCi.has(ci)) return accountByCi.get(ci)!;
    const nameKey = name.toLowerCase();
    if (!ci && accountByName.has(nameKey)) return accountByName.get(nameKey)!;

    const sectionLike =
      Boolean(row.codeOrSection && isSectionHeader(row.codeOrSection)) ||
      (row.codeOrSection == null &&
        row.nameA != null &&
        /^\d+\.\s/.test(row.nameA) &&
        !row.nameB &&
        !row.fileRef);

    let parentId: string | null = null;
    if (kind === "EXPENSE") {
      if (row.codeOrSection && /หมวดค่าใช้จ่าย/.test(row.codeOrSection)) parentId = null;
      else if (sectionLike) parentId = parentExpenseId;
      else parentId = currentGroupId ?? parentExpenseId;
    } else {
      if (row.codeOrSection && /สินทรัพย์ถาวร/.test(row.codeOrSection)) parentId = null;
      else parentId = parentCapexId;
    }

    const isSummary =
      Boolean(row.codeOrSection && isSectionHeader(row.codeOrSection)) ||
      Boolean(sectionLike && !ci && !row.fileRef);

    const account = await prisma.budgetAccount.create({
      data: {
        parentId,
        ciCode: ci,
        superiorCi: row.superiorCi && /^\d+/.test(row.superiorCi) ? row.superiorCi : null,
        fileRef: row.fileRef,
        name,
        definition: row.definition,
        kind,
        sortOrder: sortOrder++,
        isSummary,
      },
    });

    if (row.codeOrSection && /หมวดค่าใช้จ่าย/.test(row.codeOrSection)) {
      parentExpenseId = account.id;
      currentGroupId = account.id;
      kind = "EXPENSE";
    } else if (row.codeOrSection && /สินทรัพย์ถาวร/.test(row.codeOrSection)) {
      parentCapexId = account.id;
      currentGroupId = account.id;
      kind = "CAPEX";
    } else if (sectionLike && !ci) {
      currentGroupId = account.id;
    }

    if (ci) accountByCi.set(ci, account.id);
    accountByName.set(nameKey, account.id);
    return account.id;
  }

  for (const row of payload.requestRows) {
    try {
      if (row.codeOrSection && /รวมงบประมาณ/.test(row.codeOrSection)) continue;
      const accountId = await ensureAccount(row);

      const yl69 = await prisma.budgetYearLine.upsert({
        where: {
          fiscalYearId_accountId_fundingType: {
            fiscalYearId: fy69.id,
            accountId,
            fundingType: "ANNUAL",
          },
        },
        create: {
          fiscalYearId: fy69.id,
          accountId,
          fundingType: "ANNUAL",
          allocatedAmount: d(row.y69),
          notes: row.note,
        },
        update: {
          allocatedAmount: d(row.y69),
          notes: row.note,
        },
      });
      line69.set(accountId, yl69.id);

      if (row.spent != null) {
        await upsertSnapshot(yl69.id, row.spent, "ใช้ไป ณ 31 ก.ค. 69 (ชีตคำขอปึ70)");
      }

      if (row.y70 != null) {
        const yl70 = await prisma.budgetYearLine.upsert({
          where: {
            fiscalYearId_accountId_fundingType: {
              fiscalYearId: fy70.id,
              accountId,
              fundingType: "ANNUAL",
            },
          },
          create: {
            fiscalYearId: fy70.id,
            accountId,
            fundingType: "ANNUAL",
            /** ปี 70 ยังเป็นคำขอ — ยังไม่อนุมัติ */
            allocatedAmount: d(0),
          },
          update: {
            allocatedAmount: d(0),
          },
        });
        line70.set(accountId, yl70.id);

        await prisma.budgetRequest.upsert({
          where: { accountId_targetYearBe: { accountId, targetYearBe: 2570 } },
          create: {
            accountId,
            targetYearBe: 2570,
            requestedAmount: d(row.y70),
            deltaAmount: row.delta != null ? d(row.delta) : null,
            deltaPercent: row.deltaPct != null ? d(row.deltaPct) : null,
            changeDirection: row.dir,
            reason: row.reason,
            planEndAmount: row.y71 != null ? d(row.y71) : null,
          },
          update: {
            requestedAmount: d(row.y70),
            deltaAmount: row.delta != null ? d(row.delta) : null,
            deltaPercent: row.deltaPct != null ? d(row.deltaPct) : null,
            changeDirection: row.dir,
            reason: row.reason,
            planEndAmount: row.y71 != null ? d(row.y71) : null,
          },
        });
      }

      if (row.y71 != null && row.y71 !== 0) {
        /** คอลัมน์ถึงสิ้นสุดแผนในคำขอปี 70 = งบผูกพันของปี 2570 (ยังเป็นคำขอ — ยังไม่อนุมัติ) */
        await prisma.budgetYearLine.upsert({
          where: {
            fiscalYearId_accountId_fundingType: {
              fiscalYearId: fy70.id,
              accountId,
              fundingType: "COMMITMENT",
            },
          },
          create: {
            fiscalYearId: fy70.id,
            accountId,
            fundingType: "COMMITMENT",
            allocatedAmount: d(0),
            commitmentAmount: d(0),
            notes: "งบผูกพันปี 2570 ถึงสิ้นสุดแผน (คำขอปี 70)",
          },
          update: {
            allocatedAmount: d(0),
            commitmentAmount: d(0),
            notes: "งบผูกพันปี 2570 ถึงสิ้นสุดแผน (คำขอปี 70)",
          },
        });
      }
    } catch (e) {
      if (e instanceof Error && e.message === "skip-total") continue;
      throw e;
    }
  }

  for (const row of payload.spendRows) {
    const code = row.codeOrSection?.trim();
    if (!code || !isCiCode(code)) continue;
    let accountId = accountByCi.get(code);
    if (!accountId) {
      try {
        accountId = await ensureAccount(row);
      } catch {
        continue;
      }
    }
    const ylId = line69.get(accountId);
    if (ylId) {
      await prisma.budgetYearLine.update({
        where: { id: ylId },
        data: {
          carryInAmount: row.carryIn != null ? d(row.carryIn) : undefined,
          buyerName: row.buyerName ?? undefined,
          requestingUnit: row.requestingUnit ?? undefined,
          allocatedAmount: row.y69 != null ? d(row.y69) : undefined,
        },
      });
      if (row.spent != null) {
        await upsertSnapshot(ylId, row.spent, "จากชีตสรุปใช้งบ 31กค");
      }
    }
    if (row.superiorCi && /^\d+/.test(row.superiorCi)) {
      await prisma.budgetAccount.update({
        where: { id: accountId },
        data: { superiorCi: row.superiorCi },
      });
    }
  }

  for (const row of payload.resultRows) {
    const code = row.codeOrSection?.trim();
    if (!code || !isCiCode(code)) continue;
    let accountId = accountByCi.get(code);
    if (!accountId) {
      try {
        accountId = await ensureAccount(row);
        if (!line69.has(accountId) && row.y69 != null) {
          const yl = await prisma.budgetYearLine.create({
            data: {
              fiscalYearId: fy69.id,
              accountId,
              fundingType: "ANNUAL",
              allocatedAmount: d(row.y69),
            },
          });
          line69.set(accountId, yl.id);
        }
      } catch {
        continue;
      }
    }

    const commit = row.commitAppr70 ?? row.commitReq70;
    if (commit != null && commit !== 0) {
      /** ผลพิมีตัวเลขผูกพัน — ปี 70 ยังคำขอ: เก็บใน planEnd ไม่ใส่ยอดอนุมัติ */
      await prisma.budgetYearLine.upsert({
        where: {
          fiscalYearId_accountId_fundingType: {
            fiscalYearId: fy70.id,
            accountId,
            fundingType: "COMMITMENT",
          },
        },
        create: {
          fiscalYearId: fy70.id,
          accountId,
          fundingType: "COMMITMENT",
          allocatedAmount: d(0),
          commitmentAmount: d(0),
          notes: "งบผูกพันปี 2570 (ผลพิ69-สรุป · คำขอ)",
        },
        update: {
          allocatedAmount: d(0),
          commitmentAmount: d(0),
          notes: "งบผูกพันปี 2570 (ผลพิ69-สรุป · คำขอ)",
        },
      });

      await prisma.budgetRequest.upsert({
        where: { accountId_targetYearBe: { accountId, targetYearBe: 2570 } },
        create: {
          accountId,
          targetYearBe: 2570,
          requestedAmount: d(0),
          planEndAmount: d(commit),
        },
        /** ไม่ทับ planEnd จากคอลัมน์ถึงสิ้นสุดแผนในคำขอ */
        update: {},
      });

      const yl70 = line70.get(accountId);
      if (yl70) {
        await prisma.budgetYearLine.update({
          where: { id: yl70 },
          data: { commitmentAmount: d(0) },
        });
      }
    }

    const yl69 = line69.get(accountId);
    if (yl69 && row.y69 != null) {
      await prisma.budgetYearLine.update({
        where: { id: yl69 },
        data: { allocatedAmount: d(row.y69) },
      });
    }
  }

  console.log("seed budget เสร็จ", {
    accounts: await prisma.budgetAccount.count(),
    annual69: await prisma.budgetYearLine.count({ where: { fiscalYearId: fy69.id, fundingType: "ANNUAL" } }),
    annual70: await prisma.budgetYearLine.count({ where: { fiscalYearId: fy70.id, fundingType: "ANNUAL" } }),
    commit70: await prisma.budgetYearLine.count({ where: { fiscalYearId: fy70.id, fundingType: "COMMITMENT" } }),
    requests: await prisma.budgetRequest.count(),
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
