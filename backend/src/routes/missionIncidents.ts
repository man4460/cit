import { Router } from "express";
import { MissionIncidentSeverity, Prisma } from "@prisma/client";
import XLSX from "xlsx-js-style";
import { withExcelFont } from "../lib/excelFont.js";
import { incidentGroupLabel } from "../lib/missionIncidentGroups.js";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";
import { persistUpload, publicUploadPath, unlinkUploadFile, upload } from "../lib/upload.js";

/** บันทึกเหตุการณ์ไม่ปกติรายทริป — mount ที่ /missions */
export const missionIncidentsRouter = Router();

const SEVERITIES = new Set<string>(Object.values(MissionIncidentSeverity));
const MAX_PHOTOS_PER_UPLOAD = 12;

const withPhotos = { photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } } satisfies Prisma.MissionIncidentInclude;

type IncidentWithPhotos = Prisma.MissionIncidentGetPayload<{ include: typeof withPhotos }>;

function serializePhoto(p: IncidentWithPhotos["photos"][number]) {
  return {
    id: p.id,
    fileUrl: publicUploadPath(p.storedFilename),
    originalName: p.originalName,
    mimeType: p.mimeType,
    sortOrder: p.sortOrder,
    createdAt: p.createdAt,
  };
}

function serializeIncident(row: IncidentWithPhotos) {
  return { ...row, photos: row.photos.map(serializePhoto) };
}

function text(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function parseBody(body: Record<string, unknown>, partial: boolean) {
  const data: Prisma.MissionIncidentUncheckedUpdateInput = {};

  if (body.occurredAt !== undefined || !partial) {
    const d = new Date(String(body.occurredAt ?? ""));
    if (Number.isNaN(d.getTime())) return { error: "กรุณาระบุวันเวลาที่เกิดเหตุ" } as const;
    data.occurredAt = d;
  }
  if (body.category !== undefined || !partial) {
    const c = text(body.category);
    if (!c) return { error: "กรุณาเลือกประเภทเหตุการณ์" } as const;
    data.category = c;
  }
  if (body.description !== undefined || !partial) {
    const d = text(body.description);
    if (!d) return { error: "กรุณาระบุรายละเอียดเหตุการณ์" } as const;
    data.description = d;
  }
  if (body.severity !== undefined) {
    const s = String(body.severity).toUpperCase();
    if (!SEVERITIES.has(s)) return { error: "ระดับความรุนแรงไม่ถูกต้อง" } as const;
    data.severity = s as MissionIncidentSeverity;
  }
  if (body.location !== undefined) data.location = text(body.location);
  if (body.actionTaken !== undefined) data.actionTaken = text(body.actionTaken);
  if (body.reportedBy !== undefined) data.reportedBy = text(body.reportedBy);
  if (body.delayMinutes !== undefined) {
    const n = body.delayMinutes === null || body.delayMinutes === "" ? null : Number(body.delayMinutes);
    data.delayMinutes = n != null && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }
  if (body.cargoAffected !== undefined) data.cargoAffected = Boolean(body.cargoAffected);
  if (body.resolved !== undefined) data.resolved = Boolean(body.resolved);

  return { data } as const;
}

const MONTH_LABELS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const SEVERITY_LABEL: Record<MissionIncidentSeverity, string> = { LOW: "เล็กน้อย", MEDIUM: "ปานกลาง", HIGH: "รุนแรง" };

function parseYear(v: unknown): number {
  const y = parseInt(String(v ?? ""), 10);
  return Number.isFinite(y) && y >= 2000 && y <= 2100 ? y : new Date().getFullYear();
}

function routeLabel(route: { name: string | null; startLocation: string; endLocation: string } | null): string {
  if (!route) return "ไม่ระบุเส้นทาง";
  return [route.startLocation, route.endLocation].filter(Boolean).join(" → ") || route.name || "ไม่ระบุเส้นทาง";
}

async function loadYearIncidents(year: number | null) {
  return prisma.missionIncident.findMany({
    where: year == null ? undefined : { occurredAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } },
    orderBy: [{ occurredAt: "desc" }],
    include: {
      _count: { select: { photos: true } },
      mission: {
        select: {
          id: true,
          code: true,
          title: true,
          route: { select: { name: true, startLocation: true, endLocation: true } },
        },
      },
    },
  });
}

/** ทะเบียนเหตุการณ์ไม่ปกติทุกทริปทุกปี — กรองฝั่ง client */
missionIncidentsRouter.get("/incident-log", async (_req, res, next) => {
  try {
    const rows = await loadYearIncidents(null);
    res.json(
      rows.map((r) => ({
        id: r.id,
        missionId: r.missionId,
        missionCode: r.mission.code,
        missionTitle: r.mission.title,
        routeLabel: routeLabel(r.mission.route),
        occurredAt: r.occurredAt,
        category: r.category,
        severity: r.severity,
        location: r.location,
        description: r.description,
        actionTaken: r.actionTaken,
        delayMinutes: r.delayMinutes,
        cargoAffected: r.cargoAffected,
        resolved: r.resolved,
        photoCount: r._count.photos,
      })),
    );
  } catch (e) {
    next(e);
  }
});

