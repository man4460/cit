/** ประเภทรายงานสรุป — ใช้ทั้งหน้ารวมและหน้ารายละเอียด */
export const REPORT_TYPES = [
  { slug: "weekly", label: "รายงานตรวจยานพาหนะประจำสัปดาห์" },
  { slug: "monthly", label: "รายงานสภาพเสื้อเกราะประจำเดือน" },
  { slug: "quarterly", label: "รายงานประจำไตรมาส" },
  { slug: "half-year", label: "รายงานประจำครึ่งปี" },
  { slug: "yearly", label: "รายงานประจำปี" },
] as const;

/** หน้าตรวจบันทึก — เมนูย่อยใต้รายงาน (หมวดการปฏิบัติการ) */
export const INSPECTION_LINKS = [
  {
    to: "/vehicles/weekly-inspection",
    label: "ตรวจรถประจำสัปดาห์",
    hint: "ตารางตรวจตามหัวข้อ · บันทึกรายคัน",
  },
  {
    to: "/assets/armor-monthly",
    label: "ตรวจเสื้อเกราะรายเดือน",
    hint: "ตารางตรวจตามหัวข้อ · บันทึกรายชิ้น",
  },
] as const;
