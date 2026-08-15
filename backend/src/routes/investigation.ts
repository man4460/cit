import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { resolveActorLabel, writeAuditLog } from "../lib/auditLog.js";
import {
  ACTIVE_STATUSES,
  ORG_ROLE_LABEL_TH,
  ORG_ROLE_LEVEL,
  applyApprovalDecision,
  caseInclude,
  isCaseStatus,
  isOrgRole,
  logCaseEvent,
  startApprovalChain,
  type CaseStatus,
  type OrgRole,
} from "../lib/investigationWorkflow.js";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";
import { persistUpload, unlinkUploadFile, upload } from "../lib/upload.js";

export const investigationRouter = Router();

const KINDS = ["STRATEGIC", "BAU"] as const;
type CategoryKind = (typeof KINDS)[number];

const ISSUE_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "DROPPED"] as const;
type IssueStatus = (typeof ISSUE_STATUSES)[number];

const DOCUMENT_KINDS = ["EVIDENCE", "REPORT", "ATTACHMENT"] as const;
type DocumentKind = (typeof DOCUMENT_KINDS)[number];

function isKind(v: unknown): v is CategoryKind {
  return typeof v === "string" && (KINDS as readonly string[]).includes(v);
}

function isIssueStatus(v: unknown): v is IssueStatus {
  return typeof v === "string" && (ISSUE_STATUSES as readonly string[]).includes(v);
}

function isDocumentKind(v: unknown): v is DocumentKind {
  return typeof v === "string" && (DOCUMENT_KINDS as readonly string[]).includes(v);
}

function parseOptionalDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function optionalId(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return String(v).trim() || null;
}

function buddhistYear(d = new Date()): number {
  return d.getFullYear() + 543;
}

async function nextCaseNumber(tx: Prisma.TransactionClient = prisma): Promise<string> {
  const yearBe = buddhistYear();
  const prefix = `INV-${yearBe}-`;
  const latest = await tx.investigationCase.findFirst({
    where: { caseNumber: { startsWith: prefix } },
    orderBy: { caseNumber: "desc" },
    select: { caseNumber: true },
  });
  let seq = 1;
  if (latest?.caseNumber) {
    const m = latest.caseNumber.match(/INV-\d{4}-(\d+)$/);
    if (m) seq = Number(m[1]) + 1;
  }
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

function serializeDocument(row: {
  id: string;
  caseId: string;
  issueId: string | null;
  storedFilename: string;
  originalName: string | null;
  mimeType: string | null;
  kind: string;
  title: string | null;
  sortOrder: number;
  createdAt: Date;
}) {
  return { ...row, fileUrl: `/uploads/${row.storedFilename}` };
}

async function actorName(userId: string | undefined | null): Promise<string | null> {
  if (!userId) return null;
  const actor = await resolveActorLabel(prisma, userId);
  return actor.username ?? null;
}

// --------------------------------------------------------------------------
// แฟ้มคดีหลัก + หมวดย่อย
// --------------------------------------------------------------------------

const categoryInclude = {
  team: { select: { id: true, name: true, code: true, sortOrder: true } },
  children: {
    orderBy: [{ sortOrder: "asc" as const }, { name: "asc" as const }],
    include: {
      team: { select: { id: true, name: true, code: true, sortOrder: true } },
      _count: { select: { subCases: true } },
    },
  },
  _count: { select: { cases: true, children: true } },
} satisfies Prisma.InvestigationCategoryInclude;

const categoryOrder: Prisma.InvestigationCategoryOrderByWithRelationInput[] = [
  { sortOrder: "asc" },
  { name: "asc" },
];

investigationRouter.get("/categories", async (req, res, next) => {
  try {
    const flat = String(req.query.flat ?? "") === "1";
    if (flat) {
      const rows = await prisma.investigationCategory.findMany({
        orderBy: categoryOrder,
        include: {
          team: { select: { id: true, name: true, code: true, sortOrder: true } },
          parent: { select: { id: true, name: true, nameEn: true, code: true } },
        },
      });
      return res.json(rows);
    }
    const rows = await prisma.investigationCategory.findMany({
      where: { parentId: null },
      orderBy: categoryOrder,
      include: categoryInclude,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

investigationRouter.post("/categories", async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "กรอกชื่อแฟ้ม/หมวดย่อย" });
    const nameEn =
      req.body?.nameEn === undefined || req.body?.nameEn === null
        ? null
        : String(req.body.nameEn).trim() || null;
    const parentId = optionalId(req.body?.parentId) ?? null;
    let kindRaw = req.body?.kind ?? "BAU";
    let inheritedTeamId: string | null = null;

    if (parentId) {
      const parent = await prisma.investigationCategory.findUnique({ where: { id: parentId } });
      if (!parent) return res.status(400).json({ error: "แฟ้มหลักไม่ถูกต้อง" });
      if (parent.parentId) return res.status(400).json({ error: "หมวดย่อยซ้อนชั้นเกิน 1 ระดับไม่ได้" });
      kindRaw = req.body?.kind ?? parent.kind;
      inheritedTeamId = parent.teamId;
    }
    if (!isKind(kindRaw)) return res.status(400).json({ error: "ชนิดหมวดไม่ถูกต้อง (STRATEGIC / BAU)" });

    const sortOrder =
      req.body?.sortOrder !== undefined && Number.isFinite(Number(req.body.sortOrder))
        ? Number(req.body.sortOrder)
        : 0;
    const teamId = optionalId(req.body?.teamId) ?? inheritedTeamId;
    if (teamId) {
      const team = await prisma.investigationTeam.findUnique({ where: { id: teamId } });
      if (!team) return res.status(400).json({ error: "ทีมแนะนำไม่ถูกต้อง" });
    }

    // รหัสแฟ้มใช้เฉพาะแฟ้มหลัก
    const code = parentId ? null : optionalId(req.body?.code) ?? null;

    const row = await prisma.investigationCategory.create({
      data: {
        name,
        nameEn,
        code,
        description: req.body?.description != null ? String(req.body.description).trim() || null : null,
        kind: kindRaw,
        teamId,
        parentId,
        sortOrder,
      },
      include: categoryInclude,
    });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "investigation-category",
      entityId: row.id,
      action: "CREATE",
      summary: parentId ? `เพิ่มหมวดย่อย: ${row.name}` : `เพิ่มแฟ้มคดี: ${row.name}`,
      after: row,
      actor,
      req,
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "รหัสแฟ้มซ้ำ" });
    next(e);
  }
});

