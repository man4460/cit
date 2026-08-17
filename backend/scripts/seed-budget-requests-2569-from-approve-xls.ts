/**
 * ใส่เฉพาะคำขอปี 2569 จากไฟล์ผลพิจารณา — ไม่แตะยอดอนุมัติ / BudgetYearLine
 *
 *   npx tsx scripts/seed-budget-requests-2569-from-approve-xls.ts [path.xls]
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Prisma } from "@prisma/client";
import XLSX from "xlsx";
import { prisma } from "../src/lib/prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_XLS =
  "/Users/mawell-03/Downloads/Copy_of_ต้นฉบับ_ผลอนุมัติงบประจำปี_2568.xls";

/** รหัสในไฟล์ → รหัสในระบบ */
const CI_ALIASES: Record<string, string> = {
  "52010200": "5020102000",
  "52010700": "5020104000",
  "52020500": "5020304000",
  "52020600": "5020305000",
  "52021100": "5020306000",
  "52030200": "5020402000",
  "53060900": "5031116000",
  "53060600": "5031143000",
  "53100200": "5031134000",
  "53040300": "5031207000",
  "453209": "1800009007",
  "453210": "1800009013",
  "453605": "1800009016",
};

type ParsedRow = {
  row: number;
  kind: "EXPENSE" | "CAPEX";
  ciCode: string | null;
  name: string;
  /** คำขอปี (คอลัมน์จำนวนเงินคำขอหลักในชีท) */
  requestedAmount: number;
  /** คำขอปี 2569 ถึงสิ้นสุดแผน */
  planEndAmount: number | null;
  reason: string | null;
  isSummary: boolean;
};

function d(n: number | null | undefined): Prisma.Decimal {
  return new Prisma.Decimal(n ?? 0);
}

function num(v: unknown): number | null {
  if (v == null || v === "" || v === "-") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  return s && s !== "-" ? s : null;
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[0-9]+[.)]/g, "")
    .replace(/[()（）\-_/\\]/g, "")
    .replace(/ค่าใช้จ่าย|คชจ\.?|เงิน/g, "");
}

function isCi(s: string | null): boolean {
  return Boolean(s && /^\d{5,12}$/.test(s));
}

function resolveCi(ci: string | null): string | null {
  if (!ci) return null;
  return CI_ALIASES[ci] ?? ci;
}

function scoreMatch(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) {
    const ratio = Math.min(na.length, nb.length) / Math.max(na.length, nb.length);
    return Math.round(70 + 25 * ratio);
  }
  return 0;
}

function parseSheet(rows: unknown[][]): ParsedRow[] {
  const out: ParsedRow[] = [];
  let kind: "EXPENSE" | "CAPEX" = "EXPENSE";

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const c0 = str(r[0]);
    const c1 = str(r[1]);
    const c2 = str(r[2]);
    const joined = `${c0 ?? ""} ${c1 ?? ""} ${c2 ?? ""}`;

    if (i < 7) continue;
    if (/รวมงบประมาณ/.test(joined)) continue;
    if (/กลุ่มครุภัณฑ์|Activity type/.test(joined)) continue;

    if (c0 && /หมวด\s*7|สินทรัพย์ถาวร/.test(c0)) kind = "CAPEX";
    else if (c0 && /หมวด\s*\d/.test(c0)) kind = "EXPENSE";

    // แถวรายหน่วยงาน — ข้าม
    if (str(r[4]) && str(r[5]) && !isCi(c0) && !isCi(c1)) continue;

    let ciCode: string | null = null;
    let name: string | null = null;
    let isSummary = false;

    if (isCi(c1) && c2) {
      ciCode = c1!;
      name = c2;
    } else if (isCi(c0) && (c2 || c1)) {
      ciCode = c0!;
      name = c2 || c1!;
      isSummary = !isCi(c1);
    } else if (!isCi(c0) && !isCi(c1) && c2 && /งานติดตั้ง|ระบบ/.test(c2)) {
      name = c2;
    } else {
      continue;
    }

    if (!name) continue;

    // col7 = จำนวนเงินคำขอปี (ชีทระบุ 2568) → ใช้เป็นคำขอปี 69 ในระบบ
    // col9 = คำขอปี 2569 ถึงสิ้นสุดแผน
    const requestedAmount = num(r[7]);
    const planEndAmount = num(r[9]);
    if (requestedAmount == null && planEndAmount == null) continue;

    out.push({
      row: i + 1,
      kind,
      ciCode,
      name,
      requestedAmount: requestedAmount ?? 0,
      planEndAmount,
      reason: [str(r[10]), str(r[15])].filter(Boolean).join("\n") || null,
      isSummary,
    });
  }
  return out;
}

