import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export const routeMasterRouter = Router();

function dec(v: string | number | undefined | null) {
  if (v === undefined || v === null || v === "") return undefined;
  return new Prisma.Decimal(v);
}

routeMasterRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.routeMaster.findMany({ orderBy: { startLocation: "asc" } });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

routeMasterRouter.get("/:id", async (req, res, next) => {
  try {
    const row = await prisma.routeMaster.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

routeMasterRouter.post("/", async (req, res, next) => {
  try {
    const { name, startLocation, endLocation, distanceKm } = req.body;
    if (!startLocation || !endLocation || distanceKm === undefined)
      return res.status(400).json({ error: "startLocation, endLocation, distanceKm required" });
    const row = await prisma.routeMaster.create({
      data: {
        name: name || null,
        startLocation,
        endLocation,
        distanceKm: dec(distanceKm)!,
      },
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

routeMasterRouter.put("/:id", async (req, res, next) => {
  try {
    const { name, startLocation, endLocation, distanceKm } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name || null;
    if (startLocation !== undefined) data.startLocation = startLocation;
    if (endLocation !== undefined) data.endLocation = endLocation;
    if (distanceKm !== undefined) data.distanceKm = dec(distanceKm);
    const row = await prisma.routeMaster.update({ where: { id: req.params.id }, data });
    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "Not found" });
    next(e);
  }
});

routeMasterRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.routeMaster.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "Not found" });
    next(e);
  }
});