investigationRouter.patch("/categories/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.investigationCategory.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "ไม่พบแฟ้ม/หมวดย่อย" });

    const data: Prisma.InvestigationCategoryUpdateInput = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: "ชื่อว่างไม่ได้" });
      data.name = name;
    }
    if (req.body?.nameEn !== undefined)
      data.nameEn = req.body.nameEn == null ? null : String(req.body.nameEn).trim() || null;
    if (req.body?.kind !== undefined) {
      if (!isKind(req.body.kind)) return res.status(400).json({ error: "ชนิดหมวดไม่ถูกต้อง" });
      data.kind = req.body.kind;
    }
    if (req.body?.sortOrder !== undefined) {
      if (!Number.isFinite(Number(req.body.sortOrder))) return res.status(400).json({ error: "ลำดับไม่ถูกต้อง" });
      data.sortOrder = Number(req.body.sortOrder);
    }
    if (req.body?.code !== undefined) {
      if (existing.parentId) return res.status(400).json({ error: "หมวดย่อยไม่ใช้รหัสแฟ้ม" });
      data.code = optionalId(req.body.code) ?? null;
    }
    if (req.body?.description !== undefined)
      data.description = req.body.description == null ? null : String(req.body.description).trim() || null;
    if (req.body?.teamId !== undefined) {
      const teamId = optionalId(req.body.teamId) ?? null;
      if (teamId) {
        const team = await prisma.investigationTeam.findUnique({ where: { id: teamId } });
        if (!team) return res.status(400).json({ error: "ทีมแนะนำไม่ถูกต้อง" });
        data.team = { connect: { id: teamId } };
      } else {
        data.team = { disconnect: true };
      }
    }
    if (req.body?.parentId !== undefined) {
      const parentId = optionalId(req.body.parentId) ?? null;
      if (parentId === id) return res.status(400).json({ error: "ไม่สามารถเป็นหมวดย่อยของตัวเองได้" });
      if (parentId) {
        const parent = await prisma.investigationCategory.findUnique({ where: { id: parentId } });
        if (!parent) return res.status(400).json({ error: "แฟ้มหลักไม่ถูกต้อง" });
        if (parent.parentId) return res.status(400).json({ error: "หมวดย่อยซ้อนชั้นเกิน 1 ระดับไม่ได้" });
        if (!existing.parentId) {
          const childCount = await prisma.investigationCategory.count({ where: { parentId: id } });
          if (childCount > 0) return res.status(400).json({ error: "แฟ้มที่มีหมวดย่อยแล้ว ย้ายเป็นหมวดย่อยไม่ได้" });
        }
        data.parent = { connect: { id: parentId } };
        data.code = null;
      } else {
        data.parent = { disconnect: true };
      }
    }

    const row = await prisma.investigationCategory.update({ where: { id }, data, include: categoryInclude });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "investigation-category",
      entityId: row.id,
      action: "UPDATE",
      summary: `แก้ไขแฟ้ม/หมวดย่อย: ${row.name}`,
      after: row,
      actor,
      req,
    });
    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "รหัสแฟ้มซ้ำ" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบแฟ้ม/หมวดย่อย" });
    next(e);
  }
});

investigationRouter.delete("/categories/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.investigationCategory.findUnique({
      where: { id },
      include: { _count: { select: { cases: true, subCases: true, children: true } } },
    });
    if (!existing) return res.status(404).json({ error: "ไม่พบแฟ้ม/หมวดย่อย" });
    if (existing._count.cases > 0 || existing._count.subCases > 0)
      return res.status(409).json({ error: "มีคดีอ้างอิงอยู่ — ย้ายหรือลบคดีก่อน" });
    if (existing._count.children > 0)
      return res.status(409).json({ error: "ยังมีหมวดย่อย — ลบหมวดย่อยก่อน" });

    await prisma.investigationCategory.delete({ where: { id } });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "investigation-category",
      entityId: id,
      action: "DELETE",
      summary: `ลบแฟ้ม/หมวดย่อย: ${existing.name}`,
      before: existing,
      actor,
      req,
    });
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบแฟ้ม/หมวดย่อย" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2003")
      return res.status(409).json({ error: "มีคดีอ้างอิงหมวดนี้อยู่ — ย้ายหรือลบคดีก่อน" });
    next(e);
  }
});

// --------------------------------------------------------------------------
// ทีมสืบสวน + สมาชิกตามสายงาน
// --------------------------------------------------------------------------

const teamInclude = {
  members: { orderBy: [{ approvalLevel: "desc" }, { sortOrder: "asc" }, { fullName: "asc" }] },
} satisfies Prisma.InvestigationTeamInclude;

investigationRouter.get("/teams", async (_req, res, next) => {
  try {
    const rows = await prisma.investigationTeam.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: teamInclude,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

investigationRouter.post("/teams", async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "กรอกชื่อทีม" });
    const row = await prisma.investigationTeam.create({
      data: {
        name,
        code: req.body?.code ? String(req.body.code).trim() : null,
        description: req.body?.description ? String(req.body.description) : null,
        sortOrder: Number.isFinite(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : 0,
        active: req.body?.active === undefined ? true : Boolean(req.body.active),
      },
      include: teamInclude,
    });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "investigation-team",
      entityId: row.id,
      action: "CREATE",
      summary: `เพิ่มทีมสืบสวน: ${row.name}`,
      after: row,
      actor,
      req,
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "ชื่อทีมซ้ำ" });
    next(e);
  }
});

investigationRouter.patch("/teams/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const data: Prisma.InvestigationTeamUpdateInput = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: "ชื่อทีมว่างไม่ได้" });
      data.name = name;
    }
    if (req.body?.code !== undefined) data.code = req.body.code ? String(req.body.code).trim() : null;
    if (req.body?.description !== undefined)
      data.description = req.body.description ? String(req.body.description) : null;
    if (req.body?.sortOrder !== undefined) {
      if (!Number.isFinite(Number(req.body.sortOrder))) return res.status(400).json({ error: "ลำดับไม่ถูกต้อง" });
      data.sortOrder = Number(req.body.sortOrder);
    }
    if (req.body?.active !== undefined) data.active = Boolean(req.body.active);
    if (req.body?.leadMemberId !== undefined) data.leadMemberId = optionalId(req.body.leadMemberId) ?? null;

    const row = await prisma.investigationTeam.update({ where: { id }, data, include: teamInclude });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "investigation-team",
      entityId: row.id,
      action: "UPDATE",
      summary: `แก้ไขทีมสืบสวน: ${row.name}`,
      after: row,
      actor,
      req,
    });
    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "ชื่อทีมซ้ำ" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบทีม" });
    next(e);
  }
});

