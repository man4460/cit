export type MissionIncidentSeverity = "LOW" | "MEDIUM" | "HIGH";

export interface MissionIncidentPhoto {
  id: string;
  fileUrl: string;
  originalName: string | null;
  mimeType: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface MissionIncident {
  id: string;
  missionId: string;
  occurredAt: string;
  category: string;
  severity: MissionIncidentSeverity;
  location: string | null;
  description: string;
  actionTaken: string | null;
  delayMinutes: number | null;
  cargoAffected: boolean;
  resolved: boolean;
  reportedBy: string | null;
  createdAt: string;
  updatedAt: string;
  photos?: MissionIncidentPhoto[];
}

export type IncidentGroupKey = "SECURITY" | "ROAD" | "OPERATION" | "OTHER";

/** กลุ่มประเภทเหตุการณ์ — ต้องตรงกับ backend/src/lib/missionIncidentGroups.ts */
export const INCIDENT_GROUPS: {
  key: Exclude<IncidentGroupKey, "OTHER">;
  label: string;
  chip: string;
  dot: string;
  categories: readonly string[];
}[] = [
  {
    key: "SECURITY",
    label: "ความปลอดภัย / ภัยคุกคาม",
    chip: "bg-rose-50 text-rose-700 ring-rose-200",
    dot: "bg-rose-500",
    categories: ["บุคคล / ยานพาหนะต้องสงสัย", "ตู้สินค้า / ซีล / กุญแจ ผิดปกติ"],
  },
  {
    key: "ROAD",
    label: "อุบัติเหตุและสภาพเส้นทาง",
    chip: "bg-amber-50 text-amber-800 ring-amber-200",
    dot: "bg-amber-500",
    categories: ["อุบัติเหตุที่ขบวนเกี่ยวข้อง", "การจราจรติดขัด / เส้นทางปิด", "สภาพอากาศ / ภัยธรรมชาติ"],
  },
  {
    key: "OPERATION",
    label: "ยานพาหนะ อุปกรณ์ และการปฏิบัติงาน",
    chip: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    dot: "bg-indigo-500",
    categories: [
      "รถขัดข้อง / ยางรั่ว",
      "อุปกรณ์สื่อสาร / GPS ขัดข้อง",
      "บุคลากรเจ็บป่วย",
      "ส่งมอบล่าช้า / ปลายทางไม่พร้อม",
    ],
  },
];

export const OTHER_GROUP = {
  key: "OTHER" as const,
  label: "อื่นๆ (ไม่จัดกลุ่ม)",
  chip: "bg-slate-100 text-slate-700 ring-slate-200",
  dot: "bg-slate-400",
};

/** ประเภทเหตุการณ์ที่พบบ่อยในการขนส่งธนบัตร — เลือก "อื่นๆ" แล้วพิมพ์เองได้ */
export const INCIDENT_CATEGORIES: readonly string[] = INCIDENT_GROUPS.flatMap((g) => g.categories);

export const INCIDENT_OTHER = "อื่นๆ";

export const INCIDENT_GROUP_COLOR: Record<IncidentGroupKey, string> = {
  SECURITY: "#f43f5e",
  ROAD: "#f59e0b",
  OPERATION: "#6366f1",
  OTHER: "#94a3b8",
};

export const SEVERITY_COLOR: Record<MissionIncidentSeverity, string> = { LOW: "#38bdf8", MEDIUM: "#f59e0b", HIGH: "#e11d48" };

export function incidentGroupOf(category: string) {
  return INCIDENT_GROUPS.find((g) => g.categories.includes(category)) ?? OTHER_GROUP;
}

export const SEVERITY_OPTIONS: { key: MissionIncidentSeverity; label: string; chip: string; dot: string }[] = [
  { key: "LOW", label: "เล็กน้อย", chip: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-400" },
  { key: "MEDIUM", label: "ปานกลาง", chip: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  { key: "HIGH", label: "รุนแรง", chip: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500" },
];

export function severityMeta(s: MissionIncidentSeverity) {
  return SEVERITY_OPTIONS.find((o) => o.key === s) ?? SEVERITY_OPTIONS[1];
}

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export function formatIncidentTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${String(d.getFullYear() + 543).slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())} น.`;
}

export function formatDelay(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} นาที`;
  return m ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
}

/** บรรทัดสรุปเหตุการณ์สำหรับรายงานผลการปฏิบัติ */
export function incidentReportLines(i: MissionIncident): { head: string; details: string[] } {
  const head = [
    formatIncidentTime(i.occurredAt),
    i.category,
    `(${severityMeta(i.severity).label})`,
    i.location ? `ที่ ${i.location}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const details = [i.description];
  if (i.actionTaken) details.push(`การแก้ไข: ${i.actionTaken}`);
  const delay = formatDelay(i.delayMinutes);
  const status = [
    delay ? `ล่าช้า ${delay}` : "",
    i.cargoAffected ? "ทรัพย์สินได้รับผลกระทบ" : "ทรัพย์สินไม่ได้รับผลกระทบ",
    i.resolved ? "แก้ไขเรียบร้อย" : "ยังไม่ยุติ",
    i.photos?.length ? `ภาพประกอบ ${i.photos.length} รูป` : "",
  ].filter(Boolean);
  details.push(status.join(" · "));
  return { head, details };
}
