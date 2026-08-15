/**
 * อัปเดตจุดส่ง + จำนวนตู้ + มูลค่ารายจุด จากไฟล์
 * งขส_สรุปจำนวนภารกิจขนส่งธนบัตร+5+ประจำปี+2569.xlsx (ชีต «สรุป 69»)
 *
 *   npm run seed:missions:destinations-2569
 */
import "dotenv/config";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_XLSX =
  process.env.DEST_SUMMARY_XLSX ??
  String.raw`C:\Users\LENOVO\Downloads\Telegram Desktop\งขส_สรุปจำนวนภารกิจขนส่งธนบัตร+5+ประจำปี+2569.xlsx`;

type StopAlloc = { code: string; containers: number; cargoMillionBaht: number };

type TripDest = {
  tripNo: number;
  routeText: string;
  stops: string[];
  allocations: StopAlloc[];
};

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
    .replace(/\n/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  return cleaned
    .split(/\s*[-–—]\s*|\s+และ\s+|\s*\/\s*/)
    .map((s) => s.replace(/^[.,\s]+|[.,\s]+$/g, "").trim())
    .filter(Boolean);
}

function extractViaPython(xlsxPath: string): TripDest[] {
  const py = `
import json, openpyxl, re, sys

path = sys.argv[1]
wb = openpyxl.load_workbook(path, data_only=True)
ws = wb["สรุป 69"]
rows = []

def split_route(text):
    t = re.sub(r"[\\r\\n]+", " - ", str(text or ""))
    t = re.sub(r"\\s+", " ", t).strip()
    parts = re.split(r"\\s*[-–—]\\s*|\\s+และ\\s+|\\s*/\\s*", t)
    return [p.strip(" .,") for p in parts if p.strip(" .,")]

# จับ (ศนร. 2 ตู้) มูลค่า 7,820 ล้านบาท หรือ ศรย. 5 ตู้\\nมูลค่า ...
pair_re = re.compile(
    r"(?:\\(\\s*)?(ศ[\\wก-๙]+\\.?)\\s*(\\d+)\\s*ตู้\\s*\\)?(?:[^ม]*มูลค่า\\s*([\\d,]+(?:\\.\\d+)?)\\s*ล้านบาท)?",
    re.UNICODE,
)

for r in range(3, ws.max_row + 1):
    trip = ws.cell(r, 1).value
    route = ws.cell(r, 3).value
    cont = ws.cell(r, 4).value
    if trip is None or route is None or cont is None:
        continue
    m = re.search(r"(\\d+)", str(trip))
    if not m:
        continue
    trip_no = int(m.group(1))
    route_text = str(route).strip()
    if not route_text or route_text.lower() == "none":
        continue
    text = str(cont).replace("\\xa0", " ")
    allocations = []
    for m in pair_re.finditer(text):
        code = m.group(1).strip()
        containers = int(m.group(2))
        million = float((m.group(3) or "0").replace(",", "")) if m.group(3) else 0.0
        allocations.append({
            "code": code,
            "containers": containers,
            "cargoMillionBaht": million,
        })
    rows.append({
        "tripNo": trip_no,
        "routeText": route_text.replace("\\n", " - "),
        "stops": split_route(route_text),
        "allocations": allocations,
    })

print(json.dumps(rows, ensure_ascii=False))
`.trim();

  const scriptPath = path.join(os.tmpdir(), `export-dest-69-${Date.now()}.py`);
  fs.writeFileSync(scriptPath, py, "utf8");
  try {
    if (!fs.existsSync(xlsxPath)) throw new Error(`ไม่พบไฟล์: ${xlsxPath}`);
    const out = execFileSync("python", [scriptPath, xlsxPath], {
      encoding: "utf8",
      maxBuffer: 5 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    return JSON.parse(out) as TripDest[];
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      /* ignore */
    }
  }
}

function matchAlloc(stop: string, allocations: StopAlloc[]): StopAlloc | null {
  const key = normalizeStopKey(stop);
  return (
    allocations.find((a) => {
      const ak = normalizeStopKey(a.code);
      return ak === key || ak.includes(key) || key.includes(ak);
    }) ?? null
  );
}

async function main() {
  const xlsxPath = process.argv[2] || DEFAULT_XLSX;
  const trips = extractViaPython(xlsxPath);
  console.log(`อ่าน ${trips.length} ทริปจาก สรุป 69`);

  for (const t of trips) {
    const code = `TRIP-2569-${String(t.tripNo).padStart(2, "0")}`;
    const mission = await prisma.mission.findUnique({ where: { code } });
    if (!mission) {
      console.warn(`ข้าม ${code} — ไม่พบภารกิจ`);
      continue;
    }

    const stops = t.stops.length ? t.stops : splitRouteStops(t.routeText);
    if (!stops.length) {
      console.warn(`ข้าม ${code} — ไม่มีจุดส่งในเส้นทาง`);
      continue;
    }

    const destinations = stops.map((address, i) => {
      const alloc = matchAlloc(address, t.allocations);
      return {
        sortOrder: i,
        address,
        cargoValue: new Prisma.Decimal(
          alloc ? Math.round(alloc.cargoMillionBaht * 1_000_000) : 0,
        ),
        containerCount: alloc?.containers ?? 0,
      };
    });

    // ถ้า allocation ไม่ตรงชื่อ stop ใดเลย — ใส่ตามลำดับหลังต้นทาง
    const matchedAny = destinations.some((d) => d.containerCount > 0);
    if (!matchedAny && t.allocations.length) {
      let ai = 0;
      for (let i = 0; i < destinations.length && ai < t.allocations.length; i++) {
        // ข้ามต้นทางถ้ามี allocation น้อยกว่า stops
        if (i === 0 && destinations.length > t.allocations.length) continue;
        const a = t.allocations[ai++];
        destinations[i] = {
          sortOrder: i,
          address: destinations[i].address,
          cargoValue: new Prisma.Decimal(Math.round(a.cargoMillionBaht * 1_000_000)),
          containerCount: a.containers,
        };
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.missionDestination.deleteMany({ where: { missionId: mission.id } });
      await tx.mission.update({
        where: { id: mission.id },
        data: { destinations: { create: destinations } },
      });
    });

    console.log(
      `${code}:`,
      destinations.map((d) => `${d.address} ${d.containerCount}ตู้ ${d.cargoValue}บ.`).join(" · "),
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
