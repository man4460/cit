/**
 * อ่านไฟล์ งขส_สรุปจำนวนภารกิจขนส่งธนบัตร+5+ประจำปี+2569.xlsx
 * ชีต «trip 69» + «สรุป 69» — ใช้เป็นค่าอ้างอิงหลักสำหรับ TRIP-2569-01…05
 */
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import type { EstimatePersonCounts } from "./estimatePersonCounts.js";
import { EMPTY_ESTIMATE_PERSON_COUNTS } from "./estimatePersonCounts.js";

export const DEFAULT_TRIP2569_XLSX =
  process.env.MISSION_TRIP2569_XLSX ??
  process.env.DEST_SUMMARY_XLSX ??
  String.raw`C:\Users\MAN\Downloads\Telegram Desktop\งขส_สรุปจำนวนภารกิจขนส่งธนบัตร+5+ประจำปี+2569.xlsx`;

export type Trip2569Personnel = {
  special: number;
  highway: number;
  crime: number;
  bot: number;
  driver: number;
};

export type Trip2569Data = {
  tripNo: number;
  missionCode: string;
  routeText: string;
  dateRange: string;
  spareTractor: number;
  personnel: Trip2569Personnel;
  /** ยอดรายบรรทัดตาม itemCode / groupCode */
  amountsByKey: Record<string, number>;
  /** ยอดรวมตามหมวดจากชีตสรุป */
  groupTotals: {
    hospitality: number;
    external: number;
    misc: number;
    allowance: number;
    fuel: number;
    insurance: number;
    fees: number;
    operating: number;
  };
  personCounts: EstimatePersonCounts;
};

let cachedTrips: Trip2569Data[] | null = null;
let cachedPath: string | null = null;

