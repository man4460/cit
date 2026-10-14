import { Router } from "express";
import { Prisma, RouteMasterStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { computeRouteDistanceKm, knownLocationLabels } from "../lib/routeDistance.js";
import { routeParam } from "../lib/routeParam.js";
import { locationCodesRouter } from "./locationCodes.js";

export const routeMasterRouter = Router();

routeMasterRouter.use("/locations", locationCodesRouter);

function dec(v: string | number | undefined | null) {
  if (v === undefined || v === null || v === "") return undefined;
  return new Prisma.Decimal(v);
}

function optionalDec(v: string | number | undefined | null) {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return new Prisma.Decimal(n);
}

function optionalInt(v: string | number | undefined | null) {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

const SEGMENT_FIELDS = ["highway", "districts", "provinces", "distance"] as const;

/** undefined = ไม่แก้ · DbNull = ล้าง · array = ช่วงทางหลวงที่ตัดช่องว่างแล้ว */
function parseHighwaySegments(v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) return Prisma.DbNull;
  const rows = v
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
    .map((r) => Object.fromEntries(SEGMENT_FIELDS.map((k) => [k, String(r[k] ?? "").trim()])))
    .filter((r) => SEGMENT_FIELDS.some((k) => r[k]));
  return rows.length ? rows : Prisma.DbNull;
}

/** null = ไม่มีแนวเส้นทาง · array = [[lat, lng], ...] ที่อยู่ในประเทศไทย */
function parseRouteGeometry(v: unknown): number[][] | null {
  if (!Array.isArray(v)) return null;
  const pts = v
    .filter((p): p is unknown[] => Array.isArray(p) && p.length >= 2)
    .map((p) => [Number(p[0]), Number(p[1])])
    .filter(([lat, lng]) => lat >= 5 && lat <= 21 && lng >= 97 && lng <= 106)
    .map(([lat, lng]) => [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5]);
  return pts.length >= 2 ? pts : null;
}

function parseStatus(v: unknown): RouteMasterStatus | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v).toUpperCase();
  if (s === "ACTIVE" || s === "INACTIVE") return s as RouteMasterStatus;
  return undefined;
}

