import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";

export const fireHostsRouter = Router();

fireHostsRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.fireHost.findMany({
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

fireHostsRouter.get("/:id", async (req, res, next) => {
  try {
    const row = await prisma.fireHost.findUnique({ where: { id: routeParam(req.params.id) } });
    if (!row) return res.status(404).json({ error: "ไม่พบ" });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

fireHostsRouter.post("/", async (req, res, next) => {
  try {
    const { code, detail, location, guardTeam, track, sortOrder } = req.body ?? {};
    if (!code || !String(code).trim()) return res.status(400).json({ error: "กรอกรหัส" });
    if (!location || !String(location).trim()) return res.status(400).json({ error: "กรอกสถานที่" });
    const row = await prisma.fireHost.create({
      data: {
        code: String(code).trim(),
        detail: detail != null ? String(detail) : "",
        location: String(location).trim(),
        guardTeam: guardTeam != null && String(guardTeam).trim() ? String(guardTeam).trim() : null,
        track: track === false || track === "FALSE" ? false : true,
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
      },
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "รหัสซ้ำ" });
    next(e);
  }
});

fireHostsRouter.put("/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const { code, detail, location, guardTeam, track, sortOrder } = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (code !== undefined) {
      const c = String(code).trim();
      if (!c) return res.status(400).json({ error: "รหัสว่างไม่ได้" });
      data.code = c;
    }
    if (detail !== undefined) data.detail = String(detail);
    if (location !== undefined) {
      const v = String(location).trim();
      if (!v) return res.status(400).json({ error: "สถานที่ว่างไม่ได้" });
      data.location = v;
    }
    if (guardTeam !== undefined) data.guardTeam = String(guardTeam).trim() || null;
    if (track !== undefined) data.track = !(track === false || track === "FALSE");
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder);
    const row = await prisma.fireHost.update({ where: { id }, data });
    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "รหัสซ้ำ" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});

fireHostsRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.fireHost.delete({ where: { id: routeParam(req.params.id) } });
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});
