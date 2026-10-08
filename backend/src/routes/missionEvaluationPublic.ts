import { Router, type Request } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";
import {
  RATING_LABELS,
  linkIsAccepting,
  parseStoredAnswers,
  personnelDisplayName,
  publicCategoryConfig,
  sanitizeAnswers,
  sanitizeOtherComment,
  sanitizeOverall,
} from "../lib/missionEvaluation.js";

/** แบบประเมินภารกิจผ่าน QR — ไม่ต้องล็อกอิน ยืนยันตัวตนด้วยชื่อในทริป + เลขบัตร 4 หลักท้าย */
export const missionEvaluationPublicRouter = Router();

const MAX_ATTEMPTS = 8;
const LOCK_MS = 15 * 60 * 1000;
const attempts = new Map<string, { n: number; until: number }>();

function attemptKey(req: Request, token: string) {
  return `${token}:${req.ip ?? ""}`;
}

function lockedMinutes(key: string) {
  const a = attempts.get(key);
  return a && a.until > Date.now() ? Math.ceil((a.until - Date.now()) / 60000) : 0;
}

function recordFail(key: string) {
  const a = attempts.get(key) ?? { n: 0, until: 0 };
  a.n += 1;
  if (a.n >= MAX_ATTEMPTS) {
    a.until = Date.now() + LOCK_MS;
    a.n = 0;
  }
  attempts.set(key, a);
}

async function loadLink(token: string) {
  if (!token || token.length < 20) return null;
  return prisma.missionEvaluationLink.findUnique({
    where: { token },
    include: {
      mission: {
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          plannedStart: true,
          plannedEnd: true,
          route: { select: { name: true, startLocation: true, endLocation: true } },
          personnel: {
            select: {
              personnelId: true,
              personnelRole: { select: { name: true } },
              personnel: {
                select: { fullName: true, rank: true, idNumber: true, personnelCategory: { select: { name: true } } },
              },
            },
            orderBy: { personnel: { fullName: "asc" } },
          },
        },
      },
    },
  });
}

type LoadedLink = NonNullable<Awaited<ReturnType<typeof loadLink>>>;

type Verified =
  | { ok: true; personnelId: string }
  | { ok: false; status: number; error: string };

function verifyIdentity(req: Request, token: string, link: LoadedLink, body: unknown): Verified {
  const key = attemptKey(req, token);
  const lock = lockedMinutes(key);
  if (lock) return { ok: false, status: 429, error: `ยืนยันตัวตนผิดหลายครั้ง — ลองใหม่ใน ${lock} นาที` };
  const b = (body ?? {}) as { personnelId?: unknown; idLast4?: unknown };
  const personnelId = typeof b.personnelId === "string" ? b.personnelId : "";
  const last4 = String(b.idLast4 ?? "").replace(/\D/g, "");
  const member = link.mission.personnel.find((p) => p.personnelId === personnelId);
  if (!member) return { ok: false, status: 400, error: "เลือกชื่อของท่านจากรายชื่อในภารกิจ" };
  if (last4.length !== 4) return { ok: false, status: 400, error: "กรอกเลขบัตรประชาชน 4 หลักท้าย" };
  const idDigits = member.personnel.idNumber.replace(/\D/g, "");
  if (idDigits.slice(-4) !== last4) {
    recordFail(key);
    return { ok: false, status: 403, error: "เลขบัตร 4 หลักท้ายไม่ตรงกับข้อมูลในระบบ" };
  }
  attempts.delete(key);
  return { ok: true, personnelId };
}

missionEvaluationPublicRouter.get("/:token", async (req, res, next) => {
  try {
    const token = routeParam(req.params.token);
    const link = await loadLink(token);
    if (!link) return res.status(404).json({ error: "ไม่พบแบบประเมิน หรือลิงก์ถูกยกเลิกแล้ว" });
    const m = link.mission;
    const responded = new Set(
      (
        await prisma.missionEvaluationResponse.findMany({
          where: { missionId: m.id },
          select: { personnelId: true },
        })
      ).map((r) => r.personnelId),
    );
    res.json({
      mission: {
        code: m.code,
        title: m.title,
        routeName: m.route ? m.route.name || `${m.route.startLocation} → ${m.route.endLocation}` : null,
        plannedStart: m.plannedStart?.toISOString() ?? null,
        plannedEnd: m.plannedEnd?.toISOString() ?? null,
      },
      accepting: linkIsAccepting(link, m.status),
      closesAt: link.closesAt?.toISOString() ?? null,
      crew: m.personnel.map((p) => ({
        personnelId: p.personnelId,
        name: personnelDisplayName(p.personnel),
        group: p.personnel.personnelCategory?.name?.trim() || "อื่นๆ",
        role: p.personnelRole?.name ?? null,
        responded: responded.has(p.personnelId),
      })),
      categories: publicCategoryConfig(),
      ratingLabels: RATING_LABELS,
    });
  } catch (e) {
    next(e);
  }
});

missionEvaluationPublicRouter.post("/:token/verify", async (req, res, next) => {
  try {
    const token = routeParam(req.params.token);
    const link = await loadLink(token);
    if (!link) return res.status(404).json({ error: "ไม่พบแบบประเมิน" });
    const v = verifyIdentity(req, token, link, req.body);
    if (!v.ok) return res.status(v.status).json({ error: v.error });
    const existing = await prisma.missionEvaluationResponse.findUnique({
      where: { missionId_personnelId: { missionId: link.missionId, personnelId: v.personnelId } },
    });
    res.json({
      ok: true,
      response: existing
        ? {
            answers: parseStoredAnswers(existing.answers),
            overallRating: existing.overallRating,
            otherComment: existing.otherComment ?? "",
            updatedAt: existing.updatedAt.toISOString(),
          }
        : null,
    });
  } catch (e) {
    next(e);
  }
});

missionEvaluationPublicRouter.post("/:token/submit", async (req, res, next) => {
  try {
    const token = routeParam(req.params.token);
    const link = await loadLink(token);
    if (!link) return res.status(404).json({ error: "ไม่พบแบบประเมิน" });
    if (!linkIsAccepting(link, link.mission.status)) {
      return res.status(409).json({ error: "แบบประเมินนี้ปิดรับคำตอบแล้ว" });
    }
    const v = verifyIdentity(req, token, link, req.body);
    if (!v.ok) return res.status(v.status).json({ error: v.error });

    const body = req.body as Record<string, unknown>;
    const overallRating = sanitizeOverall(body.overallRating);
    if (overallRating == null) return res.status(400).json({ error: "กรุณาให้คะแนนความพึงพอใจโดยรวม" });
    const answers = sanitizeAnswers(body.answers);
    const otherComment = sanitizeOtherComment(body.otherComment);

    const data = {
      answers: answers as unknown as Prisma.InputJsonValue,
      overallRating,
      otherComment,
    };
    await prisma.missionEvaluationResponse.upsert({
      where: { missionId_personnelId: { missionId: link.missionId, personnelId: v.personnelId } },
      create: { missionId: link.missionId, personnelId: v.personnelId, ...data },
      update: data,
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
