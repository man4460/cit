import type { BudgetKind, BudgetYearLineRow } from "./budgetFormat";

export type BudgetMajor = {
  key: string;
  num: number;
  catId: string;
  name: string;
  kind: BudgetKind;
  children: BudgetYearLineRow[];
  allocated: number;
  spent: number;
  remaining: number;
  pctUsed: number | null;
};

export function sectionOf(lines: BudgetYearLineRow[], kind: BudgetKind) {
  return (
    lines.find((l) => l.kind === kind && l.isSummary && /หมวดค่าใช้จ่าย|สินทรัพย์ถาวร/.test(l.name)) ?? null
  );
}

/** รวมยอดตามแถวสรุปหมวด (ค่าใช้จ่าย + สินทรัพย์ถาวร) — ไม่บวกรายการย่อยซ้ำ */
export function sectionAllocatedTotal(lines: BudgetYearLineRow[]): number | null {
  let total = 0;
  let found = false;
  for (const kind of ["EXPENSE", "CAPEX"] as BudgetKind[]) {
    const sec = sectionOf(lines, kind);
    if (sec) {
      found = true;
      total += sec.allocatedAmount;
    }
  }
  return found ? total : null;
}

/** รวมคำขอตามแถวสรุปหมวด — ตรงยอดในไฟล์คำขอ */
export function sectionRequestedTotal(
  lines: BudgetYearLineRow[],
  requestedOf: (row: BudgetYearLineRow) => number,
): number | null {
  let total = 0;
  let found = false;
  for (const kind of ["EXPENSE", "CAPEX"] as BudgetKind[]) {
    const sec = sectionOf(lines, kind);
    if (sec) {
      found = true;
      total += requestedOf(sec);
    }
  }
  return found ? total : null;
}

/** รวมเฉพาะรายการที่มีรหัส CI (ไม่นับหัวกลุ่ม/ลูกซ้ำ) */
export function ciLeafAllocatedTotal(lines: BudgetYearLineRow[]): number {
  return lines
    .filter((l) => !l.isSummary && Boolean(l.ciCode))
    .reduce((s, l) => s + l.allocatedAmount, 0);
}

export function ciLeafRequestedTotal(
  lines: BudgetYearLineRow[],
  requestedOf: (row: BudgetYearLineRow) => number,
): number {
  return lines
    .filter((l) => !l.isSummary && Boolean(l.ciCode))
    .reduce((s, l) => s + requestedOf(l), 0);
}

/** เลขนำหน้าชื่อ เช่น 1. / 1.1 / 10. */
export function parseExpenseNo(name: string): { major: number; minor: number | null } | null {
  const sub = name.match(/^(\d+)\.(\d+)\s/);
  if (sub) return { major: Number(sub[1]), minor: Number(sub[2]) };
  const maj = name.match(/^(\d+)\.\s/);
  if (maj) return { major: Number(maj[1]), minor: null };
  return null;
}

type ExpenseLineBlock = {
  num: number;
  row: BudgetYearLineRow;
  children: BudgetYearLineRow[];
};

function synthesizeExpenseMajor(num: number, kids: BudgetYearLineRow[]): BudgetYearLineRow {
  const allocated = kids.reduce((s, k) => s + k.allocatedAmount, 0);
  const spent = kids.reduce((s, k) => s + k.spent, 0);
  const title = kids
    .map((k) => k.name.replace(/^\d+\.\d+\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" / ");
  return {
    id: `virtual-expense-${num}`,
    accountId: `virtual-expense-${num}`,
    parentId: null,
    categoryId: null,
    categoryName: null,
    yearBe: kids[0]?.yearBe ?? null,
    fundingType: kids[0]?.fundingType ?? "ANNUAL",
    ciCode: null,
    superiorCi: null,
    fileRef: null,
    name: `${num}. ${title || "รายการ"}`,
    definition: null,
    kind: "EXPENSE",
    sortOrder: kids[0]?.sortOrder ?? num,
    isSummary: true,
    allocatedAmount: allocated,
    carryInAmount: 0,
    commitmentAmount: 0,
    totalBudget: allocated,
    buyerName: null,
    requestingUnit: null,
    quantity: null,
    documentUrl: null,
    notes: null,
    snapshotSpent: null,
    snapshotAsOf: null,
    transactionTotal: 0,
    spent,
    remaining: allocated - spent,
    pctUsed: allocated > 0 ? spent / allocated : null,
  };
}

function buildExpenseLineBlocks(lines: BudgetYearLineRow[]): ExpenseLineBlock[] {
  const exp = lines
    .filter((l) => l.kind === "EXPENSE" && !/หมวดค่าใช้จ่าย/.test(l.name))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "th"));

  const majors: ExpenseLineBlock[] = [];
  let current: ExpenseLineBlock | null = null;

  const ensureMajor = (num: number, seedKid?: BudgetYearLineRow): ExpenseLineBlock => {
    const existing = majors.find((m) => m.num === num);
    if (existing) return existing;
    const block: ExpenseLineBlock = {
      num,
      row: seedKid ? synthesizeExpenseMajor(num, [seedKid]) : synthesizeExpenseMajor(num, []),
      children: [],
    };
    majors.push(block);
    return block;
  };

  for (const l of exp) {
    const p = parseExpenseNo(l.name);
    if (!p) continue;

    if (p.minor != null) {
      current = ensureMajor(p.major, l);
      current.children.push(l);
      if (current.row.id.startsWith("virtual-expense-")) {
        current.row = synthesizeExpenseMajor(p.major, current.children);
      }
      continue;
    }

    const isGroup = /กลุ่ม\s*\d|กลุ่ม\d/.test(l.name);
    const isTopHeader = !isGroup && (Boolean(l.ciCode) || l.isSummary);
    if (isTopHeader) {
      current = { num: p.major, row: l, children: [] };
      majors.push(current);
      continue;
    }

    if (current) current.children.push(l);
  }

  return majors.sort((a, b) => a.num - b.num);
}

