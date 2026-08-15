/**
 * จัด categoryId ให้รายการงบที่ยังไม่จัดหมวด — ตามกฎเดิมของหน้าสรุป
 * (ค่าใช้จ่าย: เลขบรรทัด 1–17 · สินทรัพย์: CI / ชื่อ)
 *
 *   npx tsx scripts/remap-budget-account-categories.ts
 */
import "dotenv/config";
import { PrismaClient, type BudgetAccountKind } from "@prisma/client";

const prisma = new PrismaClient();

const EXPENSE_LINE_TO_TITLE: { lineNos: number[]; title: string }[] = [
  { lineNos: [1, 2, 3, 4, 5], title: "ค่าใช้จ่ายเกี่ยวกับพนักงาน" },
  { lineNos: [6], title: "ค่าจ้างงานรักษาความปลอดภัย" },
  { lineNos: [7], title: "ค่าจ้าง / ค่าตอบแทน" },
  { lineNos: [8, 9, 10], title: "ค่าซ่อมบำรุงและวัสดุ" },
  { lineNos: [11, 12, 13, 14, 17], title: "ค่าใช้จ่ายดำเนินงานทั่วไป" },
  { lineNos: [15, 16], title: "ค่าสิทธิ์การใช้โปรแกรม" },
];

const CAPEX_KEY_TO_TITLE: Record<string, string> = {
  "9": "ระบบรักษาความปลอดภัย",
  "11": "ครุภัณฑ์คอมพิวเตอร์",
  "14": "เครื่องเสียง / ขยายเสียง",
  "16": "อุปกรณ์ป้องกัน",
  "25": "ยานพาหนะและขนส่ง",
  "28": "งานติดตั้ง / ระบบ",
  "7": "ครุภัณฑ์สำนักงาน",
  "8": "ครุภัณฑ์สำนักงาน",
  "12": "ครุภัณฑ์อื่น",
  other: "ครุภัณฑ์อื่น",
};

function parseExpenseNo(name: string): { major: number; minor: number | null } | null {
  const sub = name.match(/^(\d+)\.(\d+)\s/);
  if (sub) return { major: Number(sub[1]), minor: Number(sub[2]) };
  const maj = name.match(/^(\d+)\.\s/);
  if (maj) return { major: Number(maj[1]), minor: null };
  return null;
}

function expenseTitleForLine(lineNo: number): string {
  for (const row of EXPENSE_LINE_TO_TITLE) {
    if (row.lineNos.includes(lineNo)) return row.title;
  }
  return "ค่าใช้จ่ายดำเนินงานทั่วไป";
}