investigationRouter.delete("/teams/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.investigationTeam.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "ไม่พบทีม" });
    const cases = await prisma.investigationCase.count({ where: { teamId: id } });
    if (cases > 0) return res.status(409).json({ error: "มีคดีอยู่ในทีมนี้ — ย้ายคดีก่อนลบ" });
    await prisma.investigationTeam.delete({ where: { id } });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "investigation-team",
      entityId: id,
      action: "DELETE",
      summary: `ลบทีมสืบสวน: ${existing.name}`,
      before: existing,
      actor,
      req,
    });
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบทีม" });
    next(e);
  }
});

investigationRouter.get("/members", async (req, res, next) => {
  try {
    const teamId = String(req.query.teamId ?? "").trim();
    const rows = await prisma.investigationMember.findMany({
      where: teamId ? { teamId } : undefined,
      orderBy: [{ approvalLevel: "desc" }, { sortOrder: "asc" }, { fullName: "asc" }],
      include: { team: true },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

function memberDataFromBody(body: Record<string, unknown>) {
  const orgRole = (body.orgRole ?? "INVESTIGATOR") as OrgRole;
  return {
    fullName: String(body.fullName ?? "").trim(),
    orgRole,
    approvalLevel: ORG_ROLE_LEVEL[orgRole],
    position: body.position ? String(body.position).trim() : null,
    email: body.email ? String(body.email).trim() : null,
    phone: body.phone ? String(body.phone).trim() : null,
    teamId: optionalId(body.teamId) ?? null,
    userId: optionalId(body.userId) ?? null,
    personnelId: optionalId(body.personnelId) ?? null,
    active: body.active === undefined ? true : Boolean(body.active),
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
  };
}

investigationRouter.post("/members", async (req, res, next) => {
  try {
    if (req.body?.orgRole !== undefined && !isOrgRole(req.body.orgRole))
      return res.status(400).json({ error: "ตำแหน่งไม่ถูกต้อง" });
    const data = memberDataFromBody(req.body ?? {});
    if (!data.fullName) return res.status(400).json({ error: "กรอกชื่อ-สกุล" });
    const row = await prisma.investigationMember.create({ data, include: { team: true } });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "investigation-member",
      entityId: row.id,
      action: "CREATE",
      summary: `เพิ่มบุคลากรสืบสวน: ${ORG_ROLE_LABEL_TH[row.orgRole as OrgRole]} ${row.fullName}`,
      after: row,
      actor,
      req,
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

investigationRouter.patch("/members/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const body = req.body ?? {};
    const data: Prisma.InvestigationMemberUncheckedUpdateInput = {};
    if (body.fullName !== undefined) {
      const fullName = String(body.fullName).trim();
      if (!fullName) return res.status(400).json({ error: "ชื่อว่างไม่ได้" });
      data.fullName = fullName;
    }
    if (body.orgRole !== undefined) {
      const orgRole: unknown = body.orgRole;
      if (!isOrgRole(orgRole)) return res.status(400).json({ error: "ตำแหน่งไม่ถูกต้อง" });
      data.orgRole = orgRole;
      data.approvalLevel = ORG_ROLE_LEVEL[orgRole];
    }
    if (body.position !== undefined) data.position = body.position ? String(body.position).trim() : null;
    if (body.email !== undefined) data.email = body.email ? String(body.email).trim() : null;
    if (body.phone !== undefined) data.phone = body.phone ? String(body.phone).trim() : null;
    if (body.teamId !== undefined) data.teamId = optionalId(body.teamId) ?? null;
    if (body.userId !== undefined) data.userId = optionalId(body.userId) ?? null;
    if (body.personnelId !== undefined) data.personnelId = optionalId(body.personnelId) ?? null;
    if (body.active !== undefined) data.active = Boolean(body.active);
    if (body.sortOrder !== undefined) {
      if (!Number.isFinite(Number(body.sortOrder))) return res.status(400).json({ error: "ลำดับไม่ถูกต้อง" });
      data.sortOrder = Number(body.sortOrder);
    }

    const row = await prisma.investigationMember.update({ where: { id }, data, include: { team: true } });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "investigation-member",
      entityId: row.id,
      action: "UPDATE",
      summary: `แก้ไขบุคลากรสืบสวน: ${row.fullName}`,
      after: row,
      actor,
      req,
    });
    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบบุคลากร" });
    next(e);
  }
});

investigationRouter.delete("/members/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.investigationMember.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "ไม่พบบุคลากร" });
    const pending = await prisma.investigationApproval.count({
      where: { approverMemberId: id, decision: "PENDING" },
    });
    if (pending > 0) return res.status(409).json({ error: "ยังมีเรื่องรอพิจารณาของบุคคลนี้ค้างอยู่" });
    await prisma.investigationMember.delete({ where: { id } });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "investigation-member",
      entityId: id,
      action: "DELETE",
      summary: `ลบบุคลากรสืบสวน: ${existing.fullName}`,
      before: existing,
      actor,
      req,
    });
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบบุคลากร" });
    next(e);
  }
});

// --------------------------------------------------------------------------
// สถิติแดชบอร์ด
// --------------------------------------------------------------------------

