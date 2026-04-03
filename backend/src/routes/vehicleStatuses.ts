import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";

export const vehicleStatusesRouter = Router();

vehicleStatusesRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.vehicleStatus.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

vehicleStatusesRouter.post("/", async (req, res, next) => {
  try {
    const { name, sortOrder } = req.body ?? {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: "กรอกชื่อสถานะ" });
    const row = await prisma.vehicleStatus.create({
      data: { name: String(name).trim(), sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0 },
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "ชื่อสถานะซ้ำ" });
    next(e);
  }
});

vehicleStatusesRouter.patch("/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const { name, sortOrder } = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (name !== undefined) {
      const n = String(name).trim();
      if (!n) return res.status(400).json({ error: "ชื่อว่างไม่ได้" });
      data.name = n;
    }
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder);
    const row = await prisma.vehicleStatus.update({ where: { id }, data });
    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "ชื่อสถานะซ้ำ" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});

vehicleStatusesRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.vehicleStatus.delete({ where: { id: routeParam(req.params.id) } });
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2003")
      return res.status(409).json({ error: "มีรถอ้างอิงสถานะนี้อยู่ — แก้ข้อมูลรถก่อน" });
    next(e);
  }
});
