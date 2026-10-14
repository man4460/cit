import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";

export const adminNotesRouter = Router();

adminNotesRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await prisma.adminNote.findMany({ orderBy: [{ updatedAt: "desc" }] }));
  } catch (e) {
    next(e);
  }
});

adminNotesRouter.post("/", async (req, res, next) => {
  try {
    const title = String(req.body?.title ?? "").trim();
    if (!title) return res.status(400).json({ error: "กรอกชื่อโน้ต" });
    const row = await prisma.adminNote.create({
      data: { title, content: String(req.body?.content ?? ""), createdById: req.auth?.userId ?? null },
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

adminNotesRouter.put("/:id", async (req, res, next) => {
  try {
    const data: Record<string, string> = {};
    if (req.body?.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title) return res.status(400).json({ error: "ชื่อโน้ตต้องไม่ว่าง" });
      data.title = title;
    }
    if (req.body?.content !== undefined) data.content = String(req.body.content);
    const row = await prisma.adminNote.update({ where: { id: routeParam(req.params.id) }, data });
    res.json(row);
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});

adminNotesRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.adminNote.delete({ where: { id: routeParam(req.params.id) } });
    res.status(204).send();
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});
