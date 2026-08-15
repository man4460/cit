import type { Prisma } from "@prisma/client";
import { createApprovalToken } from "./approvalToken.js";
import { appBaseUrl, approvalMailBody, sendMail } from "./mailer.js";
import { prisma } from "./prisma.js";

export const ORG_ROLES = [
  "DIRECTOR",
  "DEPUTY_DIRECTOR",
  "ASSISTANT_DIRECTOR",
  "INVESTIGATOR",
] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const CASE_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "OPEN",
  "IN_PROGRESS",
  "PENDING_EXTERNAL",
  "REPORT_SUBMITTED",
  "CLOSED",
  "ARCHIVED",
  "REJECTED",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const ACTIVE_STATUSES: CaseStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "PENDING_EXTERNAL",
  "REPORT_SUBMITTED",
];

export const APPROVAL_STAGES = ["CASE_OPEN", "FINAL_REPORT"] as const;
export type ApprovalStage = (typeof APPROVAL_STAGES)[number];

/** ลำดับเสนอตามสายงาน: จนท. 1 → ผช.ผอ. 2 → รอง ผอ. 3 → ผอ. 4 */
export const ORG_ROLE_LEVEL: Record<OrgRole, number> = {
  INVESTIGATOR: 1,
  ASSISTANT_DIRECTOR: 2,
  DEPUTY_DIRECTOR: 3,
  DIRECTOR: 4,
};

export const ORG_ROLE_LABEL_TH: Record<OrgRole, string> = {
  DIRECTOR: "ผอ.",
  DEPUTY_DIRECTOR: "รอง ผอ.",
  ASSISTANT_DIRECTOR: "ผช.ผอ.",
  INVESTIGATOR: "จนท.สืบสวน",
};

export const STAGE_LABEL_TH: Record<ApprovalStage, string> = {
  CASE_OPEN: "ขออนุมัติเปิดคดี",
  FINAL_REPORT: "เสนอรายงานสรุปเพื่อปิดคดี",
};

export function isOrgRole(v: unknown): v is OrgRole {
  return typeof v === "string" && (ORG_ROLES as readonly string[]).includes(v);
}

export function isCaseStatus(v: unknown): v is CaseStatus {
  return typeof v === "string" && (CASE_STATUSES as readonly string[]).includes(v);
}

export function isApprovalStage(v: unknown): v is ApprovalStage {
  return typeof v === "string" && (APPROVAL_STAGES as readonly string[]).includes(v);
}

export const caseInclude = {
  category: true,
  subCategory: true,
  team: true,
  leadMember: true,
  requestedByMember: true,
} satisfies Prisma.InvestigationCaseInclude;

export type CaseRow = Prisma.InvestigationCaseGetPayload<{ include: typeof caseInclude }>;

export async function logCaseEvent(params: {
  caseId: string;
  type: string;
  message: string;
  actorUserId?: string | null;
  actorName?: string | null;
}) {
  await prisma.investigationCaseEvent.create({
    data: {
      caseId: params.caseId,
      type: params.type,
      message: params.message.slice(0, 1000),
      actorUserId: params.actorUserId ?? null,
      actorName: params.actorName ?? null,
    },
  });
}

/**
 * สายอนุมัติของคดี: สมาชิกระดับ 2 ขึ้นไปในทีมเดียวกัน เรียงจากต่ำไปสูง
 * ถ้าทีมไม่มีผู้อนุมัติ ใช้ผู้บริหารส่วนกลาง (สมาชิกที่ไม่สังกัดทีม) แทน
 */
export async function buildApprovalChain(teamId: string | null) {
  const teamMembers = teamId
    ? await prisma.investigationMember.findMany({
        where: { teamId, active: true, approvalLevel: { gte: 2 } },
        orderBy: [{ approvalLevel: "asc" }, { sortOrder: "asc" }],
      })
    : [];

  const central = await prisma.investigationMember.findMany({
    where: { active: true, approvalLevel: { gte: 2 }, teamId: null },
    orderBy: [{ approvalLevel: "asc" }, { sortOrder: "asc" }],
  });

  // รวมสายทีม + ส่วนกลาง โดยคงลำดับขั้นและไม่ให้ระดับซ้ำ
  const byLevel = new Map<number, (typeof central)[number]>();
  for (const m of [...teamMembers, ...central]) {
    if (!byLevel.has(m.approvalLevel)) byLevel.set(m.approvalLevel, m);
  }
  return [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([, m]) => m);
}