investigationRouter.get("/stats", async (_req, res, next) => {
  try {
    const now = new Date();
    const categories = await prisma.investigationCategory.findMany({
      where: { parentId: null },
      orderBy: categoryOrder,
      include: categoryInclude,
    });
    const teams = await prisma.investigationTeam.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    const [
      total,
      draft,
      pendingApproval,
      openCount,
      inProgress,
      pendingExternal,
      reportSubmitted,
      closed,
      archived,
      rejected,
      slaBreached,
      byCategory,
      byTeam,
      activeByCategory,
      activeByTeam,
    ] = await Promise.all([
      prisma.investigationCase.count(),
      prisma.investigationCase.count({ where: { status: "DRAFT" } }),
      prisma.investigationCase.count({ where: { status: "PENDING_APPROVAL" } }),
      prisma.investigationCase.count({ where: { status: "OPEN" } }),
      prisma.investigationCase.count({ where: { status: "IN_PROGRESS" } }),
      prisma.investigationCase.count({ where: { status: "PENDING_EXTERNAL" } }),
      prisma.investigationCase.count({ where: { status: "REPORT_SUBMITTED" } }),
      prisma.investigationCase.count({ where: { status: "CLOSED" } }),
      prisma.investigationCase.count({ where: { status: "ARCHIVED" } }),
      prisma.investigationCase.count({ where: { status: "REJECTED" } }),
      prisma.investigationCase.count({
        where: { status: { in: ACTIVE_STATUSES }, slaDueAt: { lt: now } },
      }),
      prisma.investigationCase.groupBy({ by: ["categoryId"], _count: { _all: true } }),
      prisma.investigationCase.groupBy({ by: ["teamId"], _count: { _all: true } }),
      prisma.investigationCase.groupBy({
        by: ["categoryId"],
        where: { status: { in: ACTIVE_STATUSES } },
        _count: { _all: true },
      }),
      prisma.investigationCase.groupBy({
        by: ["teamId"],
        where: { status: { in: ACTIVE_STATUSES } },
        _count: { _all: true },
      }),
    ]);

    const countMap = new Map(byCategory.map((r) => [r.categoryId, r._count._all]));
    const activeCatMap = new Map(activeByCategory.map((r) => [r.categoryId, r._count._all]));
    const byPillar: Record<string, number> = {};
    const byCategoryRows = categories.map((c) => {
      const count = countMap.get(c.id) ?? 0;
      byPillar[c.id] = count;
      return {
        id: c.id,
        name: c.name,
        nameEn: c.nameEn,
        code: c.code,
        kind: c.kind,
        teamId: c.teamId,
        teamName: c.team?.name ?? null,
        childrenCount: c.children?.length ?? c._count?.children ?? 0,
        count,
        activeCount: activeCatMap.get(c.id) ?? 0,
      };
    });

    const teamCountMap = new Map(byTeam.map((r) => [r.teamId ?? "", r._count._all]));
    const activeTeamMap = new Map(activeByTeam.map((r) => [r.teamId ?? "", r._count._all]));
    const byTeamRows = teams.map((t) => ({
      id: t.id,
      name: t.name,
      code: t.code,
      count: teamCountMap.get(t.id) ?? 0,
      activeCount: activeTeamMap.get(t.id) ?? 0,
    }));

    const strategicIds = categories.filter((c) => c.kind === "STRATEGIC").map((c) => c.id);
    const bauIds = categories.filter((c) => c.kind === "BAU").map((c) => c.id);

    const [strategicActive, bauActive] = await Promise.all([
      strategicIds.length
        ? prisma.investigationCase.count({
            where: { categoryId: { in: strategicIds }, status: { in: ACTIVE_STATUSES } },
          })
        : Promise.resolve(0),
      bauIds.length
        ? prisma.investigationCase.count({
            where: { categoryId: { in: bauIds }, status: { in: ACTIVE_STATUSES } },
          })
        : Promise.resolve(0),
    ]);

    const strategicTotal = byCategoryRows
      .filter((c) => c.kind === "STRATEGIC")
      .reduce((s, c) => s + c.count, 0);
    const bauTotal = byCategoryRows.filter((c) => c.kind === "BAU").reduce((s, c) => s + c.count, 0);

    const recent = await prisma.investigationCase.findMany({
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: caseInclude,
    });

    res.json({
      total,
      draft,
      pendingApproval,
      open: openCount,
      inProgress,
      pendingExternal,
      reportSubmitted,
      closed,
      archived,
      rejected,
      active: openCount + inProgress + pendingExternal + reportSubmitted,
      slaBreached,
      strategic: { total: strategicTotal, active: strategicActive },
      bau: { total: bauTotal, active: bauActive },
      byPillar,
      byCategory: byCategoryRows,
      byTeam: byTeamRows,
      categories,
      teams,
      recent,
    });
  } catch (e) {
    next(e);
  }
});

// --------------------------------------------------------------------------
// กล่องงานรออนุมัติของผู้ใช้ปัจจุบัน
// --------------------------------------------------------------------------

investigationRouter.get("/approvals/inbox", async (req, res, next) => {
  try {
    const userId = req.auth?.userId;
    const members = userId
      ? await prisma.investigationMember.findMany({ where: { userId }, select: { id: true } })
      : [];
    const memberIds = members.map((m) => m.id);

    // ADMIN เห็นทุกเรื่องที่รอพิจารณาเพื่อทำแทนได้
    const isAdmin = req.auth?.role === "ADMIN";
    if (!memberIds.length && !isAdmin) return res.json([]);

    const rows = await prisma.investigationApproval.findMany({
      where: {
        decision: "PENDING",
        ...(memberIds.length && !isAdmin ? { approverMemberId: { in: memberIds } } : {}),
      },
      orderBy: [{ createdAt: "asc" }],
      include: { case: { include: caseInclude }, approver: true },
    });

    // แสดงเฉพาะขั้นที่ถึงคิวจริง (ไม่มีขั้นก่อนหน้าค้าง)
    const ready = [] as typeof rows;
    for (const row of rows) {
      const before = await prisma.investigationApproval.count({
        where: {
          caseId: row.caseId,
          stage: row.stage,
          decision: "PENDING",
          sequence: { lt: row.sequence },
        },
      });
      if (before === 0) ready.push(row);
    }
    res.json(ready);
  } catch (e) {
    next(e);
  }
});

// --------------------------------------------------------------------------
// คดี
// --------------------------------------------------------------------------

investigationRouter.get("/cases", async (req, res, next) => {
  try {
    const categoryId = String(req.query.categoryId ?? req.query.pillar ?? "").trim();
    const teamId = String(req.query.teamId ?? "").trim();
    const statusRaw = String(req.query.status ?? "").trim();
    const scope = String(req.query.scope ?? "").trim();
    const q = String(req.query.q ?? "").trim();

    const where: Prisma.InvestigationCaseWhereInput = {};
    if (categoryId) where.categoryId = categoryId;
    if (teamId) where.teamId = teamId;
    if (statusRaw) {
      if (!isCaseStatus(statusRaw)) return res.status(400).json({ error: "status ไม่ถูกต้อง" });
      where.status = statusRaw;
    } else if (scope === "archived") {
      where.status = "ARCHIVED";
    } else if (scope === "active") {
      where.status = { notIn: ["ARCHIVED"] };
    }
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { caseNumber: { contains: q } },
        { summary: { contains: q } },
        { category: { name: { contains: q } } },
        { team: { name: { contains: q } } },
      ];
    }

    const rows = await prisma.investigationCase.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      include: caseInclude,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

investigationRouter.get("/cases/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const row = await prisma.investigationCase.findUnique({
      where: { id },
      include: {
        ...caseInclude,
        issues: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: { assignee: true },
        },
        documents: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        approvals: { orderBy: [{ stage: "asc" }, { sequence: "asc" }], include: { approver: true } },
        events: { orderBy: { createdAt: "desc" }, take: 100 },
      },
    });
    if (!row) return res.status(404).json({ error: "ไม่พบคดี" });
    res.json({ ...row, documents: row.documents.map(serializeDocument) });
  } catch (e) {
    next(e);
  }
});

