import { Router } from "express";
import XLSX from "xlsx-js-style";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";
import {
  EVALUATION_CATEGORIES,
  RATING_LABELS,
  linkIsAccepting,
  newEvaluationToken,
  parseStoredAnswers,
  personnelDisplayName,
  publicCategoryConfig,
  summarizeEvaluation,
} from "../lib/missionEvaluation.js";

/** จัดการแบบประเมินภารกิจ (QR) และรายงานผล — ผลแสดงแบบไม่ระบุตัวตน */
export const missionEvaluationsRouter = Router();

function routeLabel(route: { name: string | null; startLocation: string; endLocation: string } | null) {
  if (!route) return null;
  return route.name || `${route.startLocation} → ${route.endLocation}`;
}

function serializeLink(link: { token: string; isOpen: boolean; closesAt: Date | null; createdAt: Date } | null, status: string) {
  if (!link) return null;
  return {
    token: link.token,
    isOpen: link.isOpen,
    closesAt: link.closesAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
    accepting: linkIsAccepting(link, status),
  };
}

const responseSelect = {
  missionId: true,
  personnelId: true,
  answers: true,
  overallRating: true,
  otherComment: true,
  submittedAt: true,
  updatedAt: true,
} as const;

async function loadMissionEvaluation(missionId: string) {
  const mission = await prisma.mission.findUnique({
    where: { id: missionId },
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      plannedStart: true,
      plannedEnd: true,
      route: { select: { name: true, startLocation: true, endLocation: true } },
      evaluationLink: true,
      personnel: {
        select: {
          personnelId: true,
          personnelRole: { select: { name: true } },
          personnel: { select: { fullName: true, rank: true } },
        },
        orderBy: { personnel: { fullName: "asc" } },
      },
      evaluationResponses: { select: responseSelect, orderBy: { updatedAt: "desc" } },
    },
  });
  return mission;
}

missionEvaluationsRouter.get("/:missionId", async (req, res, next) => {
  try {
    const m = await loadMissionEvaluation(routeParam(req.params.missionId));
    if (!m) return res.status(404).json({ error: "ไม่พบภารกิจ" });
    const respondedAt = new Map(m.evaluationResponses.map((r) => [r.personnelId, r.updatedAt.toISOString()]));
    res.json({
      mission: {
        id: m.id,
        code: m.code,
        title: m.title,
        status: m.status,
        plannedStart: m.plannedStart?.toISOString() ?? null,
        plannedEnd: m.plannedEnd?.toISOString() ?? null,
        routeName: routeLabel(m.route),
      },
      link: serializeLink(m.evaluationLink, m.status),
      categories: publicCategoryConfig(),
      ratingLabels: RATING_LABELS,
      summary: summarizeEvaluation(m.evaluationResponses, m.personnel.length),
      respondents: m.personnel.map((p) => ({
        name: personnelDisplayName(p.personnel),
        role: p.personnelRole?.name ?? null,
        responded: respondedAt.has(p.personnelId),
        respondedAt: respondedAt.get(p.personnelId) ?? null,
      })),
    });
  } catch (e) {
    next(e);
  }
});

/** สร้างลิงก์ (ถ้ายังไม่มี) หรือ regenerate=true เพื่อออกลิงก์ใหม่ — QR เดิมใช้ไม่ได้ */
missionEvaluationsRouter.post("/:missionId/link", async (req, res, next) => {
  try {
    const missionId = routeParam(req.params.missionId);
    const mission = await prisma.mission.findUnique({ where: { id: missionId }, select: { id: true, status: true } });
    if (!mission) return res.status(404).json({ error: "ไม่พบภารกิจ" });
    const regenerate = Boolean((req.body as { regenerate?: unknown })?.regenerate);
    const existing = await prisma.missionEvaluationLink.findUnique({ where: { missionId } });
    const link = existing
      ? regenerate
        ? await prisma.missionEvaluationLink.update({ where: { missionId }, data: { token: newEvaluationToken(), isOpen: true } })
        : existing
      : await prisma.missionEvaluationLink.create({ data: { missionId, token: newEvaluationToken() } });
    res.json(serializeLink(link, mission.status));
  } catch (e) {
    next(e);
  }
});

