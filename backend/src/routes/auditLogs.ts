import { AuditAction, Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";

export const auditLogsRouter = Router();

const ACTIONS = new Set<string>(["CREATE", "UPDATE", "DELETE"]);

function parseDayStart(raw: string): Date | null {
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDayEnd(raw: string): Date | null {
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ค่าตัวเลือกสำหรับกรอง (ประเภท / ผู้ใช้) */
auditLogsRouter.get("/meta", async (_req, res, next) => {
  try {
    const [types, actors] = await Promise.all([
      prisma.auditLog.findMany({
        distinct: ["entityType"],
        select: { entityType: true },
        orderBy: { entityType: "asc" },
      }),
      prisma.auditLog.findMany({
        where: { actorUsername: { not: null } },
        distinct: ["actorUsername"],
        select: { actorUsername: true },
        orderBy: { actorUsername: "asc" },
        take: 200,
      }),
    ]);
    res.json({
      entityTypes: types.map((t) => t.entityType).filter(Boolean),
      actors: actors.map((a) => a.actorUsername!).filter(Boolean),
    });
  } catch (e) {
    next(e);
  }
});

auditLogsRouter.get("/", async (req, res, next) => {
  try {
    const entityType = String(req.query.entityType ?? "").trim();
    const entityId = String(req.query.entityId ?? "").trim();
    const actionRaw = String(req.query.action ?? "").trim().toUpperCase();
    const actor = String(req.query.actor ?? "").trim();
    const q = String(req.query.q ?? "").trim();
    const from = parseDayStart(String(req.query.from ?? ""));
    const to = parseDayEnd(String(req.query.to ?? ""));
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || Number(req.query.take) || 25, 1), 200);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const skip = (page - 1) * pageSize;

    const action = ACTIONS.has(actionRaw) ? (actionRaw as AuditAction) : null;

    const where: Prisma.AuditLogWhereInput = {
      AND: [
        entityType ? { entityType } : {},
        entityId ? { entityId } : {},
        action ? { action } : {},
        actor
          ? {
              OR: [
                { actorUsername: { contains: actor } },
                { actorUserId: { contains: actor } },
              ],
            }
          : {},
        from || to
          ? {
              createdAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {},
        q
          ? {
              OR: [
                { summary: { contains: q } },
                { actorUsername: { contains: q } },
                { entityId: { contains: q } },
                { entityType: { contains: q } },
              ],
            }
          : {},
      ],
    };

    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
    ]);

    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    res.json({
      items,
      total,
      page,
      pageSize,
      pageCount,
    });
  } catch (e) {
    next(e);
  }
});

auditLogsRouter.get("/:id", async (req, res, next) => {
  try {
    const row = await prisma.auditLog.findUnique({ where: { id: routeParam(req.params.id) } });
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e) {
    next(e);
  }
});
