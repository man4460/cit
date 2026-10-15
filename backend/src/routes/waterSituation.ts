import { Router } from "express";
import { latestReport, manualBot, rebuildRound } from "../lib/waterReport.js";
import { addManual, manualState, removeManual, validateManual } from "../lib/waterManual.js";
import { prisma } from "../lib/prisma.js";

export const waterSituationRouter = Router();

/** รายงานสถานการณ์น้ำรอบล่าสุด (สร้างอัตโนมัติทุก 3 ชม. — ดู lib/waterReport.ts) + ค่าที่เจ้าหน้าที่กรอกล่าสุด */
waterSituationRouter.get("/", async (_req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    const [rep, manual] = await Promise.all([latestReport(), manualState()]);
    const hq = rep.sites.hq;
    const sites = hq ? { ...rep.sites, hq: { ...hq, bot: manualBot(manual.active) } } : rep.sites;
    res.json({ ...rep, sites, manual });
  } catch (e) {
    next(e);
  }
});

waterSituationRouter.get("/manual", async (_req, res, next) => {
  try {
    res.json(await manualState());
  } catch (e) {
    next(e);
  }
});

/** เจ้าหน้าที่กรอกค่าวัดจริงหน้างาน — ใช้เป็นหลักทันที และคำนวณสถานะรอบปัจจุบันใหม่ */
waterSituationRouter.post("/manual", async (req, res, next) => {
  try {
    const v = validateManual(req.body);
    if (typeof v === "string") return res.status(400).json({ error: v });
    const userId = req.auth?.userId;
    const u = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, username: true } }) : null;
    const entry = await addManual({ ...v, by: u?.fullName || u?.username || "" });
    await rebuildRound();
    res.status(201).json({ entry, manual: await manualState() });
  } catch (e) {
    next(e);
  }
});

waterSituationRouter.delete("/manual/:id", async (req, res, next) => {
  try {
    if (!(await removeManual(String(req.params.id)))) return res.status(404).json({ error: "ไม่พบรายการ" });
    await rebuildRound();
    res.json({ manual: await manualState() });
  } catch (e) {
    next(e);
  }
});
