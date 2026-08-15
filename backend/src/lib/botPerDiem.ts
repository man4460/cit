/** อัตราเบี้ยเลี้ยง/วัน สำหรับบุคลากรประเภท ธปท. */
export const BOT_PER_DIEM_JRAS = 450;
export const BOT_PER_DIEM_OTHER = 500;

/**
 * จรส. → 450 บาท/วัน
 * จรส.(ควบ) และอื่นๆ → 500 บาท/วัน
 *
 * รองรับค่าชั้นจากแบบฟอร์มตัวเลขด้วย: ชั้น 4–5 (ไม่ควบ) = อัตราเดียวกับ จรส.
 */
export function botPerDiemDailyRate(gradeLevel: string | null | undefined): number {
  const g = (gradeLevel ?? "").trim().replace(/\s+/g, "");
  if (!g) return BOT_PER_DIEM_OTHER;

  if (/จรส\.?\(ควบ\)|จรส\.?（ควบ）/i.test(g)) return BOT_PER_DIEM_OTHER;
  if (/^จรส\.?$/i.test(g) || (/จรส/i.test(g) && !/ควบ/.test(g))) return BOT_PER_DIEM_JRAS;

  const m = g.match(/^(\d+)/);
  if (m) {
    const n = Number(m[1]);
    const concurrent = /ควบ/.test(g);
    if (n <= 4) return BOT_PER_DIEM_JRAS;
    if (n === 5 && !concurrent) return BOT_PER_DIEM_JRAS;
  }

  return BOT_PER_DIEM_OTHER;
}