function capexKey(name: string, ciCode: string | null): string {
  if (/เครื่องอ่านบัตร\s*\(\s*บัตรประชาชน|ถ่ายรูปบัตร|B-Card/i.test(name)) return "11";

  const ci = (ciCode ?? "").trim();
  if (/^28\d+/.test(ci)) return "28";
  if (/^18000\d{2}/.test(ci)) return String(Number(ci.slice(5, 7)));

  if (/งานติดตั้ง|ระบบห้องควบคุม|ระบบคัดกรอง|UVSS|ใต้ท้องรถยนต์/.test(name)) return "28";
  if (/คอมพิวเตอร์|จอคอมพิวเตอร์|NoteBook|Notebook|เครื่องอ่านบัตร|ถ่ายรูปบัตร|B-Card/i.test(name)) {
    return "11";
  }
  if (/โทรโข่ง|ลำโพง|ปลาดาว|เครื่องขยายเสียง/.test(name)) return "14";
  if (/เกราะ|หมวกกันกระสุน/.test(name)) return "16";
  if (/รถจักรยานยนต์|รถยนต์|รถขนส่ง/.test(name)) return "25";
  if (
    /กล้อง|CCTV|X-Ray|ไม้กั้น|Access|ตรวจ|วิทยุ|Thermal|Beam|RFID|บุกรุก|แจ้งเตือน|Auto\s*dialer|Panic|เหตุการณ์ไม่ปกติ/i.test(
      name,
    )
  ) {
    return "9";
  }
  if (/เก้าอี้|ตู้นิรภัย/.test(name)) return "7";
  return "other";
}

async function ensureCategory(
  kind: BudgetAccountKind,
  name: string,
  sortOrder: number,
  cache: Map<string, string>,
): Promise<string> {
  const key = `${kind}:${name}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const existing = await prisma.budgetCategory.findFirst({ where: { kind, name } });
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }
  const created = await prisma.budgetCategory.create({
    data: { kind, name, sortOrder },
  });
  cache.set(key, created.id);
  return created.id;
}

async function main() {
  const cache = new Map<string, string>();

  // preload / ensure expense cats
  for (let i = 0; i < EXPENSE_LINE_TO_TITLE.length; i++) {
    await ensureCategory("EXPENSE", EXPENSE_LINE_TO_TITLE[i]!.title, i + 1, cache);
  }
  // preload / ensure capex cats (unique titles in display order)
  const capexOrder = [
    "ระบบรักษาความปลอดภัย",
    "ครุภัณฑ์คอมพิวเตอร์",
    "เครื่องเสียง / ขยายเสียง",
    "อุปกรณ์ป้องกัน",
    "ยานพาหนะและขนส่ง",
    "งานติดตั้ง / ระบบ",
    "ครุภัณฑ์สำนักงาน",
    "ครุภัณฑ์อื่น",
  ];
  for (let i = 0; i < capexOrder.length; i++) {
    await ensureCategory("CAPEX", capexOrder[i]!, i + 1, cache);
  }

  const accounts = await prisma.budgetAccount.findMany({
    where: { isSummary: false },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  let updated = 0;
  let skipped = 0;

  // --- EXPENSE: walk like buildExpenseLineBlocks ---
  const expenses = accounts.filter((a) => a.kind === "EXPENSE" && !/หมวดค่าใช้จ่าย/.test(a.name));
  let currentMajor: number | null = null;

  for (const a of expenses) {
    const p = parseExpenseNo(a.name);
    let lineNo: number | null = null;

    if (p) {
      if (p.minor != null) {
        lineNo = p.major;
        currentMajor = p.major;
      } else {
        const isGroup = /กลุ่ม\s*\d|กลุ่ม\d/.test(a.name);
        const isTopHeader = !isGroup && Boolean(a.ciCode);
        if (isTopHeader) {
          lineNo = p.major;
          currentMajor = p.major;
        } else if (currentMajor != null) {
          lineNo = currentMajor;
        } else {
          lineNo = p.major;
          currentMajor = p.major;
        }
      }
    } else if (currentMajor != null) {
      lineNo = currentMajor;
    }

    if (lineNo == null) {
      skipped += 1;
      continue;
    }

    const title = expenseTitleForLine(lineNo);
    const categoryId = await ensureCategory("EXPENSE", title, 99, cache);
    if (a.categoryId === categoryId) {
      skipped += 1;
      continue;
    }
    await prisma.budgetAccount.update({ where: { id: a.id }, data: { categoryId } });
    updated += 1;
  }

  // --- CAPEX ---
  const capex = accounts.filter((a) => a.kind === "CAPEX");
  for (const a of capex) {
    if (/^หมายเหตุ/.test(a.name)) {
      const categoryId = await ensureCategory("CAPEX", "ครุภัณฑ์อื่น", 8, cache);
      if (a.categoryId !== categoryId) {
        await prisma.budgetAccount.update({ where: { id: a.id }, data: { categoryId } });
        updated += 1;
      } else {
        skipped += 1;
      }
      continue;
    }
    const key = capexKey(a.name, a.ciCode);
    const title = CAPEX_KEY_TO_TITLE[key] ?? CAPEX_KEY_TO_TITLE.other!;
    const categoryId = await ensureCategory("CAPEX", title, 99, cache);
    if (a.categoryId === categoryId) {
      skipped += 1;
      continue;
    }
    await prisma.budgetAccount.update({ where: { id: a.id }, data: { categoryId } });
    updated += 1;
  }

  const orphanLeft = await prisma.budgetAccount.count({
    where: { categoryId: null, isSummary: false },
  });

  console.log(`updated=${updated} skipped=${skipped} orphanLeft=${orphanLeft}`);

  const counts = await prisma.budgetCategory.findMany({
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
    include: { _count: { select: { accounts: true } } },
  });
  for (const c of counts) {
    console.log(`${c.kind}\t${c.sortOrder}\t${c._count.accounts}\t${c.name}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
