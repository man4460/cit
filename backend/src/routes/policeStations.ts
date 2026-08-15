import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";

export const policeStationsRouter = Router();

policeStationsRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.policeStationMaster.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

policeStationsRouter.post("/", async (req, res, next) => {
  try {
    const { name, vendorCode, sortOrder } = req.body ?? {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: "กรอกชื่อสถานี/สังกัด" });
    const row = await prisma.policeStationMaster.create({
      data: {
        name: String(name).trim(),
        vendorCode: vendorCode != null && String(vendorCode).trim() ? String(vendorCode).trim() : null,
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
      },
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "ชื่อซ้ำ" });
    next(e);
  }
});

policeStationsRouter.patch("/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const { name, vendorCode, sortOrder } = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (name !== undefined) {
      const n = String(name).trim();
      if (!n) return res.status(400).json({ error: "ชื่อว่างไม่ได้" });
      data.name = n;
    }
    if (vendorCode !== undefined)
      data.vendorCode = vendorCode == null || vendorCode === "" ? null : String(vendorCode).trim() || null;
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder);
    const row = await prisma.policeStationMaster.update({ where: { id }, data });
    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "ชื่อซ้ำ" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});

policeStationsRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.policeStationMaster.delete({ where: { id: routeParam(req.params.id) } });
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2003")
      return res.status(409).json({ error: "มีบุคลากรหรือภารกิจใช้อยู่ — แก้ข้อมูลก่อน" });
    next(e);
  }
});