const EXPENSE_CATS: { id: string; title: string; sort: number; lineNos: number[] }[] = [
  { id: "staff", title: "ค่าใช้จ่ายเกี่ยวกับพนักงาน", sort: 1, lineNos: [1, 2, 3, 4, 5] },
  { id: "os", title: "ค่าจ้างงานรักษาความปลอดภัย", sort: 2, lineNos: [6] },
  { id: "hire", title: "ค่าจ้าง / ค่าตอบแทน", sort: 3, lineNos: [7] },
  { id: "maint", title: "ค่าซ่อมบำรุงและวัสดุ", sort: 4, lineNos: [8, 9, 10] },
  { id: "ops", title: "ค่าใช้จ่ายดำเนินงานทั่วไป", sort: 5, lineNos: [11, 12, 13, 14, 17] },
  { id: "sw", title: "ค่าสิทธิ์การใช้โปรแกรม", sort: 6, lineNos: [15, 16] },
];

export function buildExpenseMajors(lines: BudgetYearLineRow[]): BudgetMajor[] {
  const blocks = buildExpenseLineBlocks(lines);
  const byNo = new Map(blocks.map((b) => [b.num, b]));

  const used = new Set<number>();
  const cats = EXPENSE_CATS.map((cat) => {
    const parts = cat.lineNos.map((n) => byNo.get(n)).filter((b): b is ExpenseLineBlock => Boolean(b));
    for (const p of parts) used.add(p.num);
    return { ...cat, parts };
  }).filter((c) => c.parts.length > 0);

  const leftover = blocks.filter((b) => !used.has(b.num));
  if (leftover.length) {
    cats.push({
      id: "other",
      title: "อื่นๆ",
      sort: 99,
      lineNos: leftover.map((b) => b.num),
      parts: leftover,
    });
  }

  cats.sort((a, b) => a.sort - b.sort);

  return cats.map((cat, idx) => {
    const num = idx + 1;
    const children: BudgetYearLineRow[] = [];
    let allocated = 0;
    let spent = 0;
    for (const b of cat.parts) {
      children.push(b.row);
      children.push(...b.children);
      allocated += b.row.allocatedAmount;
      spent += b.row.spent;
    }
    const remaining = allocated - spent;
    return {
      key: `expense-${cat.id}`,
      num,
      catId: cat.id,
      name: `${num}. ${cat.title}`,
      kind: "EXPENSE" as const,
      children,
      allocated,
      spent,
      remaining,
      pctUsed: allocated > 0 ? spent / allocated : null,
    };
  });
}

function majorHeadingsCapex(lines: BudgetYearLineRow[], includeZero: boolean): BudgetYearLineRow[] {
  const section = sectionOf(lines, "CAPEX");
  if (section) {
    const direct = lines
      .filter((l) => l.parentId === section.accountId && l.kind === "CAPEX")
      .filter((l) => !/^หมายเหตุ/.test(l.name))
      .filter((l) => includeZero || l.allocatedAmount > 0 || l.spent > 0)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "th"));
    if (direct.length > 0) return direct;
  }
  return lines
    .filter((l) => l.kind === "CAPEX" && !l.isSummary && Boolean(l.ciCode))
    .filter((l) => includeZero || l.allocatedAmount > 0 || l.spent > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "th"));
}

