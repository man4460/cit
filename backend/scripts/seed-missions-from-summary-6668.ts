/**
 * ซิงก์ภารกิจ TRIP-2566/67/68 จากชีต «สรุป 66/67/68»
 * ในไฟล์ งขส_สรุปจำนวนภารกิจขนส่งธนบัตร+5+ประจำปี+2569.xlsx
 *
 * - ช่องตัวเลขว่าง → 0
 * - บันทึกหมวดค่าใช้จ่ายครบทุกช่อง (รวมยอด 0) ยกเว้นคอลัมน์ «คชจ.ดำเนินงานทั้งสิ้น» ซึ่งเป็นยอดรวมย่อย
 * - จัดจำนวนตู้/มูลค่าตามข้อความในคอลัมน์จำนวนตู้
 *
 *   npx tsx scripts/seed-missions-from-summary-6668.ts
 *   MISSION_SUMMARY_XLSX="path.xlsx" npx tsx scripts/seed-missions-from-summary-6668.ts
 */
import "dotenv/config";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { MissionStatus, Prisma, PrismaClient } from "@prisma/client";
import { seedMissionMasterData } from "../src/lib/seedMissionMasters.js";

const prisma = new PrismaClient();

const DEFAULT_XLSX =
  process.env.MISSION_SUMMARY_XLSX ??
  process.env.MISSION_TRIP2569_XLSX ??
  String.raw`C:\Users\MAN\Downloads\Telegram Desktop\งขส_สรุปจำนวนภารกิจขนส่งธนบัตร+5+ประจำปี+2569.xlsx`;

/** คอลัมน์ค่าใช้จ่ายในชีตสรุป — ไม่รวมคอลัมน์ 13 คชจ.ดำเนินงานทั้งสิ้น (subtotal) */
const EXPENSE_NAMES = [
  "ค่ารับรอง",
  "ค่าตอบแทนบุคคลภายนอก",
  "เบ็ดเตล็ด/ล้างรถ",
  "ค่าเงินช่วยเหลือ",
  "ค่าน้ำมัน / เชื้อเพลิง",
  "ประกันภัย",
  "ค่าธรรมเนียมอื่นๆ",
  "ค่าจ้างรถบรรทุก",
] as const;

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

type StopAlloc = { code: string; containers: number; cargoMillionBaht: number };

type SummaryTrip = {
  yearBe: number;
  tripNo: number;
  code: string;
  dateRange: string;
  routeText: string;
  containersTotal: number;
  spareTractors: number;
  allocations: StopAlloc[];
  expenses: Record<string, number>;
  totalExpense: number;
};

function beToCe(yearBe: number): number {
  return yearBe - 543;
}

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

function parseThaiDateRange(raw: string, yearBe: number): { start: Date; end: Date } | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const yearCe = beToCe(yearBe);
  const re = new RegExp(String.raw`(\d{1,2})\s*${TH_MONTH_REGEX.source}\s*(\d{2})?`, "gu");
  const hits: { day: number; month: number; yearCe: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const day = parseInt(m[1]!, 10);
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
  const startDt = new Date(Date.UTC(hits[0]!.yearCe, hits[0]!.month - 1, hits[0]!.day, 12, 0, 0));
  const last = hits[hits.length - 1]!;
  const endDt = new Date(Date.UTC(last.yearCe, last.month - 1, last.day, 12, 0, 0));
  return { start: startDt, end: endDt };
}

function normalizeStopKey(raw: string): string {
  return raw
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(/ฯ/g, "")
    .toLowerCase();
}

