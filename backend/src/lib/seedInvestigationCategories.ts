import { prisma } from "./prisma.js";

type SeedCategory = {
  code: string;
  name: string;
  nameEn: string;
  description: string;
  kind: "STRATEGIC" | "BAU";
  /** ทีมแนะนำเริ่มต้น (ไม่บังคับมอบหมาย) */
  suggestedTeamCode?: string;
  sortOrder: number;
  /** ชื่อชุดก่อนหน้า (รวมภาษาอังกฤษในวงเล็บ) ที่อนุญาตให้เปลี่ยนทับได้ */
  legacyNames?: string[];
};

const DEFAULT_CATEGORIES: SeedCategory[] = [
  {
    code: "FILE-1",
    name: "แฟ้มตรวจสอบประวัติและใบอนุญาต",
    nameEn: "Background Check & Licensing",
    description:
      "ผลตรวจประวัติอาชญากร (3 ถัง), ผลการขึ้นทะเบียน ธภ.7 และการตรวจประวัติพนักงานก่อนเข้าทำงาน (BI)",
    kind: "BAU",
    suggestedTeamCode: "TEAM-1",
    sortOrder: 1,
    legacyNames: ["แฟ้มตรวจสอบประวัติและใบอนุญาต (Background Check & Licensing)"],
  },
  {
    code: "FILE-2",
    name: "แฟ้มสืบข้อเท็จจริงและวินัย",
    nameEn: "Internal Investigation",
    description:
      "เอกสารสอบข้อเท็จจริงพนักงาน, มติคณะกรรมการสอบวินัย และข้อร้องเรียนภายใน — จำกัดสิทธิ์เข้าถึงขั้นสูงสุด",
    kind: "BAU",
    suggestedTeamCode: "TEAM-1",
    sortOrder: 2,
    legacyNames: ["สืบสวนภายใน", "แฟ้มสืบข้อเท็จจริงและวินัย (Internal Investigation)"],
  },
  {
    code: "FILE-3",
    name: "แฟ้มข่าวกรองและเตือนภัย",
    nameEn: "Intelligence & Early Warning",
    description:
      "ข่าวรายวัน, การประเมิน Trigger Point และแฟ้มเป้าหมาย (Target Dossier) ก่อนส่งให้ทีม Task Force ลงพื้นที่",
    kind: "BAU",
    suggestedTeamCode: "TEAM-1",
    sortOrder: 3,
    legacyNames: ["ข่าวกรองและเตือนภัย", "แฟ้มข่าวกรองและเตือนภัย (Intelligence & Early Warning)"],
  },
  {
    code: "FILE-4",
    name: "แฟ้มคดีธนบัตร",
    nameEn: "Banknotes Security",
    description:
      "บันทึกการจับกุมธนบัตรปลอม, ข้อมูลเครือข่ายปลอมแปลง และการสืบสวนธนบัตรชำรุดที่มีเหตุสงสัย",
    kind: "BAU",
    suggestedTeamCode: "TEAM-1",
    sortOrder: 4,
    legacyNames: ["ความมั่นคงธนบัตร", "แฟ้มคดีธนบัตร (Banknotes Security)"],
  },
  {
    code: "FILE-5",
    name: "แฟ้มคดีระบบชำระเงินและเงินตรา",
    nameEn: "Payment & FX Integrity",
    description:
      "หลักฐานการแฝงตัวทดสอบแอปพลิเคชัน Payment, บันทึกการลงพื้นที่ตรวจบริษัทรับแลกเปลี่ยนเงินตรา (FX) และการเฝ้าระวังความผิดปกติตาม พ.ร.บ. เงินตรา",
    kind: "STRATEGIC",
    suggestedTeamCode: "TEAM-2",
    sortOrder: 5,
    legacyNames: ["Payment & FX Integrity", "แฟ้มคดีระบบชำระเงินและเงินตรา (Payment & FX Integrity)"],
  },
  {
    code: "FILE-6",
    name: "แฟ้มคดีธุรกิจนอนแบงก์",
    nameEn: "Non-Bank & Market Conduct",
    description:
      "ผลการสืบสวนธุรกิจรถแลกเงิน, สินเชื่อเถื่อน, การทวงหนี้โหด และการเอาเปรียบผู้บริโภคที่ฝ่ายกำกับดูแลร้องขอให้ลงพื้นที่",
    kind: "STRATEGIC",
    suggestedTeamCode: "TEAM-3",
    sortOrder: 6,
    legacyNames: ["Non-Bank & Market Conduct", "แฟ้มคดีธุรกิจนอนแบงก์ (Non-Bank & Market Conduct)"],
  },
  {
    code: "FILE-7",
    name: "แฟ้มคดีภัยการเงินและทุนเทา",
    nameEn: "Anti-Fraud & Grey Capital",
    description:
      "การสืบสวนเครือข่ายบัญชีม้า, แก๊งคอลเซ็นเตอร์ และการตรวจสอบเส้นทางเงินหรือธุรกรรมเงินสดต้องสงสัย (ทุนเทา)",
    kind: "STRATEGIC",
    suggestedTeamCode: "TEAM-3",
    sortOrder: 7,
    legacyNames: ["Anti-Fraud & Grey Capital", "แฟ้มคดีภัยการเงินและทุนเทา (Anti-Fraud & Grey Capital)"],
  },
];

