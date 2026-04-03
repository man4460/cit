/** ประเภทรายงาน — ใช้ทั้งหน้ารวมและหน้ารายละเอียด */
export const REPORT_TYPES = [
  { slug: "weekly", label: "รายงานตรวจยานพาหนะประจำสัปดาห์" },
  { slug: "monthly", label: "รายงานสภาพเสื้อเกราะประจำเดือน" },
  { slug: "quarterly", label: "รายงานประจำไตรมาส" },
  { slug: "half-year", label: "รายงานประจำครึ่งปี" },
  { slug: "yearly", label: "รายงานประจำปี" },
] as const;
