/** ประเภทบุคลากรตำรวจ — แยกตามสังกัดหลัก */
export const POLICE_CATEGORY_HIGHWAY = "ทางหลวง";
export const POLICE_CATEGORY_CRIME_SUPPRESSION = "กองปราบ";
/** แท็บ/ประเภทในระบบ · เดิมใช้ชื่อ อรินทราช */
export const POLICE_CATEGORY_ARINTHARAT = "ปฏิบัติการพิเศษ";
export const POLICE_CATEGORY_ARINTHARAT_LEGACY = "อรินทราช";

export const POLICE_PERSONNEL_CATEGORY_NAMES = [
  POLICE_CATEGORY_HIGHWAY,
  POLICE_CATEGORY_CRIME_SUPPRESSION,
  POLICE_CATEGORY_ARINTHARAT,
  POLICE_CATEGORY_ARINTHARAT_LEGACY,
] as const;

export type PolicePersonnelCategoryName =
  | typeof POLICE_CATEGORY_HIGHWAY
  | typeof POLICE_CATEGORY_CRIME_SUPPRESSION
  | typeof POLICE_CATEGORY_ARINTHARAT;

/** สถานี/สังกัดมาตรฐาน */
export const POLICE_STATION_HIGHWAY = "กองบังคับการตำรวจทางหลวง";
export const POLICE_STATION_CRIME_SUPPRESSION = "กองบังคับการปราบปราม";
export const POLICE_STATION_ARINTHARAT = "กองกำกับการต่อต้านการก่อการร้าย";

/**
 * แมปข้อความสังกัด/ตำแหน่ง → ประเภทบุคลากร
 * ทางหลวง · กองปราบ · ปฏิบัติการพิเศษ
 */
export function policePersonnelCategoryFromUnit(
  unitOrPosition: string | null | undefined,
): PolicePersonnelCategoryName | null {
  const u = (unitOrPosition ?? "").trim();
  if (!u) return null;
  if (/ทางหลวง/.test(u)) return POLICE_CATEGORY_HIGHWAY;
  if (/อรินทราช|ก่อการร้าย|ต่อต้านการก่อการร้าย|ปฏิบัติการพิเศษ|หนุมาน/.test(u)) {
    return POLICE_CATEGORY_ARINTHARAT;
  }
  if (/ปราบปราม|กองปราบ/.test(u)) return POLICE_CATEGORY_CRIME_SUPPRESSION;
  return null;
}

/** รวมชื่อสถานีที่ซ้ำ/ใกล้เคียงให้เป็นชื่อมาตรฐาน */
export function canonicalPoliceStationName(raw: string): string {
  const n = raw.replace(/\s+/g, " ").trim();
  if (/ทางหลวง/.test(n)) return POLICE_STATION_HIGHWAY;
  if (/อรินทราช|ก่อการร้าย|ต่อต้านการก่อการร้าย|ปฏิบัติการพิเศษ/.test(n)) return POLICE_STATION_ARINTHARAT;
  if (/ปราบปราม|กองปราบ/.test(n)) return POLICE_STATION_CRIME_SUPPRESSION;
  return n;
}

export function policeStationSortOrder(name: string): number {
  if (name === POLICE_STATION_CRIME_SUPPRESSION) return 0;
  if (name === POLICE_STATION_HIGHWAY) return 1;
  if (name === POLICE_STATION_ARINTHARAT) return 2;
  return 50;
}
