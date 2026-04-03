import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";

export const assetItemStatusesRouter = Router();

assetItemStatusesRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.assetItemStatus.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

assetItemStatusesRouter.post("/", async (req, res, next) => {
  try {
    const { name, sortOrder, excludesFromFleetCare } = req.body ?? {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: "กรอกชื่อสถานะ" });
    const row = await prisma.assetItemStatus.create({
      data: {
        name: String(name).trim(),
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
        excludesFromFleetCare: Boolean(excludesFromFleetCare),
      },
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "ชื่อซ้ำ" });
    next(e);
  }
});

assetItemStatusesRouter.patch("/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const { name, sortOrder, excludesFromFleetCare } = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (name !== undefined) {
      const n = String(name).trim();
      if (!n) return res.status(400).json({ error: "ชื่อว่างไม่ได้" });
      data.name = n;
    }
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder);
    if (excludesFromFleetCare !== undefined) data.excludesFromFleetCare = Boolean(excludesFromFleetCare);
    const row = await prisma.assetItemStatus.update({ where: { id }, data });
    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "ชื่อซ้ำ" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});

assetItemStatusesRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.assetItemStatus.delete({ where: { id: routeParam(req.params.id) } });
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2003")
      return res.status(409).json({ error: "มีครุภัณฑ์อ้างอิง — แก้ข้อมูลก่อน" });
    next(e);
  }
});
