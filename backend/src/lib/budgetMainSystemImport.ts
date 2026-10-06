import XLSX from "xlsx-js-style";

export type ImportRowType = "TOTAL" | "SECTION" | "GROUP" | "ITEM";
export type ImportRowKind = "EXPENSE" | "CAPEX" | "OTHER";

export type ParsedImportRow = {
  sortOrder: number;
  rowType: ImportRowType;
  kind: ImportRowKind | null;
  code: string | null;
  name: string;
  ciCode: string | null;
  parentCi: string | null;
  approved: number;
  carryIn: number;
  midYear: number;
  netBudget: number;
  spent: number;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  pr: number;
  po: number;
  reserved: number;
  carryOut: number;
  earmark: number;
  remaining: number;
  pctSpent: number | null;
  commitmentTotal: number;
  commitmentYears: { yearAd: number; amount: number }[];
};

export type ParsedImport = {
  yearAd: number | null;
  yearBe: number | null;
  asOfDate: Date | null;
  unitLabel: string | null;
  rows: ParsedImportRow[];
};

const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

type NumField =
  | "approved"
  | "carryIn"
  | "midYear"
  | "netBudget"
  | "spent"
  | "q1"
  | "q2"
  | "q3"
  | "q4"
  | "pr"
  | "po"
  | "reserved"
  | "carryOut"
  | "earmark"
  | "remaining"
  | "commitmentTotal";

