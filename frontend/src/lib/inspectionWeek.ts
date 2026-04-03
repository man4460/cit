/** วันที่ในรูปแบบ YYYY-MM-DD ตามปฏิทินในเครื่อง */
export function toYyyyMmDd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** วันจันทร์ของสัปดาห์ที่มีวันที่ d (อาทิตย์ = ย้อนไปจันทร์ก่อนหน้า) */
export function mondayOfWeekContaining(d: Date): string {
  const dow = d.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(d);
  mon.setDate(d.getDate() + offset);
  return toYyyyMmDd(mon);
}
