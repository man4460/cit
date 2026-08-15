/** หมวดเอกสารกลางในคลังเอกสาร — ใช้ลิงก์จากปุ่มเอกสารของแต่ละโมดูล */
export const MODULE_DOCUMENT_CATEGORIES = {
  budget: "งบประมาณ",
  armor: "เสื้อเกราะ",
  vehicles: "ยานพาหนะ",
  radios: "วิทยุ",
  weapons: "อาวุธปืน",
  fire: "อัคคีภัย",
  missions: "ขนส่งธนบัตร",
} as const;

export type ModuleDocumentCategoryKey = keyof typeof MODULE_DOCUMENT_CATEGORIES;

export function moduleDocumentCategoryName(key: ModuleDocumentCategoryKey): string {
  return MODULE_DOCUMENT_CATEGORIES[key];
}

export function documentsLibraryPathForCategory(categoryName: string): string {
  return `/documents?category=${encodeURIComponent(categoryName)}`;
}