/** ลำดับสำคัญ — ข้อความที่เจาะจงกว่าต้องมาก่อน เช่น "งบเหลื่อมปี" ชนกับ "งบที่ยกไปเหลื่อมปี" */
const HEADER_MATCHERS: { field: NumField | "pct"; test: (h: string) => boolean }[] = [
  { field: "approved", test: (h) => h.includes("งบที่ได้รับอนุมัติ") },
  { field: "carryOut", test: (h) => h.includes("ยกไปเหลื่อมปี") },
  { field: "carryIn", test: (h) => h.includes("งบเหลื่อมปี") },
  { field: "midYear", test: (h) => h.includes("งบจัดสรรระหว่างปี") },
  { field: "netBudget", test: (h) => h.includes("งบสุทธิ") },
  { field: "spent", test: (h) => h.includes("เบิกจ่าย(รวม)") },
  { field: "q1", test: (h) => /เบิกจ่ายq1/i.test(h) },
  { field: "q2", test: (h) => /เบิกจ่ายq2/i.test(h) },
  { field: "q3", test: (h) => /เบิกจ่ายq3/i.test(h) },
  { field: "q4", test: (h) => /เบิกจ่ายq4/i.test(h) },
  { field: "pr", test: (h) => /(^|[^a-z])pr\(/i.test(h) },
  { field: "po", test: (h) => /(^|[^a-z])po\(/i.test(h) },
  { field: "reserved", test: (h) => h.includes("กันเงิน") },
  { field: "earmark", test: (h) => /earmark/i.test(h) },
  { field: "remaining", test: (h) => h.includes("งบคงเหลือ") },
  { field: "pct", test: (h) => h.includes("%เบิกจ่าย") },
  { field: "commitmentTotal", test: (h) => h.includes("งบผูกพัน(รวม)") },
];

function compact(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, "");
}

function toNum(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function parseAsOf(text: string): Date | null {
  const m = text.match(/(\d{1,2})\s*(?:เดือน)?\s*([ก-๙]+)\s*(?:ค\.ศ\.|พ\.ศ\.)?\s*(\d{4})/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = THAI_MONTHS.findIndex((name) => m[2].includes(name));
  let year = Number(m[3]);
  if (month < 0 || !day || !year) return null;
  if (year > 2400) year -= 543;
  return new Date(Date.UTC(year, month, day, 5, 0, 0));
}

/** ชื่อไฟล์ระบบหลักลงท้าย _25691006 (พ.ศ.yyyymmdd) */
export function parseAsOfFromFileName(fileName: string): Date | null {
  const m = fileName.match(/(25\d{2})(\d{2})(\d{2})(?!\d)/);
  if (!m) return null;
  const year = Number(m[1]) - 543;
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month, day, 5, 0, 0));
}

function splitCodeName(raw: string): { code: string | null; name: string } {
  const cleaned = raw.replace(/\t/g, " ").replace(/\s+/g, " ").trim();
  const m = cleaned.match(/^(\d+(?:\.\d+)*)\.?\s+(.*)$/);
  if (!m) return { code: null, name: cleaned };
  return { code: m[1], name: m[2].trim() };
}

export function parseMainSystemBudgetWorkbook(buffer: Buffer): ParsedImport {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("ไฟล์ไม่มีชีต");
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
  });

  let unitLabel: string | null = null;
  let asOfDate: Date | null = null;
  let yearAd: number | null = null;

  const headerIdx = grid.findIndex((r) => r.some((c) => compact(c).toLowerCase().includes("superiorci")));
  if (headerIdx < 0) throw new Error("ไม่พบหัวตาราง (Superior CI) — ไฟล์นี้ไม่ใช่รายงานการใช้งบประมาณจากระบบหลัก");

  for (const r of grid.slice(0, headerIdx)) {
    const label = compact(r[0]);
    const value = String(r[1] ?? "").trim();
    if (label.includes("ฝ่ายงาน")) {
      unitLabel = value || null;
      const y = value.match(/ปี\s*(\d{4})/);
      if (y) yearAd = Number(y[1]);
    } else if (label.includes("ข้อมูลณ")) {
      asOfDate = parseAsOf(value);
    }
    if (yearAd == null) {
      for (const c of r) {
        const y = String(c ?? "").match(/งบปี\s*(\d{4})/);
        if (y) {
          yearAd = Number(y[1]);
          break;
        }
      }
    }
  }
  if (yearAd != null && yearAd > 2400) yearAd -= 543;

  const width = Math.max(...grid.slice(Math.max(0, headerIdx - 2), headerIdx + 1).map((r) => r.length));
  const colOf = new Map<NumField | "pct", number>();
  const commitmentYearCols: { col: number; yearAd: number }[] = [];
  for (let c = 0; c < width; c++) {
    const h = compact(`${grid[headerIdx - 1]?.[c] ?? ""}${grid[headerIdx]?.[c] ?? ""}`);
    if (!h) continue;
    const yearCommit = h.match(/^งบผูกพันปี(\d{4})/);
    if (yearCommit) {
      commitmentYearCols.push({ col: c, yearAd: Number(yearCommit[1]) });
      continue;
    }
    const hit = HEADER_MATCHERS.find((m) => !colOf.has(m.field) && m.test(h));
    if (hit) colOf.set(hit.field, c);
  }
  if (!colOf.has("approved") || !colOf.has("spent")) {
    throw new Error("ไม่พบคอลัมน์ งบที่ได้รับอนุมัติ / เบิกจ่าย (รวม) ในไฟล์");
  }

  const rows: ParsedImportRow[] = [];
  let kind: ImportRowKind | null = null;
  let parentCi: string | null = null;

  for (const r of grid.slice(headerIdx + 1)) {
    const rawName = String(r[0] ?? "").trim();
    if (!rawName || rawName.startsWith("หมายเหตุ")) continue;
    const ciCode = String(r[1] ?? "").trim() || null;
    const hasNumbers = r.slice(2).some((v) => typeof v === "number");
    if (!hasNumbers) continue;

    const { code, name } = splitCodeName(rawName);
    let rowType: ImportRowType;
    if (ciCode && ciCode.length >= 8) {
      rowType = "ITEM";
    } else if (ciCode) {
      rowType = "GROUP";
      parentCi = ciCode;
      /** กลุ่มนอกหมวด เช่น 30501 ค่าใช้จ่ายเรียกเก็บของกิจการฯ ไม่ใช่ทั้งค่าใช้จ่ายและสินทรัพย์ */
      const inSection = /^30[0-4]/.test(ciCode) || /^[12]8/.test(ciCode);
      if (!inSection || (kind !== "EXPENSE" && kind !== "CAPEX")) kind = "OTHER";
    } else if (name.startsWith("หมวด")) {
      rowType = "SECTION";
      kind = name.includes("สินทรัพย") ? "CAPEX" : "EXPENSE";
      parentCi = null;
    } else {
      rowType = "TOTAL";
      kind = null;
      parentCi = null;
    }

    const get = (f: NumField) => {
      const c = colOf.get(f);
      return c == null ? 0 : toNum(r[c]);
    };
    const pctCol = colOf.get("pct");
    const pctRaw = pctCol == null ? null : r[pctCol];
    const commitmentYears = commitmentYearCols
      .map(({ col, yearAd: y }) => ({ yearAd: y, amount: toNum(r[col]) }))
      .filter((x) => x.amount !== 0);

    rows.push({
      sortOrder: rows.length,
      rowType,
      kind: rowType === "TOTAL" ? null : kind,
      code,
      name,
      ciCode,
      parentCi: rowType === "ITEM" ? parentCi : null,
      approved: get("approved"),
      carryIn: get("carryIn"),
      midYear: get("midYear"),
      netBudget: get("netBudget"),
      spent: get("spent"),
      q1: get("q1"),
      q2: get("q2"),
      q3: get("q3"),
      q4: get("q4"),
      pr: get("pr"),
      po: get("po"),
      reserved: get("reserved"),
      carryOut: get("carryOut"),
      earmark: get("earmark"),
      remaining: get("remaining"),
      pctSpent: typeof pctRaw === "number" && Number.isFinite(pctRaw) ? pctRaw / 100 : null,
      commitmentTotal: get("commitmentTotal"),
      commitmentYears,
    });
  }

  if (!rows.length) throw new Error("ไม่พบรายการงบประมาณในไฟล์");

  return {
    yearAd,
    yearBe: yearAd != null ? yearAd + 543 : null,
    asOfDate,
    unitLabel,
    rows,
  };
}

/** เทียบชื่อแบบหลวม — ตัดเลขข้อ ช่องว่าง วรรณยุกต์/การันต์ และวงเล็บท้าย */
export function looseBudgetName(raw: string): string {
  return splitCodeName(raw)
    .name.replace(/[\u0E47-\u0E4E]/g, "")
    .replace(/[\s\-–—_.,/()]+/g, "")
    .toLowerCase();
}