/** สถิติเหตุการณ์ไม่ปกติทั้งปี (ตามวันเวลาที่เกิดเหตุ) — ต้องประกาศก่อน /:missionId/incidents */
missionIncidentsRouter.get("/stats/incidents", async (req, res, next) => {
  try {
    const year = parseYear(req.query.year);
    const [rows, tripCount] = await Promise.all([
      loadYearIncidents(year),
      prisma.mission.count({
        where: { plannedStart: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
      }),
    ]);

    const months = MONTH_LABELS.map((label, i) => ({ month: i + 1, label, LOW: 0, MEDIUM: 0, HIGH: 0, total: 0 }));
    const byCategory = new Map<string, { count: number; high: number }>();
    const byRoute = new Map<string, number>();
    const trips = new Set<string>();
    const totals = { incidents: rows.length, high: 0, medium: 0, low: 0, unresolved: 0, cargoAffected: 0, delayMinutes: 0 };

    for (const r of rows) {
      const m = months[r.occurredAt.getMonth()];
      m[r.severity] += 1;
      m.total += 1;
      if (r.severity === "HIGH") totals.high += 1;
      else if (r.severity === "MEDIUM") totals.medium += 1;
      else totals.low += 1;
      if (!r.resolved) totals.unresolved += 1;
      if (r.cargoAffected) totals.cargoAffected += 1;
      totals.delayMinutes += r.delayMinutes ?? 0;
      trips.add(r.missionId);
      const c = byCategory.get(r.category) ?? { count: 0, high: 0 };
      c.count += 1;
      if (r.severity === "HIGH") c.high += 1;
      byCategory.set(r.category, c);
      const rl = routeLabel(r.mission.route);
      byRoute.set(rl, (byRoute.get(rl) ?? 0) + 1);
    }

    res.json({
      year,
      totals: { ...totals, tripsWithIncidents: trips.size, tripCount },
      months,
      byCategory: [...byCategory.entries()]
        .map(([category, v]) => ({ category, ...v }))
        .sort((a, b) => b.count - a.count),
      byRoute: [...byRoute.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
      rows: rows.map((r) => ({
        id: r.id,
        missionId: r.missionId,
        missionCode: r.mission.code,
        missionTitle: r.mission.title,
        routeLabel: routeLabel(r.mission.route),
        occurredAt: r.occurredAt,
        category: r.category,
        severity: r.severity,
        location: r.location,
        description: r.description,
        delayMinutes: r.delayMinutes,
        cargoAffected: r.cargoAffected,
        resolved: r.resolved,
        photoCount: r._count.photos,
      })),
    });
  } catch (e) {
    next(e);
  }
});

missionIncidentsRouter.get("/stats/incidents/export.xlsx", async (req, res, next) => {
  try {
    const year = parseYear(req.query.year);
    const rows = await loadYearIncidents(year);
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) =>
      `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const header = [
      "ลำดับ",
      "วันเวลาที่เกิดเหตุ",
      "ภารกิจ",
      "เส้นทาง",
      "กลุ่ม",
      "ประเภท",
      "ความรุนแรง",
      "สถานที่",
      "รายละเอียด",
      "การแก้ไข",
      "ล่าช้า (นาที)",
      "ทรัพย์สินได้รับผลกระทบ",
      "สถานะ",
      "จำนวนรูป",
      "ผู้บันทึก",
    ];
    const aoa: (string | number)[][] = [
      [`เหตุการณ์ไม่ปกติระหว่างทริปขนส่งธนบัตร — พ.ศ. ${year + 543}`],
      header,
      ...[...rows].reverse().map((r, i) => [
        i + 1,
        fmt(r.occurredAt),
        r.mission.code || r.mission.title || "",
        routeLabel(r.mission.route),
        incidentGroupLabel(r.category),
        r.category,
        SEVERITY_LABEL[r.severity],
        r.location ?? "",
        r.description,
        r.actionTaken ?? "",
        r.delayMinutes ?? "",
        r.cargoAffected ? "ใช่" : "ไม่",
        r.resolved ? "แก้ไขเรียบร้อย" : "ยังไม่ยุติ",
        r._count.photos,
        r.reportedBy ?? "",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [6, 18, 22, 20, 28, 26, 11, 24, 48, 36, 11, 14, 14, 9, 18].map((wch) => ({ wch }));
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } }];
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (!cell) continue;
        cell.s =
          r === 0
            ? { font: withExcelFont({ bold: true, sz: 14, color: { rgb: "1E1B4B" } }) }
            : r === 1
              ? {
                  font: withExcelFont({ bold: true, sz: 10, color: { rgb: "312E81" } }),
                  fill: { fgColor: { rgb: "E0E7FF" } },
                  alignment: { horizontal: "center", vertical: "center", wrapText: true },
                }
              : { font: withExcelFont({ sz: 10 }), alignment: { vertical: "top", wrapText: true } };
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "เหตุการณ์ไม่ปกติ");
    const file = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const filename = `เหตุการณ์ไม่ปกติระหว่างทริป_${year + 543}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(file);
  } catch (e) {
    next(e);
  }
});

async function findIncident(missionId: string, incidentId: string) {
  return prisma.missionIncident.findFirst({
    where: { id: incidentId, missionId },
    include: withPhotos,
  });
}

missionIncidentsRouter.get("/:missionId/incidents", async (req, res, next) => {
  try {
    const rows = await prisma.missionIncident.findMany({
      where: { missionId: routeParam(req.params.missionId) },
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
      include: withPhotos,
    });
    res.json(rows.map(serializeIncident));
  } catch (e) {
    next(e);
  }
});

missionIncidentsRouter.post("/:missionId/incidents", async (req, res, next) => {
  try {
    const missionId = routeParam(req.params.missionId);
    const mission = await prisma.mission.findUnique({ where: { id: missionId }, select: { id: true } });
    if (!mission) return res.status(404).json({ error: "ไม่พบภารกิจ" });
    const parsed = parseBody(req.body ?? {}, false);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });
    const row = await prisma.missionIncident.create({
      data: { ...(parsed.data as Prisma.MissionIncidentUncheckedCreateInput), missionId },
      include: withPhotos,
    });
    res.status(201).json(serializeIncident(row));
  } catch (e) {
    next(e);
  }
});

