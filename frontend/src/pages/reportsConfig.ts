export type ReportGroupKey = "weekly" | "monthly" | "quarterly" | "half-year" | "yearly" | "other";

/** โซนบนหน้ารวมรายงาน — เรียงตามรอบเวลา (โซนที่ยังไม่มีรายงานจะไม่แสดง) */
export const REPORT_GROUPS: {
  key: ReportGroupKey;
  label: string;
  hint: string;
  icon: "calendarWeek" | "calendarMonth" | "chartBar" | "chartPie" | "trophy" | "folder";
  tone: { tile: string; wrap: string; row: string; icon: string };
}[] = [
  {
    key: "weekly",
    label: "รายงานประจำสัปดาห์",
    hint: "สรุปผลรายสัปดาห์",
    icon: "calendarWeek",
    tone: { tile: "from-sky-500 to-cyan-400", wrap: "border-sky-100 from-sky-50/80", row: "hover:bg-sky-50", icon: "text-sky-500" },
  },
  {
    key: "monthly",
    label: "รายงานประจำเดือน",
    hint: "สรุปผลรายเดือน",
    icon: "calendarMonth",
    tone: { tile: "from-violet-500 to-purple-400", wrap: "border-violet-100 from-violet-50/80", row: "hover:bg-violet-50", icon: "text-violet-500" },
  },
  {
    key: "quarterly",
    label: "รายงานประจำไตรมาส",
    hint: "สรุปผลราย 3 เดือน",
    icon: "chartBar",
    tone: { tile: "from-emerald-500 to-teal-400", wrap: "border-emerald-100 from-emerald-50/80", row: "hover:bg-emerald-50", icon: "text-emerald-500" },
  },
  {
    key: "half-year",
    label: "รายงานประจำครึ่งปี",
    hint: "สรุปผลราย 6 เดือน",
    icon: "chartPie",
    tone: { tile: "from-amber-500 to-orange-400", wrap: "border-amber-100 from-amber-50/80", row: "hover:bg-amber-50", icon: "text-amber-500" },
  },
  {
    key: "yearly",
    label: "รายงานประจำปี",
    hint: "สรุปผลทั้งปี",
    icon: "trophy",
    tone: { tile: "from-pink-500 to-fuchsia-400", wrap: "border-pink-100 from-pink-50/80", row: "hover:bg-pink-50", icon: "text-pink-500" },
  },
  {
    key: "other",
    label: "รายงานอื่นๆ",
    hint: "รายงานเฉพาะเรื่อง",
    icon: "folder",
    tone: { tile: "from-[#0000BF] to-[#8b5cf6]", wrap: "border-indigo-100 from-indigo-50/80", row: "hover:bg-indigo-50", icon: "text-indigo-500" },
  },
];

export type ReportType = {
  slug: string;
  label: string;
  group: ReportGroupKey;
  hint: string;
  /** รายงานผู้ผ่านกิจกรรม — จับคู่หมวดหมู่กิจกรรมที่ชื่อมีคำนี้ */
  activityCategoryKeyword?: string;
};

/** ประเภทรายงานสรุป — ใช้ทั้งหน้ารวมและหน้ารายละเอียด */
export const REPORT_TYPES: ReportType[] = [
  { slug: "weekly", label: "รายงานตรวจยานพาหนะประจำสัปดาห์", group: "weekly", hint: "ผลตรวจรถรายคัน · คันที่ยังไม่ตรวจ" },
  { slug: "monthly", label: "รายงานสภาพเสื้อเกราะประจำเดือน", group: "monthly", hint: "ผลตรวจเสื้อเกราะรายชิ้น · รายการผิดปกติ" },
  {
    slug: "tactical-driving-graduates",
    label: "รายงานผู้ผ่านการอบรมขับรถยุทธวิธี",
    group: "other",
    hint: "รายชื่อจากกิจกรรมหมวด «ฝึกอบรมขับรถยุทธวิธี»",
    activityCategoryKeyword: "ขับรถยุทธวิธี",
  },
  {
    slug: "emergency-drill-graduates",
    label: "รายงานผู้ผ่านการฝึกซ้อมแผนฉุกเฉิน",
    group: "other",
    hint: "รายชื่อจากกิจกรรมหมวด «ฝึกซ้อมแผนฉุกเฉิน»",
    activityCategoryKeyword: "แผนฉุกเฉิน",
  },
];