/** สร้าง token + ส่งอีเมลแจ้งผู้อนุมัติขั้นปัจจุบัน */
export async function notifyApprover(approvalId: string): Promise<void> {
  const approval = await prisma.investigationApproval.findUnique({
    where: { id: approvalId },
    include: { case: true, approver: true },
  });
  if (!approval) return;

  const { token, tokenHash, expiresAt } = createApprovalToken();
  await prisma.investigationApproval.update({
    where: { id: approval.id },
    data: { tokenHash, tokenExpiresAt: expiresAt, notifiedAt: new Date() },
  });

  const email = approval.approverEmail?.trim() || approval.approver?.email?.trim();
  if (!email) return;

  const requester = approval.case.requestedByMemberId
    ? await prisma.investigationMember.findUnique({ where: { id: approval.case.requestedByMemberId } })
    : null;

  await sendMail({
    to: email,
    subject: `[${approval.case.caseNumber}] ${STAGE_LABEL_TH[approval.stage as ApprovalStage]} — ${approval.case.title}`,
    body: approvalMailBody({
      caseNumber: approval.case.caseNumber,
      caseTitle: approval.case.title,
      stageLabel: STAGE_LABEL_TH[approval.stage as ApprovalStage],
      approverName: approval.approverName ?? approval.approver?.fullName ?? "ผู้พิจารณา",
      requesterName: requester?.fullName ?? null,
      link: `${appBaseUrl()}/approve/${token}`,
      expiresAt,
    }),
    relatedType: "investigation-approval",
    relatedId: approval.id,
  });
}

export type StartChainResult =
  | { ok: true; approvals: { id: string; sequence: number }[] }
  | { ok: false; error: string };

/** เปิดสายอนุมัติใหม่สำหรับคดี แล้วแจ้งผู้อนุมัติคนแรก */
export async function startApprovalChain(params: {
  caseId: string;
  stage: ApprovalStage;
  actorUserId?: string | null;
  actorName?: string | null;
}): Promise<StartChainResult> {
  const caseRow = await prisma.investigationCase.findUnique({ where: { id: params.caseId } });
  if (!caseRow) return { ok: false, error: "ไม่พบคดี" };

  const chain = await buildApprovalChain(caseRow.teamId);
  if (!chain.length) {
    return {
      ok: false,
      error: "ยังไม่มีผู้อนุมัติในสายงาน — เพิ่มสมาชิกระดับ ผช.ผอ. ขึ้นไปในหน้าทีมสืบสวนก่อน",
    };
  }

  // ล้างสายเดิมของขั้นนี้ที่ยังไม่ได้ตัดสิน เพื่อเสนอใหม่ได้
  await prisma.investigationApproval.deleteMany({
    where: { caseId: caseRow.id, stage: params.stage, decision: "PENDING" },
  });

  const created: { id: string; sequence: number }[] = [];
  let sequence = 1;
  for (const member of chain) {
    const row = await prisma.investigationApproval.create({
      data: {
        caseId: caseRow.id,
        stage: params.stage,
        sequence,
        approverMemberId: member.id,
        approverName: member.fullName,
        approverEmail: member.email,
        orgRole: member.orgRole,
        decision: "PENDING",
      },
    });
    created.push({ id: row.id, sequence });
    sequence += 1;
  }

  await prisma.investigationCase.update({
    where: { id: caseRow.id },
    data: {
      approvalStage: params.stage,
      status: params.stage === "CASE_OPEN" ? "PENDING_APPROVAL" : "REPORT_SUBMITTED",
      reportSubmittedAt: params.stage === "FINAL_REPORT" ? new Date() : undefined,
    },
  });

  await logCaseEvent({
    caseId: caseRow.id,
    type: "SUBMIT",
    message: `${STAGE_LABEL_TH[params.stage]} — เสนอตามสายงาน ${chain
      .map((m) => `${ORG_ROLE_LABEL_TH[m.orgRole as OrgRole]} ${m.fullName}`)
      .join(" → ")}`,
    actorUserId: params.actorUserId,
    actorName: params.actorName,
  });

  await notifyApprover(created[0].id);
  return { ok: true, approvals: created };
}

