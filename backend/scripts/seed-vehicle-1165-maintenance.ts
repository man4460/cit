/**
 * นำเข้าประวัติการบำรุงรักษา — รถทะเบียน 5 กล 1165 กทม. (จากตารางประวัติการซ่อม)
 * รัน: npm run seed:vehicle1165-maint
 *
 * รันซ้ำได้: ถ้ามีรายการซ้ำ (ตรวจจับจากรายการแรก) จะข้ามทั้งชุด
 */
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLATE_SUB = "1165";

const MAINTENANCE_ROWS: { date: string; detail: string; cost: string }[] = [
  {
    date: "2023-03-21T12:00:00.000Z",
    detail: "เปลี่ยนปะเก็นฝาสูบ และฝาครอบโซ่เพลาลูกเบี้ยว",
    cost: "8951.62",
  },
  { date: "2024-03-08T12:00:00.000Z", detail: "เปลี่ยนแบตเตอรี่", cost: "2768.09" },
  {
    date: "2024-05-02T12:00:00.000Z",
    detail: "ตรวจเช็คระยะ เปลี่ยนถ่ายน้ำมันเครื่อง",
    cost: "2724.22",
  },
  { date: "2024-10-02T12:00:00.000Z", detail: "เปลี่ยนแบตเตอรี่", cost: "2637.55" },
  {
    date: "2024-10-28T12:00:00.000Z",
    detail: "เปลี่ยนยางรองแท่นเครื่อง ฝาปิดหม้อน้ำ น้ำยาหล่อเย็น",
    cost: "4330.29",
  },
  {
    date: "2025-01-22T12:00:00.000Z",
    detail: "เปลี่ยนชุดแม่เหล็กจานไฟฟ้า",
    cost: "12337.10",
  },
  { date: "2025-05-23T12:00:00.000Z", detail: "เปลี่ยนยางรถยนต์", cost: "27600.00" },
];

const CONDITION_NOTES = `--- สภาพรถ (จากบันทึกประวัติการซ่อม — ทะเบียน 1165) ---
1) ไฟฟ้ารั่วลงดิน นำเข้าศูนย์หลายครั้งไม่หายขาด หลังเปลี่ยนชุดแม่เหล็กจานไฟฟ้ายังมีปัญหา — ถ้าจอดเกิน 2 วันอาจสตาร์ทไม่ติด
2) รถจอดงาน/งดใช้ชั่วคราว เสี่ยงสตาร์ทไม่ติดระหว่างภารกิจ
3) ตามมาตรฐานเมื่อถึง 100,000 กม. ควรตรวจ/เปลี่ยน: สายไทม์มิ่ง หัวเทียน ระบบเบรก ระบบหล่อเย็น ช่วงล่าง (โช้คอัพ บอลจอยน์ต บูช ฯลฯ)`;

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
      detail: { contains: "ปะเก็นฝาสูบ" },
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

  if (!vehicle.notes?.includes("สภาพรถ (จากบันทึกประวัติการซ่อม — ทะเบียน 1165)")) {
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
