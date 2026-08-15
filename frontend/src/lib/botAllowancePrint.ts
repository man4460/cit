/** อัตราเบี้ยพิเศษฯ ตามแบบฟอร์ม ธปท. (บาท/วัน) */
export const BOT_SPECIAL_ALLOWANCE_PER_DAY = 1400;

/** อัตราเบี้ยเลี้ยง/วัน — จรส. = 450; จรส.(ควบ) และอื่นๆ = 500 */
export const BOT_PER_DIEM_JRAS = 450;
export const BOT_PER_DIEM_OTHER = 500;

/** ชื่อประเภทบุคลากรที่ใช้คำนวณค่าตอบแทนอัตโนมัติ */
export const BOT_PERSONNEL_CATEGORY_NAME = "ธปท.";

/**
 * อัตราเบี้ยเลี้ยงต่อวันตามระดับชั้น/จรส.
 * จรส. → 450 · จรส.(ควบ) และอื่นๆ → 500
 * (ชั้นตัวเลข 4–5 ไม่ควบ = อัตราเดียวกับ จรส.)
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

const POLICE_RANK_RE =
  /^(พ\.?\s*ต\.?\s*(ต\.|ท\.|อ\.)?|ร\.?\s*ต\.?\s*(ต\.|ท\.|อ\.)?|ส\.?\s*ต\.?\s*(ต\.|ท\.|อ\.)?|ด\.?\s*ต\.?|ว่าที่)/i;
const POLICE_ROLE_RE = /ตร\.|ตำรวจ|police|ทางหลวง|กองปราบ|อรินทราช|ปฏิบัติการพิเศษ/i;
const DRIVER_ROLE_RE = /คนขับ|driver/i;
const POLICE_CATEGORY_RE = /ตำรวจ|ทางหลวง|กองปราบ|อรินทราช|ปฏิบัติการพิเศษ/;

export type BotAllowancePerson = {
  personnelId: string;
  fullName: string;
  rank: string | null;
  position?: string | null;
  idNumber?: string | null;
  employeeCode?: string | null;
  gradeLevel?: string | null;
  perDiemRate?: string | number | null;
  vehicleTravelAllowance?: string | number | null;
  personnelCategoryName?: string | null;
  roleName: string;
  compensationRate: string;
};

export function isBotPersonnelCategory(name: string | null | undefined): boolean {
  return (name ?? "").trim() === BOT_PERSONNEL_CATEGORY_NAME;
}

/** ตัดตำรวจ (จากประเภท/บทบาทในภารกิจหรือยศ) และคนขับออก */
export function isPoliceOrDriverForBotAllowance(p: BotAllowancePerson): boolean {
  const cat = (p.personnelCategoryName ?? "").trim();
  if (cat && POLICE_CATEGORY_RE.test(cat)) return true;
  const role = (p.roleName ?? "").trim();
  const rank = (p.rank ?? "").trim().replace(/\s+/g, "");
  if (DRIVER_ROLE_RE.test(role)) return true;
  if (POLICE_ROLE_RE.test(role)) return true;
  if (rank && POLICE_RANK_RE.test(rank)) return true;
  return false;
}

/** รายชื่อในแบบฟอร์ม: ถ้ามีประเภท ธปท. ให้ใช้กลุ่มนั้น ไม่เช่นนั้นตัดตำรวจ/คนขับ */
export function filterBotAllowancePersonnel(list: BotAllowancePerson[]): BotAllowancePerson[] {
  const botOnly = list.filter((p) => isBotPersonnelCategory(p.personnelCategoryName));
  if (botOnly.length) return botOnly;
  return list.filter((p) => !isPoliceOrDriverForBotAllowance(p));
}

/** จำนวนวันรวม (รวมวันเริ่ม–สิ้นสุด) อย่างน้อย 1 */
export function missionInclusiveDays(startIso: string | null | undefined, endIso: string | null | undefined): number {
  if (!startIso && !endIso) return 1;
  const a = startIso ? new Date(startIso) : endIso ? new Date(endIso) : null;
  const b = endIso ? new Date(endIso) : startIso ? new Date(startIso) : null;
  if (!a || !b || Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 1;
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, diff + 1);
}

/** ค่าตอบแทนรวมต่อคนในภารกิจประเภท ธปท. = (เบี้ยพิเศษ + เบี้ยเลี้ยง/วัน) × จำนวนวัน + เงินช่วยเหลือยานพาหนะไป-กลับ */
export function calcBotMissionCompensation(
  perDiemRate: number | string | null | undefined,
  days: number,
  vehicleTravelAllowance?: number | string | null | undefined,
  gradeLevel?: string | null | undefined,
): number {
  const stored = Number(perDiemRate);
  const fromGrade = botPerDiemDailyRate(gradeLevel);
  const perDiem =
    Number.isFinite(stored) && stored > 0 ? stored : fromGrade;
  const travel = Number(vehicleTravelAllowance);
  const daily = BOT_SPECIAL_ALLOWANCE_PER_DAY + (Number.isFinite(perDiem) && perDiem > 0 ? perDiem : 0);
  const travelAmt = Number.isFinite(travel) && travel > 0 ? travel : 0;
  return daily * Math.max(1, days) + travelAmt;
}

export function formatThaiMissionDateRange(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): string {
  if (!startIso && !endIso) return "—";
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
  try {
    if (startIso && endIso) {
      const s = new Date(startIso);
      const e = new Date(endIso);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "—";
      const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
      if (sameMonth && s.getDate() === e.getDate()) {
        return `วันที่ ${s.toLocaleDateString("th-TH", opts)}`;
      }
      if (sameMonth) {
        const monthYear = s.toLocaleDateString("th-TH", { month: "long", year: "numeric" });
        return `วันที่ ${s.getDate()}-${e.getDate()} ${monthYear}`;
      }
      return `วันที่ ${s.toLocaleDateString("th-TH", opts)} – ${e.toLocaleDateString("th-TH", opts)}`;
    }
    const d = new Date((startIso || endIso)!);
    return `วันที่ ${d.toLocaleDateString("th-TH", opts)}`;
  } catch {
    return "—";
  }
}

export function formatBahtPlain(n: number): string {
  if (!Number.isFinite(n) || n === 0) return n === 0 ? "0" : "—";
  return n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}
