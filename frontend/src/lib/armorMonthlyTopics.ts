import type { ArmorMonthlyCheckKey } from "../types";

export const ARMOR_MONTHLY_TOPICS: ReadonlyArray<{
  key: ArmorMonthlyCheckKey;
  title: string;
  subtitle?: string;
}> = [
  { key: "outerShell", title: "สภาพผิว / โครงเสื้อ", subtitle: "รอยฉีกขาด แตกร้าว สีลอก" },
  { key: "strapsFasteners", title: "สายรัด ตัวล็อก", subtitle: "Velcro ตะขอ ความแน่นหนา" },
  { key: "ballisticLayer", title: "แผ่น / ชั้นกันกระสุน", subtitle: "บุบสลาย แผล รอยกระแทก" },
  { key: "cleanlinessStorage", title: "ความสะอาด การเก็บรักษา", subtitle: "คราบ กลิ่น การจัดเก็บ" },
  { key: "overallReadiness", title: "ความพร้อมใช้งานโดยรวม", subtitle: "สรุปภาพรวมชิ้นนี้" },
];
