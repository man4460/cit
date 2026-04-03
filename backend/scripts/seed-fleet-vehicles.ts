/**
 * นำเข้าทะเบียนรถจากสเปรดชีต (15 คัน)
 * รัน: npm run seed:fleet
 *
 * อัปเดตเมื่อทะเบียนหรือรหัสครุภัณฑ์ตรงกับข้อมูลเดิม
 */
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Row = {
  brand: string;
  model: string;
  purchase: string;
  transfer: string;
  licensePlate: string;
  assetCode: string;
  cctr: string;
  fuel: string;
  mileage: number;
  survey?: string;
  remark: string;
};

const FLEET_ROWS: Row[] = [
  {
    brand: "Toyota",
    model: "Fortuner",
    purchase: "30/6/2014",
    transfer: "30/6/2014",
    licensePlate: "3 กฉ 4830 กทม.",
    assetCode: "30109428",
    cctr: "48004",
    fuel: "ดีเซล",
    mileage: 256660,
    survey: "5-ก.พ.-69",
    remark: "เตรียมส่งคืน",
  },
  {
    brand: "Toyota",
    model: "Fortuner",
    purchase: "28/9/2015",
    transfer: "28/9/2015",
    licensePlate: "4 กน 5682 กทม.",
    assetCode: "30111726",
    cctr: "48004",
    fuel: "ดีเซล",
    mileage: 240983,
    survey: "5-ก.พ.-69",
    remark: "",
  },
  {
    brand: "Toyota",
    model: "Ventury",
    purchase: "26/7/2016",
    transfer: "26/7/2016",
    licensePlate: "ฮว 5804 กทม.",
    assetCode: "30122304",
    cctr: "48004",
    fuel: "ดีเซล",
    mileage: 193283,
    survey: "5-ก.พ.-69",
    remark: "",
  },
  {
    brand: "Toyota",
    model: "Ventury",
    purchase: "26/7/2016",
    transfer: "26/7/2016",
    licensePlate: "ฮว 5805 กทม.",
    assetCode: "30122305",
    cctr: "48004",
    fuel: "ดีเซล",
    mileage: 175501,
    survey: "5-ก.พ.-69",
    remark: "",
  },
  {
    brand: "Toyota",
    model: "Ventury",
    purchase: "28/9/2015",
    transfer: "28/9/2015",
    licensePlate: "ฮล 7136 กทม.",
    assetCode: "30111731",
    cctr: "48004",
    fuel: "ดีเซล",
    mileage: 122587,
    survey: "5-ก.พ.-69",
    remark: "",
  },
  {
    brand: "Toyota",
    model: "Ventury",
    purchase: "28/9/2015",
    transfer: "28/9/2015",
    licensePlate: "ฮล 7137 กทม.",
    assetCode: "30111732",
    cctr: "48004",
    fuel: "ดีเซล",
    mileage: 108658,
    survey: "5-ก.พ.-69",
    remark: "",
  },
  {
    brand: "Toyota",
    model: "Camry",
    purchase: "28/11/2016",
    transfer: "28/11/2016",
    licensePlate: "5 กธ 4933 กทม.",
    assetCode: "30124794",
    cctr: "48004",
    fuel: "เบนซิน",
    mileage: 143962,
    survey: "5-ก.พ.-69",
    remark: "เตรียมส่งคืน",
  },
  {
    brand: "Toyota",
    model: "Camry",
    purchase: "28/11/2016",
    transfer: "28/11/2016",
    licensePlate: "5 กธ 4936 กทม.",
    assetCode: "30124795",
    cctr: "48004",
    fuel: "เบนซิน",
    mileage: 150439,
    survey: "5-ก.พ.-69",
    remark: "เตรียมส่งคืน",
  },
  {
    brand: "Honda",
    model: "Accord",
    purchase: "6/12/2016",
    transfer: "6/12/2016",
    licensePlate: "5 กล 1160 กทม.",
    assetCode: "30124793",
    cctr: "48004",
    fuel: "เบนซิน",
    mileage: 130544,
    survey: "5-ก.พ.-69",
    remark: "เตรียมส่งคืน",
  },
  {
    brand: "Honda",
    model: "Accord",
    purchase: "6/12/2016",
    transfer: "6/12/2016",
    licensePlate: "5 กล 1165 กทม.",
    assetCode: "30124792",
    cctr: "48004",
    fuel: "เบนซิน",
    mileage: 160149,
    survey: "5-ก.พ.-69",
    remark: "เตรียมส่งคืน",
  },
  {
    brand: "ISUZU",
    model: "MU-X",
    purchase: "4/8/2015",
    transfer: "4/8/2015",
    licensePlate: "4 กต 8593 กทม.",
    assetCode: "30111727",
    cctr: "48004",
    fuel: "ดีเซล",
    mileage: 89653,
    survey: "5-ก.พ.-69",
    remark: "รับมาจาก ศสป.",
  },
  {
    brand: "Honda",
    model: "Accord",
    purchase: "17/12/2019",
    transfer: "22/10/2025",
    licensePlate: "9 กต 2115 กทม.",
    assetCode: "30133289",
    cctr: "38997(เดิม)",
    fuel: "เบนซิน (กองปราบ)",
    mileage: 59664,
    survey: "5-ก.พ.-69",
    remark: "ผอส.โสภี สงวนดีกุล ฝจอ.",
  },
  {
    brand: "Honda",
    model: "Accord",
    purchase: "16/3/2020",
    transfer: "22/10/2025",
    licensePlate: "9 กว 2711 กทม.",
    assetCode: "30134341",
    cctr: "38997(เดิม)",
    fuel: "เบนซิน (ทางหลวง)",
    mileage: 68615,
    survey: "5-ก.พ.-69",
    remark: "ผอส.ปราณี สุทธศรี ฝสม.",
  },
  {
    brand: "Honda",
    model: "Accord",
    purchase: "16/3/2020",
    transfer: "22/10/2025",
    licensePlate: "9 กว 2730 กทม.",
    assetCode: "30134342",
    cctr: "38997(เดิม)",
    fuel: "เบนซิน (ทางหลวง)",
    mileage: 95315,
    remark: "ผอส.สุดารัตน์ กิจพิพงษ์ ฝทส.",
  },
  {
    brand: "Honda",
    model: "Accord",
    purchase: "16/3/2020",
    transfer: "22/10/2025",
    licensePlate: "9 กว 2735 กทม.",
    assetCode: "30134343",
    cctr: "38997(เดิม)",
    fuel: "เบนซิน (กองปราบ)",
    mileage: 79143,
    remark: "ผส.ธาริธธิ์ ปั้นเปี่ยมรัษฎ์",
  },
];

