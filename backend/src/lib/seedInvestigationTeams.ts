import { prisma } from "./prisma.js";

type SeedTeam = {
  code: string;
  name: string;
  description: string;
  sortOrder: number;
};

const DEFAULT_TEAMS: SeedTeam[] = [
  {
    code: "TEAM-1",
    name: "ทีม 1 ภารกิจพื้นฐาน (The Fortress)",
    description:
      "ป้อมปราการค้ำยันงาน Routine (BAU) ทั้งหมดของ ศสป. — ดูแลแฟ้มตรวจประวัติและใบอนุญาต (BI 3 ถัง, ธภ.7), แฟ้มสืบข้อเท็จจริงและวินัย, แฟ้มข่าวกรองและเตือนภัย และแฟ้มคดีธนบัตร (ใช้ AI และ RPA ทุ่นแรง) · คุมโดย ผช.ผอ. 1",
    sortOrder: 0,
  },
  {
    code: "TEAM-2",
    name: "ทีม 2 ศูนย์ปฏิบัติการภัยการเงิน (Financial Crime Task Force)",
    description:
      "หน่วยปฏิบัติการพิเศษด้านระบบชำระเงินและเงินตราต่างประเทศ — ดูแลแฟ้มคดีระบบชำระเงินและเงินตรา: แฝงตัวทดสอบแอป Payment, ลงพื้นที่ตรวจบริษัทรับแลกเปลี่ยนเงินตรา (FX) และเฝ้าระวังความผิดปกติตาม พ.ร.บ. เงินตรา · คุมโดย ผช.ผอ. 2",
    sortOrder: 1,
  },
  {
    code: "TEAM-3",
    name: "ทีม 3 ศูนย์ปฏิบัติการภูมิทัศน์การเงินใหม่ (New Landscape Task Force)",
    description:
      "หน่วยลุยหน้างานนโยบายใหม่ คุ้มครองผู้บริโภคและปราบปรามภัยการเงิน — ดูแลแฟ้มคดีธุรกิจนอนแบงก์ (รถแลกเงิน, สินเชื่อเถื่อน, ทวงหนี้โหด) และแฟ้มคดีภัยการเงินและทุนเทา (บัญชีม้า, แก๊งคอลเซ็นเตอร์, เส้นทางเงินต้องสงสัย) · คุมโดย ผช.ผอ. 3",
    sortOrder: 2,
  },
];

/** ชื่อทีมชุดก่อนหน้า — อัปเดตทับได้ เพราะยังไม่ใช่ชื่อที่ผู้ใช้ตั้งเอง */
const LEGACY_NAMES = new Set([
  "ทีมสืบสวน 1 — นโยบายเชิงยุทธศาสตร์",
  "ทีมสืบสวน 2 — งานประจำและภายใน",
  "ทีมสืบสวน 3 — ข่าวกรองและเตือนภัย",
]);

/** คำอธิบายชุดก่อนหน้า — อัปเดตทับได้เช่นกัน */
const LEGACY_DESCRIPTIONS = new Set([
  "ป้อมปราการค้ำยันงาน Routine (BAU) ทั้งหมดของ ศสป. — งานแอดมิน, สอบประวัติ BI 3 ถัง, ตรวจ ธภ.7, ข่าวรายวัน, สอบวินัย และธนบัตรปลอม (ใช้ AI และ RPA ทุ่นแรง) · คุมโดย ผช.ผอ. 1",
  "นโยบายผู้ว่าฯ ด้านระบบชำระเงิน (Payment) และ FX — แฝงตัวทดสอบบริการ Payment, ตรวจสอบการฟอกเงินผ่านกระแสเงินสด (ทุนเทา) และสร้างเครือข่ายความร่วมมือกับ ปปง. / ตำรวจไซเบอร์ · คุมโดย ผช.ผอ. 2",
  "นโยบายผู้ว่าฯ ด้าน Non-Bank และการคุ้มครองผู้บริโภค — ลงพื้นที่สืบสวนธุรกิจรถแลกเงิน, สินเชื่อเถื่อน, การทวงหนี้โหดที่ผิด พ.ร.บ. เพื่อสนับสนุนข้อมูลให้ฝ่ายกำกับดูแลดำเนินการทางปกครอง · คุมโดย ผช.ผอ. 3",
]);

/** สร้างทีมสืบสวนเริ่มต้น 3 ทีม — จับคู่ด้วยรหัสทีม และไม่ทับชื่อ/คำอธิบายที่ผู้ใช้แก้เอง */
export async function seedInvestigationTeams(): Promise<void> {
  let created = 0;
  let updated = 0;

  for (const row of DEFAULT_TEAMS) {
    const existing =
      (await prisma.investigationTeam.findFirst({ where: { code: row.code } })) ??
      (await prisma.investigationTeam.findUnique({ where: { name: row.name } }));

    if (!existing) {
      await prisma.investigationTeam.create({ data: row });
      created += 1;
      continue;
    }

    const keepName = existing.name !== row.name && !LEGACY_NAMES.has(existing.name);
    const keepDescription =
      !!existing.description?.trim() &&
      existing.description !== row.description &&
      !LEGACY_DESCRIPTIONS.has(existing.description);

    const data = {
      code: row.code,
      name: keepName ? existing.name : row.name,
      description: keepDescription ? existing.description : row.description,
      sortOrder: row.sortOrder,
    };
    if (
      existing.code === data.code &&
      existing.name === data.name &&
      existing.description === data.description &&
      existing.sortOrder === data.sortOrder
    )
      continue;

    await prisma.investigationTeam.update({ where: { id: existing.id }, data });
    updated += 1;
  }

  if (created > 0) console.log(`[seed] investigation teams: +${created}`);
  if (updated > 0) console.log(`[seed] investigation teams updated: ${updated}`);
}
