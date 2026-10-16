import { Router } from "express";
import { latestReport, rebuildRound } from "../lib/waterReport.js";
import { addManual, manualBotForSite, manualState, removeManual, validateManual } from "../lib/waterManual.js";
import { loadSiteSeries } from "../lib/waterSeries.js";
import { seedHistoryRounds } from "../lib/waterHistorySeed.js";
import { persistUpload, upload } from "../lib/upload.js";
import { prisma } from "../lib/prisma.js";

export const waterSituationRouter = Router();

function withManualBots<T extends { sites: Record<string, Record<string, unknown>> }>(
  rep: T,
  active: Awaited<ReturnType<typeof manualState>>["active"],
) {
  const sites: Record<string, Record<string, unknown>> = {};
  for (const [id, s] of Object.entries(rep.sites ?? {})) {
    const bot = manualBotForSite(active, id);
    sites[id] = bot ? { ...s, bot: { ...((s.bot as object) || {}), ...bot } } : s;
  }
  return { ...rep, sites };
}

/** รายงานสถานการณ์น้ำรอบล่าสุด + ค่าที่เจ้าหน้าที่กรอก + ชุดย้อนหลังทุก 3 ชม. */
waterSituationRouter.get("/", async (_req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    const [rep, manual, series] = await Promise.all([latestReport(), manualState(), loadSiteSeries(56)]);
    res.json({ ...withManualBots(rep, manual.active), manual, series });
  } catch (e) {
    next(e);
  }
});

/** ชุดข้อมูลย้อนหลังทุกรอบ 3 ชม. รายพื้นที่ — ใช้ทำกราฟหน้าสรุป */
waterSituationRouter.get("/series", async (_req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await loadSiteSeries(56));
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

/** เจ้าหน้าที่กรอกค่าวัดจริงหน้างาน (+ แนบรูปได้) — ใช้เป็นหลักทันที และคำนวณสถานะรอบปัจจุบันใหม่ */
waterSituationRouter.post("/manual", upload.single("photo"), async (req, res, next) => {
  try {
    const body = {
      key: req.body?.key,
      value: req.body?.value,
      time: req.body?.time,
      note: req.body?.note,
      photoUrl: req.body?.photoUrl,
    };
    const v = validateManual(body);
    if (typeof v === "string") return res.status(400).json({ error: v });
    let photoUrl = v.photoUrl ?? null;
    if (req.file) {
      const saved = await persistUpload(req.file, {
        module: "water",
        kind: "photo",
        forceImage: true,
        userId: req.auth?.userId,
      });
      photoUrl = saved.publicPath;
    }
    const userId = req.auth?.userId;
    const u = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, username: true } }) : null;
    const entry = await addManual({ ...v, photoUrl, by: u?.fullName || u?.username || "" });
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

/** บังคับสร้างรอบรายงานสถานการณ์น้ำใหม่ทันที */
waterSituationRouter.post("/rebuild", async (_req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    const [rep, manual, series] = await Promise.all([rebuildRound(), manualState(), loadSiteSeries(56)]);
    res.json({ ...withManualBots(rep, manual.active), manual, series });
  } catch (e) {
    next(e);
  }
});

/** seed ประวัติย้อนหลัง 7 วัน (รอบที่ยังไม่มีไฟล์) จากกราฟสถานี + Open-Meteo */
waterSituationRouter.post("/seed-history", async (_req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    const result = await seedHistoryRounds();
    res.json({ ...result, series: await loadSiteSeries(56) });
  } catch (e) {
    next(e);
  }
});
