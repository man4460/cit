/**
 * อัปเดตบทบาทบุคลากรใน TRIP-2569-01…05 ตามตำแหน่ง/สังกัด
 *   npm run seed:missions:remap-roles-2569
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  missionRoleFromFarabPosition,
  missionRoleFromPoliceUnit,
} from "../src/lib/missionRoleFromSource.js";
import { seedMissionMasterData } from "../src/lib/seedMissionMasters.js";

const prisma = new PrismaClient();

const CODES = ["TRIP-2569-01", "TRIP-2569-02", "TRIP-2569-03", "TRIP-2569-04", "TRIP-2569-05"];

async function ensureRoleId(name: string): Promise<string> {
  const row = await prisma.missionPersonnelRoleMaster.upsert({
    where: { name },
    create: { name, sortOrder: 50 },
    update: {},
  });
  return row.id;
}

function resolveRoleName(position: string | null, orgName: string | null): string {
  const pos = (position ?? "").trim();
  const org = (orgName ?? "").trim();

  // ตำรวจ: ดูจากตำแหน่ง (ที่ seed ใส่สังกัดไว้) หรือชื่อหน่วยงาน
  if (/ทางหลวง|ปราบปราม|กองปราบ|อรินทราช|ก่อการร้าย|ตำรวจ|สถานี/.test(pos) || /ตำรวจ|อรินทราช|ทางหลวง|กองปราบ/.test(org)) {
    return missionRoleFromPoliceUnit(pos || org);
  }
  // ฝรภ. / ตำแหน่งองค์กร
  if (pos) return missionRoleFromFarabPosition(pos);
  if (/ฝ่ายรักษาความปลอดภัย|ฝรภ/.test(org)) return "จนท.ฝรภ.";
  return "อื่นๆ (บุคลากร)";
}

async function main() {
  await seedMissionMasterData();

  let updated = 0;
  for (const code of CODES) {
    const mission = await prisma.mission.findUnique({
      where: { code },
      include: {
        personnel: {
          include: {
            personnel: { include: { organizationUnitType: true } },
            personnelRole: true,
          },
        },
      },
    });
    if (!mission) {
      console.warn(`ข้าม ${code}`);
      continue;
    }

    console.log(`\n${code}`);
    for (const a of mission.personnel) {
      const roleName = resolveRoleName(
        a.personnel.position,
        a.personnel.organizationUnitType?.name ?? null,
      );
      if (a.personnelRole.name === roleName) {
        console.log(`  = ${a.personnel.fullName} · ${roleName}`);
        continue;
      }
      const roleId = await ensureRoleId(roleName);
      await prisma.missionPersonnel.update({
        where: { id: a.id },
        data: { personnelRoleId: roleId },
      });
      updated++;
      console.log(`  → ${a.personnel.fullName}: ${a.personnelRole.name} → ${roleName}`);
    }
  }
  console.log(`\nเสร็จ — อัปเดต ${updated} แถว`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
