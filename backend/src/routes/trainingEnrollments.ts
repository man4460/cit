import { TrainingResultStatus } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";

const personnelInclude = {
  personnelCategory: true,
  organizationUnitType: true,
} as const;

const listInclude = {
  personnel: { include: personnelInclude },
  trainingCourse: true,
} as const;

function parseStatus(v: unknown): TrainingResultStatus | null {
  if (v === "PASSED" || v === "FAILED") return v;
  return null;
}

function parseDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function validateRange(start: Date, end: Date): string | null {
  if (end.getTime() < start.getTime()) return "วันสิ้นสุดต้องไม่ก่อนวันเริ่มอบรม";
  return null;
}

export const trainingEnrollmentsRouter = Router();

trainingEnrollmentsRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.trainingEnrollment.findMany({
      orderBy: [{ trainingStartDate: "desc" }, { createdAt: "desc" }],
      include: listInclude,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

trainingEnrollmentsRouter.get("/:id", async (req, res, next) => {
  try {
    const row = await prisma.trainingEnrollment.findUnique({
      where: { id: routeParam(req.params.id) },
      include: listInclude,
    });
    if (!row) return res.status(404).json({ error: "ไม่พบ" });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

trainingEnrollmentsRouter.post("/", async (req, res, next) => {
  try {
    const { personnelId, trainingCourseId, trainingStartDate, trainingEndDate, status } = req.body ?? {};
    if (!personnelId || !String(personnelId).trim()) return res.status(400).json({ error: "เลือกบุคลากร" });
    if (!trainingCourseId || !String(trainingCourseId).trim())
      return res.status(400).json({ error: "เลือกหลักสูตร" });
    const start = parseDate(trainingStartDate);
    const end = parseDate(trainingEndDate);
    if (!start) return res.status(400).json({ error: "ระบุวันเริ่มอบรม" });
    if (!end) return res.status(400).json({ error: "ระบุวันสิ้นสุดอบรม" });
    const rangeErr = validateRange(start, end);
    if (rangeErr) return res.status(400).json({ error: rangeErr });
    const st = parseStatus(status) ?? TrainingResultStatus.PASSED;
    const row = await prisma.trainingEnrollment.create({
      data: {
        personnelId: String(personnelId).trim(),
        trainingCourseId: String(trainingCourseId).trim(),
        trainingStartDate: start,
        trainingEndDate: end,
        status: st,
      },
      include: listInclude,
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2003")
      return res.status(400).json({ error: "บุคลากรหรือหลักสูตรไม่ถูกต้อง" });
    next(e);
  }
});

trainingEnrollmentsRouter.patch("/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.trainingEnrollment.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "ไม่พบ" });

    const { personnelId, trainingCourseId, trainingStartDate, trainingEndDate, status } = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (personnelId !== undefined) {
      const p = String(personnelId).trim();
      if (!p) return res.status(400).json({ error: "บุคลากรว่างไม่ได้" });
      data.personnelId = p;
    }
    if (trainingCourseId !== undefined) {
      const c = String(trainingCourseId).trim();
      if (!c) return res.status(400).json({ error: "หลักสูตรว่างไม่ได้" });
      data.trainingCourseId = c;
    }
    let nextStart = existing.trainingStartDate;
    let nextEnd = existing.trainingEndDate;
    if (trainingStartDate !== undefined) {
      const start = parseDate(trainingStartDate);
      if (!start) return res.status(400).json({ error: "วันเริ่มอบรมไม่ถูกต้อง" });
      data.trainingStartDate = start;
      nextStart = start;
    }
    if (trainingEndDate !== undefined) {
      const end = parseDate(trainingEndDate);
      if (!end) return res.status(400).json({ error: "วันสิ้นสุดอบรมไม่ถูกต้อง" });
      data.trainingEndDate = end;
      nextEnd = end;
    }
    if (data.trainingStartDate !== undefined || data.trainingEndDate !== undefined) {
      const rangeErr = validateRange(nextStart, nextEnd);
      if (rangeErr) return res.status(400).json({ error: rangeErr });
    }
    if (status !== undefined) {
      const st = parseStatus(status);
      if (!st) return res.status(400).json({ error: "สถานะต้องเป็น PASSED หรือ FAILED" });
      data.status = st;
    }
    const row = await prisma.trainingEnrollment.update({
      where: { id },
      data,
      include: listInclude,
    });
    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2003")
      return res.status(400).json({ error: "บุคลากรหรือหลักสูตรไม่ถูกต้อง" });
    next(e);
  }
});

trainingEnrollmentsRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.trainingEnrollment.delete({ where: { id: routeParam(req.params.id) } });
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});
