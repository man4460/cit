/**
 * นำเข้าประวัติการบำรุงรักษา — รถทะเบียน ฮว 5805 กทม. (จากตารางประวัติการซ่อม)
 * รัน: npm run seed:vehicle5805-maint
 */
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLATE_SUB = "5805";

const MAINTENANCE_ROWS: { date: string; detail: string; cost: string }[] = [
  {
    date: "2022-12-16T12:00:00.000Z",
    detail: "เปลี่ยนสายพานไทม์มิ่ง เช็คระยะ15000 กม และเปลี่ยนถ่ายน้ำมันเครื่อง ไส้กรอง",
    cost: "9362.45",
  },
  {
    date: "2023-08-03T12:00:00.000Z",
    detail: "ตรวจเช็คระยะ เปลี่ยนถ่ายน้ำมันเครื่อง",
    cost: "6136.88",
  },
  {
    date: "2023-08-11T12:00:00.000Z",
    detail: "เปลี่ยนสายพานเครื่อง และใบปัดน้ำฝน",
    cost: "1689.85",
  },
  { date: "2023-11-03T12:00:00.000Z", detail: "เปลี่ยนแบตเตอรี่", cost: "4269.57" },
  {
    date: "2023-11-21T12:00:00.000Z",
    detail: "เปลี่ยนเซ็นเซอร์ แอร์โฟว์ และชุดวาล์วควบคุมเบรก",
    cost: "62922.15",
  },
  {
    date: "2024-05-07T12:00:00.000Z",
    detail: "เปลี่ยนถ่ายน้ำมันเครื่องและชุดของเหลว",
    cost: "8930.22",
  },
  { date: "2024-05-20T12:00:00.000Z", detail: "เปลี่ยนกรองอากาศ", cost: "1114.14" },
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
      detail: {
        startsWith: "เปลี่ยนสายพานไทม์มิ่ง เช็คระยะ15000",
      },
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
