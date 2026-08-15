import type {
  InvestigationApprovalDecision,
  InvestigationApprovalStage,
  InvestigationCaseStatus,
  InvestigationCategoryKind,
  InvestigationDocumentKind,
  InvestigationIssueStatus,
  InvestigationOrgRole,
} from "../types";

export const STATUS_LABEL_TH: Record<InvestigationCaseStatus, string> = {
  DRAFT: "ร่าง",
  PENDING_APPROVAL: "รออนุมัติเปิดคดี",
  OPEN: "เปิดคดีแล้ว",
  IN_PROGRESS: "กำลังสืบสวน",
  PENDING_EXTERNAL: "รอหน่วยงานภายนอก",
  REPORT_SUBMITTED: "รอพิจารณารายงาน",
  CLOSED: "ปิดคดี",
  ARCHIVED: "จัดเก็บ",
  REJECTED: "ไม่อนุมัติ",
};

/** สีป้ายสถานะ (Tailwind) */
export const STATUS_TONE: Record<InvestigationCaseStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700 ring-slate-200",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800 ring-amber-200",
  OPEN: "bg-sky-100 text-sky-800 ring-sky-200",
  IN_PROGRESS: "bg-indigo-100 text-indigo-800 ring-indigo-200",
  PENDING_EXTERNAL: "bg-purple-100 text-purple-800 ring-purple-200",
  REPORT_SUBMITTED: "bg-orange-100 text-orange-800 ring-orange-200",
  CLOSED: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  ARCHIVED: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  REJECTED: "bg-rose-100 text-rose-800 ring-rose-200",
};

export const STATUS_ORDER: InvestigationCaseStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "OPEN",
  "IN_PROGRESS",
  "PENDING_EXTERNAL",
  "REPORT_SUBMITTED",
  "CLOSED",
  "ARCHIVED",
  "REJECTED",
];

export const PRIORITY_LABEL_TH: Record<1 | 2 | 3, string> = {
  1: "สูง",
  2: "ปานกลาง",
  3: "ต่ำ",
};

export const KIND_LABEL_TH: Record<InvestigationCategoryKind, string> = {
  STRATEGIC: "Strategic",
  BAU: "BAU",
};

export const ORG_ROLE_LABEL_TH: Record<InvestigationOrgRole, string> = {
  DIRECTOR: "ผอ.",
  DEPUTY_DIRECTOR: "รอง ผอ.",
  ASSISTANT_DIRECTOR: "ผช.ผอ.",
  INVESTIGATOR: "จนท.สืบสวน",
};

/** เรียงจากบนลงล่างตามสายบังคับบัญชา */
export const ORG_ROLE_ORDER: InvestigationOrgRole[] = [
  "DIRECTOR",
  "DEPUTY_DIRECTOR",
  "ASSISTANT_DIRECTOR",
  "INVESTIGATOR",
];

export const STAGE_LABEL_TH: Record<InvestigationApprovalStage, string> = {
  CASE_OPEN: "ขออนุมัติเปิดคดี",
  FINAL_REPORT: "เสนอรายงานสรุปเพื่อปิดคดี",
};

export const DECISION_LABEL_TH: Record<InvestigationApprovalDecision, string> = {
  PENDING: "รอพิจารณา",
  APPROVED: "เห็นชอบ",
  REJECTED: "ไม่อนุมัติ",
};

export const ISSUE_STATUS_LABEL_TH: Record<InvestigationIssueStatus, string> = {
  OPEN: "ยังไม่เริ่ม",
  IN_PROGRESS: "กำลังสืบ",
  DONE: "ได้ข้อสรุป",
  DROPPED: "ยุติประเด็น",
};

export const ISSUE_STATUS_TONE: Record<InvestigationIssueStatus, string> = {
  OPEN: "bg-slate-100 text-slate-700 ring-slate-200",
  IN_PROGRESS: "bg-indigo-100 text-indigo-800 ring-indigo-200",
  DONE: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  DROPPED: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

export const DOCUMENT_KIND_LABEL_TH: Record<InvestigationDocumentKind, string> = {
  EVIDENCE: "พยานหลักฐาน",
  REPORT: "รายงาน",
  ATTACHMENT: "เอกสารแนบ",
};

export const CASE_EVENT_LABEL_TH: Record<string, string> = {
  CREATE: "สร้างคดี",
  SUBMIT: "เสนอพิจารณา",
  APPROVE: "เห็นชอบ",
  REJECT: "ไม่อนุมัติ",
  OPENED: "เปิดคดี",
  CLOSED: "ปิดคดี",
  ARCHIVE: "จัดเก็บ",
  STATUS: "เปลี่ยนสถานะ",
  ISSUE: "ประเด็นย่อย",
  DOCUMENT: "เอกสาร",
};

export function isStrategicKind(kind: InvestigationCategoryKind | string | null | undefined): boolean {
  return kind === "STRATEGIC";
}

/** ชื่อสั้นของทีมมาตรฐาน (ใช้บนแดชบอร์ด/การ์ด) */
const TEAM_SHORT_BY_CODE: Record<string, string> = {
  "TEAM-1": "The Fortress",
  "TEAM-2": "Financial Crime TF",
  "TEAM-3": "New Landscape TF",
};

/** คืนชื่อสั้นของทีม — รหัสมาตรฐาน / ในวงเล็บ / หรือตัดคำยาว */
export function teamShortName(team: { code?: string | null; name: string }): string {
  const code = team.code?.trim().toUpperCase();
  if (code && TEAM_SHORT_BY_CODE[code]) return TEAM_SHORT_BY_CODE[code];
  const paren = team.name.match(/\(([^)]+)\)\s*$/);
  if (paren?.[1]?.trim()) {
    const nick = paren[1].trim();
    if (/Task Force/i.test(nick)) return nick.replace(/\s*Task Force\s*/i, " TF").trim();
    return nick;
  }
  return team.name.length > 28 ? `${team.name.slice(0, 26)}…` : team.name;
}

/** แสดงชื่อแฟ้ม: ไทยเป็นหลัก · อังกฤษเป็นรอง */
export function categoryDisplayName(cat: { name: string; nameEn?: string | null } | null | undefined): string {
  if (!cat) return "—";
  return cat.nameEn?.trim() ? `${cat.name}` : cat.name;
}

export function categorySubtitle(cat: { nameEn?: string | null } | null | undefined): string | null {
  const en = cat?.nameEn?.trim();
  return en || null;
}

/** สถานะที่ถือว่าคดียังเดินอยู่ (ใช้คิด SLA) */
export function isActiveCaseStatus(status: InvestigationCaseStatus): boolean {
  return (
    status === "OPEN" ||
    status === "IN_PROGRESS" ||
    status === "PENDING_EXTERNAL" ||
    status === "REPORT_SUBMITTED"
  );
}
