/** แท็บย่อยขั้นบุคลากรในฟอร์มสร้าง/แก้ไขภารกิจ */
export type MissionPersonnelTabKey = "bot" | "crime" | "highway" | "special" | "driver";

export type MissionPersonnelTabDef = {
  key: MissionPersonnelTabKey;
  label: string;
  /** ชื่อประเภทบุคลากรที่จัดเข้าแท็บนี้ */
  categories: readonly string[];
  /** บทบาทเริ่มต้นเมื่อเพิ่มแถวในแท็บ */
  defaultRoleRe: RegExp;
};

export const MISSION_PERSONNEL_TABS: readonly MissionPersonnelTabDef[] = [
  { key: "bot", label: "ธปท.", categories: ["ธปท."], defaultRoleRe: /จนท\.ฝรภ|จรส/ },
  { key: "crime", label: "กองปราบ", categories: ["กองปราบ"], defaultRoleRe: /ตร\.กองปราบ|กองปราบ/ },
  { key: "highway", label: "ทางหลวง", categories: ["ทางหลวง"], defaultRoleRe: /ตร\.ทางหลวง|ทางหลวง/ },
  {
    key: "special",
    label: "ปฏิบัติการพิเศษ",
    categories: ["ปฏิบัติการพิเศษ", "อรินทราช", "หนุมาน"],
    defaultRoleRe: /ตร\.อรินทราช|อรินทราช|หนุมาน|ปฏิบัติการพิเศษ/,
  },
  { key: "driver", label: "ขับรถสินค้า", categories: ["ขับรถสินค้า"], defaultRoleRe: /คนขับ|ขับรถ/ },
] as const;

export function missionPersonnelTabByCategory(
  categoryName: string | null | undefined,
): MissionPersonnelTabKey | null {
  const n = (categoryName ?? "").trim();
  if (!n) return null;
  for (const tab of MISSION_PERSONNEL_TABS) {
    if (tab.categories.some((c) => c === n)) return tab.key;
  }
  if (/^ตร\.ทางหลวง|ทางหลวง/.test(n)) return "highway";
  if (/^ตร\.กองปราบ|กองปราบ/.test(n)) return "crime";
  if (/^ตร\.อรินทราช|อรินทราช|หนุมาน|ปฏิบัติการพิเศษ/.test(n)) return "special";
  if (n === "ธปท.") return "bot";
  if (n === "ขับรถสินค้า") return "driver";
  return null;
}

export function defaultMissionRoleIdForTab(
  tabKey: MissionPersonnelTabKey,
  roles: Array<{ id: string; name: string }>,
): string {
  const tab = MISSION_PERSONNEL_TABS.find((t) => t.key === tabKey);
  if (!tab) return roles[0]?.id ?? "";
  const hit = roles.find((r) => tab.defaultRoleRe.test(r.name));
  return hit?.id ?? roles[0]?.id ?? "";
}
