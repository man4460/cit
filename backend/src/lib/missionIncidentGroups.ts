/** กลุ่มประเภทเหตุการณ์ไม่ปกติระหว่างทริป — ต้องตรงกับ frontend/src/lib/missionIncidents.ts */
export const INCIDENT_GROUPS = [
  {
    key: "SECURITY",
    label: "ความปลอดภัย / ภัยคุกคาม",
    categories: ["บุคคล / ยานพาหนะต้องสงสัย", "ตู้สินค้า / ซีล / กุญแจ ผิดปกติ"],
  },
  {
    key: "ROAD",
    label: "อุบัติเหตุและสภาพเส้นทาง",
    categories: ["อุบัติเหตุที่ขบวนเกี่ยวข้อง", "การจราจรติดขัด / เส้นทางปิด", "สภาพอากาศ / ภัยธรรมชาติ"],
  },
  {
    key: "OPERATION",
    label: "ยานพาหนะ อุปกรณ์ และการปฏิบัติงาน",
    categories: [
      "รถขัดข้อง / ยางรั่ว",
      "อุปกรณ์สื่อสาร / GPS ขัดข้อง",
      "บุคลากรเจ็บป่วย",
      "ส่งมอบล่าช้า / ปลายทางไม่พร้อม",
    ],
  },
] as const;

export function incidentGroupLabel(category: string): string {
  return INCIDENT_GROUPS.find((g) => (g.categories as readonly string[]).includes(category))?.label ?? "อื่นๆ (ไม่จัดกลุ่ม)";
}
