import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";

export const activityCategoriesRouter = Router();

const prismaCode = (e: unknown) => (e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "");

activityCategoriesRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.activityCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

activityCategoriesRouter.post("/", async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "กรอกชื่อหมวดหมู่" });
    const max = await prisma.activityCategory.aggregate({ _max: { sortOrder: true } });
    const row = await prisma.activityCategory.create({
      data: {
        name,
        sortOrder: req.body?.sortOrder !== undefined ? Number(req.body.sortOrder) : (max._max.sortOrder ?? -1) + 1,
      },
    });
    res.status(201).json(row);
  } catch (e) {
    if (prismaCode(e) === "P2002") return res.status(409).json({ error: "ชื่อหมวดหมู่ซ้ำ" });
    next(e);
  }
});

activityCategoriesRouter.patch("/:id", async (req, res, next) => {
  try {
    const data: { name?: string; sortOrder?: number } = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: "ชื่อว่างไม่ได้" });
      data.name = name;
    }
    if (req.body?.sortOrder !== undefined) data.sortOrder = Number(req.body.sortOrder);
    const row = await prisma.activityCategory.update({ where: { id: routeParam(req.params.id) }, data });
    res.json(row);
  } catch (e) {
    if (prismaCode(e) === "P2002") return res.status(409).json({ error: "ชื่อหมวดหมู่ซ้ำ" });
    if (prismaCode(e) === "P2025") return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});

activityCategoriesRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const used = await prisma.workTask.count({ where: { categoryId: id } });
    if (used > 0) return res.status(409).json({ error: `มีกิจกรรม ${used} รายการใช้หมวดนี้อยู่ — เปลี่ยนหมวดของกิจกรรมก่อนลบ` });
    await prisma.activityCategory.delete({ where: { id } });
    res.status(204).send();
  } catch (e) {
    if (prismaCode(e) === "P2025") return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});
