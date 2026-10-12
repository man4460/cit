/**
 * แมปบทบาทภารกิจจากตำแหน่ง/สังกัด ตามไฟล์ค่าตอบแทนที่นำเข้า
 * - จรส./ผู้วิเคราะห์ → เจ้าหน้าที่ขับรถคุ้มกันหน้า และสื่อสาร
 * - รองผู้อำนวยการ → ผู้อำนวยการเดินทาง
 * - ผู้ช่วยผู้อำนวยการ → ผู้ช่วยผู้อำนวยการเดินทาง
 * - ตำรวจทางหลวง → ตำรวจทางหลวง นำขบวน
 * - กองปราบปราม → ตำรวจกองปราบปราม สื่อสาร / ประสานท้องที่
 * - อรินทราช / ก่อการร้าย → ตำรวจอรินทราช 26 (คุ้มกัน)
 */
export const ROLE_DIRECTOR = "ผู้อำนวยการเดินทาง";
export const ROLE_ASSISTANT_DIRECTOR = "ผู้ช่วยผู้อำนวยการเดินทาง";
export const ROLE_FARAB_STAFF = "เจ้าหน้าที่ขับรถคุ้มกันหน้า และสื่อสาร";
export const ROLE_HIGHWAY_POLICE = "ตำรวจทางหลวง นำขบวน";
export const ROLE_CRIME_POLICE = "ตำรวจกองปราบปราม สื่อสาร / ประสานท้องที่";
export const ROLE_ARINTHARAT_POLICE = "ตำรวจอรินทราช 26 (คุ้มกัน)";

export function missionRoleFromFarabPosition(position: string): string {
  const p = position.trim();
  if (/รอง\s*(ผอ|ผู้อำนวยการ)/.test(p)) return ROLE_DIRECTOR;
  if (/ผช\.?\s*ผอ|ผู้ช่วยผู้อำนวยการ/.test(p)) return ROLE_ASSISTANT_DIRECTOR;
  if (/^จรส|ผู้วิเคราะห์|ผวส/.test(p)) return ROLE_FARAB_STAFF;
  if (/ผอ|หัวหน้า/.test(p)) return ROLE_DIRECTOR;
  return ROLE_FARAB_STAFF;
}

export function missionRoleFromPoliceUnit(unitOrPosition: string): string {
  const u = unitOrPosition.trim();
  if (/ทางหลวง/.test(u)) return ROLE_HIGHWAY_POLICE;
  if (/อรินทราช|ก่อการร้าย|ต่อต้านการก่อการร้าย/.test(u)) return ROLE_ARINTHARAT_POLICE;
  return ROLE_CRIME_POLICE;
}