const CAPEX_CAT_TITLES: Record<string, { title: string; sort: number }> = {
  "9": { title: "ระบบรักษาความปลอดภัย", sort: 1 },
  "11": { title: "ครุภัณฑ์คอมพิวเตอร์", sort: 2 },
  "14": { title: "เครื่องเสียง / ขยายเสียง", sort: 3 },
  "16": { title: "อุปกรณ์ป้องกัน", sort: 4 },
  "25": { title: "ยานพาหนะและขนส่ง", sort: 5 },
  "28": { title: "งานติดตั้ง / ระบบ", sort: 6 },
  "7": { title: "ครุภัณฑ์สำนักงาน", sort: 7 },
  "8": { title: "ครุภัณฑ์สำนักงาน", sort: 8 },
  "12": { title: "ครุภัณฑ์อื่น", sort: 9 },
  other: { title: "อื่นๆ", sort: 99 },
};

export function capexCategoryId(row: BudgetYearLineRow): string {
  const name = row.name;
  if (/เครื่องอ่านบัตร\s*\(\s*บัตรประชาชน|ถ่ายรูปบัตร|B-Card/i.test(name)) return "11";

  const ci = row.ciCode?.trim() || "";
  if (/^28\d+/.test(ci)) return "28";
  if (/^18000\d{2}/.test(ci)) return String(Number(ci.slice(5, 7)));

  if (/งานติดตั้ง|ระบบห้องควบคุม|ระบบคัดกรอง|UVSS|ใต้ท้องรถยนต์/.test(name)) return "28";
  if (/คอมพิวเตอร์|จอคอมพิวเตอร์|NoteBook|Notebook|เครื่องอ่านบัตร|ถ่ายรูปบัตร|B-Card/i.test(name)) {
    return "11";
  }
  if (/โทรโข่ง|ลำโพง|ปลาดาว|เครื่องขยายเสียง/.test(name)) return "14";
  if (/เกราะ|หมวกกันกระสุน/.test(name)) return "16";
  if (/รถจักรยานยนต์|รถยนต์|รถขนส่ง/.test(name)) return "25";
  if (/กล้อง|CCTV|X-Ray|ไม้กั้น|Access|ตรวจ|วิทยุ|Thermal|Beam|RFID|บุกรุก|แจ้งเตือน|Auto\s*dialer|Panic|เหตุการณ์ไม่ปกติ/i.test(name)) {
    return "9";
  }
  if (/เก้าอี้|ตู้นิรภัย/.test(name)) return "7";
  return "other";
}

export function buildCapexMajors(
  lines: BudgetYearLineRow[],
  opts?: { includeZero?: boolean },
): BudgetMajor[] {
  const items = majorHeadingsCapex(lines, Boolean(opts?.includeZero));
  const map = new Map<string, BudgetYearLineRow[]>();
  for (const row of items) {
    const id = capexCategoryId(row);
    const list = map.get(id) ?? [];
    list.push(row);
    map.set(id, list);
  }

  const raw = [...map.entries()]
    .map(([catId, kids]) => {
      const meta = CAPEX_CAT_TITLES[catId] ?? CAPEX_CAT_TITLES.other;
      const sorted = [...kids].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "th"));
      const allocated = sorted.reduce((s, k) => s + k.allocatedAmount, 0);
      const spent = sorted.reduce((s, k) => s + k.spent, 0);
      return { catId, title: meta.title, sort: meta.sort, children: sorted, allocated, spent };
    })
    .sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title, "th"));

  return raw.map((g, idx) => {
    const num = idx + 1;
    const remaining = g.allocated - g.spent;
    return {
      key: `capex-${g.catId}`,
      num,
      catId: g.catId,
      name: `${num}. ${g.title}`,
      kind: "CAPEX" as const,
      children: g.children,
      allocated: g.allocated,
      spent: g.spent,
      remaining,
      pctUsed: g.allocated > 0 ? g.spent / g.allocated : null,
    };
  });
}

export function isRealBudgetLine(row: BudgetYearLineRow): boolean {
  return !row.id.startsWith("virtual-");
}

export type BudgetCategoryRow = {
  id: string;
  name: string;
  kind: BudgetKind;
  sortOrder: number;
  accountCount?: number;
};