export function parseTrip2569No(input: string | null | undefined): number | null {
  if (!input) return null;
  const m = input.trim().match(/^TRIP-2569-0?([1-5])$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 5 ? n : null;
}

function personnelToPersonCounts(p: Trip2569Personnel): EstimatePersonCounts {
  return {
    ...EMPTY_ESTIMATE_PERSON_COUNTS,
    specialCommissioned: p.special,
    highwayCommissioned: p.highway,
    crimeCommissioned: p.crime,
    bot: p.bot,
    driver: p.driver,
  };
}

function extractViaPython(xlsxPath: string): Trip2569Data[] {
  const py = `
import json, openpyxl, re, sys

path = sys.argv[1]
wb = openpyxl.load_workbook(path, data_only=True)
ws = wb["trip 69"]
ws_sum = wb["สรุป 69"]

TRIP_COL = {1: 6, 2: 7, 3: 8, 4: 9, 5: 10}

def num(v):
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return 0.0

def label_col4(r):
    return str(ws.cell(r, 4).value or "").strip()

def match_label(text, prefix):
    t = re.sub(r"\\s+", " ", text)
    return t.startswith(prefix)

HOSP_ROWS = [
    ("1.1", "1. อาหารกลางวัน/เย็น"),
    ("1.2", "2. อาหารเช้า/ของว่าง"),
    ("1.3", "3. เครื่องดื่ม"),
    ("1.4", "4. อาหารกลางวัน"),
    ("1.5", "5. อาหารว่าง"),
    ("1.6", "6. อาหารเย็น"),
    ("1.7", "7. อาหารกลางวัน/น้ำแข็ง"),
    ("1.8", "8. อาหารเย็น"),
    ("1.9", "9. ที่พัก"),
]

EXT_ROWS = [
    ("specialCombined", "1. จนท.ตร.ต่อต้านการก่อการร้าย"),
    ("highwayCombined", "2. จนท.ตร.ทางหลวง"),
    ("crimeCombined", "3. จนท.ตร.กองปราบ"),
    ("2.4", "4. จนท.ตร.นำเข้าพื้นที่ 1"),
    ("2.5", "5. จนท.ตร.นำเข้าพื้นที่ 2"),
]

ALLOW_ROWS = [
    ("8.1", "1. เบี้ยพิเศษ"),
    ("5.1", "2. ที่พัก จนท.ฝรภ."),
    ("5.2", "3. ค่าพาหนะ"),
    ("5.3", "4. เบี้ยเลี้ยง"),
]

PERSONNEL = [
    ("special", "1. จนท.ตร.ต่อต้านการก่อการร้าย"),
    ("highway", "2. จนท.ตร.ทางหลวง"),
    ("crime", "3. จนท.ตร.กองปราบ"),
    ("bot", "4. จนท.ฝ่ายรักษาความปลอดภัย"),
    ("driver", "5. พขร."),
]

# สร้าง index แถวจาก col 4
row_by_prefix = {}
for r in range(1, ws.max_row + 1):
    lab = label_col4(r)
    if lab:
        row_by_prefix[lab[:20]] = r

def find_row(prefixes, r_start=1, r_end=None):
    if r_end is None:
        r_end = ws.max_row
    for r in range(r_start, r_end + 1):
        lab = label_col4(r)
        for p in prefixes:
            if match_label(lab, p):
                return r
    return None

summary_by_trip = {}
for r in range(3, ws_sum.max_row + 1):
    trip_cell = ws_sum.cell(r, 1).value
    if not trip_cell:
        continue
    m = re.search(r"(\\d+)", str(trip_cell))
    if not m:
        continue
    tn = int(m.group(1))
    if tn < 1 or tn > 5:
        continue
    route = str(ws_sum.cell(r, 3).value or "").replace("\\n", " - ").strip()
    date_range = str(ws_sum.cell(r, 2).value or "").strip()
    spare = num(ws_sum.cell(r, 5).value)
    summary_by_trip[tn] = {
        "routeText": route,
        "dateRange": date_range,
        "spareTractor": int(spare),
        "groupTotals": {
            "hospitality": num(ws_sum.cell(r, 6).value),
            "external": num(ws_sum.cell(r, 7).value),
            "misc": num(ws_sum.cell(r, 8).value),
            "allowance": num(ws_sum.cell(r, 9).value),
            "fuel": num(ws_sum.cell(r, 10).value),
            "insurance": num(ws_sum.cell(r, 11).value),
            "fees": num(ws_sum.cell(r, 12).value),
            "operating": num(ws_sum.cell(r, 13).value),
        },
    }

trips = []
for trip_no, col in TRIP_COL.items():
    meta = summary_by_trip.get(trip_no, {})
    route_text = meta.get("routeText") or str(ws.cell(4, col).value or "").strip()
    date_range = meta.get("dateRange") or str(ws.cell(7, col).value or "").strip()

    personnel = {}
    for key, prefix in PERSONNEL:
        row = find_row([prefix], 9, 14)
        personnel[key] = int(num(ws.cell(row, col).value)) if row else 0

    amounts = {}
    for code, prefix in HOSP_ROWS:
        row = find_row([prefix], 15, 24)
        if row:
            amounts[code] = num(ws.cell(row, col).value)

    for code, prefix in EXT_ROWS:
        row = find_row([prefix], 25, 31)
        if row:
            amounts[code] = num(ws.cell(row, col).value)

    # ค่าทางด่วน → group 3
    toll_row = find_row(["ค่าทางด่วน"], 32, 34)
    if toll_row:
        amounts["3"] = num(ws.cell(toll_row, col).value)

    wash_row = find_row(["ล้างรถ"], 34, 36)
    if wash_row:
        amounts["4"] = num(ws.cell(wash_row, col).value)

    for code, prefix in ALLOW_ROWS:
        row = find_row([prefix], 36, 42)
        if row:
            amounts[code] = num(ws.cell(row, col).value)

    fuel_row = find_row(["ค่าน้ำมันเชื้อเพลิง"], 42, 44)
    if fuel_row:
        amounts["6"] = num(ws.cell(fuel_row, col).value)

    ins_row = find_row(["ค่าประกัน"], 44, 46)
    if ins_row:
        amounts["7"] = num(ws.cell(ins_row, col).value)

    # specialCombined → แมปเป็น 2.1 ที่ฝั่ง TypeScript (ไม่แยก 2.6/2.7 จากยอดนี้)

    trips.append({
        "tripNo": trip_no,
        "missionCode": f"TRIP-2569-{trip_no:02d}",
        "routeText": route_text,
        "dateRange": date_range,
        "spareTractor": meta.get("spareTractor", 0),
        "personnel": personnel,
        "amountsByKey": amounts,
        "groupTotals": meta.get("groupTotals", {
            "hospitality": 0, "external": 0, "misc": 0, "allowance": 0,
            "fuel": 0, "insurance": 0, "fees": 0, "operating": 0,
        }),
    })

print(json.dumps(trips, ensure_ascii=False))
`.trim();

  const scriptPath = path.join(os.tmpdir(), `export-trip2569-${Date.now()}.py`);
  fs.writeFileSync(scriptPath, py, "utf8");
  try {
    if (!fs.existsSync(xlsxPath)) {
      throw new Error(`ไม่พบไฟล์สรุป 5 ทริป 2569: ${xlsxPath}`);
    }
    const out = execFileSync("python", [scriptPath, xlsxPath], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    const raw = JSON.parse(out) as Array<Omit<Trip2569Data, "personCounts"> & { personnel: Trip2569Personnel }>;
    return raw.map((t) => ({
      ...t,
      personCounts: personnelToPersonCounts(t.personnel),
    }));
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      /* ignore */
    }
  }
}

export function loadTrip2569Catalog(xlsxPath = DEFAULT_TRIP2569_XLSX): Trip2569Data[] {
  const resolved = path.resolve(xlsxPath);
  if (cachedTrips && cachedPath === resolved) return cachedTrips;
  cachedTrips = extractViaPython(resolved);
  cachedPath = resolved;
  return cachedTrips;
}

export function getTrip2569ByNo(tripNo: number, xlsxPath?: string): Trip2569Data | null {
  if (tripNo < 1 || tripNo > 5) return null;
  const trips = loadTrip2569Catalog(xlsxPath ?? DEFAULT_TRIP2569_XLSX);
  return trips.find((t) => t.tripNo === tripNo) ?? null;
}

export function getTrip2569ByMissionCode(code: string | null | undefined, xlsxPath?: string): Trip2569Data | null {
  const tripNo = parseTrip2569No(code);
  return tripNo ? getTrip2569ByNo(tripNo, xlsxPath) : null;
}

/** จับคู่จากข้อความเส้นทาง (fallback เมื่อไม่มีรหัส TRIP-2569-0N) */
export function findTrip2569ByRouteText(routeText: string, xlsxPath?: string): Trip2569Data | null {
  const norm = routeText.replace(/\s+/g, "").replace(/\./g, "").toLowerCase();
  if (!norm) return null;
  const trips = loadTrip2569Catalog(xlsxPath ?? DEFAULT_TRIP2569_XLSX);
  for (const t of trips) {
    const rt = t.routeText.replace(/\s+/g, "").replace(/\./g, "").toLowerCase();
    if (norm.includes(rt) || rt.includes(norm)) return t;
    const stops = rt.split(/[-–—]/).filter(Boolean);
    if (stops.length >= 2 && stops.every((s) => norm.includes(s.slice(0, 4)))) return t;
  }
  return null;
}

export function clearTrip2569Cache(): void {
  cachedTrips = null;
  cachedPath = null;
}