import { prisma } from "./prisma.js";

/** หมวดกลางในคลังเอกสาร — ลิงก์จากปุ่มเอกสารในแต่ละโมดูล */
export const MODULE_DOCUMENT_TYPE_NAMES = [
  "งบประมาณ",
  "เสื้อเกราะ",
  "ยานพาหนะ",
  "วิทยุ",
  "อาวุธปืน",
  "อัคคีภัย",
  "ขนส่งธนบัตร",
] as const;

const LEGACY_TYPES = ["หนังสือ", "คำสั่ง", "ระเบียบ"] as const;

export async function seedDocumentMasterData(): Promise<void> {
  let order = 0;
  let created = 0;

  for (const name of MODULE_DOCUMENT_TYPE_NAMES) {
    const existing = await prisma.documentType.findUnique({ where: { name } });
    if (!existing) {
      await prisma.documentType.create({ data: { name, sortOrder: order } });
      created += 1;
    } else if (existing.sortOrder !== order) {
      await prisma.documentType.update({ where: { id: existing.id }, data: { sortOrder: order } });
    }
    order += 1;
  }

  for (const name of LEGACY_TYPES) {
    const existing = await prisma.documentType.findUnique({ where: { name } });
    if (!existing) {
      await prisma.documentType.create({ data: { name, sortOrder: order } });
      created += 1;
    }
    order += 1;
  }

  if (created > 0) {
    console.log(`[seed] document types: +${created} (module categories ready)`);
  }
}
