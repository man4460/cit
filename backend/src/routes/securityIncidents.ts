import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";
import { analyzeIncidents, type AnalysisIncident } from "../lib/incidentAnalysis.js";

export const securityIncidentsRouter = Router();

const MONTH_LABELS_TH = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

type PeriodKey = "today" | "month" | "quarter" | "year";

function startOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** ช่วงเวลาตามปฏิทินท้องถิ่น (วันนี้ / เดือนนี้ / ไตรมาสนี้ / ปีนี้) */
function periodRangeLocal(period: string): { start: Date; end: Date; year: number } | null {
  const key = period.trim().toLowerCase() as PeriodKey | "";
  if (key !== "today" && key !== "month" && key !== "quarter" && key !== "year") return null;
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let start: Date;
  if (key === "today") start = startOfLocalDay(now);
  else if (key === "month") start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  else if (key === "quarter") {
    const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
    start = new Date(now.getFullYear(), qStartMonth, 1, 0, 0, 0, 0);
  } else start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
  return { start, end, year: start.getFullYear() };
}

type IncidentSearchFields = {
  externalId: number;
  title: string;
  location: string | null;
  incidentType: string | null;
  impactLevel: string | null;
  statusResolved: boolean;
  cause: string | null;
  details: string | null;
  actionExecuted: string | null;
  reportingOfficer: string | null;
};

const incidentSearchSelect = {
  externalId: true,
  title: true,
  location: true,
  incidentType: true,
  impactLevel: true,
  statusResolved: true,
  cause: true,
  details: true,
  actionExecuted: true,
  reportingOfficer: true,
} as const;

function normalizeSearch(s: string) {
  return s.trim().toLowerCase().normalize("NFC");
}

/** ทุกคำในช่องกรองแดชบอร์ดต้องพบในข้อความของเหตุการณ์ (ตรรกะเดียวกับ rowMatchesFilter ฝั่งหน้าเว็บ) */
function incidentMatchesSearch(tokens: string[], r: IncidentSearchFields, monthIndex: number) {
  if (tokens.length === 0) return true;
  const hay = [
    String(r.externalId),
    r.title,
    (r.incidentType ?? "").trim() || "ไม่ระบุ",
    (r.location ?? "").trim() || "ไม่ระบุ",
    r.impactLevel,
    r.cause,
    r.details,
    r.actionExecuted,
    r.reportingOfficer,
    r.statusResolved ? "ปิดแล้ว" : "เปิดอยู่",
    MONTH_LABELS_TH[monthIndex],
  ]
    .map((p) => normalizeSearch(String(p ?? "")))
    .join(" ");
  return tokens.every((t) => hay.includes(t));
}

function searchTokens(raw: unknown) {
  return normalizeSearch(String(raw ?? "")).split(/\s+/).filter(Boolean);
}

async function getDashboardYears(): Promise<number[]> {
  const rows = await prisma.securityIncident.findMany({
    select: { incidentAt: true, sourceCreatedAt: true },
  });
  const years = new Set<number>();
  for (const r of rows) {
    const d = r.incidentAt ?? r.sourceCreatedAt;
    if (d) years.add(d.getUTCFullYear());
  }
  return [...years].sort((a, b) => b - a);
}

securityIncidentsRouter.get("/stats/years", async (_req, res, next) => {
  try {
    res.json({ years: await getDashboardYears() });
  } catch (e) {
    next(e);
  }
});