investigationRouter.post("/cases", async (req, res, next) => {
  try {
    const title = String(req.body?.title ?? "").trim();
    if (!title) return res.status(400).json({ error: "กรอกชื่อเรื่องคดี" });
    const categoryId = String(req.body?.categoryId ?? req.body?.pillar ?? "").trim();
    if (!categoryId) return res.status(400).json({ error: "เลือกแฟ้มคดี" });
    const cat = await prisma.investigationCategory.findUnique({ where: { id: categoryId } });
    if (!cat) return res.status(400).json({ error: "แฟ้มคดีไม่ถูกต้อง" });
    if (cat.parentId) return res.status(400).json({ error: "categoryId ต้องเป็นแฟ้มหลัก ไม่ใช่หมวดย่อย" });

    const subCategoryId = optionalId(req.body?.subCategoryId) ?? null;
    if (subCategoryId) {
      const sub = await prisma.investigationCategory.findUnique({ where: { id: subCategoryId } });
      if (!sub || sub.parentId !== categoryId)
        return res.status(400).json({ error: "หมวดย่อยไม่ถูกต้อง หรือไม่ได้อยู่ภายใต้แฟ้มที่เลือก" });
    }

    // มอบหมายทีมได้อิสระทีละเคส — ไม่บังคับตามแฟ้ม
    const teamId = optionalId(req.body?.teamId) ?? null;
    if (teamId) {
      const team = await prisma.investigationTeam.findUnique({ where: { id: teamId } });
      if (!team) return res.status(400).json({ error: "ทีมรับผิดชอบไม่ถูกต้อง" });
    }

    let status: CaseStatus = "DRAFT";
    if (req.body?.status !== undefined) {
      if (!isCaseStatus(req.body.status)) return res.status(400).json({ error: "สถานะไม่ถูกต้อง" });
      status = req.body.status;
    }

    const priorityRaw = Number(req.body?.priority ?? 2);
    const priority = Number.isFinite(priorityRaw) ? Math.min(3, Math.max(1, Math.round(priorityRaw))) : 2;

    const slaDueAt = parseOptionalDate(req.body?.slaDueAt);
    if (req.body?.slaDueAt && slaDueAt === undefined)
      return res.status(400).json({ error: "รูปแบบวันครบ SLA ไม่ถูกต้อง" });

    const openedAt = parseOptionalDate(req.body?.openedAt);
    if (req.body?.openedAt && openedAt === undefined)
      return res.status(400).json({ error: "รูปแบบวันเปิดคดีไม่ถูกต้อง" });

    const closedAt =
      status === "CLOSED" || status === "ARCHIVED"
        ? (parseOptionalDate(req.body?.closedAt) ?? new Date())
        : null;

    const tags =
      req.body?.tags === undefined || req.body?.tags === null
        ? null
        : typeof req.body.tags === "string"
          ? String(req.body.tags).trim() || null
          : JSON.stringify(req.body.tags);

    const caseNumber = await nextCaseNumber();
    const row = await prisma.investigationCase.create({
      data: {
        caseNumber,
        title,
        summary: req.body?.summary != null ? String(req.body.summary) : null,
        categoryId,
        subCategoryId,
        teamId,
        leadMemberId: optionalId(req.body?.leadMemberId) ?? null,
        requestedByMemberId: optionalId(req.body?.requestedByMemberId) ?? null,
        status,
        priority,
        slaDueAt: slaDueAt ?? null,
        openedAt: openedAt ?? new Date(),
        closedAt,
        ownerUserId: req.auth?.userId ?? null,
        tags,
      },
      include: caseInclude,
    });

    await logCaseEvent({
      caseId: row.id,
      type: "CREATE",
      message: `สร้างคดี ${row.caseNumber}`,
      actorUserId: req.auth?.userId,
      actorName: await actorName(req.auth?.userId),
    });

    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "investigation-case",
      entityId: row.id,
      action: "CREATE",
      summary: `สร้างคดี ${row.caseNumber}: ${row.title}`,
      after: row,
      actor,
      req,
    });

    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

investigationRouter.patch("/cases/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.investigationCase.findUnique({ where: { id }, include: caseInclude });
    if (!existing) return res.status(404).json({ error: "ไม่พบคดี" });

    const data: Prisma.InvestigationCaseUncheckedUpdateInput = {};
    let nextCategoryId = existing.categoryId;

    if (req.body?.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title) return res.status(400).json({ error: "ชื่อเรื่องต้องไม่ว่าง" });
      data.title = title;
    }
    if (req.body?.summary !== undefined)
      data.summary = req.body.summary == null ? null : String(req.body.summary);
    if (req.body?.conclusion !== undefined)
      data.conclusion = req.body.conclusion == null ? null : String(req.body.conclusion);
    if (req.body?.recommendation !== undefined)
      data.recommendation = req.body.recommendation == null ? null : String(req.body.recommendation);
    if (req.body?.categoryId !== undefined || req.body?.pillar !== undefined) {
      const categoryId = String(req.body?.categoryId ?? req.body?.pillar ?? "").trim();
      if (!categoryId) return res.status(400).json({ error: "เลือกแฟ้มคดี" });
      const cat = await prisma.investigationCategory.findUnique({ where: { id: categoryId } });
      if (!cat) return res.status(400).json({ error: "แฟ้มคดีไม่ถูกต้อง" });
      if (cat.parentId) return res.status(400).json({ error: "categoryId ต้องเป็นแฟ้มหลัก ไม่ใช่หมวดย่อย" });
      data.categoryId = categoryId;
      nextCategoryId = categoryId;
      // เปลี่ยนแฟ้มหลักแล้วหมวดย่อยเดิมอาจไม่เข้ากัน — เคลียร์ถ้าไม่ได้ส่ง subCategoryId มาใหม่
      if (req.body?.subCategoryId === undefined) data.subCategoryId = null;
    }
    if (req.body?.subCategoryId !== undefined) {
      const subCategoryId = optionalId(req.body.subCategoryId) ?? null;
      if (subCategoryId) {
        const sub = await prisma.investigationCategory.findUnique({ where: { id: subCategoryId } });
        if (!sub || sub.parentId !== nextCategoryId)
          return res.status(400).json({ error: "หมวดย่อยไม่ถูกต้อง หรือไม่ได้อยู่ภายใต้แฟ้มที่เลือก" });
      }
      data.subCategoryId = subCategoryId;
    }
    if (req.body?.teamId !== undefined) data.teamId = optionalId(req.body.teamId) ?? null;
    if (req.body?.leadMemberId !== undefined) data.leadMemberId = optionalId(req.body.leadMemberId) ?? null;
    if (req.body?.requestedByMemberId !== undefined)
      data.requestedByMemberId = optionalId(req.body.requestedByMemberId) ?? null;
    if (req.body?.status !== undefined) {
      if (!isCaseStatus(req.body.status)) return res.status(400).json({ error: "สถานะไม่ถูกต้อง" });
      data.status = req.body.status;
      if (req.body.status === "CLOSED" || req.body.status === "ARCHIVED") {
        if (!existing.closedAt && req.body?.closedAt === undefined) data.closedAt = new Date();
      } else if (req.body?.closedAt === undefined) {
        data.closedAt = null;
      }
    }
    if (req.body?.priority !== undefined) {
      const priorityRaw = Number(req.body.priority);
      if (!Number.isFinite(priorityRaw)) return res.status(400).json({ error: "ความสำคัญไม่ถูกต้อง" });
      data.priority = Math.min(3, Math.max(1, Math.round(priorityRaw)));
    }
    if (req.body?.slaDueAt !== undefined) {
      const slaDueAt = parseOptionalDate(req.body.slaDueAt);
      if (req.body.slaDueAt && slaDueAt === undefined)
        return res.status(400).json({ error: "รูปแบบวันครบ SLA ไม่ถูกต้อง" });
      data.slaDueAt = slaDueAt ?? null;
    }
    if (req.body?.openedAt !== undefined) {
      const openedAt = parseOptionalDate(req.body.openedAt);
      if (req.body.openedAt && openedAt === undefined)
        return res.status(400).json({ error: "รูปแบบวันเปิดคดีไม่ถูกต้อง" });
      if (openedAt) data.openedAt = openedAt;
    }
    if (req.body?.closedAt !== undefined) {
      const closedAt = parseOptionalDate(req.body.closedAt);
      if (req.body.closedAt && closedAt === undefined)
        return res.status(400).json({ error: "รูปแบบวันปิดคดีไม่ถูกต้อง" });
      data.closedAt = closedAt ?? null;
    }
    if (req.body?.tags !== undefined) {
      data.tags =
        req.body.tags == null
          ? null
          : typeof req.body.tags === "string"
            ? String(req.body.tags).trim() || null
            : JSON.stringify(req.body.tags);
    }
    if (req.body?.ownerUserId !== undefined)
      data.ownerUserId = req.body.ownerUserId ? String(req.body.ownerUserId) : null;

    const row = await prisma.investigationCase.update({ where: { id }, data, include: caseInclude });

    if (req.body?.status !== undefined && req.body.status !== existing.status) {
      await logCaseEvent({
        caseId: row.id,
        type: "STATUS",
        message: `เปลี่ยนสถานะ ${existing.status} → ${row.status}`,
        actorUserId: req.auth?.userId,
        actorName: await actorName(req.auth?.userId),
      });
    }

    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "investigation-case",
      entityId: row.id,
      action: "UPDATE",
      summary: `แก้ไขคดี ${row.caseNumber}: ${row.title}`,
      before: existing,
      after: row,
      actor,
      req,
    });

    res.json(row);
  } catch (e) {
    next(e);
  }
});

