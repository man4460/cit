/**
 * อัปเดตวันเกิด + ผู้รับผลประโยชน์ จากไฟล์ส่งบริษัทประกัน (แบบฟอร์มวิริยะ)
 *
 *   npx tsx scripts/import-insurance-personnel-xlsx.ts <file.xlsx>          # dry-run
 *   npx tsx scripts/import-insurance-personnel-xlsx.ts <file.xlsx> --apply
 *   --no-bens  อัปเดตเฉพาะวันเกิด
 * อ่านทุกชีตที่มีหัวตาราง (ไฟล์รวมหลายทริป) — คนซ้ำใช้ข้อมูลชีตหลังสุด
 */
import "dotenv/config";
import XLSX from "xlsx";
import { prisma } from "../src/lib/prisma.js";

const file = process.argv[2];
const apply = process.argv.includes("--apply");
const skipBens = process.argv.includes("--no-bens");
if (!file) {
  console.error("usage: import-insurance-personnel-xlsx.ts <file.xlsx> [--apply]");
  process.exit(1);
}

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

/** ปีในไฟล์เป็น พ.ศ. — ทั้งเซลล์วันที่ (serial ที่พิมพ์ปี พ.ศ.) และข้อความ d/m/yyyy */
function parseBirth(cell: XLSX.CellObject | undefined): Date | null {
  if (!cell || cell.v == null || cell.v === "") return null;
  let y: number, m: number, d: number;
  if (cell.t === "n") {
    const p = XLSX.SSF.parse_date_code(cell.v as number);
    if (!p) return null;
    ({ y, m, d } = p);
  } else {
    const parts = String(cell.v).trim().split(/[/.-]/).map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
    [d, m, y] = parts as [number, number, number];
    if (y < 100) y += 2500;
  }
  if (y > 2400) y -= 543;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

type Row = {
  line: string;
  rank: string;
  name: string;
  idDigits: string;
  birth: Date | null;
  bens: string[];
};

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");
const benKey = (names: string[]) =>
  names.map((n) => n.replace(/^(นางสาว|นส\.)/, "น.ส.").replace(/[\s\u0E3A]+/g, "")).join("|");

/** อ่านทุกชีตที่มีหัวตาราง — คนเดียวกันหลายชีต ใช้ข้อมูลจากชีตหลังสุด (ทริปล่าสุด) */
function readRows(path: string): Row[] {
  const wb = XLSX.readFile(path);
  const byId = new Map<string, Row>();
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]!;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
    const headerIdx = grid.findIndex((r) => clean(r[0]) === "ที่" && clean(r[6]).includes("บัตรประชาชน"));
    if (headerIdx < 0) continue;
    for (let i = headerIdx + 1; i < grid.length; i++) {
      const r = grid[i]!;
      const idDigits = digits(r[6]);
      if (!clean(r[2]) || !idDigits) continue;
      const ben = (a: number) => {
        const [title, first, last] = [r[a], r[a + 1], r[a + 2]].map(clean);
        return first && last ? `${title}${first} ${last}` : "";
      };
      const row: Row = {
        line: `${sheetName}!${i + 1}`,
        rank: clean(r[1]),
        name: `${clean(r[2])} ${clean(r[3])}`.trim(),
        idDigits,
        birth: parseBirth(ws[XLSX.utils.encode_cell({ r: i, c: 4 })]),
        bens: [ben(8), ben(11)].filter(Boolean),
      };
      const prev = byId.get(idDigits);
      if (prev) {
        if (prev.birth && row.birth && ymd(prev.birth) !== ymd(row.birth))
          console.log(`ขัดกัน วันเกิด ${row.name}: ${prev.line}=${ymd(prev.birth)} / ${row.line}=${ymd(row.birth)}`);
        if (prev.bens.length && row.bens.length && benKey(prev.bens) !== benKey(row.bens))
          console.log(`ขัดกัน ผู้รับผลประโยชน์ ${row.name}: ${prev.line}=[${prev.bens.join(" | ")}] / ${row.line}=[${row.bens.join(" | ")}]`);
        row.birth ??= prev.birth;
        if (!row.bens.length) row.bens = prev.bens;
      }
      byId.set(idDigits, row);
    }
  }
  if (!byId.size) throw new Error("ไม่พบหัวตาราง (ที่ / หมายเลขบัตรประชาชน)");
  return [...byId.values()];
}

async function main() {
  const rows = readRows(file!);
  const all = await prisma.personnel.findMany({
    select: { id: true, idNumber: true, rank: true, fullName: true, birthDate: true, beneficiaries: { orderBy: { sortOrder: "asc" } } },
  });
  const byId = new Map(all.map((p) => [digits(p.idNumber), p]));

  let matched = 0;
  let birthUpdates = 0;
  let benUpdates = 0;
  const missing: Row[] = [];

  for (const row of rows) {
    const p = byId.get(row.idDigits);
    if (!p) {
      missing.push(row);
      continue;
    }
    matched += 1;
    const curBirth = ymd(p.birthDate);
    const newBirth = ymd(row.birth);
    const birthChange = row.birth && curBirth !== newBirth;
    const curBens = p.beneficiaries.map((b) => clean(b.fullName));
    const benChange = !skipBens && row.bens.length > 0 && benKey(curBens) !== benKey(row.bens);

    console.log(
      `${row.line}\t${row.idDigits}\t${p.rank ?? ""} ${p.fullName}` +
        (birthChange ? `\n\tวันเกิด ${curBirth} → ${newBirth}` : "") +
        (benChange ? `\n\tผู้รับผลประโยชน์ [${curBens.join(" | ") || "—"}] → [${row.bens.join(" | ")}]` : ""),
    );

    if (!apply) {
      if (birthChange) birthUpdates += 1;
      if (benChange) benUpdates += 1;
      continue;
    }
    await prisma.$transaction(async (tx) => {
      if (birthChange) {
        await tx.personnel.update({ where: { id: p.id }, data: { birthDate: row.birth } });
        birthUpdates += 1;
      }
      if (benChange) {
        await tx.personnelBeneficiary.deleteMany({ where: { personnelId: p.id } });
        await tx.personnelBeneficiary.createMany({
          data: row.bens.map((fullName, sortOrder) => ({ personnelId: p.id, fullName, sortOrder })),
        });
        benUpdates += 1;
      }
    });
  }

  console.log(`\nแถวในไฟล์ ${rows.length} | พบในระบบ ${matched} | ไม่พบ ${missing.length}`);
  console.log(`${apply ? "อัปเดตแล้ว" : "จะอัปเดต"}: วันเกิด ${birthUpdates} คน, ผู้รับผลประโยชน์ ${benUpdates} คน`);
  for (const m of missing) console.log(`  ไม่พบ: แถว ${m.line} ${m.rank} ${m.name} (${m.idDigits})`);
  if (!apply) console.log("\n(dry-run — ใส่ --apply เพื่อบันทึก)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
