export const RADIO_CATEGORY_NAME = "วิทยุสื่อสาร";

export function isRadioAsset(a: { assetCategory?: { name?: string | null } | null; itemName?: string }) {
  if (a.assetCategory?.name === RADIO_CATEGORY_NAME) return true;
  return /วิทยุ/.test(a.itemName ?? "");
}

export function radioKind(itemName: string): "handheld" | "mobile" | "other" {
  if (/มือถือ|Handheld|ใช้มือถือ/i.test(itemName)) return "handheld";
  if (/เคลื่อนที่|Mobile/i.test(itemName)) return "mobile";
  return "other";
}

export function radioKindLabel(itemName: string) {
  const k = radioKind(itemName);
  if (k === "handheld") return "มือถือ";
  if (k === "mobile") return "เคลื่อนที่";
  return "อื่น ๆ";
}
