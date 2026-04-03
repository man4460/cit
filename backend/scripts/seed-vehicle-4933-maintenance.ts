/**
 * นำเข้าประวัติการบำรุงรักษา — รถทะเบียน 5 กธ 4933 กทม. (จากตารางประวัติการซ่อม)
 * รัน: npm run seed:vehicle4933-maint
 */
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLATE_SUB = "4933";

const MAINTENANCE_ROWS: { date: string; detail: string; cost: string }[] = [
  {
    date: "2023-03-13T12:00:00.000Z",
    detail: "ตรวจเช็คระยะ เปลี่ยนถ่ายน้ำมันเครื่อง เปลี่ยนหัวเทียน ปะเก็นวาล์ว",
    cost: "9316.06",
  },
  { date: "2023-06-14T12:00:00.000Z", detail: "ซ่อมระบบแอร์", cost: "12197.79" },
  { date: "2023-06-16T12:00:00.000Z", detail: "เปลี่ยนคอมฯ", cost: "15514.73" },
  { date: "2023-08-25T12:00:00.000Z", detail: "เปลี่ยนแบตเตอรี่", cost: "2407.50" },
  {
    date: "2023-11-27T12:00:00.000Z",
    detail: "เปลี่ยนหลอดไฟใหญ่ด้านขวา",
    cost: "8017.24",
  },
  {
    date: "2024-05-03T12:00:00.000Z",
    detail: "ตรวจเช็คระยะ เปลี่ยนถ่ายน้ำมันเครื่อง",
    cost: "6867.42",
  },
  { date: "2024-05-20T12:00:00.000Z", detail: "เปลี่ยนลูกหมากกันโครง", cost: "4520.22" },
  { date: "2024-07-02T12:00:00.000Z", detail: "ถอดล้างตู้แอร์", cost: "5045.48" },
  { date: "2024-11-20T12:00:00.000Z", detail: "เปลี่ยนยางปัดน้ำฝน", cost: "1004.09" },
  { date: "2025-02-14T12:00:00.000Z", detail: "เปลี่ยนยางรถยนต์", cost: "20800.00" },
  { date: "2025-02-24T12:00:00.000Z", detail: "เปลี่ยนผ้าเบรกหน้า", cost: "3000.00" },
];

const CONDITION_NOTES = `--- สภาพรถ (จากบันทึกประวัติการซ่อม — ทะเบียน 4933) ---
1) พบซากสัตว์ (จิ้งจก) ตายในรถ — ล้างพรม ที่นั่ง ตู้แอร์ แล้ว แต่ยังมีกลิ่นค้าง
2) ออกตัวช้า เร่งไม่ทันในสถานการณ์เร่งด่วนหรือการแซง
3) มีเสียงดังจากใต้ท้องรถขณะขับหรือขับชนท้องแหลม — ควรตรวจซ่อมช่วงล่างทั้งระบบ
4) ตามมาตรฐานเมื่อถึง 100,000 กม. ควรตรวจ/เปลี่ยน: สายไทม์มิ่ง หัวเทียน ระบบเบรก ระบบหล่อเย็น ช่วงล่าง (โช้คอัพ ข้อต่อต่างๆ บูชลิงก์สเตบิไลเซอร์ ฯลฯ)`;

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
      detail: "ตรวจเช็คระยะ เปลี่ยนถ่ายน้ำมันเครื่อง เปลี่ยนหัวเทียน ปะเก็นวาล์ว",
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

  if (!vehicle.notes?.includes("สภาพรถ (จากบันทึกประวัติการซ่อม — ทะเบียน 4933)")) {
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
