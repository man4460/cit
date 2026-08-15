import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";

export const fireExtinguishersRouter = Router();

function parseDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

fireExtinguishersRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.fireExtinguisher.findMany({
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

fireExtinguishersRouter.get("/:id", async (req, res, next) => {
  try {
    const row = await prisma.fireExtinguisher.findUnique({ where: { id: routeParam(req.params.id) } });
    if (!row) return res.status(404).json({ error: "ไม่พบ" });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

fireExtinguishersRouter.post("/", async (req, res, next) => {
  try {
    const { code, location, kind, sizeLabel, manufacturedAt, status, guardTeam, notes, sortOrder } = req.body ?? {};
    if (!code || !String(code).trim()) return res.status(400).json({ error: "กรอกรหัสถังดับเพลิง" });
    if (!location || !String(location).trim()) return res.status(400).json({ error: "กรอกสถานที่ติดตั้ง" });
    if (!kind || !String(kind).trim()) return res.status(400).json({ error: "กรอกชนิด" });
    if (!sizeLabel || !String(sizeLabel).trim()) return res.status(400).json({ error: "กรอกขนาด" });

    const row = await prisma.fireExtinguisher.create({
      data: {
        code: String(code).trim(),
        location: String(location).trim(),
        kind: String(kind).trim(),
        sizeLabel: String(sizeLabel).trim(),
        manufacturedAt: parseDate(manufacturedAt) ?? null,
        status: status != null && String(status).trim() ? String(status).trim() : "ปกติ",
        guardTeam: guardTeam != null && String(guardTeam).trim() ? String(guardTeam).trim() : null,
        notes: notes != null && String(notes).trim() ? String(notes).trim() : null,
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
      },
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "รหัสถังดับเพลิงซ้ำ" });
    next(e);
  }
});

fireExtinguishersRouter.put("/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const { code, location, kind, sizeLabel, manufacturedAt, status, guardTeam, notes, sortOrder } = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (code !== undefined) {
      const c = String(code).trim();
      if (!c) return res.status(400).json({ error: "รหัสว่างไม่ได้" });
      data.code = c;
    }
    if (location !== undefined) {
      const v = String(location).trim();
      if (!v) return res.status(400).json({ error: "สถานที่ว่างไม่ได้" });
      data.location = v;
    }
    if (kind !== undefined) {
      const v = String(kind).trim();
      if (!v) return res.status(400).json({ error: "ชนิดว่างไม่ได้" });
      data.kind = v;
    }
    if (sizeLabel !== undefined) {
      const v = String(sizeLabel).trim();
      if (!v) return res.status(400).json({ error: "ขนาดว่างไม่ได้" });
      data.sizeLabel = v;
    }
    if (manufacturedAt !== undefined) data.manufacturedAt = parseDate(manufacturedAt) ?? null;
    if (status !== undefined) data.status = String(status).trim() || "ปกติ";
    if (guardTeam !== undefined) data.guardTeam = String(guardTeam).trim() || null;
    if (notes !== undefined) data.notes = String(notes).trim() || null;
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder);

    const row = await prisma.fireExtinguisher.update({ where: { id }, data });
    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "รหัสถังดับเพลิงซ้ำ" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});

fireExtinguishersRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.fireExtinguisher.delete({ where: { id: routeParam(req.params.id) } });
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});
