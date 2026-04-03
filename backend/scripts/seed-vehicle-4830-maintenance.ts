/**
 * นำเข้าประวัติการบำรุงรักษา — รถทะเบียน 3 กฉ 4830 กทม. (จากตารางประวัติการซ่อม)
 * รัน: npm run seed:vehicle4830-maint
 */
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLATE_SUB = "4830";

const MAINTENANCE_ROWS: { date: string; detail: string; cost: string }[] = [
  { date: "2023-02-01T12:00:00.000Z", detail: "เปลี่ยนไฟหน้าทั้งชุด", cost: "23732.60" },
  {
    date: "2023-05-29T12:00:00.000Z",
    detail: "เปลี่ยนถ่ายน้ำมันเครื่อง น้ำมันเฟืองท้าย น้ำยาหล่อเย็น วาล์ว",
    cost: "10614.45",
  },
  { date: "2023-06-14T12:00:00.000Z", detail: "เปลี่ยนผ้าเบรก", cost: "7470.63" },
  { date: "2023-08-28T12:00:00.000Z", detail: "เปลี่ยนแบตเตอรี่", cost: "3424.00" },
  { date: "2024-03-08T12:00:00.000Z", detail: "เปลี่ยนสวิทช์ไฟเบรก", cost: "513.87" },
  {
    date: "2024-09-03T12:00:00.000Z",
    detail: "ตรวจเช็คระยะเปลี่ยนถ่ายน้ำมันเครื่อง",
    cost: "4557.56",
  },
  { date: "2024-09-11T12:00:00.000Z", detail: "เปลี่ยนยางรถยนต์ 4 เส้น", cost: "19200.00" },
  { date: "2024-09-11T12:00:00.000Z", detail: "เปลี่ยนน็อตเพลาลูกเบี้ยว", cost: "750.00" },
];

const CONDITION_NOTES = `--- สภาพรถ (จากบันทึกประวัติการซ่อม — ทะเบียน 4830) ---
1) เกียร์เข้ายาก/กระตุก — ข้อมูลจาก ทยพ. ระบุว่าเคยเปลี่ยนชุดเกียร์ทั้งชุดมาก่อน
2) รถออกตัวไม่ดี มีอาการกระตุกขณะขับ — ช่างแนะนำซ่อมใหญ่ ขณะนี้จอดงาน/ไม่ใช้ในภารกิจ เสี่ยงอุบัติเหตุหรือเสียกลางทาง
3) ตามมาตรฐาน 200,000 กม. ควรเปลี่ยนชิ้นส่วนครั้งใหญ่: น้ำมันเครื่องและไส้กรอง น้ำมันเกียร์ น้ำมันเบรก น้ำยาหล่อเย็น น้ำมันพาวเวอร์ — สายไทม์มิ่ง หัวเทียน แบต ยาง ผ้าเบรก กรองอากาศ กรองน้ำมัน สายพาน ลูกรอกตึงสาย ปะเก็นฝาสูป ซีลต่างๆ ฯลฯ`;

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
      detail: "เปลี่ยนไฟหน้าทั้งชุด",
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

  if (!vehicle.notes?.includes("สภาพรถ (จากบันทึกประวัติการซ่อม — ทะเบียน 4830)")) {
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