missionEvaluationsRouter.patch("/:missionId/link", async (req, res, next) => {
  try {
    const missionId = routeParam(req.params.missionId);
    const existing = await prisma.missionEvaluationLink.findUnique({
      where: { missionId },
      include: { mission: { select: { status: true } } },
    });
    if (!existing) return res.status(404).json({ error: "ยังไม่ได้สร้างแบบประเมิน" });
    const body = (req.body ?? {}) as { isOpen?: unknown; closesAt?: unknown };
    const data: { isOpen?: boolean; closesAt?: Date | null } = {};
    if (typeof body.isOpen === "boolean") data.isOpen = body.isOpen;
    if (body.closesAt !== undefined) {
      if (body.closesAt === null || body.closesAt === "") data.closesAt = null;
      else {
        const d = new Date(String(body.closesAt));
        if (Number.isNaN(d.getTime())) return res.status(400).json({ error: "วันปิดรับไม่ถูกต้อง" });
        data.closesAt = d;
      }
    }
    const link = await prisma.missionEvaluationLink.update({ where: { missionId }, data });
    res.json(serializeLink(link, existing.mission.status));
  } catch (e) {
    next(e);
  }
});

const headStyle = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: { fgColor: { rgb: "3730A3" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
};

function styleHeaderRow(ws: XLSX.WorkSheet, row: number, cols: number) {
  for (let c = 0; c < cols; c++) {
    const ref = XLSX.utils.encode_cell({ r: row, c });
    if (ws[ref]) ws[ref].s = headStyle;
  }
}

missionEvaluationsRouter.get("/:missionId/export", async (req, res, next) => {
  try {
    const m = await loadMissionEvaluation(routeParam(req.params.missionId));
    if (!m) return res.status(404).json({ error: "ไม่พบภารกิจ" });
    const s = summarizeEvaluation(m.evaluationResponses, m.personnel.length);
    const fmt = (n: number | null) => (n == null ? "-" : n.toFixed(2));

    const summaryRows: (string | number)[][] = [
      [`ผลประเมินภารกิจ ${m.code ?? ""} ${m.title ?? ""}`.trim()],
      [`เส้นทาง: ${routeLabel(m.route) ?? "-"}`],
      [`ผู้ตอบ ${s.responseCount} จาก ${s.crewCount} คน (${s.responseRate}%) · คะแนนโดยรวมเฉลี่ย ${fmt(s.overall.average)} / 5`],
      [],
      ["ด้าน", "คะแนนเฉลี่ย (เต็ม 5)", "ผู้ให้คะแนน", "ไม่ได้ใช้บริการ", "5", "4", "3", "2", "1", "จุดที่ควรปรับปรุง (จำนวนครั้ง)"],
      ...s.categories.map((c) => [
        c.label,
        fmt(c.average),
        c.ratedCount,
        c.naCount,
        ...[...c.distribution].reverse(),
        c.tags.map((t) => `${t.tag} (${t.count})`).join(", ") || "-",
      ]),
      ["ความพึงพอใจโดยรวม", fmt(s.overall.average), s.responseCount, 0, ...[...s.overall.distribution].reverse(), ""],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary["!cols"] = [{ wch: 26 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 60 }];
    styleHeaderRow(wsSummary, 4, 10);
    if (wsSummary.A1) wsSummary.A1.s = { font: { bold: true, sz: 14 } };

    const detailHeader = [
      "ลำดับ",
      ...EVALUATION_CATEGORIES.flatMap((c) => [`${c.label} (คะแนน)`, `${c.label} (จุดที่ควรปรับปรุง)`, `${c.label} (ความเห็น)`]),
      "โดยรวม (คะแนน)",
      "ความเห็นอื่นๆ",
      "วันที่ตอบ",
    ];
    const detailRows = m.evaluationResponses.map((r, i) => {
      const a = parseStoredAnswers(r.answers);
      return [
        i + 1,
        ...EVALUATION_CATEGORIES.flatMap((c) => [a[c.key].rating ?? "ไม่ได้ใช้", a[c.key].tags.join(", "), a[c.key].comment]),
        r.overallRating ?? "",
        r.otherComment ?? "",
        r.updatedAt.toLocaleString("th-TH"),
      ];
    });
    const wsDetail = XLSX.utils.aoa_to_sheet([detailHeader, ...detailRows]);
    wsDetail["!cols"] = detailHeader.map((_, i) => ({ wch: i === 0 ? 6 : 24 }));
    styleHeaderRow(wsDetail, 0, detailHeader.length);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsSummary, "สรุปผล");
    XLSX.utils.book_append_sheet(wb, wsDetail, "รายละเอียด (ไม่ระบุตัวตน)");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `ผลประเมินภารกิจ_${m.code ?? m.id.slice(0, 8)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buf);
  } catch (e) {
    next(e);
  }
});
