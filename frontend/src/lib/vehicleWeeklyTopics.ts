export type VehicleWeeklyTopicKey =
  | "airConditioning"
  | "engineOperation"
  | "tireCondition"
  | "cctvAnalog"
  | "cctvThinkware"
  | "engineStart5Min";

export const VEHICLE_WEEKLY_TOPICS: {
  key: VehicleWeeklyTopicKey;
  title: string;
  subtitle?: string;
}[] = [
  { key: "airConditioning", title: "ระบบแอร์" },
  { key: "engineOperation", title: "การทำงานของเครื่องยนต์" },
  { key: "tireCondition", title: "สภาพยาง" },
  { key: "cctvAnalog", title: "ระบบ CCTV", subtitle: "(แบบเดิม Analog)" },
  { key: "cctvThinkware", title: "ระบบ CCTV", subtitle: "(ติดใหม่ Thinkware)" },
  { key: "engineStart5Min", title: "สตาร์ทจำนวน 5 นาที", subtitle: "ปกติ / ไม่ปกติ" },
];
