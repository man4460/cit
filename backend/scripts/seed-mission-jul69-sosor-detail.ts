/**
 * นำเข้าบุคลากร / ค่าตอบแทน / น้ำมันรายคัน เข้า TRIP-2569-05 (14–17 ก.ค.69 ศสร.+ศหญ.)
 *
 * ไฟล์:
 *  - รายละเอียดค่าใช้จ่าย_ศสร_ศหญ_วันที่_14_17_ก_ค_69.xlsx  (ชีต ทะเบียนน้ำมัน)
 *  - ค่าตอบแทน ฝรภ (3).xlsx
 *  - ค่าตอบแทนตำรวจ (2).xlsx
 *
 * บุคลากร: จับคู่รหัส/ชื่อที่มีอยู่แล้ว — ไม่สร้างซ้ำ
 * น้ำมัน: แยกตามทะเบียนรถ — หลายคันในแถวหารลิตรเท่า ๆ กัน
 *
 *   npm run seed:missions:jul69-sosor
 */
import "dotenv/config";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { MissionVehicleFuelType, Prisma, PrismaClient } from "@prisma/client";
import {
  missionRoleFromFarabPosition,
  missionRoleFromPoliceUnit,
} from "../src/lib/missionRoleFromSource.js";
import { seedMissionMasterData } from "../src/lib/seedMissionMasters.js";
import { seedPersonnelMasterData } from "../src/lib/seedPersonnelMasters.js";

const prisma = new PrismaClient();

const MISSION_CODE = "TRIP-2569-05";
const TAG = "[กค69-ศสรศหญ]";

const EXPENSE_XLSX =
  process.env.JUL69_EXPENSE_XLSX ??
  String.raw`C:\Users\LENOVO\Downloads\Telegram Desktop\รายละเอียดค่าใช้จ่าย_ศสร_ศหญ_วันที่_14_17_ก_ค_69.xlsx`;
const FARAB_XLSX =
  process.env.JUL69_FARAB_XLSX ??
  String.raw`C:\Users\LENOVO\Downloads\Telegram Desktop\ค่าตอบแทน ฝรภ (3).xlsx`;
const POLICE_XLSX =
  process.env.JUL69_POLICE_XLSX ??
  String.raw`C:\Users\LENOVO\Downloads\Telegram Desktop\ค่าตอบแทนตำรวจ (2).xlsx`;

type FarabRow = {
  seq: number;
  empCode: string;
  rank: string;
  firstName: string;
  lastName: string;
  position: string;
  total: number;
};

type PoliceRow = {
  seq: number;
  rank: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  amount: number;
  unit: string;
  isPerson: boolean;
};

type FuelRow = {
  dateText: string;
  plates: string[];
  fuelKind: string;
  liters: number;
  amount: number;
};

type Extracted = { farab: FarabRow[]; police: PoliceRow[]; fuel: FuelRow[]; fuelTotalBaht: number };