function vehicleTypeNameForModel(model: string): string {
  const m = model.trim();
  if (/Ventury/i.test(m)) return "รถตู้";
  if (/Fortuner|MU-X|MU[Xx]/i.test(m)) return "รถกระบะ";
  if (/Camry|Accord/i.test(m)) return "รถเก๋ง";
  return "อื่นๆ";
}

/** DD/MM/YYYY → Date (เที่ยง UTC เพื่อลดปัญหา timezone ตอนแสดงเป็นวันที่) */
function parseDdMmYyyy(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  const year = parseInt(m[3], 10);
  const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function buildNotes(r: Row): string {
  const lines = [
    `ปีจัดซื้อ (ตามทะเบียน): ${r.purchase}`,
    `รับโอน: ${r.transfer}`,
    `ศูนย์ต้นทุน (Cctr): ${r.cctr}`,
    `ประเภทน้ำมัน: ${r.fuel}`,
  ];
  if (r.survey?.trim()) lines.push(`วันสำรวจ: ${r.survey}`);
  if (r.remark.trim()) lines.push(`หมายเหตุ: ${r.remark}`);
  return lines.join("\n");
}

function statusNameForRow(r: Row): string {
  if (r.remark.includes("เตรียมส่งคืน")) return "เตรียมส่งคืน";
  return "ใช้งานปกติ";
}

async function ensureVehicleStatus(name: string): Promise<string> {
  let row = await prisma.vehicleStatus.findUnique({ where: { name } });
  if (!row) {
    const max = await prisma.vehicleStatus.aggregate({ _max: { sortOrder: true } });
    row = await prisma.vehicleStatus.create({
      data: { name, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
    console.log(`สร้างสถานะรถ: ${name}`);
  }
  return row.id;
}

async function ensureWorkCategoryGroup(name: string): Promise<string> {
  let row = await prisma.workCategoryGroup.findUnique({ where: { name } });
  if (!row) {
    const max = await prisma.workCategoryGroup.aggregate({ _max: { sortOrder: true } });
    row = await prisma.workCategoryGroup.create({
      data: { name, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
    console.log(`สร้างกลุ่มประเภทการทำงาน: ${name}`);
  }
  return row.id;
}

async function main() {
  const statusNormalId = await ensureVehicleStatus("ใช้งานปกติ");
  const statusReturnId = await ensureVehicleStatus("เตรียมส่งคืน");
  const workGroupId = await ensureWorkCategoryGroup("ประจำฐาน / สาขา");

  let created = 0;
  let updated = 0;

  for (const r of FLEET_ROWS) {
    const typeName = vehicleTypeNameForModel(r.model);
    const vt = await prisma.vehicleType.findUnique({ where: { name: typeName } });
    const statusId = statusNameForRow(r) === "เตรียมส่งคืน" ? statusReturnId : statusNormalId;
    const bm = `${r.brand} ${r.model}`.trim();
    const notes = buildNotes(r);
    const purchasedAt = parseDdMmYyyy(r.purchase);

    const payload = {
      brandModel: bm,
      brand: r.brand,
      model: r.model,
      licensePlate: r.licensePlate.trim(),
      assetCode: r.assetCode.trim(),
      currentMileage: new Prisma.Decimal(r.mileage),
      vehicleTypeId: vt?.id ?? null,
      workCategoryGroupId: workGroupId,
      vehicleStatusId: statusId,
      notes,
      purchasedAt,
    };

    const byPlate = await prisma.vehicle.findUnique({ where: { licensePlate: r.licensePlate.trim() } });
    const byAsset =
      !byPlate && r.assetCode.trim()
        ? await prisma.vehicle.findUnique({ where: { assetCode: r.assetCode.trim() } })
        : null;
    const existing = byPlate ?? byAsset;

    if (existing) {
      await prisma.vehicle.update({
        where: { id: existing.id },
        data: {
          ...payload,
          licensePlate: r.licensePlate.trim(),
        },
      });
      updated++;
      console.log(`อัปเดต ${r.licensePlate} (${r.assetCode})`);
    } else {
      await prisma.vehicle.create({ data: payload });
      created++;
      console.log(`เพิ่ม ${r.licensePlate} (${r.assetCode})`);
    }
  }

  console.log(`\nเสร็จ: เพิ่ม ${created} คัน, อัปเดต ${updated} คัน (รวม ${FLEET_ROWS.length} แถว)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
