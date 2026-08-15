import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";

export const firearmsRouter = Router();

function parseDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

firearmsRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.firearm.findMany({
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

firearmsRouter.get("/:id", async (req, res, next) => {
  try {
    const row = await prisma.firearm.findUnique({ where: { id: routeParam(req.params.id) } });
    if (!row) return res.status(404).json({ error: "ไม่พบ" });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

firearmsRouter.post("/", async (req, res, next) => {
  try {
    const {
      code, costCenter, brand, serial, registerNo, registerCard, purchasedAt,
      detail, team, docUrl, photoUrl, status, checked, fixNote, sortOrder,
    } = req.body ?? {};
    if (!code || !String(code).trim()) return res.status(400).json({ error: "กรอกรหัสอาวุธปืน" });
    if (!brand || !String(brand).trim()) return res.status(400).json({ error: "กรอกชนิด/ยี่ห้อ" });

    const row = await prisma.firearm.create({
      data: {
        code: String(code).trim(),
        costCenter: costCenter != null && String(costCenter).trim() ? String(costCenter).trim() : null,
        brand: String(brand).trim(),
        serial: serial != null && String(serial).trim() ? String(serial).trim() : null,
        registerNo: registerNo != null && String(registerNo).trim() ? String(registerNo).trim() : null,
        registerCard: registerCard != null && String(registerCard).trim() ? String(registerCard).trim() : null,
        purchasedAt: parseDate(purchasedAt) ?? null,
        detail: detail != null && String(detail).trim() ? String(detail).trim() : null,
        team: team != null && String(team).trim() ? String(team).trim() : null,
        docUrl: docUrl != null && String(docUrl).trim() ? String(docUrl).trim() : null,
        photoUrl: photoUrl != null && String(photoUrl).trim() ? String(photoUrl).trim() : null,
        status: status != null ? String(status).trim() : "",
        checked: checked != null && String(checked).trim() ? String(checked).trim() : null,
        fixNote: fixNote != null && String(fixNote).trim() ? String(fixNote).trim() : null,
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
      },
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "รหัสอาวุธปืนซ้ำ" });
    next(e);
  }
});

firearmsRouter.put("/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const {
      code, costCenter, brand, serial, registerNo, registerCard, purchasedAt,
      detail, team, docUrl, photoUrl, status, checked, fixNote, sortOrder,
    } = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (code !== undefined) {
      const c = String(code).trim();
      if (!c) return res.status(400).json({ error: "รหัสว่างไม่ได้" });
      data.code = c;
    }
    if (costCenter !== undefined) data.costCenter = String(costCenter).trim() || null;
    if (brand !== undefined) {
      const v = String(brand).trim();
      if (!v) return res.status(400).json({ error: "ชนิด/ยี่ห้อว่างไม่ได้" });
      data.brand = v;
    }
    if (serial !== undefined) data.serial = String(serial).trim() || null;
    if (registerNo !== undefined) data.registerNo = String(registerNo).trim() || null;
    if (registerCard !== undefined) data.registerCard = String(registerCard).trim() || null;
    if (purchasedAt !== undefined) data.purchasedAt = parseDate(purchasedAt) ?? null;
    if (detail !== undefined) data.detail = String(detail).trim() || null;
    if (team !== undefined) data.team = String(team).trim() || null;
    if (docUrl !== undefined) data.docUrl = String(docUrl).trim() || null;
    if (photoUrl !== undefined) data.photoUrl = String(photoUrl).trim() || null;
    if (status !== undefined) data.status = String(status).trim();
    if (checked !== undefined) data.checked = String(checked).trim() || null;
    if (fixNote !== undefined) data.fixNote = String(fixNote).trim() || null;
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder);

    const row = await prisma.firearm.update({ where: { id }, data });
    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "รหัสอาวุธปืนซ้ำ" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});

firearmsRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.firearm.delete({ where: { id: routeParam(req.params.id) } });
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});
