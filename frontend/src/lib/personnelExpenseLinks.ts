import type { MissionPersonnelTabKey } from "./missionPersonnelTabs";

/** แมปบุคลากรในภารกิจ → รายการค่าใช้จ่าย (ช่องเดียวตามประเภท ไม่แยกสัญญาบัตร/ประทวน) */
export const PERSONNEL_EXPENSE_ITEM_LINKS: Record<
  Exclude<MissionPersonnelTabKey, "driver">,
  { items: string[]; label: string }
> = {
  bot: { label: "จนท.ธปท.", items: ["5.1", "5.2"] },
  highway: { label: "ตร.ทางหลวง", items: ["2.2"] },
  crime: { label: "ตร.กองปราบ", items: ["2.3"] },
  special: { label: "ตร.อรินทราช / หนุมาน", items: ["2.1"] },
};

export const PERSONNEL_EXPENSE_LINK_HELP = Object.values(PERSONNEL_EXPENSE_ITEM_LINKS)
  .map((row) => `${row.label} → ${row.items.join(", ")}`)
  .join(" · ");

/** รายการที่ลิงก์จากจนท.ธปท. (จำนวนคน / ยอดรวม) — ใช้ทริปทั่วไป
 *  TRIP-2569 ข้อ 5.1/5.2/5.3/8.1 ใช้ยอด Excel ตรง ๆ ไม่คูณคน×อัตรา */
export const BOT_PERSONNEL_LINK_ITEM_CODES = ["5.1", "5.2", "5.3", "8.1"] as const;

/** รายการที่ลิงก์จากบุคลากรตำรวจ (ยอดรวมตามประเภท) */
export const POLICE_PERSONNEL_LINK_ITEM_CODES = ["2.1", "2.2", "2.3"] as const;

/** รายการที่ลิงก์จากสถานีตำรวจ */
export const STATION_PERSONNEL_LINK_ITEM_CODES = ["2.4", "2.5", "2.6", "2.7"] as const;

/** รายการทั้งหมดที่ลิงก์จากบุคลากร/สถานี → ค่าใช้จ่ายจริง */
export const ACTUAL_EXPENSE_LINKED_ITEM_CODES = [
  ...POLICE_PERSONNEL_LINK_ITEM_CODES,
  ...STATION_PERSONNEL_LINK_ITEM_CODES,
  ...BOT_PERSONNEL_LINK_ITEM_CODES,
] as const;

export const ACTUAL_EXPENSE_LINKED_ITEM_CODE_SET = new Set<string>(ACTUAL_EXPENSE_LINKED_ITEM_CODES);

/** ไม่ใช้แล้ว — คง Set ว่างเพื่อความเข้ากันได้กับโค้ดเก่า */
export const SPECIAL_OPS_REFERENCE_ITEM_CODES = new Set<string>();