investigationRouter.delete("/cases/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.investigationCase.findUnique({
      where: { id },
      include: { documents: true },
    });
    if (!existing) return res.status(404).json({ error: "ไม่พบคดี" });

    await prisma.investigationCase.delete({ where: { id } });
    for (const doc of existing.documents) unlinkUploadFile(doc.storedFilename);

    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "investigation-case",
      entityId: id,
      action: "DELETE",
      summary: `ลบคดี ${existing.caseNumber}: ${existing.title}`,
      before: existing,
      actor,
      req,
    });

    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

// --------------------------------------------------------------------------
// Workflow: เสนอ / พิจารณา / ส่งรายงาน / จัดเก็บ
// --------------------------------------------------------------------------

investigationRouter.post("/cases/:id/submit", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.investigationCase.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "ไม่พบคดี" });
    if (!["DRAFT", "REJECTED"].includes(existing.status))
      return res.status(409).json({ error: "เสนอขออนุมัติได้เฉพาะคดีสถานะ ร่าง หรือ ไม่อนุมัติ" });

    if (req.body?.requestedByMemberId !== undefined) {
      await prisma.investigationCase.update({
        where: { id },
        data: { requestedByMemberId: optionalId(req.body.requestedByMemberId) ?? null },
      });
    }

    const result = await startApprovalChain({
      caseId: id,
      stage: "CASE_OPEN",
      actorUserId: req.auth?.userId,
      actorName: await actorName(req.auth?.userId),
    });
    if (!result.ok) return res.status(400).json({ error: result.error });

    const row = await prisma.investigationCase.findUnique({ where: { id }, include: caseInclude });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "investigation-case",
      entityId: id,
      action: "UPDATE",
      summary: `เสนอขออนุมัติเปิดคดี ${existing.caseNumber}`,
      before: existing,
      after: row,
      actor,
      req,
    });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

