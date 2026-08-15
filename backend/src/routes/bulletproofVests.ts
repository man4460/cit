import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";

export const bulletproofVestsRouter = Router();

function parseDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function optStr(v: unknown): string | null {
  return v != null && String(v).trim() ? String(v).trim() : null;
}

bulletproofVestsRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.bulletproofVest.findMany({
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

bulletproofVestsRouter.get("/:id", async (req, res, next) => {
  try {
    const row = await prisma.bulletproofVest.findUnique({ where: { id: routeParam(req.params.id) } });
    if (!row) return res.status(404).json({ error: "ไม่พบ" });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

bulletproofVestsRouter.post("/", async (req, res, next) => {
  try {
    const {
      code, description, level, team, capturedAt, costCenter, registerNo,
      permitBeginsAt, permitExpiresAt, notes, docUrl, mailUrl, sortOrder,
    } = req.body ?? {};
    if (!code || !String(code).trim()) return res.status(400).json({ error: "กรอกรหัสเสื้อเกราะ" });
    if (!description || !String(description).trim()) return res.status(400).json({ error: "กรอกชนิด/รายละเอียด" });

    const row = await prisma.bulletproofVest.create({
      data: {
        code: String(code).trim(),
        description: String(description).trim(),
        level: level != null ? String(level).trim() : "",
        team: optStr(team),
        capturedAt: parseDate(capturedAt) ?? null,
        costCenter: optStr(costCenter),
        registerNo: optStr(registerNo),
        permitBeginsAt: parseDate(permitBeginsAt) ?? null,
        permitExpiresAt: parseDate(permitExpiresAt) ?? null,
        notes: optStr(notes),
        docUrl: optStr(docUrl),
        mailUrl: optStr(mailUrl),
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
      },
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "รหัสเสื้อเกราะซ้ำ" });
    next(e);
  }
});

bulletproofVestsRouter.put("/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const {
      code, description, level, team, capturedAt, costCenter, registerNo,
      permitBeginsAt, permitExpiresAt, notes, docUrl, mailUrl, sortOrder,
    } = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (code !== undefined) {
      const c = String(code).trim();
      if (!c) return res.status(400).json({ error: "รหัสว่างไม่ได้" });
      data.code = c;
    }
    if (description !== undefined) {
      const v = String(description).trim();
      if (!v) return res.status(400).json({ error: "ชนิด/รายละเอียดว่างไม่ได้" });
      data.description = v;
    }
    if (level !== undefined) data.level = String(level).trim();
    if (team !== undefined) data.team = String(team).trim() || null;
    if (capturedAt !== undefined) data.capturedAt = parseDate(capturedAt) ?? null;
    if (costCenter !== undefined) data.costCenter = String(costCenter).trim() || null;
    if (registerNo !== undefined) data.registerNo = String(registerNo).trim() || null;
    if (permitBeginsAt !== undefined) data.permitBeginsAt = parseDate(permitBeginsAt) ?? null;
    if (permitExpiresAt !== undefined) data.permitExpiresAt = parseDate(permitExpiresAt) ?? null;
    if (notes !== undefined) data.notes = String(notes).trim() || null;
    if (docUrl !== undefined) data.docUrl = String(docUrl).trim() || null;
    if (mailUrl !== undefined) data.mailUrl = String(mailUrl).trim() || null;
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder);

    const row = await prisma.bulletproofVest.update({ where: { id }, data });
    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "รหัสเสื้อเกราะซ้ำ" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});

bulletproofVestsRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.bulletproofVest.delete({ where: { id: routeParam(req.params.id) } });
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});