export type DecisionResult =
  | { ok: true; status: CaseStatus; finished: boolean }
  | { ok: false; code: number; error: string };

/** บันทึกผลพิจารณา 1 ขั้น แล้วส่งต่อขั้นถัดไปหรือปิดสาย */
export async function applyApprovalDecision(params: {
  approvalId: string;
  decision: "APPROVED" | "REJECTED";
  comment?: string | null;
  actorUserId?: string | null;
  actorName?: string | null;
}): Promise<DecisionResult> {
  const approval = await prisma.investigationApproval.findUnique({
    where: { id: params.approvalId },
    include: { case: true },
  });
  if (!approval) return { ok: false, code: 404, error: "ไม่พบรายการอนุมัติ" };
  if (approval.decision !== "PENDING")
    return { ok: false, code: 409, error: "รายการนี้พิจารณาไปแล้ว" };

  const stage = approval.stage as ApprovalStage;

  // ต้องพิจารณาตามลำดับสายงาน
  const pendingBefore = await prisma.investigationApproval.count({
    where: {
      caseId: approval.caseId,
      stage,
      decision: "PENDING",
      sequence: { lt: approval.sequence },
    },
  });
  if (pendingBefore > 0)
    return { ok: false, code: 409, error: "ยังมีขั้นก่อนหน้าที่ยังไม่ได้พิจารณา" };

  const comment = params.comment?.trim() || null;
  await prisma.investigationApproval.update({
    where: { id: approval.id },
    data: {
      decision: params.decision,
      comment,
      decidedAt: new Date(),
      decidedByUserId: params.actorUserId ?? null,
      tokenHash: null,
      tokenExpiresAt: null,
    },
  });

  const roleLabel = ORG_ROLE_LABEL_TH[approval.orgRole as OrgRole];
  const who = `${roleLabel} ${approval.approverName ?? ""}`.trim();

  if (params.decision === "REJECTED") {
    const nextStatus: CaseStatus = stage === "CASE_OPEN" ? "REJECTED" : "IN_PROGRESS";
    await prisma.investigationApproval.deleteMany({
      where: { caseId: approval.caseId, stage, decision: "PENDING" },
    });
    await prisma.investigationCase.update({
      where: { id: approval.caseId },
      data: { approvalStage: null, status: nextStatus },
    });
    await logCaseEvent({
      caseId: approval.caseId,
      type: "REJECT",
      message: `${who} ไม่อนุมัติ (${STAGE_LABEL_TH[stage]})${comment ? ` — ความเห็น: ${comment}` : ""}`,
      actorUserId: params.actorUserId,
      actorName: params.actorName ?? approval.approverName,
    });
    return { ok: true, status: nextStatus, finished: true };
  }

  await logCaseEvent({
    caseId: approval.caseId,
    type: "APPROVE",
    message: `${who} เห็นชอบ (${STAGE_LABEL_TH[stage]})${comment ? ` — ความเห็น: ${comment}` : ""}`,
    actorUserId: params.actorUserId,
    actorName: params.actorName ?? approval.approverName,
  });

  const next = await prisma.investigationApproval.findFirst({
    where: { caseId: approval.caseId, stage, decision: "PENDING" },
    orderBy: { sequence: "asc" },
  });

  if (next) {
    await notifyApprover(next.id);
    const current = await prisma.investigationCase.findUnique({ where: { id: approval.caseId } });
    return { ok: true, status: (current?.status ?? "PENDING_APPROVAL") as CaseStatus, finished: false };
  }

  const now = new Date();
  const finalStatus: CaseStatus = stage === "CASE_OPEN" ? "OPEN" : "CLOSED";
  await prisma.investigationCase.update({
    where: { id: approval.caseId },
    data:
      stage === "CASE_OPEN"
        ? { status: "OPEN", approvalStage: null, approvedAt: now, openedAt: now }
        : { status: "CLOSED", approvalStage: null, closedAt: now },
  });
  await logCaseEvent({
    caseId: approval.caseId,
    type: stage === "CASE_OPEN" ? "OPENED" : "CLOSED",
    message: stage === "CASE_OPEN" ? "อนุมัติครบสายงาน — เปิดคดี" : "อนุมัติครบสายงาน — ปิดคดี",
    actorUserId: params.actorUserId,
    actorName: params.actorName ?? approval.approverName,
  });
  return { ok: true, status: finalStatus, finished: true };
}