investigationRouter.post("/cases/:id/report/submit", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.investigationCase.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "ไม่พบคดี" });
    if (!["OPEN", "IN_PROGRESS", "PENDING_EXTERNAL"].includes(existing.status))
      return res.status(409).json({ error: "ส่งรายงานได้เมื่อคดีอยู่ระหว่างดำเนินการ" });

    const conclusion = String(req.body?.conclusion ?? "").trim();
    if (!conclusion) return res.status(400).json({ error: "กรอกผลสรุปการสืบสวน" });

    await prisma.investigationCase.update({
      where: { id },
      data: {
        conclusion,
        recommendation: req.body?.recommendation ? String(req.body.recommendation) : null,
      },
    });

    const result = await startApprovalChain({
      caseId: id,
      stage: "FINAL_REPORT",
      actorUserId: req.auth?.userId,
      actorName: await actorName(req.auth?.userId),
    });
    if (!result.ok) return res.status(400).json({ error: result.error });

    const row = await prisma.investigationCase.findUnique({ where: { id }, include: caseInclude });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "investigation-case",
      entityId: id,
      action: "UPDATE",
      summary: `ส่งรายงานสรุปคดี ${existing.caseNumber} เพื่อพิจารณาปิดคดี`,
      before: existing,
      after: row,
      actor,
      req,
    });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

investigationRouter.post("/cases/:id/approvals/:approvalId/decide", async (req, res, next) => {
  try {
    const caseId = routeParam(req.params.id);
    const approvalId = routeParam(req.params.approvalId);
    const decision = String(req.body?.decision ?? "").trim().toUpperCase();
    if (decision !== "APPROVED" && decision !== "REJECTED")
      return res.status(400).json({ error: "ผลพิจารณาต้องเป็น APPROVED หรือ REJECTED" });

    const approval = await prisma.investigationApproval.findUnique({ where: { id: approvalId } });
    if (!approval || approval.caseId !== caseId)
      return res.status(404).json({ error: "ไม่พบรายการอนุมัติของคดีนี้" });

    // เจ้าของคิวเท่านั้น (ADMIN ทำแทนได้)
    if (req.auth?.role !== "ADMIN") {
      const mine = approval.approverMemberId
        ? await prisma.investigationMember.findFirst({
            where: { id: approval.approverMemberId, userId: req.auth?.userId ?? "" },
          })
        : null;
      if (!mine) return res.status(403).json({ error: "ไม่ใช่ผู้พิจารณาของขั้นนี้" });
    }

    const result = await applyApprovalDecision({
      approvalId,
      decision,
      comment: req.body?.comment ? String(req.body.comment) : null,
      actorUserId: req.auth?.userId,
      actorName: await actorName(req.auth?.userId),
    });
    if (!result.ok) return res.status(result.code).json({ error: result.error });

    const row = await prisma.investigationCase.findUnique({ where: { id: caseId }, include: caseInclude });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "investigation-approval",
      entityId: approvalId,
      action: "UPDATE",
      summary: `พิจารณาคดี ${row?.caseNumber ?? caseId}: ${decision === "APPROVED" ? "เห็นชอบ" : "ไม่อนุมัติ"}`,
      after: { decision, comment: req.body?.comment ?? null, status: result.status },
      actor,
      req,
    });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

investigationRouter.post("/cases/:id/archive", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.investigationCase.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "ไม่พบคดี" });
    if (existing.status !== "CLOSED")
      return res.status(409).json({ error: "จัดเก็บได้เฉพาะคดีที่ปิดแล้ว" });

    const row = await prisma.investigationCase.update({
      where: { id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
      include: caseInclude,
    });
    await logCaseEvent({
      caseId: id,
      type: "ARCHIVE",
      message: "จัดเก็บคดีเข้าคลัง",
      actorUserId: req.auth?.userId,
      actorName: await actorName(req.auth?.userId),
    });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "investigation-case",
      entityId: id,
      action: "UPDATE",
      summary: `จัดเก็บคดี ${row.caseNumber}`,
      before: existing,
      after: row,
      actor,
      req,
    });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