function splitLegacyName(full: string): { name: string; nameEn: string | null } {
  const m = full.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) return { name: m[1].trim(), nameEn: m[2].trim() };
  return { name: full.trim(), nameEn: null };
}

/**
 * สร้าง/ปรับแฟ้มคดีมาตรฐาน 7 แฟ้ม (ชื่อไทยหลัก · อังกฤษรอง)
 * จับคู่ด้วยรหัสแฟ้มก่อน — ไม่ทับชื่อที่ผู้ใช้ตั้งเอง
 */
export async function seedInvestigationCategories(): Promise<void> {
  const teams = await prisma.investigationTeam.findMany({ select: { id: true, code: true } });
  const teamIdByCode = new Map(teams.filter((t) => t.code).map((t) => [t.code as string, t.id]));

  let created = 0;
  let updated = 0;

  for (const row of DEFAULT_CATEGORIES) {
    const suggestedTeamId = row.suggestedTeamCode
      ? (teamIdByCode.get(row.suggestedTeamCode) ?? null)
      : null;

    const existing =
      (await prisma.investigationCategory.findFirst({ where: { code: row.code } })) ??
      (await prisma.investigationCategory.findFirst({
        where: { name: row.name, parentId: null },
      })) ??
      (row.legacyNames?.length
        ? await prisma.investigationCategory.findFirst({
            where: { name: { in: row.legacyNames }, parentId: null },
          })
        : null);

    if (!existing) {
      await prisma.investigationCategory.create({
        data: {
          code: row.code,
          name: row.name,
          nameEn: row.nameEn,
          description: row.description,
          kind: row.kind,
          teamId: suggestedTeamId,
          parentId: null,
          sortOrder: row.sortOrder,
        },
      });
      created += 1;
      continue;
    }

    const legacyHit = (row.legacyNames ?? []).includes(existing.name);
    const fromCombined = existing.name.includes("(") && existing.name.includes(")");
    const keepName = existing.name !== row.name && !legacyHit && !fromCombined;

    let nextName = keepName ? existing.name : row.name;
    let nextNameEn = existing.nameEn?.trim() || row.nameEn;
    if (fromCombined && !keepName) {
      const split = splitLegacyName(existing.name);
      nextName = row.name;
      nextNameEn = existing.nameEn?.trim() || split.nameEn || row.nameEn;
    }

    const data = {
      code: row.code,
      name: nextName,
      nameEn: nextNameEn,
      description: existing.description?.trim() ? existing.description : row.description,
      kind: row.kind,
      // ไม่ทับทีมที่ผู้ใช้ตั้งไว้แล้ว — เติมเฉพาะตอนว่าง
      teamId: existing.teamId ?? suggestedTeamId,
      parentId: null as string | null,
      sortOrder: row.sortOrder,
    };

    const unchanged =
      existing.code === data.code &&
      existing.name === data.name &&
      existing.nameEn === data.nameEn &&
      existing.description === data.description &&
      existing.kind === data.kind &&
      existing.teamId === data.teamId &&
      existing.parentId === data.parentId &&
      existing.sortOrder === data.sortOrder;
    if (unchanged) continue;

    await prisma.investigationCategory.update({ where: { id: existing.id }, data });
    updated += 1;
  }

  if (created > 0) console.log(`[seed] investigation categories: +${created}`);
  if (updated > 0) console.log(`[seed] investigation categories updated: ${updated}`);
}
