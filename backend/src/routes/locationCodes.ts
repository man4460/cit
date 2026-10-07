import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { invalidateLocationCodes, loadLocationCodes, normalizeLocationCode } from "../lib/routeDistance.js";
import { routeParam } from "../lib/routeParam.js";

export const locationCodesRouter = Router();

function optionalCoord(v: unknown, min: number, max: number): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

function prismaCode(e: unknown) {
  return e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
}

function readBody(body: Record<string, unknown>, partial: boolean) {
  const data: Record<string, unknown> = {};
  if (!partial || body.code !== undefined) {
    const code = normalizeLocationCode(body.code);
    if (!code) return { error: "กรอกรหัสพื้นที่" };
    data.code = code;
  }
  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) return { error: "กรอกชื่อหน่วยงาน/สถานที่" };
    data.name = name;
  }
  if (!partial || body.province !== undefined) {
    const province = String(body.province ?? "").trim().replace(/^จ(\.|ังหวัด)\s*/, "");
    if (!province) return { error: "กรอกจังหวัด" };
    data.province = province;
  }
  const lat = optionalCoord(body.lat, 5, 21);
  const lng = optionalCoord(body.lng, 97, 106);
  if (lat === undefined && body.lat !== undefined) return { error: "ละติจูดไม่ถูกต้อง (ประเทศไทย 5–21)" };
  if (lng === undefined && body.lng !== undefined) return { error: "ลองจิจูดไม่ถูกต้อง (ประเทศไทย 97–106)" };
  if (lat !== undefined) data.lat = lat;
  if (lng !== undefined) data.lng = lng;
  if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0;
  return { data };
}

locationCodesRouter.get("/", async (_req, res, next) => {
  try {
    await loadLocationCodes();
    res.json(await prisma.locationCode.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }));
  } catch (e) {
    next(e);
  }
});

locationCodesRouter.post("/", async (req, res, next) => {
  try {
    const parsed = readBody(req.body ?? {}, false);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });
    if (parsed.data.sortOrder === undefined) {
      const last = await prisma.locationCode.aggregate({ _max: { sortOrder: true } });
      parsed.data.sortOrder = (last._max.sortOrder ?? 0) + 1;
    }
    const row = await prisma.locationCode.create({
      data: parsed.data as { code: string; name: string; province: string },
    });
    invalidateLocationCodes();
    res.status(201).json(row);
  } catch (e) {
    if (prismaCode(e) === "P2002") return res.status(409).json({ error: "รหัสนี้มีอยู่แล้ว" });
    next(e);
  }
});

locationCodesRouter.patch("/:id", async (req, res, next) => {
  try {
    const parsed = readBody(req.body ?? {}, true);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });
    const row = await prisma.locationCode.update({ where: { id: routeParam(req.params.id) }, data: parsed.data });
    invalidateLocationCodes();
    res.json(row);
  } catch (e) {
    if (prismaCode(e) === "P2002") return res.status(409).json({ error: "รหัสนี้มีอยู่แล้ว" });
    if (prismaCode(e) === "P2025") return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});

locationCodesRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.locationCode.delete({ where: { id: routeParam(req.params.id) } });
    invalidateLocationCodes();
    res.status(204).send();
  } catch (e) {
    if (prismaCode(e) === "P2025") return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});
