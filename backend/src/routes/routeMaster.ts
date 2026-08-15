import { Router } from "express";
import { Prisma, RouteMasterStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { computeRouteDistanceKm, knownLocationLabels } from "../lib/routeDistance.js";
import { routeParam } from "../lib/routeParam.js";

export const routeMasterRouter = Router();

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
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

routeMasterRouter.get("/meta/locations", async (_req, res, next) => {
  try {
    res.json({ locations: knownLocationLabels() });
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
        error: "ไม่รู้จักพิกัดต้นทาง/ปลายทาง — ใช้รหัสเช่น สพฐ ศขก ศชม",
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
    const { name, startLocation, endLocation, distanceKm, externalPersonnelCompensation, missionDays, status } =
      req.body;
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
    const { name, startLocation, endLocation, distanceKm, externalPersonnelCompensation, missionDays, status } =
      req.body;
    const data: Record<string, unknown> = {};
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