function extractViaPython(): Extracted {
  const py = `
import json, openpyxl, re, sys

def plates_from(text):
    t = str(text or "")
    t = re.sub(r"^รถยนต์\\s*", "", t).strip()
    parts = [p.strip() for p in re.split(r"\\s*/\\s*", t) if p.strip()]
    return parts

def digits(s):
    return re.sub(r"\\D", "", str(s or ""))

farab_path, police_path, expense_path = sys.argv[1], sys.argv[2], sys.argv[3]

# --- ฝรภ. ---
wb = openpyxl.load_workbook(farab_path, data_only=True)
ws = wb.active
farab = []
for r in range(7, ws.max_row + 1):
    seq = ws.cell(r, 1).value
    if seq is None or str(seq).strip() == "รวม":
        break
    try:
        seq_n = int(seq)
    except Exception:
        continue
    farab.append({
        "seq": seq_n,
        "empCode": str(ws.cell(r, 2).value or "").strip(),
        "rank": str(ws.cell(r, 3).value or "").strip(),
        "firstName": str(ws.cell(r, 4).value or "").strip(),
        "lastName": str(ws.cell(r, 5).value or "").strip(),
        "position": str(ws.cell(r, 6).value or "").strip(),
        "total": float(ws.cell(r, 11).value or 0),
    })

# --- ตำรวจ ---
wb = openpyxl.load_workbook(police_path, data_only=True)
ws = wb.active
police = []
unit = ""
for r in range(1, ws.max_row + 1):
    a = ws.cell(r, 1).value
    b = ws.cell(r, 2).value
    c = ws.cell(r, 3).value
    if isinstance(a, str) and a.strip() and not str(a).strip().isdigit() and a.strip() not in ("ลำดับ", "รวมเงินทั้งหมด"):
        if "กอง" in a or "สถานี" in a:
            unit = a.strip()
        continue
    if a == "ลำดับ" or b == "ยศ":
        continue
    try:
        seq_n = int(a)
    except Exception:
        continue
    rank = str(b or "").strip()
    first = str(c or "").strip()
    last = str(ws.cell(r, 4).value or "").strip()
    idraw = ws.cell(r, 5).value
    amount = float(ws.cell(r, 6).value or 0)
    u = str(ws.cell(r, 7).value or unit).strip()
    id_digits = digits(idraw)
    is_person = bool(first and last and len(id_digits) >= 12)
    if not last and first and ("สถานี" in first or "กอง" in first):
        is_person = False
    if first and not last and len(id_digits) < 12:
        is_person = False
    # แถวยศเป็นชื่อหน่วยงาน (vendor)
    if ("กอง" in rank or "สถานี" in rank) and not last:
        is_person = False
    police.append({
        "seq": seq_n,
        "rank": rank,
        "firstName": first,
        "lastName": last,
        "idNumber": id_digits or str(idraw or "").strip(),
        "amount": amount,
        "unit": u,
        "isPerson": is_person,
    })

# --- น้ำมัน: ใช้ชีตทะเบียนน้ำมัน (เฉพาะทริปนี้) ไม่ใช่ทะเบียนควบคุมสะสม ---
wb = openpyxl.load_workbook(expense_path, data_only=True)
if "ทะเบียนน้ำมัน" in wb.sheetnames:
    ws = wb["ทะเบียนน้ำมัน"]
elif "ทะเบียนควบคุมน้ำมัน" in wb.sheetnames:
    ws = wb["ทะเบียนควบคุมน้ำมัน"]
else:
    ws = wb.active
fuel = []
for r in range(1, ws.max_row + 1):
    date = ws.cell(r, 1).value
    plates_cell = ws.cell(r, 3).value
    kind = ws.cell(r, 6).value
    liters = ws.cell(r, 7).value
    amount = ws.cell(r, 8).value
    if date is None or plates_cell is None or liters is None:
        continue
    ds = str(date).strip()
    if not ds or "/" not in ds:
        continue
    # กรองเฉพาะ ก.ค.69
    if "/7/" not in ds and "/07/" not in ds:
        continue
    fuel.append({
        "dateText": ds,
        "plates": plates_from(plates_cell),
        "fuelKind": str(kind or "").strip(),
        "liters": float(liters or 0),
        "amount": float(amount or 0),
    })
fuel_total = sum(x["amount"] for x in fuel)

print(json.dumps({"farab": farab, "police": police, "fuel": fuel, "fuelTotalBaht": fuel_total}, ensure_ascii=False))
`.trim();

  const scriptPath = path.join(os.tmpdir(), `export-jul69-${Date.now()}.py`);
  fs.writeFileSync(scriptPath, py, "utf8");
  try {
    for (const p of [EXPENSE_XLSX, FARAB_XLSX, POLICE_XLSX]) {
      if (!fs.existsSync(p)) throw new Error(`ไม่พบไฟล์: ${p}`);
    }
    const out = execFileSync("python", [scriptPath, FARAB_XLSX, POLICE_XLSX, EXPENSE_XLSX], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    return JSON.parse(out) as Extracted;
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      /* ignore */
    }
  }
}

function normalizePlateKey(raw: string): string {
  return raw.replace(/\s+/g, " ").replace(/\s*กทม\.?\s*$/i, "").trim().toLowerCase();
}

function findVehicleId(vehicles: { id: string; licensePlate: string }[], plateToken: string): string | null {
  const key = normalizePlateKey(plateToken);
  const hit = vehicles.find((v) => {
    const vp = normalizePlateKey(v.licensePlate);
    return vp === key || vp.includes(key) || key.includes(vp);
  });
  return hit?.id ?? null;
}

async function ensureOrg(name: string, sortOrder: number): Promise<string> {
  const row = await prisma.organizationUnitType.upsert({
    where: { name },
    create: { name, sortOrder },
    update: { sortOrder },
  });
  return row.id;
}

