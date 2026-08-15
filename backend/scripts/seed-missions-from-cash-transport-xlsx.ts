/**
 * นำเข้าภารกิจจากไฟล์สถิติการขนส่งธนบัตร (ชีต «รายละเอียด Trip»)
 *
 * รัน:
 *   npx tsx scripts/seed-missions-from-cash-transport-xlsx.ts
 *   หรือตั้ง MISSION_XLSX=พาธไฟล์
 */
import "dotenv/config";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { Prisma, PrismaClient, MissionStatus } from "@prisma/client";
import { seedMissionMasterData } from "../src/lib/seedMissionMasters.js";

const prisma = new PrismaClient();

const DEFAULT_XLSX =
  process.env.MISSION_XLSX ??
  String.raw`C:\Users\LENOVO\Downloads\Telegram Desktop\สถิติการขนส่งธนบัตร_ปรับรูปแบบใหม่_8.xlsx`;

/**
 * คอลัมน์ค่าใช้จ่ายในชีต «รายละเอียด Trip»
 * หมายเหตุ: คอลัมน์ 16 «คชจ.ดำเนินงาน» = รวมหมวดย่อย (คอลัมน์ 9–15)
 * ไม่นำเข้า เพื่อไม่ให้ซ้ำกับรายการย่อย
 * รวมค่าใช้จ่าย (คอลัมน์ 18) = คชจ.ดำเนินงาน + ค่าจ้างรถบรรทุก
 */
const EXPENSE_COLS: { key: string; col: number; name: string }[] = [
  { key: "entertainment", col: 9, name: "ค่ารับรอง" },
  { key: "extComp", col: 10, name: "ค่าตอบแทนบุคคลภายนอก" },
  { key: "misc", col: 11, name: "เบ็ดเตล็ด/ล้างรถ" },
  { key: "allowance", col: 12, name: "ค่าเงินช่วยเหลือ" },
  { key: "fuel", col: 13, name: "ค่าน้ำมัน / เชื้อเพลิง" },
  { key: "insurance", col: 14, name: "ประกันภัย" },
  { key: "fees", col: 15, name: "ค่าธรรมเนียมอื่นๆ" },
  // skip col 16 คชจ.ดำเนินงาน (subtotal)
  { key: "truck", col: 17, name: "ค่าจ้างรถบรรทุก" },
];

const TH_MONTH: Record<string, number> = {
  "ม.ค": 1,
  "ก.พ": 2,
  "มี.ค": 3,
  "เม.ย": 4,
  "พ.ค": 5,
  "มิ.ย": 6,
  "ก.ค": 7,
  "ส.ค": 8,
  "ก.ย": 9,
  "ต.ค": 10,
  "พ.ย": 11,
  "ธ.ค": 12,
};

type RawTrip = {
  yearBe: number;
  tripNo: number;
  tripLabel: string;
  dateRange: string;
  routeText: string;
  containers: number;
  spareTractors: number;
  cargoMillionBaht: number;
  expenses: Record<string, number>;
  totalExpense: number;
};

function extractTripsViaPython(xlsxPath: string): RawTrip[] {
  const py = `
import json, openpyxl, sys
path = sys.argv[1]
wb = openpyxl.load_workbook(path, data_only=True)
ws = wb["รายละเอียด Trip"]
rows = []
for r in range(5, ws.max_row + 1):
    year = ws.cell(r, 1).value
    trip_no = ws.cell(r, 2).value
    if year is None or trip_no is None:
        continue
    label = ws.cell(r, 3).value or f"Trip {trip_no}"
    date_range = (ws.cell(r, 4).value or "").strip() if isinstance(ws.cell(r, 4).value, str) else str(ws.cell(r, 4).value or "")
    route = (ws.cell(r, 5).value or "")
    if isinstance(route, str):
        route = route.replace("\\n", " / ").strip()
    else:
        route = str(route or "")
    # ไม่ดึงคอลัมน์ 16 คชจ.ดำเนินงาน — เป็นยอดรวมหมวดย่อย (9–15)
    expenses = {
        "ค่ารับรอง": float(ws.cell(r, 9).value or 0),
        "ค่าตอบแทนบุคคลภายนอก": float(ws.cell(r, 10).value or 0),
        "เบ็ดเตล็ด/ล้างรถ": float(ws.cell(r, 11).value or 0),
        "ค่าเงินช่วยเหลือ": float(ws.cell(r, 12).value or 0),
        "ค่าน้ำมัน / เชื้อเพลิง": float(ws.cell(r, 13).value or 0),
        "ประกันภัย": float(ws.cell(r, 14).value or 0),
        "ค่าธรรมเนียมอื่นๆ": float(ws.cell(r, 15).value or 0),
        "ค่าจ้างรถบรรทุก": float(ws.cell(r, 17).value or 0),
    }
    rows.append({
        "yearBe": int(year),
        "tripNo": int(trip_no),
        "tripLabel": str(label).strip(),
        "dateRange": date_range,
        "routeText": route,
        "containers": int(float(ws.cell(r, 6).value or 0)),
        "spareTractors": int(float(ws.cell(r, 7).value or 0)),
        "cargoMillionBaht": float(ws.cell(r, 8).value or 0),
        "expenses": expenses,
        "totalExpense": float(ws.cell(r, 18).value or 0),
    })
print(json.dumps(rows, ensure_ascii=False))
`.trim();
  const scriptPath = path.join(os.tmpdir(), `export-missions-${Date.now()}.py`);
  fs.writeFileSync(scriptPath, py, "utf8");
  try {
    const out = execFileSync("python", [scriptPath, xlsxPath], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    return JSON.parse(out) as RawTrip[];
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      /* ignore */
    }
  }
}