async function main() {
  const xlsPath = process.argv[2] || DEFAULT_XLS;
  if (!fs.existsSync(xlsPath)) throw new Error(`ไม่พบไฟล์: ${xlsPath}`);

  const wb = XLSX.readFile(xlsPath);
  const sheetName = wb.SheetNames.find((n) => n === "rptApprove2_9") ?? wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: "",
  }) as unknown[][];
  const parsed = parseSheet(rows).filter((r) => !r.isSummary);

  console.log(`อ่าน ${xlsPath}`);
  console.log(`ชีต ${sheetName}: ${parsed.length} รายการคำขอ (ไม่รวมแถวสรุป)`);
  console.log("โหมด: ใส่เฉพาะ BudgetRequest ปี 2569 — ไม่แก้ยอดอนุมัติ");

  await prisma.budgetFiscalYear.upsert({
    where: { yearBe: 2569 },
    create: { yearBe: 2569, status: "ACTIVE", notes: "งบประจำปี 2569" },
    update: {},
  });

  // ลบเฉพาะคำขอปี 69 เดิม (ส่วนใหญ่เป็นแถวว่าง) แล้วใส่ใหม่ — ไม่แตะปี 70
  await prisma.budgetRequest.deleteMany({ where: { targetYearBe: 2569 } });

  const accounts = await prisma.budgetAccount.findMany({
    select: { id: true, name: true, ciCode: true, kind: true },
  });
  const byCi = new Map(accounts.filter((a) => a.ciCode).map((a) => [a.ciCode!, a]));

  let matched = 0;
  let created = 0;
  let upserted = 0;
  let skipped = 0;
  let sortOrder = accounts.length + 1;

  for (const row of parsed) {
    const resolvedCi = resolveCi(row.ciCode);
    let account = resolvedCi ? byCi.get(resolvedCi) : undefined;
    if (!account && row.ciCode) account = byCi.get(row.ciCode);

    if (!account) {
      let best: (typeof accounts)[0] | null = null;
      let bestScore = 0;
      let second = 0;
      for (const a of accounts) {
        if (a.kind !== row.kind) continue;
        const s = scoreMatch(row.name, a.name);
        if (s > bestScore) {
          second = bestScore;
          bestScore = s;
          best = a;
        } else if (s > second) second = s;
      }
      if (best && bestScore >= 92 && bestScore - second >= 8) account = best;
    }

    if (!account) {
      // สร้างบัญชีใหม่เฉพาะเมื่อมีรหัส — ไม่สร้างชื่อลอย ๆ ทับหมวดเดิม
      if (!resolvedCi && !row.ciCode) {
        skipped++;
        console.warn(`ข้าม (ไม่จับคู่ได้): row ${row.row} ${row.name}`);
        continue;
      }
      account = await prisma.budgetAccount.create({
        data: {
          name: row.name,
          ciCode: resolvedCi ?? row.ciCode,
          kind: row.kind,
          isSummary: false,
          sortOrder: sortOrder++,
        },
      });
      accounts.push(account);
      if (account.ciCode) byCi.set(account.ciCode, account);
      created++;
    } else {
      matched++;
    }

    await prisma.budgetRequest.upsert({
      where: { accountId_targetYearBe: { accountId: account.id, targetYearBe: 2569 } },
      create: {
        accountId: account.id,
        targetYearBe: 2569,
        requestedAmount: d(row.requestedAmount),
        planEndAmount: row.planEndAmount != null ? d(row.planEndAmount) : null,
        reason: row.reason,
      },
      update: {
        requestedAmount: d(row.requestedAmount),
        planEndAmount: row.planEndAmount != null ? d(row.planEndAmount) : null,
        reason: row.reason,
      },
    });
    upserted++;
  }

  const sum = await prisma.budgetRequest.aggregate({
    where: { targetYearBe: 2569 },
    _sum: { requestedAmount: true, planEndAmount: true },
    _count: true,
  });

  console.log("เสร็จ", {
    matched,
    created,
    upserted,
    skipped,
    request2569: sum._count,
    sumRequested: sum._sum.requestedAmount,
    sumPlanEnd: sum._sum.planEndAmount,
    request2570unchanged: await prisma.budgetRequest.count({ where: { targetYearBe: 2570 } }),
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