securityIncidentsRouter.get("/stats/year", async (req, res, next) => {
  try {
    const location = String(req.query.location ?? "").trim();
    const period = String(req.query.period ?? "").trim().toLowerCase();
    const periodWin = periodRangeLocal(period);

    const y = parseInt(String(req.query.year ?? ""), 10);
    let year = Number.isFinite(y) && y >= 2000 && y <= 2100 ? y : new Date().getFullYear();
    let start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    let end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
    let periodKey: PeriodKey | "" = "";

    if (periodWin) {
      start = periodWin.start;
      end = new Date(periodWin.end.getTime() + 1); // exclusive upper bound
      year = periodWin.year;
      periodKey = period as PeriodKey;
    }

    const tokens = searchTokens(req.query.q);
    const availableYears = await getDashboardYears();

    const rows = await prisma.securityIncident.findMany({
      where: {
        AND: [
          location ? { location } : {},
          {
            OR: [
              { incidentAt: { gte: start, lt: end } },
              { AND: [{ incidentAt: null }, { sourceCreatedAt: { gte: start, lt: end } }] },
            ],
          },
        ],
      },
      select: {
        incidentAt: true,
        sourceCreatedAt: true,
        ...incidentSearchSelect,
      },
    });

    const count = Array(12).fill(0) as number[];
    const open = Array(12).fill(0) as number[];
    const resolved = Array(12).fill(0) as number[];
    const byType = new Map<string, number>();
    const byLocation = new Map<string, number>();
    let totalOpen = 0;
    let totalResolved = 0;

    for (const r of rows) {
      const ref = r.incidentAt ?? r.sourceCreatedAt;
      if (!ref || ref < start || ref >= end) continue;
      const mo = periodWin ? ref.getMonth() : ref.getUTCMonth();
      if (!incidentMatchesSearch(tokens, r, mo)) continue;
      count[mo] += 1;
      if (r.statusResolved) {
        resolved[mo] += 1;
        totalResolved += 1;
      } else {
        open[mo] += 1;
        totalOpen += 1;
      }
      const t = (r.incidentType ?? "").trim() || "ไม่ระบุ";
      byType.set(t, (byType.get(t) ?? 0) + 1);
      const loc = (r.location ?? "").trim() || "ไม่ระบุ";
      byLocation.set(loc, (byLocation.get(loc) ?? 0) + 1);
    }

    const yearTotals = {
      total: totalOpen + totalResolved,
      open: totalOpen,
      resolved: totalResolved,
      typeCount: byType.size,
      locationCount: byLocation.size,
    };

    const months = MONTH_LABELS_TH.map((label, i) => ({
      month: i + 1,
      label,
      count: count[i],
      open: open[i],
      resolved: resolved[i],
    }));

    const sortDesc = (m: Map<string, number>) =>
      [...m.entries()]
        .map(([name, c]) => ({ name, count: c }))
        .sort((a, b) => b.count - a.count);

    res.json({
      year,
      period: periodKey || null,
      location: location || null,
      availableYears,
      yearTotals,
      months,
      byType: sortDesc(byType),
      byLocation: sortDesc(byLocation),
    });
  } catch (e) {
    next(e);
  }
});

/** รายการเหตุการณ์สำหรับ popup แดชบอร์ด — ช่วงเวลาเดียวกับ /stats/year + กรองเดือน/ประเภท/สถานที่ */
securityIncidentsRouter.get("/stats/year/incidents", async (req, res, next) => {
  try {
    const location = String(req.query.location ?? "").trim();
    const period = String(req.query.period ?? "").trim().toLowerCase();
    const periodWin = periodRangeLocal(period);
    const y = parseInt(String(req.query.year ?? ""), 10);
    const year = Number.isFinite(y) && y >= 2000 && y <= 2100 ? y : new Date().getFullYear();
    let start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    let end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
    if (periodWin) {
      start = periodWin.start;
      end = new Date(periodWin.end.getTime() + 1);
    }
    const monthQ = parseInt(String(req.query.month ?? ""), 10);
    const month = Number.isFinite(monthQ) && monthQ >= 1 && monthQ <= 12 ? monthQ : null;
    const typeQ = String(req.query.type ?? "").trim();
    const placeQ = String(req.query.place ?? "").trim();
    const statusQ = String(req.query.status ?? "").trim().toLowerCase();
    const tokens = searchTokens(req.query.q);

    const rows = await prisma.securityIncident.findMany({
      where: {
        AND: [
          location ? { location } : {},
          {
            OR: [
              { incidentAt: { gte: start, lt: end } },
              { AND: [{ incidentAt: null }, { sourceCreatedAt: { gte: start, lt: end } }] },
            ],
          },
        ],
      },
      orderBy: [{ incidentAt: "desc" }, { externalId: "desc" }],
      select: {
        id: true,
        externalId: true,
        title: true,
        location: true,
        incidentAt: true,
        sourceCreatedAt: true,
        incidentType: true,
        impactLevel: true,
        statusResolved: true,
        cause: true,
        details: true,
        actionExecuted: true,
        reportingOfficer: true,
      },
    });

    const filtered = rows.filter((r) => {
      const ref = r.incidentAt ?? r.sourceCreatedAt;
      if (!ref || ref < start || ref >= end) return false;
      const mo = periodWin ? ref.getMonth() : ref.getUTCMonth();
      if (month != null && mo + 1 !== month) return false;
      if (!incidentMatchesSearch(tokens, r, mo)) return false;
      if (typeQ && ((r.incidentType ?? "").trim() || "ไม่ระบุ") !== typeQ) return false;
      if (placeQ && ((r.location ?? "").trim() || "ไม่ระบุ") !== placeQ) return false;
      if (statusQ === "open" && r.statusResolved) return false;
      if (statusQ === "resolved" && !r.statusResolved) return false;
      return true;
    });

    res.json(filtered);
  } catch (e) {
    next(e);
  }
});

const FALSE_ALARM_GROUP = "__false_alarm__";

