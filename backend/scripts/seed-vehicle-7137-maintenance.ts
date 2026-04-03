/**
 * นำเข้าประวัติการบำรุงรักษา — รถทะเบียน ฮล 7137 กทม. (จากตารางประวัติการซ่อม)
 * รัน: npm run seed:vehicle7137-maint
 */
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLATE_SUB = "7137";

const MAINTENANCE_ROWS: { date: string; detail: string; cost: string }[] = [
  {
    date: "2023-05-29T12:00:00.000Z",
    detail: "ตรวจเช็คระยะ เปลี่ยนถ่ายน้ำมันเครื่อง กรองน้ำมันเครื่อง ทำความสะอาดตู้แอร์",
    cost: "5934.92",
  },
  { date: "2023-08-28T12:00:00.000Z", detail: "เปลี่ยนแบตเตอรี่", cost: "3424.00" },
  { date: "2023-10-31T12:00:00.000Z", detail: "เปลี่ยนยางรถยนต์", cost: "13200.00" },
  {
    date: "2024-05-08T12:00:00.000Z",
    detail: "ตรวจเช็คระยะ เปลี่ยนถ่ายน้ำมันเครื่อง",
    cost: "4369.24",
  },
  {
    date: "2024-05-20T12:00:00.000Z",
    detail: "เปลี่ยนสายพานเครื่อง และลูกปืนเพลา",
    cost: "17582.99",
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
      detail:
        "ตรวจเช็คระยะ เปลี่ยนถ่ายน้ำมันเครื่อง กรองน้ำมันเครื่อง ทำความสะอาดตู้แอร์",
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