async function ensurePersonnel(opts: {
  fullName: string;
  idNumber: string;
  rank?: string;
  position?: string;
  orgUnitId?: string | null;
}): Promise<{ id: string; reused: boolean }> {
  const fullName = opts.fullName.replace(/\s+/g, " ").trim();
  const byId = await prisma.personnel.findUnique({ where: { idNumber: opts.idNumber } });
  if (byId) {
    await prisma.personnel.update({
      where: { id: byId.id },
      data: {
        fullName: byId.fullName || fullName,
        rank: opts.rank || byId.rank,
        position: opts.position || byId.position,
        organizationUnitTypeId: opts.orgUnitId ?? byId.organizationUnitTypeId,
      },
    });
    return { id: byId.id, reused: true };
  }
  const byName = await prisma.personnel.findFirst({ where: { fullName } });
  if (byName) {
    await prisma.personnel.update({
      where: { id: byName.id },
      data: {
        rank: opts.rank || byName.rank,
        position: opts.position || byName.position,
        organizationUnitTypeId: opts.orgUnitId ?? byName.organizationUnitTypeId,
      },
    });
    return { id: byName.id, reused: true };
  }
  const created = await prisma.personnel.create({
    data: {
      fullName,
      idNumber: opts.idNumber,
      rank: opts.rank || null,
      position: opts.position || null,
      organizationUnitTypeId: opts.orgUnitId ?? null,
    },
  });
  return { id: created.id, reused: false };
}