routeMasterRouter.get("/", async (req, res, next) => {
  try {
    const statusQ = String(req.query.status ?? "").trim().toUpperCase();
    const where =
      statusQ === "ACTIVE" || statusQ === "INACTIVE"
        ? { status: statusQ as RouteMasterStatus }
        : undefined;
    const rows = await prisma.routeMaster.findMany({
      where,
      orderBy: { startLocation: "asc" },
      include: { _count: { select: { places: true } } },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

routeMasterRouter.get("/meta/locations", async (_req, res, next) => {
  try {
    res.json({ locations: await knownLocationLabels() });
  } catch (e) {
    next(e);
  }
});

/** ประมาณระยะทางจากต้นทาง–ปลายทาง */
routeMasterRouter.post("/estimate-distance", async (req, res, next) => {
  try {
    const startLocation = String(req.body?.startLocation ?? "").trim();
    const endLocation = String(req.body?.endLocation ?? "").trim();
    if (!startLocation || !endLocation) {
      return res.status(400).json({ error: "startLocation, endLocation required" });
    }
    const result = await computeRouteDistanceKm(startLocation, endLocation);
    if (result.method === "none" || result.km <= 0) {
      return res.status(422).json({
        error: "ไม่รู้จักพิกัดต้นทาง/ปลายทาง — ใช้รหัสเช่น สพฐ ศขก ศชม หรือเพิ่มพิกัดที่ «รหัสพื้นที่»",
        ...result,
      });
    }
    res.json(result);
  } catch (e) {
    next(e);
  }
});

/** คำนวณและอัปเดตระยะทางทุกเส้นทาง (หรือเฉพาะที่ระยะ = 0 ถ้า onlyZero) */
routeMasterRouter.post("/recalculate-distances", async (req, res, next) => {
  try {
    const onlyZero = Boolean(req.body?.onlyZero);
    const rows = await prisma.routeMaster.findMany();
    const updated: { id: string; name: string | null; distanceKm: number; method: string; path: string[] }[] = [];
    const skipped: { id: string; name: string | null; reason: string }[] = [];

    for (const row of rows) {
      const current = Number(row.distanceKm);
      if (onlyZero && current > 0) {
        skipped.push({ id: row.id, name: row.name, reason: "มีระยะทางอยู่แล้ว" });
        continue;
      }
      const result = await computeRouteDistanceKm(row.startLocation, row.endLocation);
      if (result.method === "none" || result.km <= 0) {
        skipped.push({
          id: row.id,
          name: row.name,
          reason: "ไม่รู้จักพิกัด",
        });
        continue;
      }
      await prisma.routeMaster.update({
        where: { id: row.id },
        data: { distanceKm: new Prisma.Decimal(result.km) },
      });
      updated.push({
        id: row.id,
        name: row.name,
        distanceKm: result.km,
        method: result.method,
        path: result.path,
      });
    }

    res.json({ updated: updated.length, skipped: skipped.length, items: updated, skippedItems: skipped });
  } catch (e) {
    next(e);
  }
});

// --- จุดบริการระหว่างทาง ---

const PLACE_KINDS = new Set(["FUEL", "REPAIR", "TIRE", "POLICE", "MILITARY", "OTHER"]);

function placeData(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  if (body.kind !== undefined) {
    const k = String(body.kind).toUpperCase();
    data.kind = PLACE_KINDS.has(k) ? k : "OTHER";
  }
  if (body.name !== undefined) data.name = String(body.name ?? "").trim();
  if (body.segmentIndex !== undefined) data.segmentIndex = optionalInt(body.segmentIndex as string | number | null);
  for (const k of ["location", "phone"] as const) {
    if (body[k] !== undefined) data[k] = String(body[k] ?? "").trim();
  }
  for (const k of ["mapUrl", "note", "openingHours", "externalId"] as const) {
    if (body[k] !== undefined) data[k] = String(body[k] ?? "").trim() || null;
  }
  for (const k of ["lat", "lng", "rating"] as const) {
    if (body[k] !== undefined) {
      const n = body[k] === null || body[k] === "" ? NaN : Number(body[k]);
      data[k] = Number.isFinite(n) ? n : null;
    }
  }
  if (body.isFavorite !== undefined) data.isFavorite = Boolean(body.isFavorite);
  if (body.verified !== undefined) data.verified = Boolean(body.verified);
  return data;
}

const KIND_SEARCH: Record<string, string> = {
  FUEL: "ปั๊มน้ำมัน",
  REPAIR: "อู่ซ่อมรถ",
  TIRE: "ร้านปะยาง",
  POLICE: "สถานีตำรวจ",
  MILITARY: "หน่วยทหาร ค่ายทหาร",
};

type Segment = { highway?: string; districts?: string; provinces?: string; distance?: string };

const splitSlash = (s: string | undefined) =>
  (s ?? "")
    .split(/\s*\/\s*/)
    .map((x) => x.trim())
    .filter(Boolean);

function segmentArea(s: Segment): string {
  const district = splitSlash(s.districts)
    .filter((d) => !/^ถึง|^ออกจาก/.test(d))
    .pop();
  return [district, splitSlash(s.provinces).pop()].filter(Boolean).join(" ");
}

const normName = (s: string) => s.replace(/\s+/g, "").toLowerCase();

const placeOrder: Prisma.RoutePlaceOrderByWithRelationInput[] = [
  { isFavorite: "desc" },
  { segmentIndex: "asc" },
  { name: "asc" },
];

routeMasterRouter.get("/:id/places", async (req, res, next) => {
  try {
    res.json(await prisma.routePlace.findMany({ where: { routeId: routeParam(req.params.id) }, orderBy: placeOrder }));
  } catch (e) {
    next(e);
  }
});

/**
 * สำหรับ AI/บริการอัตโนมัติ: ข้อมูลเส้นทาง + ช่วงทางหลวง + คำค้นแนะนำ + จุดที่มีอยู่แล้ว
 * ใช้คู่กับ POST /:id/places/bulk
 */
routeMasterRouter.get("/:id/search-plan", async (req, res, next) => {
  try {
    const route = await prisma.routeMaster.findUnique({
      where: { id: routeParam(req.params.id) },
      include: { places: { select: { id: true, kind: true, name: true, segmentIndex: true, externalId: true, verified: true } } },
    });
    if (!route) return res.status(404).json({ error: "ไม่พบเส้นทาง" });
    const segments = (Array.isArray(route.highwaySegments) ? route.highwaySegments : []) as Segment[];
    res.json({
      route: {
        id: route.id,
        name: route.name,
        startLocation: route.startLocation,
        endLocation: route.endLocation,
        distanceKm: Number(route.distanceKm),
      },
      kinds: [
        { id: "FUEL", label: "ปั๊มน้ำมัน" },
        { id: "REPAIR", label: "ร้านซ่อมรถ" },
        { id: "TIRE", label: "ปะยาง" },
        { id: "POLICE", label: "สถานีตำรวจ" },
        { id: "MILITARY", label: "หน่วยทหาร" },
        { id: "OTHER", label: "อื่นๆ" },
      ],
      segments: segments.map((s, index) => {
        const area = segmentArea(s);
        return {
          index,
          ...s,
          area,
          queries: Object.fromEntries(Object.entries(KIND_SEARCH).map(([k, q]) => [k, `${q} ${s.highway ?? ""} ${area}`.trim()])),
        };
      }),
      existingPlaces: route.places,
      bulkEndpoint: `/api/route-master/${route.id}/places/bulk`,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * บันทึกหลายจุดพร้อมกัน (ใช้กับ AI) — body: { places: [{ kind, name, segmentIndex?, location?, phone?,
 * mapUrl?, lat?, lng?, openingHours?, rating?, note?, externalId? }], source?: "AI" }
 * กันซ้ำด้วย externalId หรือ ชื่อ+ช่วงทางหลวง · ไม่เขียนทับจุดที่คนกรอก/ยืนยันแล้ว
 * จุดจาก AI จะเป็น verified=false จนกว่าคนกด «ยืนยัน»
 */
routeMasterRouter.post("/:id/places/bulk", async (req, res, next) => {
  try {
    const routeId = routeParam(req.params.id);
    const input = req.body?.places;
    if (!Array.isArray(input) || !input.length) return res.status(400).json({ error: "ส่ง places เป็น array" });
    if (input.length > 200) return res.status(400).json({ error: "ส่งได้ไม่เกิน 200 รายการต่อครั้ง" });
    const route = await prisma.routeMaster.findUnique({ where: { id: routeId }, select: { id: true } });
    if (!route) return res.status(404).json({ error: "ไม่พบเส้นทาง" });

    const source = String(req.body?.source ?? "AI").trim().toUpperCase() || "AI";
    const existing = await prisma.routePlace.findMany({ where: { routeId } });
    const result = { created: 0, updated: 0, skipped: 0, errors: [] as { index: number; error: string }[] };

    for (let i = 0; i < input.length; i++) {
      const raw = input[i];
      if (!raw || typeof raw !== "object") {
        result.errors.push({ index: i, error: "รูปแบบไม่ถูกต้อง" });
        continue;
      }
      const data = placeData(raw as Record<string, unknown>);
      delete data.isFavorite;
      delete data.verified;
      if (!data.name) {
        result.errors.push({ index: i, error: "ไม่มีชื่อสถานที่" });
        continue;
      }
      const extId = (data.externalId as string | null | undefined) ?? null;
      const seg = (data.segmentIndex as number | null | undefined) ?? null;
      const match = existing.find(
        (p) =>
          (extId && p.externalId === extId) ||
          (normName(p.name) === normName(String(data.name)) && (p.segmentIndex ?? null) === seg),
      );
      if (match) {
        if (match.source === "MANUAL" || match.verified) {
          result.skipped++;
          continue;
        }
        const row = await prisma.routePlace.update({ where: { id: match.id }, data });
        Object.assign(match, row);
        result.updated++;
      } else {
        const row = await prisma.routePlace.create({
          data: {
            ...(data as Omit<Prisma.RoutePlaceUncheckedCreateInput, "routeId">),
            name: String(data.name),
            routeId,
            source,
            verified: source === "MANUAL",
          },
        });
        existing.push(row);
        result.created++;
      }
    }
    res.json(result);
  } catch (e) {
    next(e);
  }
});

routeMasterRouter.post("/:id/places", async (req, res, next) => {
  try {
    const routeId = routeParam(req.params.id);
    const data = placeData(req.body ?? {});
    if (!data.name) return res.status(400).json({ error: "กรอกชื่อสถานที่" });
    const route = await prisma.routeMaster.findUnique({ where: { id: routeId }, select: { id: true } });
    if (!route) return res.status(404).json({ error: "ไม่พบเส้นทาง" });
    const row = await prisma.routePlace.create({
      data: { ...(data as Omit<Prisma.RoutePlaceUncheckedCreateInput, "routeId">), name: String(data.name), routeId },
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

routeMasterRouter.put("/places/:placeId", async (req, res, next) => {
  try {
    const data = placeData(req.body ?? {});
    if (data.name !== undefined && !data.name) return res.status(400).json({ error: "ชื่อสถานที่ต้องไม่ว่าง" });
    const row = await prisma.routePlace.update({ where: { id: routeParam(req.params.placeId) }, data });
    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});

routeMasterRouter.delete("/places/:placeId", async (req, res, next) => {
  try {
    await prisma.routePlace.delete({ where: { id: routeParam(req.params.placeId) } });
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});

routeMasterRouter.get("/:id/geometry", async (req, res, next) => {
  try {
    const row = await prisma.routeGeometry.findUnique({ where: { routeId: routeParam(req.params.id) } });
    res.json({ points: Array.isArray(row?.points) ? row.points : [], updatedAt: row?.updatedAt ?? null });
  } catch (e) {
    next(e);
  }
});

/** body: { points: [[lat, lng], ...] } · ส่ง points ว่าง/ไม่ใช่ array = ลบแนวเส้นทาง */
routeMasterRouter.put("/:id/geometry", async (req, res, next) => {
  try {
    const routeId = routeParam(req.params.id);
    const route = await prisma.routeMaster.findUnique({ where: { id: routeId }, select: { id: true } });
    if (!route) return res.status(404).json({ error: "ไม่พบเส้นทาง" });
    const points = parseRouteGeometry(req.body?.points);
    if (!points) {
      await prisma.routeGeometry.deleteMany({ where: { routeId } });
      return res.json({ points: [] });
    }
    const row = await prisma.routeGeometry.upsert({
      where: { routeId },
      create: { routeId, points },
      update: { points },
    });
    res.json({ points: row.points, updatedAt: row.updatedAt });
  } catch (e) {
    next(e);
  }
});

routeMasterRouter.get("/:id", async (req, res, next) => {
  try {
    const row = await prisma.routeMaster.findUnique({ where: { id: routeParam(req.params.id) } });
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

routeMasterRouter.post("/", async (req, res, next) => {
  try {
    const {
      name,
      startLocation,
      endLocation,
      distanceKm,
      externalPersonnelCompensation,
      missionDays,
      status,
      highwaySegments,
    } = req.body;
    if (!startLocation || !endLocation)
      return res.status(400).json({ error: "startLocation, endLocation required" });

    let km = dec(distanceKm);
    if (km == null || Number(km) <= 0) {
      const est = await computeRouteDistanceKm(String(startLocation), String(endLocation));
      if (est.km > 0) km = new Prisma.Decimal(est.km);
    }
    if (km == null) return res.status(400).json({ error: "distanceKm required" });

    const row = await prisma.routeMaster.create({
      data: {
        name: name || null,
        startLocation,
        endLocation,
        distanceKm: km,
        externalPersonnelCompensation: optionalDec(externalPersonnelCompensation) ?? null,
        missionDays: optionalInt(missionDays) ?? null,
        highwaySegments: parseHighwaySegments(highwaySegments) ?? Prisma.DbNull,
        status: parseStatus(status) ?? RouteMasterStatus.ACTIVE,
      },
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

routeMasterRouter.put("/:id", async (req, res, next) => {
  try {
    const {
      name,
      startLocation,
      endLocation,
      distanceKm,
      externalPersonnelCompensation,
      missionDays,
      status,
      highwaySegments,
    } = req.body;
    const data: Record<string, unknown> = {};
    const segments = parseHighwaySegments(highwaySegments);
    if (segments !== undefined) data.highwaySegments = segments;
    if (name !== undefined) data.name = name || null;
    if (startLocation !== undefined) data.startLocation = startLocation;
    if (endLocation !== undefined) data.endLocation = endLocation;
    if (distanceKm !== undefined) data.distanceKm = dec(distanceKm);
    if (externalPersonnelCompensation !== undefined) {
      data.externalPersonnelCompensation = optionalDec(externalPersonnelCompensation);
    }
    if (missionDays !== undefined) data.missionDays = optionalInt(missionDays);
    const nextStatus = parseStatus(status);
    if (status !== undefined) {
      if (!nextStatus) return res.status(400).json({ error: "status ต้องเป็น ACTIVE หรือ INACTIVE" });
      data.status = nextStatus;
    }

    const existing = await prisma.routeMaster.findUnique({ where: { id: routeParam(req.params.id) } });
    if (!existing) return res.status(404).json({ error: "Not found" });

    const nextStart = (startLocation !== undefined ? startLocation : existing.startLocation) as string;
    const nextEnd = (endLocation !== undefined ? endLocation : existing.endLocation) as string;
    const nextKm = distanceKm !== undefined ? dec(distanceKm) : undefined;
    if (nextKm == null || Number(nextKm) <= 0) {
      const est = await computeRouteDistanceKm(nextStart, nextEnd);
      if (est.km > 0) data.distanceKm = new Prisma.Decimal(est.km);
    }

    const row = await prisma.routeMaster.update({ where: { id: existing.id }, data });
    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "Not found" });
    next(e);
  }
});

routeMasterRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.routeMaster.delete({ where: { id: routeParam(req.params.id) } });
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "Not found" });
    next(e);
  }
});
