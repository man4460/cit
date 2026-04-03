import { Router } from "express";
import type { Prisma } from "@prisma/client";
import type { VehicleWeeklyCheckResult } from "@prisma/client";
import { armorAssetWhere } from "../lib/armorAssetWhere.js";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";

export const armorInspectionsRouter = Router();

const armorMatrixInclude = {
  assetCategory: true,
  assetAffiliation: true,
  assetItemStatus: true,
} satisfies Prisma.AssetInclude;

function parseYm(month: string): string | null {
  const m = month.trim();
  if (!/^\d{4}-\d{2}$/.test(m)) return null;
  const [y, mo] = m.split("-").map(Number);
  if (!y || mo < 1 || mo > 12) return null;
  return `${y}-${String(mo).padStart(2, "0")}`;
}

function parseCheck(v: unknown): VehicleWeeklyCheckResult | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (v === "NORMAL" || v === "ABNORMAL") return v;
  return undefined;
}

armorInspectionsRouter.get("/monthly/matrix", async (req, res, next) => {
  try {
    const monthYm = parseYm(String(req.query.month ?? ""));
    if (!monthYm) return res.status(400).json({ error: "ระบุ month=YYYY-MM" });

    const assets = await prisma.asset.findMany({
      where: armorAssetWhere,
      orderBy: [{ registryLineNo: "asc" }, { serialNumber: "asc" }],
      include: armorMatrixInclude,
    });

    const inspections = await prisma.armorMonthlyInspection.findMany({
      where: { monthYm, assetId: { in: assets.map((a) => a.id) } },
    });
    const byAsset = new Map(inspections.map((i) => [i.assetId, i]));

    const rows = assets.map((asset) => ({
      asset,
      inspection: byAsset.get(asset.id) ?? null,
    }));

    res.json({ monthYm, rows });
  } catch (e) {
    next(e);
  }
});

armorInspectionsRouter.put("/monthly", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const monthYm = parseYm(String(body.monthYm ?? body.month ?? ""));
    if (!monthYm) return res.status(400).json({ error: "monthYm ต้องเป็น YYYY-MM" });
    const assetId = body.assetId != null ? String(body.assetId).trim() : "";
    if (!assetId) return res.status(400).json({ error: "ต้องมี assetId" });

    const exists = await prisma.asset.findFirst({
      where: { AND: [{ id: assetId }, armorAssetWhere] },
      select: { id: true },
    });
    if (!exists) return res.status(404).json({ error: "ไม่พบเสื้อเกราะในระบบหรือออกจากยอดตรวจแล้ว" });

    const outerShell = parseCheck(body.outerShell);
    const strapsFasteners = parseCheck(body.strapsFasteners);
    const ballisticLayer = parseCheck(body.ballisticLayer);
    const cleanlinessStorage = parseCheck(body.cleanlinessStorage);
    const overallReadiness = parseCheck(body.overallReadiness);
    const remarks = body.remarks !== undefined ? (body.remarks != null ? String(body.remarks).trim() || null : null) : undefined;
    const inspectorName =
      body.inspectorName !== undefined
        ? body.inspectorName != null
          ? String(body.inspectorName).trim() || null
          : null
        : undefined;
    const personnelId = body.personnelId !== undefined ? (body.personnelId ? String(body.personnelId).trim() : null) : undefined;

    const data: Prisma.ArmorMonthlyInspectionUncheckedUpdateInput = {};
    if (outerShell !== undefined) data.outerShell = outerShell;
    if (strapsFasteners !== undefined) data.strapsFasteners = strapsFasteners;
    if (ballisticLayer !== undefined) data.ballisticLayer = ballisticLayer;
    if (cleanlinessStorage !== undefined) data.cleanlinessStorage = cleanlinessStorage;
    if (overallReadiness !== undefined) data.overallReadiness = overallReadiness;
    if (remarks !== undefined) data.remarks = remarks;
    if (inspectorName !== undefined) data.inspectorName = inspectorName;
    if (personnelId !== undefined) data.personnelId = personnelId;

    const row = await prisma.armorMonthlyInspection.upsert({
      where: { assetId_monthYm: { assetId, monthYm } },
      create: {
        assetId,
        monthYm,
        outerShell: outerShell ?? null,
        strapsFasteners: strapsFasteners ?? null,
        ballisticLayer: ballisticLayer ?? null,
        cleanlinessStorage: cleanlinessStorage ?? null,
        overallReadiness: overallReadiness ?? null,
        remarks: remarks ?? null,
        inspectorName: inspectorName ?? null,
        personnelId: personnelId ?? null,
      },
      update: data,
    });

    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2003")
      return res.status(404).json({ error: "ไม่พบผู้ตรวจ (personnel)" });
    next(e);
  }
});

armorInspectionsRouter.get("/monthly/report", async (req, res, next) => {
  try {
    const monthYm = parseYm(String(req.query.month ?? ""));
    if (!monthYm) return res.status(400).json({ error: "ระบุ month=YYYY-MM" });

    const assets = await prisma.asset.findMany({
      where: armorAssetWhere,
      orderBy: [{ registryLineNo: "asc" }, { serialNumber: "asc" }],
      include: armorMatrixInclude,
    });

    const inspections = await prisma.armorMonthlyInspection.findMany({
      where: { monthYm, assetId: { in: assets.map((a) => a.id) } },
    });
    const byAsset = new Map(inspections.map((i) => [i.assetId, i]));

    const rows = assets.map((asset) => {
      const inspection = byAsset.get(asset.id) ?? null;
      return { asset, inspection };
    });

    const inspected = rows.filter((r) => r.inspection != null).length;
    const withAbnormal = rows.filter((r) => {
      const i = r.inspection;
      if (!i) return false;
      return [i.outerShell, i.strapsFasteners, i.ballisticLayer, i.cleanlinessStorage, i.overallReadiness].some(
        (x) => x === "ABNORMAL",
      );
    }).length;

    res.json({
      monthYm,
      totalAssets: assets.length,
      inspectedCount: inspected,
      abnormalRowsCount: withAbnormal,
      rows,
    });
  } catch (e) {
    next(e);
  }
});

armorInspectionsRouter.delete("/monthly/:assetId", async (req, res, next) => {
  try {
    const monthYm = parseYm(String(req.query.month ?? ""));
    if (!monthYm) return res.status(400).json({ error: "ระบุ month=YYYY-MM" });
    const assetId = routeParam(req.params.assetId);
    const r = await prisma.armorMonthlyInspection.deleteMany({ where: { assetId, monthYm } });
    if (r.count === 0) return res.status(404).json({ error: "ไม่พบบันทึก" });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