/** วิเคราะห์สาเหตุ — ช่วงเวลา/สถานที่/คำกรองเดียวกับ /stats/year; type = FALSE_ALARM_GROUP | ชื่อประเภท (ไม่สนตัวพิมพ์) | ว่าง = ทุกประเภท */
securityIncidentsRouter.get("/stats/year/analysis", async (req, res, next) => {
  try {
    const location = String(req.query.location ?? "").trim();
    const period = String(req.query.period ?? "").trim().toLowerCase();
    const periodWin = periodRangeLocal(period);
    const y = parseInt(String(req.query.year ?? ""), 10);
    const year = Number.isFinite(y) && y >= 2000 && y <= 2100 ? y : new Date().getFullYear();
    let start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    let end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
    if (periodWin) {
      start = periodWin.start;
      end = new Date(periodWin.end.getTime() + 1);
    }
    const tokens = searchTokens(req.query.q);
    const typeQ = String(req.query.type ?? "").trim();

    const rows = await prisma.securityIncident.findMany({
      where: {
        AND: [
          location ? { location } : {},
          {
            OR: [
              { incidentAt: { gte: start, lt: end } },
              { AND: [{ incidentAt: null }, { sourceCreatedAt: { gte: start, lt: end } }] },
            ],
          },
        ],
      },
      select: { incidentAt: true, sourceCreatedAt: true, ...incidentSearchSelect },
    });

    const inScope: AnalysisIncident[] = [];
    const typeCounts = new Map<string, { name: string; count: number }>();
    for (const r of rows) {
      const ref = r.incidentAt ?? r.sourceCreatedAt;
      if (!ref || ref < start || ref >= end) continue;
      const mo = periodWin ? ref.getMonth() : ref.getUTCMonth();
      if (!incidentMatchesSearch(tokens, r, mo)) continue;
      const typeName = (r.incidentType ?? "").trim() || "ไม่ระบุ";
      const tk = typeName.toLowerCase();
      const tc = typeCounts.get(tk) ?? { name: typeName, count: 0 };
      tc.count += 1;
      typeCounts.set(tk, tc);
      inScope.push({ ...r, ref, monthIndex: mo });
    }

    const selected = inScope.filter((r) => {
      const t = ((r.incidentType ?? "").trim() || "ไม่ระบุ").toLowerCase();
      if (!typeQ) return true;
      if (typeQ === FALSE_ALARM_GROUP) return t.includes("false alarm");
      return t === typeQ.toLowerCase();
    });

    res.json({
      ...analyzeIncidents(selected, inScope.length),
      types: [...typeCounts.values()].sort((a, b) => b.count - a.count),
      falseAlarmCount: inScope.filter((r) => (r.incidentType ?? "").toLowerCase().includes("false alarm")).length,
    });
  } catch (e) {
    next(e);
  }
});

securityIncidentsRouter.get("/", async (req, res, next) => {
  try {
    const q = String(req.query.q ?? "").trim();
    const location = String(req.query.location ?? "").trim();
    const incidentType = String(req.query.incidentType ?? "").trim();
    const status = String(req.query.status ?? "").trim().toLowerCase();
    const take = Math.min(Math.max(Number(req.query.take) || 3000, 1), 5000);

    const statusResolved =
      status === "resolved" || status === "true" || status === "closed"
        ? true
        : status === "open" || status === "false"
          ? false
          : undefined;

    const rows = await prisma.securityIncident.findMany({
      where: {
        AND: [
          location ? { location: { contains: location } } : {},
          incidentType ? { incidentType: { contains: incidentType } } : {},
          statusResolved === undefined ? {} : { statusResolved },
          q
            ? {
                OR: [
                  { title: { contains: q } },
                  { location: { contains: q } },
                  { incidentType: { contains: q } },
                  { details: { contains: q } },
                  { cause: { contains: q } },
                  { reportingOfficer: { contains: q } },
                  { createdBy: { contains: q } },
                ],
              }
            : {},
        ],
      },
      orderBy: [{ incidentAt: "desc" }, { externalId: "desc" }],
      take,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

securityIncidentsRouter.get("/meta/filters", async (_req, res, next) => {
  try {
    const [types, locations] = await Promise.all([
      prisma.securityIncident.findMany({
        where: { incidentType: { not: null } },
        distinct: ["incidentType"],
        select: { incidentType: true },
        orderBy: { incidentType: "asc" },
      }),
      prisma.securityIncident.findMany({
        where: { location: { not: null } },
        distinct: ["location"],
        select: { location: true },
        orderBy: { location: "asc" },
      }),
    ]);
    res.json({
      incidentTypes: types.map((t) => t.incidentType!).filter(Boolean),
      locations: locations.map((l) => l.location!).filter(Boolean),
    });
  } catch (e) {
    next(e);
  }
});

securityIncidentsRouter.get("/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const row =
      (await prisma.securityIncident.findUnique({ where: { id } })) ??
      (Number.isFinite(Number(id))
        ? await prisma.securityIncident.findUnique({ where: { externalId: Number(id) } })
        : null);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e) {
    next(e);
  }
});
