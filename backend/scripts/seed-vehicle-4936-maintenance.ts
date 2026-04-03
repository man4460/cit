/**
 * นำเข้าประวัติการบำรุงรักษา — รถทะเบียน 5 กธ 4936 กทม. (จากตารางประวัติการซ่อม)
 * รัน: npm run seed:vehicle4936-maint
 */
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLATE_SUB = "4936";

const MAINTENANCE_ROWS: { date: string; detail: string; cost: string }[] = [
  {
    date: "2023-03-13T12:00:00.000Z",
    detail: "ตรวจเช็คระยะ เปลี่ยนถ่ายน้ำมันเครื่อง ไส้กรอง เปลี่ยนหัวเทียน",
    cost: "9367.42",
  },
  {
    date: "2023-08-07T12:00:00.000Z",
    detail: "ตรวจเช็คระยะ เปลี่ยนถ่ายน้ำมันเครื่อง ไส้กรอง",
    cost: "6754.86",
  },
  {
    date: "2024-05-03T12:00:00.000Z",
    detail: "ตรวจเช็คระยะ เปลี่ยนถ่ายน้ำมันเครื่อง ไส้กรอง",
    cost: "7081.42",
  },
  { date: "2024-11-20T12:00:00.000Z", detail: "เปลี่ยนยางปัดน้ำฝน", cost: "1004.09" },
  { date: "2025-02-04T12:00:00.000Z", detail: "หลอดไฟหน้าด้านขวา", cost: "8103.65" },
  {
    date: "2025-02-14T12:00:00.000Z",
    detail: "เปลี่ยนผ้าเบรก เปลี่ยนน้ำมันเครื่อง เปลี่ยนกรองอากาศ",
    cost: "9894.66",
  },
  { date: "2025-02-17T12:00:00.000Z", detail: "เปลี่ยนยางรถยนต์", cost: "20800.00" },
];

const CONDITION_NOTES = `--- สภาพรถ (จากบันทึกประวัติการซ่อม — ทะเบียน 4936) ---
1) ออกตัวช้า โดยเฉพาะเมื่อต้องเร่งหรือแซง
2) มีเสียงดังจากใต้ท้องรถขณะขับหรือขับชนท้องแหลม — ควรตรวจซ่อมใต้ท้องให้ครบถ้วน
3) ตามมาตรฐานเมื่อถึง 100,000 กม. ควรตรวจ/เปลี่ยน: สายไทม์มิ่ง หัวเทียน ระบบเบรก ระบบหล่อเย็น ช่วงล่าง (โช้คอัพ บอลจอยน์ต บูชลิงก์สเตบิไลเซอร์ ฯลฯ)`;

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
      detail: "ตรวจเช็คระยะ เปลี่ยนถ่ายน้ำมันเครื่อง ไส้กรอง เปลี่ยนหัวเทียน",
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

  if (!vehicle.notes?.includes("สภาพรถ (จากบันทึกประวัติการซ่อม — ทะเบียน 4936)")) {
    const nextNotes = [vehicle.notes?.trim(), CONDITION_NOTES].filter(Boolean).join("\n\n");
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { notes: nextNotes },
    });
    console.log("อัปเดตหมายเหตุรถ: เพิ่มบันทึกสภาพรถจากตาราง");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