/** จัดกลุ่มตามหมวดที่จัดการได้ — แสดงหมวดว่างด้วย เพื่อให้เพิ่มรายการได้ */
export function buildManagedMajors(
  lines: BudgetYearLineRow[],
  categories: BudgetCategoryRow[],
  kind: BudgetKind,
): BudgetMajor[] {
  const cats = categories
    .filter((c) => c.kind === kind)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "th"));

  const kindLines = lines.filter((l) => l.kind === kind && !l.isSummary);
  if (!cats.length) {
    return kind === "EXPENSE" ? buildExpenseMajors(lines) : buildCapexMajors(lines, { includeZero: true });
  }

  const majors: BudgetMajor[] = cats.map((cat, idx) => {
    const children = kindLines
      .filter((l) => l.categoryId === cat.id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "th"));
    /** รวมรายการหลัก: ถ้ายอดหลักเป็น 0 แต่มีย่อย ให้ใช้ผลรวมย่อย · ถ้ายอดหลักมีค่าใช้ยอดหลัก (ไม่บวกซ้ำ) */
    const tops = topLevelChildren(children);
    const allocated = tops.reduce((s, c) => s + rollupAllocated(c, childItemsOf(children, c.accountId)), 0);
    const spent = tops.reduce((s, c) => s + rollupSpent(c, childItemsOf(children, c.accountId)), 0);
    const remaining = allocated - spent;
    const num = idx + 1;
    return {
      key: `cat-${cat.id}`,
      num,
      catId: cat.id,
      name: `${num}. ${cat.name}`,
      kind,
      children,
      allocated,
      spent,
      remaining,
      pctUsed: allocated > 0 ? spent / allocated : null,
    };
  });

  const orphans = kindLines.filter((l) => !l.categoryId);
  if (orphans.length) {
    const tops = topLevelChildren(orphans);
    const allocated = tops.reduce((s, c) => s + rollupAllocated(c, childItemsOf(orphans, c.accountId)), 0);
    const spent = tops.reduce((s, c) => s + rollupSpent(c, childItemsOf(orphans, c.accountId)), 0);
    const num = majors.length + 1;
    majors.push({
      key: `cat-orphan-${kind}`,
      num,
      catId: "orphan",
      name: `${num}. อื่นๆ (ยังไม่จัดหมวด)`,
      kind,
      children: orphans,
      allocated,
      spent,
      remaining: allocated - spent,
      pctUsed: allocated > 0 ? spent / allocated : null,
    });
  }

  return majors;
}

export function topLevelChildren(children: BudgetYearLineRow[]): BudgetYearLineRow[] {
  const ids = new Set(children.map((c) => c.accountId));
  return children.filter((c) => !c.parentId || !ids.has(c.parentId));
}

export function childItemsOf(children: BudgetYearLineRow[], parentAccountId: string): BudgetYearLineRow[] {
  return children.filter((c) => c.parentId === parentAccountId);
}

/** ยอดแสดงบนหัวข้อหลัก: มียอดเองใช้ยอดเอง · ไม่มีให้รวมจากย่อย */
export function rollupAllocated(row: BudgetYearLineRow, kids: BudgetYearLineRow[]): number {
  if (!kids.length) return row.allocatedAmount;
  if (row.allocatedAmount > 0) return row.allocatedAmount;
  return kids.reduce((s, k) => s + k.allocatedAmount, 0);
}

export function rollupSpent(row: BudgetYearLineRow, kids: BudgetYearLineRow[]): number {
  if (!kids.length) return row.spent;
  return row.spent + kids.reduce((s, k) => s + k.spent, 0);
}

export function rollupRequested(
  row: BudgetYearLineRow,
  kids: BudgetYearLineRow[],
  requestedOf: (r: BudgetYearLineRow) => number,
): number {
  const self = requestedOf(row);
  if (!kids.length) return self;
  if (self > 0) return self;
  return kids.reduce((s, k) => s + requestedOf(k), 0);
}

export function expenseRowTone(name: string, kind: BudgetKind): "heading" | "sub" | "detail" {
  if (kind !== "EXPENSE") return "heading";
  const parsed = parseExpenseNo(name);
  const isSubNo = parsed?.minor != null;
  if (isSubNo) return "sub";
  const isGroupOrNested =
    /กลุ่ม\s*\d|กลุ่ม\d/.test(name) || (!parsed ? false : !name.includes("หมวด"));
  // simplified: group/nested without CI-style major
  if (/กลุ่ม\s*\d|กลุ่ม\d/.test(name)) return "detail";
  if (parsed && parsed.minor == null && !/กลุ่ม/.test(name)) return "heading";
  if (isGroupOrNested) return "detail";
  return "heading";
}
