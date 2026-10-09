/**
 * นำเข้าเหตุการณ์ไม่ปกติย้อนหลัง (จากตารางสรุป 2566–2568) ผูกกับทริปตามรหัสภารกิจ
 * ตารางต้นทางไม่มีเวลาเกิดเหตุ — ใช้ 12:00 น. ของวันนั้น
 * รันซ้ำได้: ข้ามรายการที่มีรายละเอียดเดียวกันในทริปเดียวกันแล้ว
 */
import { PrismaClient, type MissionIncidentSeverity } from "@prisma/client";

const prisma = new PrismaClient();

const ROWS: Array<{
  missionCode: string;
  date: string;
  category: string;
  severity: MissionIncidentSeverity;
  location: string | null;
  description: string;
  actionTaken: string;
}> = [
  {
    missionCode: "TRIP-2566-14",
    date: "2023-07-25",
    category: "การจราจรติดขัด / เส้นทางปิด",
    severity: "LOW",
    location: "บริเวณพัทลุง",
    description: "เกิดอุบัติเหตุบนท้องถนน บริเวณพัทลุง ทำให้รถติดประมาณ 3 กม.",
    actionTaken: "ใช้เส้นทางสำรอง",
  },
  {
    missionCode: "TRIP-2567-01",
    date: "2024-02-01",
    category: "อุบัติเหตุที่ขบวนเกี่ยวข้อง",
    severity: "HIGH",
    location: "อ.โนนสูง",
    description: "บนเส้นทาง อ.โนนสูง ขบวนขนส่งชนกับรถบนของประชาชน",
    actionTaken: "จอดรถตามแผนฉุกเฉิน",
  },
  {
    missionCode: "TRIP-2567-13",
    date: "2024-10-29",
    category: "สภาพอากาศ / ภัยธรรมชาติ",
    severity: "MEDIUM",
    location: null,
    description: "เกิดน้ำท่วมขังในเส้นทาง รถเล็กไม่สามารถผ่านได้ รถติดยาว",
    actionTaken: "ใช้เส้นทางสำรอง",
  },
  {
    missionCode: "TRIP-2568-07",
    date: "2025-07-16",
    category: "การจราจรติดขัด / เส้นทางปิด",
    severity: "MEDIUM",
    location: null,
    description: "เกิดอุบัติเหตุรถพลิกคว่ำ ปิดถนน 100% รถติดยาวประมาณ 5 กม.",
    actionTaken: "ใช้เส้นทางสำรอง",
  },
  {
    missionCode: "TRIP-2568-09",
    date: "2025-10-16",
    category: "การจราจรติดขัด / เส้นทางปิด",
    severity: "LOW",
    location: "ก่อนเข้าเขตสุราษฎร์",
    description: "เกิดอุบัติเหตุบนถนน ก่อนเข้าเขตสุราษฎร์ รถติดยาวประมาณ 3 กม.",
    actionTaken: "ใช้เส้นทางสำรอง",
  },
];

async function main() {
  let created = 0;
  for (const r of ROWS) {
    const mission = await prisma.mission.findUnique({ where: { code: r.missionCode }, select: { id: true } });
    if (!mission) {
      console.warn(`ไม่พบภารกิจ ${r.missionCode} — ข้าม`);
      continue;
    }
    const dup = await prisma.missionIncident.findFirst({
      where: { missionId: mission.id, description: r.description },
      select: { id: true },
    });
    if (dup) {
      console.log(`มีแล้ว ${r.missionCode} — ข้าม`);
      continue;
    }
    await prisma.missionIncident.create({
      data: {
        missionId: mission.id,
        occurredAt: new Date(`${r.date}T12:00:00+07:00`),
        category: r.category,
        severity: r.severity,
        location: r.location,
        description: r.description,
        actionTaken: r.actionTaken,
        cargoAffected: false,
        resolved: true,
      },
    });
    created += 1;
    console.log(`เพิ่ม ${r.missionCode} · ${r.date} · ${r.category}`);
  }
  console.log(`\nเพิ่มทั้งหมด ${created} รายการ`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
