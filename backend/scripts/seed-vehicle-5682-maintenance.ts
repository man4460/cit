/**
 * นำเข้าประวัติการบำรุงรักษา — รถทะเบียน 4 กน 5682 กทม. (จากตารางประวัติการซ่อม)
 * แถวแรกในตารางไม่ระบุจำนวนเงิน — บันทึกเป็น 0 บาท (ยอดรวมตรงตาราง)
 * รัน: npm run seed:vehicle5682-maint
 */
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLATE_SUB = "5682";

const MAINTENANCE_ROWS: { date: string; detail: string; cost: string }[] = [
  {
    date: "2022-12-06T12:00:00.000Z",
    detail: "เปลี่ยนผ้าเบรค และ เปลี่ยนถ่ายน้ำมันเครื่อง",
    cost: "0",
  },
  { date: "2023-07-03T12:00:00.000Z", detail: "ซ่อมระบบเบรก", cost: "500.23" },
  {
    date: "2023-08-03T12:00:00.000Z",
    detail: "ตรวจเช็คระยะเปลี่ยนถ่ายน้ำมันเครื่อง",
    cost: "8106.27",
  },
  { date: "2023-08-25T12:00:00.000Z", detail: "เปลี่ยนแบตเตอรี่", cost: "3424.00" },
  {
    date: "2024-02-20T12:00:00.000Z",
    detail: "ตรวจเช็คระยะเปลี่ยนถ่ายน้ำมันเครื่อง",
    cost: "6214.67",
  },
  { date: "2024-09-11T12:00:00.000Z", detail: "เปลี่ยนยางรถยนต์ 4 เส้น", cost: "19200.00" },
  { date: "2025-01-23T12:00:00.000Z", detail: "เปลี่ยนสวิทช์ไฟเบรค", cost: "516.00" },
  {
    date: "2025-02-03T12:00:00.000Z",
    detail: "ตรวจเช็คระยะเปลี่ยนถ่ายน้ำมันเครื่อง",
    cost: "4725.87",
  },
  {
    date: "2025-02-17T12:00:00.000Z",
    detail: "เปลี่ยนลูกปืนล้อ ยางปัดน้ำฝน กรองแอร์",
    cost: "7088.80",
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
      detail: "เปลี่ยนผ้าเบรค และ เปลี่ยนถ่ายน้ำมันเครื่อง",
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