function splitRouteStops(routeText: string): string[] {
  const cleaned = routeText
    .replace(/\r/g, "")
    .replace(/\n/g, " / ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return ["ไม่ระบุ"];
  const parts = cleaned
    .split(/\s*[-–—]\s*|\s*และ\s*|\s*\/\s*/)
    .map((s) => s.replace(/^[.,\s]+|[.,\s]+$/g, "").trim())
    .filter(Boolean);
  return parts.length ? parts : [cleaned];
}

function extractViaPython(xlsxPath: string): SummaryTrip[] {
  const py = `
import json, openpyxl, re, sys

path = sys.argv[1]
wb = openpyxl.load_workbook(path, data_only=True)

def to_num(v):
    if v is None or v == "":
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(",", "").strip())
    except Exception:
        return 0.0

# ไม่กินข้อความข้ามสถานีอื่น — มูลค่าต้องติดหลัง «ตู้» ของสถานีนั้นโดยตรง
pair_re = re.compile(
    r"(ศ[\\wก-๙]+\\.?)\\s*(\\d+)\\s*ตู้(?:\\s*มูลค่า\\s*([\\d,]+(?:\\.\\d+)?)\\s*ล้านบาท)?",
    re.UNICODE,
)

EXP = [
    (6, "ค่ารับรอง"),
    (7, "ค่าตอบแทนบุคคลภายนอก"),
    (8, "เบ็ดเตล็ด/ล้างรถ"),
    (9, "ค่าเงินช่วยเหลือ"),
    (10, "ค่าน้ำมัน / เชื้อเพลิง"),
    (11, "ประกันภัย"),
    (12, "ค่าธรรมเนียมอื่นๆ"),
    (15, "ค่าจ้างรถบรรทุก"),
]

out = []
for sheet_name, year_be in [("สรุป 66", 2566), ("สรุป 67", 2567), ("สรุป 68", 2568)]:
    if sheet_name not in wb.sheetnames:
        print(f"missing {sheet_name}", file=sys.stderr)
        continue
    ws = wb[sheet_name]
    for r in range(3, ws.max_row + 1):
        trip_raw = ws.cell(r, 1).value
        if trip_raw is None:
            continue
        m = re.search(r"(\\d+)", str(trip_raw))
        if not m:
            continue
        trip_no = int(m.group(1))
        date_range = str(ws.cell(r, 2).value or "").strip()
        route = str(ws.cell(r, 3).value or "").replace("\\r", " ").replace("\\n", " ").strip()
        cont_text = str(ws.cell(r, 4).value or "").replace("\\xa0", " ")
        spare = int(to_num(ws.cell(r, 5).value))
        expenses = {name: to_num(ws.cell(r, col).value) for col, name in EXP}
        total = to_num(ws.cell(r, 16).value)

        allocations = []
        for pm in pair_re.finditer(cont_text):
            million = float((pm.group(3) or "0").replace(",", "")) if pm.group(3) else 0.0
            allocations.append({
                "code": pm.group(1).strip(),
                "containers": int(pm.group(2)),
                "cargoMillionBaht": million,
            })

        # ยอดตู้ทั้งเที่ยว = ตัวเลขนำหน้า เช่น «4 ตู้ (...)» ไม่รวมยอดย่อยซ้ำ
        lead = re.match(r"\\s*(\\d+)\\s*ตู้", cont_text)
        if lead:
            containers_total = int(lead.group(1))
        elif allocations:
            # รวมต่อรหัสสถานีครั้งแรก (กันซ้ำจากขาต่อ)
            seen = {}
            for a in allocations:
                if a["code"] not in seen:
                    seen[a["code"]] = a["containers"]
            containers_total = sum(seen.values())
        else:
            containers_total = 0

        if not date_range and total == 0 and containers_total == 0 and spare == 0 and all(v == 0 for v in expenses.values()):
            continue

        out.append({
            "yearBe": year_be,
            "tripNo": trip_no,
            "code": f"TRIP-{year_be}-{trip_no:02d}",
            "dateRange": date_range,
            "routeText": route,
            "containersTotal": containers_total,
            "spareTractors": spare,
            "allocations": allocations,
            "expenses": expenses,
            "totalExpense": round(total, 2),
        })

print(json.dumps(out, ensure_ascii=False))
`.trim();

  const scriptPath = path.join(os.tmpdir(), `cit-summary-6668-${Date.now()}.py`);
  fs.writeFileSync(scriptPath, py, "utf8");
  try {
    const raw = execFileSync("python", [scriptPath, xlsxPath], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    return JSON.parse(raw) as SummaryTrip[];
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      /* ignore */
    }
  }
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
  const startLocation = stops[0]!;
  const endLocation = stops[stops.length - 1]!;
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

function buildDestinations(t: SummaryTrip): {
  sortOrder: number;
  address: string;
  cargoValue: Prisma.Decimal;
  containerCount: number;
}[] {
  const stops = splitRouteStops(t.routeText);
  const remaining = [...t.allocations];

  const takeAlloc = (address: string): StopAlloc | null => {
    const idx = remaining.findIndex((a) => {
      const key = normalizeStopKey(address);
      const ak = normalizeStopKey(a.code);
      return ak === key || ak.includes(key) || key.includes(ak);
    });
    if (idx < 0) return null;
    return remaining.splice(idx, 1)[0] ?? null;
  };

  let destinations = stops.map((address, i) => {
    const alloc = takeAlloc(address);
    return {
      sortOrder: i,
      address,
      cargoValue: new Prisma.Decimal(alloc ? Math.round(alloc.cargoMillionBaht * 1_000_000) : 0),
      containerCount: alloc?.containers ?? 0,
    };
  });

  // ถ้ายังเหลือ allocation ที่ชื่อไม่ตรง stop — ใส่ตามลำดับหลังต้นทาง
  if (remaining.length) {
    for (let i = 0; i < destinations.length && remaining.length; i++) {
      if (destinations[i]!.containerCount > 0) continue;
      if (i === 0 && destinations.length > remaining.length + destinations.filter((d) => d.containerCount > 0).length) {
        continue;
      }
      const a = remaining.shift()!;
      destinations[i] = {
        sortOrder: i,
        address: destinations[i]!.address,
        cargoValue: new Prisma.Decimal(Math.round(a.cargoMillionBaht * 1_000_000)),
        containerCount: a.containers,
      };
    }
  }

  const sum = destinations.reduce((a, d) => a + d.containerCount, 0);
  if (sum === 0 && t.containersTotal > 0) {
    const idx = destinations.length > 1 ? destinations.length - 1 : 0;
    destinations = destinations.map((d, i) =>
      i === idx ? { ...d, containerCount: t.containersTotal } : { ...d, containerCount: 0 },
    );
  }

  return destinations;
}

async function main() {
  const xlsxPath = process.argv[2] || DEFAULT_XLSX;
  if (!fs.existsSync(xlsxPath)) {
    throw new Error(`ไม่พบไฟล์: ${xlsxPath}`);
  }

  await seedMissionMasterData();

  const expenseTypeIds = new Map<string, string>();
  let sort = 10;
  for (const name of EXPENSE_NAMES) {
    expenseTypeIds.set(name, await ensureExpenseType(name, sort++));
  }

  console.log("อ่าน", xlsxPath);
  const trips = extractViaPython(xlsxPath);
  console.log(`พบ ${trips.length} ทริปจาก สรุป 66/67/68`);

  let created = 0;
  let updated = 0;

  for (const t of trips) {
    const dates = parseThaiDateRange(t.dateRange, t.yearBe);
    const stops = splitRouteStops(t.routeText);
    const routeId = await ensureRoute(stops);
    const destinations = buildDestinations(t);

    const titleParts = [
      `ขนส่งธนบัตร Trip ${t.tripNo}`,
      t.routeText.replace(/\s+/g, " ").trim(),
      t.dateRange,
    ].filter(Boolean);
    let title = titleParts.join(" · ").slice(0, 500);
    if (t.spareTractors > 0) title = `${title} (หัวลากสำรอง ${t.spareTractors})`;

    const expenseCreates = EXPENSE_NAMES.map((name) => ({
      expenseTypeId: expenseTypeIds.get(name)!,
      amount: new Prisma.Decimal(Math.round((t.expenses[name] ?? 0) * 100) / 100),
      description: `${t.code} · ${name}`,
      incurredAt: dates?.start ?? new Date(Date.UTC(beToCe(t.yearBe), 0, 1, 12)),
    }));

    const budget = new Prisma.Decimal(Math.round(t.totalExpense * 100) / 100);
    const existing = await prisma.mission.findUnique({ where: { code: t.code } });

    if (existing) {
      await prisma.$transaction(async (tx) => {
        await tx.missionDestination.deleteMany({ where: { missionId: existing.id } });
        await tx.missionExpense.deleteMany({ where: { missionId: existing.id } });
        await tx.mission.update({
          where: { id: existing.id },
          data: {
            title,
            status: MissionStatus.COMPLETED,
            routeId,
            budgetAmount: budget,
            plannedStart: dates?.start ?? existing.plannedStart,
            plannedEnd: dates?.end ?? existing.plannedEnd,
            actualStart: dates?.start ?? existing.actualStart,
            actualEnd: dates?.end ?? existing.actualEnd,
            destinations: { create: destinations },
            expenses: { create: expenseCreates },
          },
        });
      });
      updated++;
    } else {
      await prisma.mission.create({
        data: {
          code: t.code,
          title,
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
    }

    const contSum = destinations.reduce((a, d) => a + d.containerCount, 0);
    console.log(
      `${existing ? "upd" : "new"} ${t.code} total=${t.totalExpense} cont=${contSum}/${t.containersTotal} spare=${t.spareTractors} fee=${t.expenses["ค่าธรรมเนียมอื่นๆ"] ?? 0}`,
    );
  }

  console.log(`\nเสร็จ: สร้าง ${created} · อัปเดต ${updated} · รวม ${trips.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
