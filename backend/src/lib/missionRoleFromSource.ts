/**
 * แมปบทบาทภารกิจจากตำแหน่ง/สังกัด ตามไฟล์ค่าตอบแทนที่นำเข้า
 * - จรส./ผู้วิเคราะห์ → จนท.ฝรภ.
 * - รองผู้อำนวยการ → ผอ.เดินทาง
 * - ผู้ช่วยผู้อำนวยการ → ผช.ผอ.เดินทาง
 * - ตำรวจทางหลวง → ตร.ทางหลวง
 * - กองปราบปราม → ตร.กองปราบ
 * - อรินทราช / ก่อการร้าย → ตร.อรินทราช
 */
export function missionRoleFromFarabPosition(position: string): string {
  const p = position.trim();
  if (/รอง\s*(ผอ|ผู้อำนวยการ)/.test(p)) return "ผอ.เดินทาง";
  if (/ผช\.?\s*ผอ|ผู้ช่วยผู้อำนวยการ/.test(p)) return "ผช.ผอ.เดินทาง";
  if (/^จรส|ผู้วิเคราะห์|ผวส/.test(p)) return "จนท.ฝรภ.";
  if (/ผอ|หัวหน้า/.test(p)) return "ผอ.เดินทาง";
  return "จนท.ฝรภ.";
}

export function missionRoleFromPoliceUnit(unitOrPosition: string): string {
  const u = unitOrPosition.trim();
  if (/ทางหลวง/.test(u)) return "ตร.ทางหลวง";
  if (/อรินทราช|ก่อการร้าย|ต่อต้านการก่อการร้าย/.test(u)) return "ตร.อรินทราช";
  if (/ปราบปราม|กองปราบ/.test(u)) return "ตร.กองปราบ";
  return "ตำรวจ / ประสาน";
}