function beToCe(yearBe: number): number {
  return yearBe - 543;
}

/** ลำดับสำคัญ: มี/เม/มิ ก่อน ม และ พ.ย ก่อน พ.ค */
const TH_MONTH_REGEX =
  /(มี\.?\s*ค\.?|เม\.?\s*ย\.?|มิ\.?\s*ย\.?|ม\.?\s*ค\.?|ก\.?\s*พ\.?|พ\.?\s*ย\.?|พ\.?\s*ค\.?|ก\.?\s*ค\.?|ส\.?\s*ค\.?|ก\.?\s*ย\.?|ต\.?\s*ค\.?|ธ\.?\s*ค\.?)/u;

function monthFromThaiToken(token: string): number | null {
  const compact = token.replace(/\s+/g, "").replace(/\./g, "");
  for (const [key, month] of Object.entries(TH_MONTH)) {
    const k = key.replace(/\./g, "");
    if (compact === k || compact.startsWith(k)) return month;
  }
  return null;
}

/** แปลง "1 ก.พ.  - 3 ก.พ. 66" หรือ "21 เม.ย. - 23 เม.ย.69" → {start,end} (เที่ยง UTC) */
function parseThaiDateRange(raw: string, yearBe: number): { start: Date; end: Date } | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const yearCe = beToCe(yearBe);
  const re = new RegExp(String.raw`(\d{1,2})\s*${TH_MONTH_REGEX.source}\s*(\d{2})?`, "gu");
  const hits: { day: number; month: number; yearCe: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const day = parseInt(m[1], 10);
    const month = monthFromThaiToken(m[2] ?? "");
    if (!month || !day) continue;
    let y = yearCe;
    if (m[3]) {
      const yy = parseInt(m[3], 10);
      if (yy === yearBe % 100) y = yearCe;
      else if (yy >= 0 && yy <= 99) y = 2500 + yy - 543;
    }
    hits.push({ day, month, yearCe: y });
  }
  if (!hits.length) return null;
  const startDt = new Date(Date.UTC(hits[0].yearCe, hits[0].month - 1, hits[0].day, 12, 0, 0));
  const last = hits[hits.length - 1];
  const endDt = new Date(Date.UTC(last.yearCe, last.month - 1, last.day, 12, 0, 0));
  return { start: startDt, end: endDt };
}