async function main() {
  await seedPersonnelMasterData();
  await seedMissionMasterData();

  const mission = await prisma.mission.findUnique({ where: { code: MISSION_CODE } });
  if (!mission) throw new Error(`ไม่พบภารกิจ ${MISSION_CODE}`);

  const data = extractViaPython();
  console.log(
    `อ่าน: ฝรภ. ${data.farab.length} · ตำรวจ ${data.police.filter((p) => p.isPerson).length} คน (+ไม่ใช่บุคคล ${data.police.filter((p) => !p.isPerson).length}) · น้ำมัน ${data.fuel.length} แถว (${data.fuelTotalBaht} บาท)`,
  );

  const roles = await prisma.missionPersonnelRoleMaster.findMany();
  const roleId = (name: string) => {
    const r = roles.find((x) => x.name === name);
    if (!r) throw new Error(`ไม่มีบทบาท ${name}`);
    return r.id;
  };

  const vRoles = await prisma.missionVehicleRoleMaster.findMany();
  const vRoleId = (name: string) => {
    const r = vRoles.find((x) => x.name === name);
    if (!r) throw new Error(`ไม่มีบทบาทรถ ${name}`);
    return r.id;
  };

  const orgFarab = await ensureOrg("ฝ่ายรักษาความปลอดภัย", 0);
  const orgPolice = await ensureOrg("ตำรวจ / ประสาน", 2);
  const vehicles = await prisma.vehicle.findMany({ select: { id: true, licensePlate: true } });

  const personnelLinks: {
    personnelId: string;
    personnelRoleId: string;
    compensationRate: Prisma.Decimal;
  }[] = [];
  const seenPersonnel = new Set<string>();
  let reusedCount = 0;
  let createdCount = 0;

  for (const row of data.farab) {
    const fullName = `${row.firstName} ${row.lastName}`.replace(/\s+/g, " ").trim();
    const idNumber = row.empCode || `SEED-FARAB-JUL69-${row.seq}`;
    const { id: personnelId, reused } = await ensurePersonnel({
      fullName,
      idNumber,
      rank: row.rank,
      position: row.position,
      orgUnitId: orgFarab,
    });
    if (reused) reusedCount++;
    else createdCount++;
    if (seenPersonnel.has(personnelId)) {
      console.warn(`  ข้ามซ้ำในทริปนี้: ${fullName}`);
      continue;
    }
    seenPersonnel.add(personnelId);
    personnelLinks.push({
      personnelId,
      personnelRoleId: roleId(missionRoleFromFarabPosition(row.position)),
      compensationRate: new Prisma.Decimal(row.total),
    });
    console.log(`  ฝรภ. ${row.seq}. ${row.rank} ${fullName} · ${row.total}${reused ? " (มีอยู่แล้ว)" : " (สร้างใหม่)"}`);
  }

  for (const row of data.police.filter((p) => p.isPerson)) {
    const fullName = `${row.firstName} ${row.lastName}`.replace(/\s+/g, " ").trim();
    const idNumber =
      row.idNumber.length >= 12 ? row.idNumber : `SEED-POLICE-JUL69-${row.seq}-${row.idNumber}`;
    const { id: personnelId, reused } = await ensurePersonnel({
      fullName,
      idNumber,
      rank: row.rank,
      position: row.unit,
      orgUnitId: orgPolice,
    });
    if (reused) reusedCount++;
    else createdCount++;
    if (seenPersonnel.has(personnelId)) {
      console.warn(`  ข้ามซ้ำในทริปนี้: ${fullName}`);
      continue;
    }
    seenPersonnel.add(personnelId);
    personnelLinks.push({
      personnelId,
      personnelRoleId: roleId(missionRoleFromPoliceUnit(row.unit)),
      compensationRate: new Prisma.Decimal(row.amount),
    });
    console.log(`  ตร. ${row.seq}. ${row.rank} ${fullName} · ${row.amount}${reused ? " (มีอยู่แล้ว)" : " (สร้างใหม่)"}`);
  }

  const fuelByVehicle = new Map<
    string,
    { liters: number; fuelType: MissionVehicleFuelType; roleName: string; amount: number }
  >();
  for (const row of data.fuel) {
    if (!row.plates.length || row.liters <= 0) continue;
    const fuelType = row.fuelKind.includes("ดีเซล")
      ? MissionVehicleFuelType.DIESEL
      : MissionVehicleFuelType.GASOLINE;
    const roleName = fuelType === MissionVehicleFuelType.GASOLINE ? "รถหลัก" : "รถกำกับ / คุ้มกัน";
    const shareL = row.liters / row.plates.length;
    const shareBaht = row.amount / row.plates.length;
    for (const plate of row.plates) {
      const vid = findVehicleId(vehicles, plate);
      if (!vid) {
        console.warn(`  ไม่พบรถ: ${plate}`);
        continue;
      }
      const cur = fuelByVehicle.get(vid) ?? { liters: 0, fuelType, roleName, amount: 0 };
      cur.liters += shareL;
      cur.amount += shareBaht;
      cur.fuelType = fuelType;
      cur.roleName = roleName;
      fuelByVehicle.set(vid, cur);
    }
  }

  const vehicleLinks = [...fuelByVehicle.entries()].map(([vehicleId, f]) => ({
    vehicleId,
    vehicleRoleId: vRoleId(f.roleName),
    fuelLiters: new Prisma.Decimal(Math.round(f.liters * 1000) / 1000),
    fuelType: f.fuelType,
  }));

  for (const [vid, f] of fuelByVehicle) {
    const plate = vehicles.find((v) => v.id === vid)?.licensePlate ?? vid;
    console.log(`  น้ำมัน ${plate}: ${f.fuelType} ${f.liters.toFixed(3)} ล. (~${f.amount.toFixed(0)} บาท)`);
  }

  const fuelExpenseType = await prisma.missionExpenseTypeMaster.findUnique({
    where: { name: "ค่าน้ำมัน / เชื้อเพลิง" },
  });

  await prisma.$transaction(async (tx) => {
    await tx.missionPersonnel.deleteMany({ where: { missionId: mission.id } });
    await tx.missionVehicle.deleteMany({ where: { missionId: mission.id } });

    if (fuelExpenseType) {
      await tx.missionExpense.deleteMany({
        where: { missionId: mission.id, expenseTypeId: fuelExpenseType.id },
      });
      await tx.missionExpense.create({
        data: {
          missionId: mission.id,
          expenseTypeId: fuelExpenseType.id,
          amount: new Prisma.Decimal(data.fuelTotalBaht || 34075),
          description: `${TAG} ค่าน้ำมันตามทะเบียน (${vehicleLinks.length} คัน)`,
          incurredAt: mission.plannedStart ?? new Date(Date.UTC(2026, 6, 14, 12)),
        },
      });
    }

    await tx.mission.update({
      where: { id: mission.id },
      data: {
        personnel: { create: personnelLinks },
        vehicles: { create: vehicleLinks },
      },
    });
  });

  console.log(
    `\nอัปเดต ${MISSION_CODE}: บุคคล ${personnelLinks.length} · รถ/น้ำมัน ${vehicleLinks.length} คัน · ค่าน้ำมัน ${data.fuelTotalBaht.toLocaleString("th-TH")} บาท`,
  );
  console.log(`บุคลากร: ใช้ของเดิม ${reusedCount} · สร้างใหม่ ${createdCount} (ไม่ซ้ำในทะเบียน)`);
  console.log("หมายเหตุ: หมวดค่าใช้จ่ายอื่นจากสถิติ Trip คงไว้ · ค่าตอบแทนผูกที่อัตราบุคลากรรายคน");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
