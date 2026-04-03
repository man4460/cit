/**
 * นำเข้าประวัติการบำรุงรักษา — รถทะเบียน 9 กว 2730 กทม. (จากตารางประวัติการซ่อม)
 * รัน: npm run seed:vehicle2730-maint
 */
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLATE_SUB = "2730";

const ROW = {
  date: "2026-01-20T12:00:00.000Z",
  detail: "ตรวจเช็คระยะเปลี่ยนถ่ายน้ำมันเครื่อง เปลี่ยนเบ้ากุญแจ เปลี่ยนแบตเตอรี่",
  cost: "11689.75",
};

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
      detail: { contains: "เบ้ากุญแจ" },
    },
  });
  if (dup) {
    console.log(`รถ ${vehicle.licensePlate} มีประวัติรายการนี้แล้ว — ข้าม`);
    return;
  }

  await prisma.maintenanceLog.create({
    data: {
      vehicleId: vehicle.id,
      date: new Date(ROW.date),
      detail: ROW.detail,
      cost: new Prisma.Decimal(ROW.cost),
    },
  });

  console.log(`เพิ่ม 1 รายการบำรุงรักษา — ${vehicle.licensePlate} (${ROW.cost} บาท)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
