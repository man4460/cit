/**
 * ใส่ข้อมูลทะเบียนเสื้อเกราะ (ตัวอย่างจากทะเบียนควบคุมยุทธภัณฑ์)
 * รัน: npx tsx scripts/seed-bulletproof-vests.ts
 *
 * ถ้าเลขครุภัณฑ์มีอยู่แล้ว จะอัปเดตฟิลด์ให้ตรงกับชุดข้อมูลนี้
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CATEGORY_NAME = "เสื้อเกราะป้องกันกระสุนฯ";
const ITEM_NAME = "เสื้อเกราะป้องกันกระสุนฯ";
const LOCATION = "สอบ. ทอส. อาคาร 7";
const ARMOR_LEVEL = "2";
const ARMOR_WEAR = "สวมทับใน";
const ARMOR_MODEL = "CONCEAL";
const PERMIT_NO = "650507300";
/** พ.ศ. 2562-11-01 → 2019-11-01 */
const PURCHASED_AT = new Date(Date.UTC(2019, 10, 1, 12, 0, 0));
/** พ.ศ. 2567-09-01 → 2024-09-01 (หมดอายุตามทะเบียนครุภัณฑ์) */
const EXPIRES_AT = new Date(Date.UTC(2024, 8, 1, 12, 0, 0));
/** พ.ศ. 2569-11-28 → 2026-11-28 (หมดอายุใบอนุญาต) */
const PERMIT_EXPIRES_AT = new Date(Date.UTC(2026, 10, 28, 12, 0, 0));

/** เลขครุภัณฑ์ 30133447 … 30133457 (11 รายการ) */
const BASE_SERIAL = 30133447;
const COUNT = 11;

async function main() {
  let category = await prisma.assetCategory.findUnique({ where: { name: CATEGORY_NAME } });
  if (!category) {
    const maxOrder = await prisma.assetCategory.aggregate({ _max: { sortOrder: true } });
    category = await prisma.assetCategory.create({
      data: {
        name: CATEGORY_NAME,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });
    console.log(`สร้างประเภทครุภัณฑ์: ${CATEGORY_NAME}`);
  } else {
    console.log(`ใช้ประเภทเดิม: ${CATEGORY_NAME}`);
  }

  let created = 0;
  let updated = 0;

  for (let i = 0; i < COUNT; i++) {
    const lineNo = i + 1;
    const serialNumber = String(BASE_SERIAL + i);
    const unitNo = String(lineNo).padStart(3, "0");

    const common = {
      itemName: ITEM_NAME,
      location: LOCATION,
      notes: null as string | null,
      assetCategoryId: category.id,
      registryLineNo: lineNo,
      armorLevel: ARMOR_LEVEL,
      armorWearStyle: ARMOR_WEAR,
      armorModel: ARMOR_MODEL,
      armorUnitNumber: unitNo,
      permitDocumentNo: PERMIT_NO,
      permitExpiresAt: PERMIT_EXPIRES_AT,
      purchasedAt: PURCHASED_AT,
      armorExpiresAt: EXPIRES_AT,
      machineSerialNumber: null as string | null,
    };

    const existing = await prisma.asset.findUnique({ where: { serialNumber } });
    if (existing) {
      await prisma.asset.update({
        where: { serialNumber },
        data: common,
      });
      updated++;
      console.log(`อัปเดต ${serialNumber} (ลำดับ ${lineNo})`);
    } else {
      await prisma.asset.create({
        data: {
          serialNumber,
          ...common,
        },
      });
      created++;
      console.log(`เพิ่ม ${serialNumber} (ลำดับ ${lineNo})`);
    }
  }

  console.log(`\nเสร็จ: เพิ่ม ${created} รายการ, อัปเดต ${updated} รายการ`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
