/**
 * นำเข้าคำขอ + ผลอนุมัติปี 2568 จากไฟล์ผลพิจารณา
 * — ไม่แตะยอดปี 2569 / คำขอปี 2570
 *
 *   npx tsx scripts/seed-budget-2568-from-approve-xls.ts [path.xls]
 */
import "dotenv/config";
import fs from "fs";
import { Prisma } from "@prisma/client";
import XLSX from "xlsx";
import { prisma } from "../src/lib/prisma.js";

const DEFAULT_XLS =
  "/Users/mawell-03/Downloads/Copy_of_ต้นฉบับ_ผลอนุมัติงบประจำปี_2568.xls";

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
  request68: number;
  request69Plan: number | null;
  approved68: number;
  approved69Plan: number | null;
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

    const request68 = num(r[7]);
    const request69Plan = num(r[9]);
    const approved68 = num(r[12]);
    const approved69Plan = num(r[14]);
    if (request68 == null && approved68 == null && request69Plan == null && approved69Plan == null) {
      continue;
    }

    out.push({
      row: i + 1,
      kind,
      ciCode,
      name,
      request68: request68 ?? 0,
      request69Plan,
      approved68: approved68 ?? 0,
      approved69Plan,
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
  console.log(`ชีต ${sheetName}: ${parsed.length} รายการ (คำขอ+อนุมัติ ปี 2568)`);

  // ลบคำขอปี 69 ที่ใส่ผิดก่อนหน้า
  const del69 = await prisma.budgetRequest.deleteMany({ where: { targetYearBe: 2569 } });
  console.log(`ลบคำขอปี 2569 ที่ใส่ผิด: ${del69.count} รายการ`);

  const fy68 = await prisma.budgetFiscalYear.upsert({
    where: { yearBe: 2568 },
    create: { yearBe: 2568, status: "CLOSED", notes: "งบประจำปี 2568 (จากไฟล์ผลพิจารณา)" },
    update: { notes: "งบประจำปี 2568 (จากไฟล์ผลพิจารณา)" },
  });

  // ล้างเฉพาะข้อมูลปี 2568 ก่อนใส่ใหม่
  await prisma.budgetSpendSnapshot.deleteMany({
    where: { yearLine: { fiscalYearId: fy68.id } },
  });
  await prisma.budgetTransaction.deleteMany({
    where: { yearLine: { fiscalYearId: fy68.id } },
  });
  await prisma.budgetYearLine.deleteMany({ where: { fiscalYearId: fy68.id } });
  await prisma.budgetRequest.deleteMany({ where: { targetYearBe: 2568 } });

  const accounts = await prisma.budgetAccount.findMany({
    select: { id: true, name: true, ciCode: true, kind: true, isSummary: true },
  });
  const byCi = new Map(accounts.filter((a) => a.ciCode).map((a) => [a.ciCode!, a]));

  let matched = 0;
  let created = 0;
  let upserted = 0;
  let skipped = 0;
  let sortOrder = accounts.length + 1;

  const sumByKind = {
    EXPENSE: { req: 0, appr: 0, planReq: 0, planAppr: 0 },
    CAPEX: { req: 0, appr: 0, planReq: 0, planAppr: 0 },
  };

  for (const row of parsed) {
    const resolvedCi = resolveCi(row.ciCode);
    let account = resolvedCi ? byCi.get(resolvedCi) : undefined;
    if (!account && row.ciCode) account = byCi.get(row.ciCode);

    if (!account) {
      let best: (typeof accounts)[0] | null = null;
      let bestScore = 0;
      let second = 0;
      for (const a of accounts) {
        if (a.kind !== row.kind || a.isSummary) continue;
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
      if (!resolvedCi && !row.ciCode) {
        skipped++;
        console.warn(`ข้าม: row ${row.row} ${row.name}`);
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
      where: { accountId_targetYearBe: { accountId: account.id, targetYearBe: 2568 } },
      create: {
        accountId: account.id,
        targetYearBe: 2568,
        requestedAmount: d(row.request68),
        planEndAmount: row.request69Plan != null ? d(row.request69Plan) : null,
        reason: row.reason,
      },
      update: {
        requestedAmount: d(row.request68),
        planEndAmount: row.request69Plan != null ? d(row.request69Plan) : null,
        reason: row.reason,
      },
    });

    await prisma.budgetYearLine.upsert({
      where: {
        fiscalYearId_accountId_fundingType: {
          fiscalYearId: fy68.id,
          accountId: account.id,
          fundingType: "ANNUAL",
        },
      },
      create: {
        fiscalYearId: fy68.id,
        accountId: account.id,
        fundingType: "ANNUAL",
        allocatedAmount: d(row.approved68),
        notes: row.reason,
      },
      update: {
        allocatedAmount: d(row.approved68),
        notes: row.reason ?? undefined,
      },
    });

    if ((row.approved69Plan != null && row.approved69Plan !== 0) || (row.request69Plan != null && row.request69Plan !== 0)) {
      await prisma.budgetYearLine.upsert({
        where: {
          fiscalYearId_accountId_fundingType: {
            fiscalYearId: fy68.id,
            accountId: account.id,
            fundingType: "COMMITMENT",
          },
        },
        create: {
          fiscalYearId: fy68.id,
          accountId: account.id,
          fundingType: "COMMITMENT",
          allocatedAmount: d(row.approved69Plan ?? 0),
          notes: "งบผูกพันถึงสิ้นสุดแผน (ผลพิจารณาปี 2568)",
        },
        update: {
          allocatedAmount: d(row.approved69Plan ?? 0),
        },
      });
    }

    if (/ได้รับคืน|เรียกเก็บและรับคืน/.test(row.name)) {
      // เก็บรายการไว้ในฐาน แต่ไม่บวกเข้ายอดสรุปหมวด (กันยอดติดลบ)
      upserted++;
      continue;
    }

    sumByKind[row.kind].req += row.request68;
    sumByKind[row.kind].appr += row.approved68;
    sumByKind[row.kind].planReq += row.request69Plan ?? 0;
    sumByKind[row.kind].planAppr += row.approved69Plan ?? 0;
    upserted++;
  }

  // ใส่ยอดคำขอ/อนุมัติบนแถวสรุปหมวด — ให้การ์ดสรุปโชว์ได้
  const sectionDefs = [
    { kind: "EXPENSE" as const, re: /หมวดค่าใช้จ่าย/ },
    { kind: "CAPEX" as const, re: /สินทรัพย์ถาวร/ },
  ];
  for (const def of sectionDefs) {
    const sec = accounts.find((a) => a.isSummary && a.kind === def.kind && def.re.test(a.name));
    if (!sec) continue;
    const s = sumByKind[def.kind];
    await prisma.budgetRequest.upsert({
      where: { accountId_targetYearBe: { accountId: sec.id, targetYearBe: 2568 } },
      create: {
        accountId: sec.id,
        targetYearBe: 2568,
        requestedAmount: d(s.req),
        planEndAmount: s.planReq ? d(s.planReq) : null,
        reason: "ยอดรวมจากไฟล์ผลพิจารณาปี 2568",
      },
      update: {
        requestedAmount: d(s.req),
        planEndAmount: s.planReq ? d(s.planReq) : null,
      },
    });
    await prisma.budgetYearLine.upsert({
      where: {
        fiscalYearId_accountId_fundingType: {
          fiscalYearId: fy68.id,
          accountId: sec.id,
          fundingType: "ANNUAL",
        },
      },
      create: {
        fiscalYearId: fy68.id,
        accountId: sec.id,
        fundingType: "ANNUAL",
        allocatedAmount: d(s.appr),
        notes: "ยอดรวมจากไฟล์ผลพิจารณาปี 2568",
      },
      update: { allocatedAmount: d(s.appr) },
    });
  }

  console.log("เสร็จ", {
    matched,
    created,
    upserted,
    skipped,
    request2568: await prisma.budgetRequest.count({ where: { targetYearBe: 2568 } }),
    annual68: await prisma.budgetYearLine.count({
      where: { fiscalYearId: fy68.id, fundingType: "ANNUAL" },
    }),
    sumReq: sumByKind.EXPENSE.req + sumByKind.CAPEX.req,
    sumApproved: sumByKind.EXPENSE.appr + sumByKind.CAPEX.appr,
    request2569left: await prisma.budgetRequest.count({ where: { targetYearBe: 2569 } }),
    request2570: await prisma.budgetRequest.count({ where: { targetYearBe: 2570 } }),
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