function splitRouteStops(routeText: string): string[] {
  const cleaned = routeText
    .replace(/\r/g, "")
    .replace(/\n/g, " / ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return ["ไม่ระบุ"];
  const parts = cleaned
    .split(/\s*[-–—]\s*|\s+และ\s+|\s*\/\s*/)
    .map((s) => s.replace(/^[.,\s]+|[.,\s]+$/g, "").trim())
    .filter(Boolean);
  return parts.length ? parts : [cleaned];
}

async function ensureExpenseType(name: string, sortOrder: number): Promise<string> {
  const row = await prisma.missionExpenseTypeMaster.upsert({
    where: { name },
    create: { name, sortOrder },
    update: { sortOrder },
  });
  return row.id;
}

async function ensureRoute(stops: string[]): Promise<string | null> {
  if (stops.length < 2) return null;
  const startLocation = stops[0];
  const endLocation = stops[stops.length - 1];
  const existing = await prisma.routeMaster.findFirst({
    where: { startLocation, endLocation },
  });
  if (existing) return existing.id;
  const created = await prisma.routeMaster.create({
    data: {
      name: `${startLocation} → ${endLocation}`,
      startLocation,
      endLocation,
      distanceKm: new Prisma.Decimal(0),
    },
  });
  return created.id;
}

function missionCode(yearBe: number, tripNo: number): string {
  return `TRIP-${yearBe}-${String(tripNo).padStart(2, "0")}`;
}

async function main() {
  const xlsxPath = DEFAULT_XLSX;
  if (!fs.existsSync(xlsxPath)) {
    throw new Error(`ไม่พบไฟล์: ${xlsxPath}`);
  }

  await seedMissionMasterData();

  const expenseTypeIds = new Map<string, string>();
  let sort = 10;
  for (const e of EXPENSE_COLS) {
    expenseTypeIds.set(e.name, await ensureExpenseType(e.name, sort++));
  }

  console.log("อ่าน Excel…");
  const trips = extractTripsViaPython(xlsxPath);
  console.log(`พบ ${trips.length} เที่ยว`);

  let created = 0;
  let updated = 0;

  for (const t of trips) {
    const code = missionCode(t.yearBe, t.tripNo);
    const stops = splitRouteStops(t.routeText);
    const dates = parseThaiDateRange(t.dateRange, t.yearBe);
    const routeId = await ensureRoute(stops);
    const titleParts = [
      `ขนส่งธนบัตร ${t.tripLabel}`,
      t.routeText.replace(/\s+/g, " ").trim(),
      t.dateRange,
    ].filter(Boolean);
    const title = titleParts.join(" · ").slice(0, 500);

    // ชีตระบุหน่วย «ล้านบาท» — ระบบเก็บ cargoValue เป็นบาท
    const cargoValueBaht = t.cargoMillionBaht * 1_000_000;
    const destinations = stops.map((address, i) => ({
      sortOrder: i,
      address,
      cargoValue: new Prisma.Decimal(i === 0 ? cargoValueBaht : 0),
      containerCount: i === 0 ? t.containers : 0,
    }));

    const expenseCreates = Object.entries(t.expenses)
      .filter(([, amt]) => amt > 0)
      .map(([name, amt]) => ({
        expenseTypeId: expenseTypeIds.get(name)!,
        amount: new Prisma.Decimal(Math.round(amt * 100) / 100),
        description: `${code} · ${name}`,
        incurredAt: dates?.start ?? new Date(Date.UTC(beToCe(t.yearBe), 0, 1, 12)),
      }));

    const budget = new Prisma.Decimal(Math.round(t.totalExpense * 100) / 100);
    const noteSpare =
      t.spareTractors > 0 ? `หัวลากสำรอง ${t.spareTractors}` : null;

    const existing = await prisma.mission.findUnique({ where: { code } });
    if (existing) {
      await prisma.$transaction(async (tx) => {
        await tx.missionDestination.deleteMany({ where: { missionId: existing.id } });
        await tx.missionExpense.deleteMany({ where: { missionId: existing.id } });
        await tx.mission.update({
          where: { id: existing.id },
          data: {
            title: noteSpare ? `${title} (${noteSpare})` : title,
            status: MissionStatus.COMPLETED,
            routeId,
            budgetAmount: budget,
            plannedStart: dates?.start ?? null,
            plannedEnd: dates?.end ?? null,
            actualStart: dates?.start ?? null,
            actualEnd: dates?.end ?? null,
            destinations: { create: destinations },
            expenses: { create: expenseCreates },
          },
        });
      });
      updated++;
      console.log(`อัปเดต ${code}`);
    } else {
      await prisma.mission.create({
        data: {
          code,
          title: noteSpare ? `${title} (${noteSpare})` : title,
          status: MissionStatus.COMPLETED,
          routeId,
          budgetAmount: budget,
          plannedStart: dates?.start ?? null,
          plannedEnd: dates?.end ?? null,
          actualStart: dates?.start ?? null,
          actualEnd: dates?.end ?? null,
          destinations: { create: destinations },
          expenses: { create: expenseCreates },
        },
      });
      created++;
      console.log(`สร้าง ${code}`);
    }
  }

  console.log(`\nเสร็จ: สร้าง ${created} · อัปเดต ${updated} · รวม ${trips.length} ภารกิจ`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
