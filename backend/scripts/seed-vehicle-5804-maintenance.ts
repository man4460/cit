/**
 * นำเข้าประวัติการบำรุงรักษา — รถทะเบียน ฮว 5804 กทม. (จากตารางประวัติการซ่อม)
 * รัน: npm run seed:vehicle5804-maint
 */
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLATE_SUB = "5804";

const MAINTENANCE_ROWS: { date: string; detail: string; cost: string }[] = [
  {
    date: "2022-12-16T12:00:00.000Z",
    detail: "เปลี่ยนสายพานไทม์มิ่ง เช็คระยะ 15000 กม ถ่ายน้ำมันเครื่อง",
    cost: "8819.96",
  },
  {
    date: "2023-08-03T12:00:00.000Z",
    detail: "ตรวจเช็คระยะเปลี่ยนถ่ายน้ำมันเครื่อง",
    cost: "8666.25",
  },
  { date: "2023-11-03T12:00:00.000Z", detail: "เปลี่ยนแบตเตอรี่", cost: "4269.57" },
  { date: "2024-04-05T12:00:00.000Z", detail: "เปลี่ยนลูกลอยถังน้ำมัน", cost: "4106.39" },
  {
    date: "2024-05-07T12:00:00.000Z",
    detail: "ตรวจเช็คระยะเปลี่ยนถ่ายน้ำมันเครื่อง",
    cost: "4369.24",
  },
  { date: "2024-05-14T12:00:00.000Z", detail: "เปลี่ยนผ้าเบรก", cost: "3565.24" },
  {
    date: "2025-01-25T12:00:00.000Z",
    detail: "เซ็นเซอร์เพลาข้อเหวี่ยง และ แบตเตอรี่แคลเซียม 105D31RMF",
    cost: "8475.95",
  },
  {
    date: "2026-01-26T12:00:00.000Z",
    detail: "เปลี่ยนโช้คหลัง และเปลี่ยนสายพานหน้าเครื่อง",
    cost: "7360.58",
  },
];

async function main() {
  const vehicle = await prisma.vehicle.findFirst({
    where: { licensePlate: { contains: PLATE_SUB } },
  });
  if (!vehicle) {
    console.error(`ไม่พบรถที่ทะเบียนมี "${PLATE_SUB}" — รัน seed:fleet ก่อนหรือเพิ่มรถในระบบ`);
    process.exit(1);
  }

  const dup = await prisma.maintenanceLog.findFirst({
    where: {
      vehicleId: vehicle.id,
      detail: "เปลี่ยนสายพานไทม์มิ่ง เช็คระยะ 15000 กม ถ่ายน้ำมันเครื่อง",
    },
  });
  if (dup) {
    console.log(`รถ ${vehicle.licensePlate} มีประวัติชุดนี้แล้ว — ข้าม`);
    return;
  }

  await prisma.maintenanceLog.createMany({
    data: MAINTENANCE_ROWS.map((r) => ({
      vehicleId: vehicle.id,
      date: new Date(r.date),
      detail: r.detail,
      cost: new Prisma.Decimal(r.cost),
    })),
  });

  const sum = MAINTENANCE_ROWS.reduce((a, r) => a + Number(r.cost), 0);
  console.log(`เพิ่ม ${MAINTENANCE_ROWS.length} รายการบำรุงรักษา — ${vehicle.licensePlate} (รวม ~${sum.toFixed(2)} บาท)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