investigationRouter.get("/cases/:id/timeline", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const rows = await prisma.investigationCaseEvent.findMany({
      where: { caseId: id },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// --------------------------------------------------------------------------
// ประเด็นย่อย
// --------------------------------------------------------------------------

investigationRouter.get("/cases/:id/issues", async (req, res, next) => {
  try {
    const caseId = routeParam(req.params.id);
    const rows = await prisma.investigationIssue.findMany({
      where: { caseId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { assignee: true },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

investigationRouter.post("/cases/:id/issues", async (req, res, next) => {
  try {
    const caseId = routeParam(req.params.id);
    const caseRow = await prisma.investigationCase.findUnique({ where: { id: caseId } });
    if (!caseRow) return res.status(404).json({ error: "ไม่พบคดี" });

    const title = String(req.body?.title ?? "").trim();
    if (!title) return res.status(400).json({ error: "กรอกชื่อประเด็น" });
    if (req.body?.status !== undefined && !isIssueStatus(req.body.status))
      return res.status(400).json({ error: "สถานะประเด็นไม่ถูกต้อง" });

    const dueAt = parseOptionalDate(req.body?.dueAt);
    if (req.body?.dueAt && dueAt === undefined)
      return res.status(400).json({ error: "รูปแบบวันครบกำหนดไม่ถูกต้อง" });

    const agg = await prisma.investigationIssue.aggregate({
      where: { caseId },
      _max: { sortOrder: true },
    });

    const row = await prisma.investigationIssue.create({
      data: {
        caseId,
        title,
        detail: req.body?.detail ? String(req.body.detail) : null,
        status: (req.body?.status as IssueStatus) ?? "OPEN",
        assigneeMemberId: optionalId(req.body?.assigneeMemberId) ?? null,
        dueAt: dueAt ?? null,
        finding: req.body?.finding ? String(req.body.finding) : null,
        sortOrder: (agg._max.sortOrder ?? 0) + 1,
      },
      include: { assignee: true },
    });

    await logCaseEvent({
      caseId,
      type: "ISSUE",
      message: `เพิ่มประเด็นย่อย: ${row.title}`,
      actorUserId: req.auth?.userId,
      actorName: await actorName(req.auth?.userId),
    });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "investigation-issue",
      entityId: row.id,
      action: "CREATE",
      summary: `เพิ่มประเด็นย่อยในคดี ${caseRow.caseNumber}: ${row.title}`,
      after: row,
      actor,
      req,
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

investigationRouter.patch("/cases/:id/issues/:issueId", async (req, res, next) => {
  try {
    const caseId = routeParam(req.params.id);
    const issueId = routeParam(req.params.issueId);
    const existing = await prisma.investigationIssue.findUnique({ where: { id: issueId } });
    if (!existing || existing.caseId !== caseId) return res.status(404).json({ error: "ไม่พบประเด็น" });

    const data: Prisma.InvestigationIssueUncheckedUpdateInput = {};
    if (req.body?.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title) return res.status(400).json({ error: "ชื่อประเด็นว่างไม่ได้" });
      data.title = title;
    }
    if (req.body?.detail !== undefined) data.detail = req.body.detail ? String(req.body.detail) : null;
    if (req.body?.finding !== undefined) data.finding = req.body.finding ? String(req.body.finding) : null;
    if (req.body?.status !== undefined) {
      if (!isIssueStatus(req.body.status)) return res.status(400).json({ error: "สถานะประเด็นไม่ถูกต้อง" });
      data.status = req.body.status;
    }
    if (req.body?.assigneeMemberId !== undefined)
      data.assigneeMemberId = optionalId(req.body.assigneeMemberId) ?? null;
    if (req.body?.dueAt !== undefined) {
      const dueAt = parseOptionalDate(req.body.dueAt);
      if (req.body.dueAt && dueAt === undefined)
        return res.status(400).json({ error: "รูปแบบวันครบกำหนดไม่ถูกต้อง" });
      data.dueAt = dueAt ?? null;
    }
    if (req.body?.sortOrder !== undefined) {
      if (!Number.isFinite(Number(req.body.sortOrder))) return res.status(400).json({ error: "ลำดับไม่ถูกต้อง" });
      data.sortOrder = Number(req.body.sortOrder);
    }

    const row = await prisma.investigationIssue.update({
      where: { id: issueId },
      data,
      include: { assignee: true },
    });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "investigation-issue",
      entityId: row.id,
      action: "UPDATE",
      summary: `แก้ไขประเด็นย่อย: ${row.title}`,
      before: existing,
      after: row,
      actor,
      req,
    });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

investigationRouter.delete("/cases/:id/issues/:issueId", async (req, res, next) => {
  try {
    const caseId = routeParam(req.params.id);
    const issueId = routeParam(req.params.issueId);
    const existing = await prisma.investigationIssue.findUnique({ where: { id: issueId } });
    if (!existing || existing.caseId !== caseId) return res.status(404).json({ error: "ไม่พบประเด็น" });

    await prisma.investigationIssue.delete({ where: { id: issueId } });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "investigation-issue",
      entityId: issueId,
      action: "DELETE",
      summary: `ลบประเด็นย่อย: ${existing.title}`,
      before: existing,
      actor,
      req,
    });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

// --------------------------------------------------------------------------
// เอกสารแนบคดี
// --------------------------------------------------------------------------

investigationRouter.get("/cases/:id/documents", async (req, res, next) => {
  try {
    const caseId = routeParam(req.params.id);
    const rows = await prisma.investigationDocument.findMany({
      where: { caseId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    res.json(rows.map(serializeDocument));
  } catch (e) {
    next(e);
  }
});

investigationRouter.post(
  "/cases/:id/documents",
  (req, res, next) => {
    upload.array("files", 24)(req, res, (err) => {
      if (err) {
        const msg = err instanceof Error ? err.message : "อัปโหลดไฟล์ไม่สำเร็จ";
        return res.status(400).json({ error: msg });
      }
      next();
    });
  },
  async (req, res, next) => {
    try {
      const caseId = routeParam(req.params.id);
      const caseRow = await prisma.investigationCase.findUnique({ where: { id: caseId } });
      if (!caseRow) return res.status(404).json({ error: "ไม่พบคดี" });

      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (!files.length) return res.status(400).json({ error: "ยังไม่ได้เลือกไฟล์" });

      const kindRaw = String(req.body?.kind ?? "ATTACHMENT");
      const kind: DocumentKind = isDocumentKind(kindRaw) ? kindRaw : "ATTACHMENT";
      const issueId = optionalId(req.body?.issueId) ?? null;
      const title = req.body?.title ? String(req.body.title).trim() : "";

      const agg = await prisma.investigationDocument.aggregate({
        where: { caseId },
        _max: { sortOrder: true },
      });
      let order = (agg._max.sortOrder ?? 0) + 1;

      const created = [];
      for (const f of files) {
        const saved = await persistUpload(f, {
          module: "investigation",
          userId: req.auth?.userId,
          kind: kind.toLowerCase(),
          categorySlug: caseRow.caseNumber.toLowerCase(),
          displayTitle: title || undefined,
          allowPdf: true,
          allowOfficeDocs: true,
        });
        const row = await prisma.investigationDocument.create({
          data: {
            caseId,
            issueId,
            storedFilename: saved.relativePath,
            originalName: saved.displayName,
            mimeType: saved.mimeType,
            kind,
            title: title || null,
            sortOrder: order,
            uploadedByUserId: req.auth?.userId ?? null,
          },
        });
        created.push(serializeDocument(row));
        order += 1;
      }

      await logCaseEvent({
        caseId,
        type: "DOCUMENT",
        message: `แนบเอกสาร ${created.length} รายการ`,
        actorUserId: req.auth?.userId,
        actorName: await actorName(req.auth?.userId),
      });
      const actor = await resolveActorLabel(prisma, req.auth?.userId);
      await writeAuditLog(prisma, {
        entityType: "investigation-document",
        entityId: created[0]?.id ?? caseId,
        action: "CREATE",
        summary: `แนบเอกสารในคดี ${caseRow.caseNumber} จำนวน ${created.length} ไฟล์`,
        after: created,
        actor,
        req,
      });
      res.status(201).json(created);
    } catch (e) {
      next(e);
    }
  },
);

investigationRouter.delete("/cases/:id/documents/:docId", async (req, res, next) => {
  try {
    const caseId = routeParam(req.params.id);
    const docId = routeParam(req.params.docId);
    const existing = await prisma.investigationDocument.findUnique({ where: { id: docId } });
    if (!existing || existing.caseId !== caseId) return res.status(404).json({ error: "ไม่พบเอกสาร" });

    await prisma.investigationDocument.delete({ where: { id: docId } });
    unlinkUploadFile(existing.storedFilename);

    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "investigation-document",
      entityId: docId,
      action: "DELETE",
      summary: `ลบเอกสารแนบ: ${existing.originalName ?? existing.storedFilename}`,
      before: existing,
      actor,
      req,
    });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

// --------------------------------------------------------------------------
// กล่องอีเมลระบบ (ADMIN)
// --------------------------------------------------------------------------

investigationRouter.get("/mail-outbox", async (req, res, next) => {
  try {
    if (req.auth?.role !== "ADMIN") return res.status(403).json({ error: "ต้องเป็นผู้ดูแลระบบ" });
    const rows = await prisma.mailOutbox.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});