missionIncidentsRouter.put("/:missionId/incidents/:incidentId", async (req, res, next) => {
  try {
    const existing = await findIncident(routeParam(req.params.missionId), routeParam(req.params.incidentId));
    if (!existing) return res.status(404).json({ error: "Not found" });
    const parsed = parseBody(req.body ?? {}, true);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });
    const row = await prisma.missionIncident.update({
      where: { id: existing.id },
      data: parsed.data,
      include: withPhotos,
    });
    res.json(serializeIncident(row));
  } catch (e) {
    next(e);
  }
});

missionIncidentsRouter.delete("/:missionId/incidents/:incidentId", async (req, res, next) => {
  try {
    const existing = await findIncident(routeParam(req.params.missionId), routeParam(req.params.incidentId));
    if (!existing) return res.status(404).json({ error: "Not found" });
    await prisma.missionIncident.delete({ where: { id: existing.id } });
    for (const p of existing.photos) unlinkUploadFile(p.storedFilename);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

missionIncidentsRouter.post(
  "/:missionId/incidents/:incidentId/photos",
  (req, res, next) => {
    upload.array("files", MAX_PHOTOS_PER_UPLOAD)(req, res, (err: unknown) => {
      if (!err) return next();
      const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
      if (code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "ไฟล์ใหญ่เกินกำหนด" });
      if (code === "LIMIT_FILE_COUNT")
        return res.status(400).json({ error: `เลือกรูปได้ไม่เกิน ${MAX_PHOTOS_PER_UPLOAD} รูปต่อครั้ง` });
      next(err);
    });
  },
  async (req, res, next) => {
    try {
      const existing = await findIncident(routeParam(req.params.missionId), routeParam(req.params.incidentId));
      if (!existing) return res.status(404).json({ error: "ไม่พบบันทึกเหตุการณ์" });
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files?.length) return res.status(400).json({ error: "ไม่ได้รับไฟล์รูป" });

      let order = existing.photos.reduce((m, p) => Math.max(m, p.sortOrder), -1) + 1;
      for (const f of files) {
        try {
          const saved = await persistUpload(f, {
            module: "missions",
            userId: req.auth?.userId,
            kind: "incident",
            forceImage: true,
          });
          await prisma.missionIncidentPhoto.create({
            data: {
              incidentId: existing.id,
              storedFilename: saved.relativePath,
              mimeType: saved.mimeType,
              originalName: saved.displayName,
              sortOrder: order++,
            },
          });
        } catch (e) {
          return res.status(400).json({ error: e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ" });
        }
      }
      const row = await findIncident(existing.missionId, existing.id);
      res.status(201).json(row ? serializeIncident(row) : null);
    } catch (e) {
      next(e);
    }
  },
);

missionIncidentsRouter.delete("/:missionId/incidents/:incidentId/photos/:photoId", async (req, res, next) => {
  try {
    const existing = await findIncident(routeParam(req.params.missionId), routeParam(req.params.incidentId));
    if (!existing) return res.status(404).json({ error: "Not found" });
    const photo = existing.photos.find((p) => p.id === routeParam(req.params.photoId));
    if (!photo) return res.status(404).json({ error: "Not found" });
    await prisma.missionIncidentPhoto.delete({ where: { id: photo.id } });
    unlinkUploadFile(photo.storedFilename);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
