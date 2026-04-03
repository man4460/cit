/**
 * นำเข้าประวัติการบำรุงรักษา — รถทะเบียน 5 กล 1160 กทม. (จากตารางประวัติการซ่อม)
 * รัน: npm run seed:vehicle1160-maint
 *
 * รันซ้ำได้: ถ้ามีรายการซ้ำ (ตรวจจับจากรายการแรก) จะข้ามทั้งชุด
 */
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLATE_SUB = "1160";

const MAINTENANCE_ROWS: { date: string; detail: string; cost: string }[] = [
  { date: "2023-01-31T12:00:00.000Z", detail: "ตรวจประตูฝั่งคนขับ (เปิดไม่ได้)", cost: "749" },
  {
    date: "2023-05-31T12:00:00.000Z",
    detail: "ตรวจระยะ เปลี่ยนน้ำมันเครื่อง เปลี่ยนหัวเทียน",
    cost: "7906.23",
  },
  {
    date: "2023-10-03T12:00:00.000Z",
    detail: "เปลี่ยนแบตเตอรี่และซีลประตู",
    cost: "4779.69",
  },
  { date: "2024-05-02T12:00:00.000Z", detail: "เปลี่ยนน้ำมันเครื่อง", cost: "2066.17" },
  { date: "2024-11-20T12:00:00.000Z", detail: "เปลี่ยนใบปัดน้ำฝน", cost: "583.15" },
  {
    date: "2025-05-23T12:00:00.000Z",
    detail: "เปลี่ยนยางและลิงก์สเตบิไลเซอร์",
    cost: "32700",
  },
];

const CONDITION_NOTES = `--- สภาพรถ (จากบันทึกประวัติการซ่อม) ---
1) เสียงจากลำโพงดังขณะขับขี่แม้ปิดวิทยุ — นำเข้าศูนย์บริการแต่ยังไม่ได้ซ่อม ถอดฟิวส์ออกเพื่อไม่ให้ทำงาน
2) ระบบช่วงล่างไม่ดี รถเอน/สั่นเมื่อเข้าโค้ง เสี่ยงอุบัติเหตุ — ขณะนี้ผู้ขับต้องลดความเร็วมากเมื่อเลี้ยว
3) ตามมาตรฐานเมื่อถึง 100,000 กม. ควรตรวจ/เปลี่ยน: สายไทม์มิ่ง หัวเทียน ระบบเบรก ระบบหล่อเย็น ช่วงล่าง (โช้คอัพ บอลจอยน์ต ลิงก์สเตบิไลเซอร์ ฯลฯ)`;

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
      detail: { contains: "ตรวจประตูฝั่งคนขับ" },
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

  if (!vehicle.notes?.includes("สภาพรถ (จากบันทึกประวัติการซ่อม)")) {
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
