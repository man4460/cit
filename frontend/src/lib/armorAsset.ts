/** หมวด/ฟิลด์ที่ถือว่าเป็นเสื้อเกราะ — แยกไปหน้า /vests ไม่โชว์ในวัสดุทั่วไป */
export function isArmorAsset(a: {
  assetCategory?: { name?: string | null } | null;
  itemName?: string | null;
  armorLevel?: string | null;
  registryLineNo?: number | null;
  armorWearStyle?: string | null;
  armorModel?: string | null;
  armorUnitNumber?: string | null;
}) {
  if (a.assetCategory?.name && /เสื้อเกราะ/.test(a.assetCategory.name)) return true;
  if (a.itemName && /เสื้อเกราะ/.test(a.itemName)) return true;
  if (a.registryLineNo != null) return true;
  if (a.armorLevel?.trim()) return true;
  if (a.armorWearStyle?.trim()) return true;
  if (a.armorModel?.trim()) return true;
  if (a.armorUnitNumber?.trim()) return true;
  return false;
}
