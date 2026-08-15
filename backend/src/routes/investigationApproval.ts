import { Router } from "express";
import { hashApprovalToken } from "../lib/approvalToken.js";
import { writeAuditLog } from "../lib/auditLog.js";
import {
  ORG_ROLE_LABEL_TH,
  STAGE_LABEL_TH,
  applyApprovalDecision,
  type ApprovalStage,
  type OrgRole,
} from "../lib/investigationWorkflow.js";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";

/**
 * อนุมัติผ่านลิงก์ในอีเมล — ไม่ต้องเข้าสู่ระบบ
 * ตรวจสิทธิ์ด้วย token ที่สุ่มมาและเก็บเป็น sha256 เท่านั้น ใช้ได้ครั้งเดียว
 */
export const investigationApprovalRouter = Router();

async function findByToken(rawToken: string) {
  const token = rawToken.trim();
  if (!token || token.length < 32) return null;
  const approval = await prisma.investigationApproval.findUnique({
    where: { tokenHash: hashApprovalToken(token) },
    include: {
      case: {
        include: {
          category: true,
          team: true,
          issues: { orderBy: [{ sortOrder: "asc" }] },
          approvals: { orderBy: [{ stage: "asc" }, { sequence: "asc" }] },
        },
      },
    },
  });
  return approval;
}

investigationApprovalRouter.get("/:token", async (req, res, next) => {
  try {
    const approval = await findByToken(routeParam(req.params.token));
    if (!approval) return res.status(404).json({ error: "ลิงก์ไม่ถูกต้องหรือถูกใช้ไปแล้ว" });
    if (approval.decision !== "PENDING")
      return res.status(409).json({ error: "เรื่องนี้พิจารณาไปแล้ว" });
    if (approval.tokenExpiresAt && approval.tokenExpiresAt.getTime() < Date.now())
      return res.status(410).json({ error: "ลิงก์หมดอายุแล้ว — ขอให้ผู้เสนอส่งใหม่" });

    const stage = approval.stage as ApprovalStage;
    res.json({
      approvalId: approval.id,
      stage,
      stageLabel: STAGE_LABEL_TH[stage],
      sequence: approval.sequence,
      approverName: approval.approverName,
      orgRole: approval.orgRole,
      orgRoleLabel: ORG_ROLE_LABEL_TH[approval.orgRole as OrgRole],
      expiresAt: approval.tokenExpiresAt,
      case: {
        id: approval.case.id,
        caseNumber: approval.case.caseNumber,
        title: approval.case.title,
        summary: approval.case.summary,
        conclusion: approval.case.conclusion,
        recommendation: approval.case.recommendation,
        status: approval.case.status,
        priority: approval.case.priority,
        slaDueAt: approval.case.slaDueAt,
        openedAt: approval.case.openedAt,
        categoryName: approval.case.category?.name ?? null,
        teamName: approval.case.team?.name ?? null,
        issues: approval.case.issues.map((i) => ({
          id: i.id,
          title: i.title,
          detail: i.detail,
          status: i.status,
          finding: i.finding,
        })),
      },
      previousComments: approval.case.approvals
        .filter((a) => a.stage === approval.stage && a.decision !== "PENDING")
        .map((a) => ({
          sequence: a.sequence,
          approverName: a.approverName,
          orgRoleLabel: ORG_ROLE_LABEL_TH[a.orgRole as OrgRole],
          decision: a.decision,
          comment: a.comment,
          decidedAt: a.decidedAt,
        })),
    });
  } catch (e) {
    next(e);
  }
});

investigationApprovalRouter.post("/:token", async (req, res, next) => {
  try {
    const approval = await findByToken(routeParam(req.params.token));
    if (!approval) return res.status(404).json({ error: "ลิงก์ไม่ถูกต้องหรือถูกใช้ไปแล้ว" });
    if (approval.decision !== "PENDING")
      return res.status(409).json({ error: "เรื่องนี้พิจารณาไปแล้ว" });
    if (approval.tokenExpiresAt && approval.tokenExpiresAt.getTime() < Date.now())
      return res.status(410).json({ error: "ลิงก์หมดอายุแล้ว — ขอให้ผู้เสนอส่งใหม่" });

    const decision = String(req.body?.decision ?? "").trim().toUpperCase();
    if (decision !== "APPROVED" && decision !== "REJECTED")
      return res.status(400).json({ error: "ผลพิจารณาต้องเป็น APPROVED หรือ REJECTED" });

    const result = await applyApprovalDecision({
      approvalId: approval.id,
      decision,
      comment: req.body?.comment ? String(req.body.comment) : null,
      actorUserId: null,
      actorName: approval.approverName,
    });
    if (!result.ok) return res.status(result.code).json({ error: result.error });

    await writeAuditLog(prisma, {
      entityType: "investigation-approval",
      entityId: approval.id,
      action: "UPDATE",
      summary: `พิจารณาผ่านลิงก์อีเมล คดี ${approval.case.caseNumber}: ${
        decision === "APPROVED" ? "เห็นชอบ" : "ไม่อนุมัติ"
      }`,
      after: { decision, comment: req.body?.comment ?? null, status: result.status },
      actor: { username: approval.approverName ?? "ผู้พิจารณาผ่านลิงก์" },
      req,
    });

    res.json({ ok: true, status: result.status, finished: result.finished });
  } catch (e) {
    next(e);
  }
});
