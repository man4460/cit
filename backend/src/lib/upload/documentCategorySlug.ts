/**
 * แปลงชื่อหมวดเอกสาร (ภาษาไทย) → slug ASCII สำหรับโฟลเดอร์/ชื่อไฟล์
 */
const DOCUMENT_CATEGORY_SLUGS: Record<string, string> = {
  งบประมาณ: "budget",
  เสื้อเกราะ: "armor",
  ยานพาหนะ: "vehicles",
  วิทยุ: "radios",
  อาวุธปืน: "weapons",
  อัคคีภัย: "fire",
  ขนส่งธนบัตร: "missions",
  "งานจ้าง OS": "os-outsourcing",
  หนังสือ: "letters",
  คำสั่ง: "orders",
  ระเบียบ: "regulations",
};

export function documentCategorySlugFromName(name: string | null | undefined): string {
  const key = (name ?? "").trim();
  if (!key) return "uncategorized";
  const mapped = DOCUMENT_CATEGORY_SLUGS[key];
  if (mapped) return mapped;
  const slug = key
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "uncategorized";
}
