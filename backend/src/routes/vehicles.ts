import { Router } from "express";
import { Prisma, VehicleWeeklyCheckResult } from "@prisma/client";
import { diffSummary, resolveActorLabel, writeAuditLog } from "../lib/auditLog.js";
import { logVehicleDispositionIfNeeded } from "../lib/dispositionLog.js";
import { vehicleFleetCareActiveWhere, vehicleRetiredFromFleetCareWhere } from "../lib/fleetCareWhere.js";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";
import { requireAdmin } from "../middleware/auth.js";
import { persistUpload, upload } from "../lib/upload.js";

export const vehiclesRouter = Router();

function vehicleAuditSnapshot(v: {
  id: string;
  licensePlate: string;
  brandModel: string;
  brand: string;
  model: string;
  assetCode: string | null;
  vehicleStatusId: string | null;
  vehicleTypeId: string | null;
  workCategoryGroupId: string | null;
  currentMileage: unknown;
  notes: string | null;
  purchasedAt: Date | null;
  vehicleStatus?: { name: string } | null;
}) {
  return {
    id: v.id,
    licensePlate: v.licensePlate,
    brandModel: v.brandModel,
    brand: v.brand,
    model: v.model,
    assetCode: v.assetCode,
    vehicleStatusId: v.vehicleStatusId,
    vehicleStatusName: v.vehicleStatus?.name ?? null,
    vehicleTypeId: v.vehicleTypeId,
    workCategoryGroupId: v.workCategoryGroupId,
    currentMileage: String(v.currentMileage ?? ""),
    notes: v.notes,
    purchasedAt: v.purchasedAt?.toISOString() ?? null,
  };
}

const VEHICLE_AUDIT_KEYS = [
  "licensePlate",
  "brandModel",
  "brand",
  "model",
  "assetCode",
  "vehicleStatusId",
  "vehicleStatusName",
  "vehicleTypeId",
  "workCategoryGroupId",
  "currentMileage",
  "notes",
  "purchasedAt",
];

function yyyyMmDdUtcNoon(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseCheckResult(v: unknown): VehicleWeeklyCheckResult | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (v === "NORMAL" || v === "ABNORMAL") return v;
  return undefined;
}

/** ตัวเลขทศนิยม — ตัดจุลภาค/ช่องว่าง (เลขไมล์จากสเปรดชีต) ค่าไม่ถูกต้องคืน undefined */
function dec(v: string | number | undefined | null): Prisma.Decimal | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v).trim().replace(/,/g, "").replace(/\u00A0/g, "").replace(/\s/g, "");
  if (s === "") return undefined;
  try {
    return new Prisma.Decimal(s);
  } catch {
    return undefined;
  }
}

function hasNonEmptyDecimalInput(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  return String(v).trim().replace(/,/g, "").replace(/\u00A0/g, "").replace(/\s/g, "") !== "";
}

function parseOptionalDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** สตริงแสดงผลรวม — เก็บใน brandModel เพื่อความเข้ากันได้ */
function combineBrandModel(brand?: string, model?: string, legacyBrandModel?: string) {
  const b = (brand ?? "").trim();
  const m = (model ?? "").trim();
  const combined = [b, m].filter(Boolean).join(" ").trim();
  if (combined) return combined;
  return (legacyBrandModel ?? "").trim();
}

const vehicleListInclude = {
  vehicleType: true,
  workCategoryGroup: true,
  vehicleStatus: true,
  documents: {
    where: { kind: "PHOTO" as const },
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
    take: 24,
  },
  _count: { select: { documents: true, maintenanceLogs: true, fuelLogs: true } },
};

vehiclesRouter.get("/", async (req, res, next) => {
  try {
    const all = String(req.query.all ?? "") === "1";
    const rows = await prisma.vehicle.findMany({
      where: all ? undefined : vehicleFleetCareActiveWhere,
      orderBy: { licensePlate: "asc" },
      include: vehicleListInclude,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

/** รายการรถที่ออกจากยอดตรวจ/ดูแล (สถานะจำหน่าย ส่งคืน ฯลฯ) */
vehiclesRouter.get("/registry/retired", async (_req, res, next) => {
  try {
    const rows = await prisma.vehicle.findMany({
      where: vehicleRetiredFromFleetCareWhere,
      orderBy: { licensePlate: "asc" },
      include: vehicleListInclude,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

/** ประวัติการเข้าสู่สถานะจำหน่าย/ส่งคืน */
vehiclesRouter.get("/registry/disposition-log", async (_req, res, next) => {
  try {
    const rows = await prisma.vehicleDispositionLog.findMany({
      orderBy: { recordedAt: "desc" },
      include: {
        vehicle: {
          select: { id: true, licensePlate: true, brandModel: true, vehicleStatusId: true },
        },
      },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

vehiclesRouter.delete("/registry/disposition-log/:logId", requireAdmin, async (req, res, next) => {
  try {
    await prisma.vehicleDispositionLog.delete({
      where: { id: routeParam(req.params.logId) },
    });
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "Not found" });
    next(e);
  }
});

/** ตารางตรวจประจำสัปดาห์ — ทุกคัน + บันทึกของสัปดาห์ที่เลือก (weekStart=YYYY-MM-DD) */
vehiclesRouter.get("/weekly-inspection-matrix", async (req, res, next) => {
  try {
    const weekStart = String(req.query.weekStart ?? "").trim();
    const norm = yyyyMmDdUtcNoon(weekStart);
    if (!norm) return res.status(400).json({ error: "ระบุ weekStart=YYYY-MM-DD" });

    const [vehicles, inspections] = await Promise.all([
      prisma.vehicle.findMany({
        where: vehicleFleetCareActiveWhere,
        orderBy: { licensePlate: "asc" },
        select: {
          id: true,
          licensePlate: true,
          brandModel: true,
          brand: true,
          model: true,
        },
      }),
      prisma.vehicleWeeklyInspection.findMany({
        where: {
          inspectionDate: norm,
          vehicle: vehicleFleetCareActiveWhere,
        },
      }),
    ]);

    const byVehicle = new Map(inspections.map((i) => [i.vehicleId, i]));
    res.json({
      weekStart,
      inspectionDate: norm.toISOString(),
      rows: vehicles.map((v) => ({
        vehicle: v,
        inspection: byVehicle.get(v.id) ?? null,
      })),
    });
  } catch (e) {
    next(e);
  }
});

/** รายงานรถที่มีบันทึกตรวจประจำสัปดาห์แล้ว (weekStart=YYYY-MM-DD) */
vehiclesRouter.get("/weekly-inspection-report", async (req, res, next) => {
  try {
    const weekStart = String(req.query.weekStart ?? "").trim();
    const norm = yyyyMmDdUtcNoon(weekStart);
    if (!norm) return res.status(400).json({ error: "ระบุ weekStart=YYYY-MM-DD" });

    const [totalVehicles, inspections] = await Promise.all([
      prisma.vehicle.count({ where: vehicleFleetCareActiveWhere }),
      prisma.vehicleWeeklyInspection.findMany({
        where: {
          inspectionDate: norm,
          vehicle: vehicleFleetCareActiveWhere,
        },
        include: {
          vehicle: {
            select: {
              id: true,
              licensePlate: true,
              brandModel: true,
              brand: true,
              model: true,
            },
          },
        },
      }),
    ]);

    inspections.sort((a, b) =>
      a.vehicle.licensePlate.localeCompare(b.vehicle.licensePlate, "th", { numeric: true }),
    );

    res.json({
      weekStart,
      inspectionDate: norm.toISOString(),
      totalVehicles,
      inspectedCount: inspections.length,
      rows: inspections,
    });
  } catch (e) {
    next(e);
  }
});

vehiclesRouter.put("/:vehicleId/weekly-inspection", async (req, res, next) => {
  try {
    const vehicleId = routeParam(req.params.vehicleId);
    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
    if (!vehicle) return res.status(404).json({ error: "ไม่พบยานพาหนะ" });

    const weekStart = String(req.body?.weekStart ?? "").trim();
    const norm = yyyyMmDdUtcNoon(weekStart);
    if (!norm) return res.status(400).json({ error: "weekStart ต้องเป็น YYYY-MM-DD" });

    const keys = [
      "airConditioning",
      "engineOperation",
      "tireCondition",
      "cctvAnalog",
      "cctvThinkware",
      "engineStart5Min",
    ] as const;
    const parsed: Record<string, VehicleWeeklyCheckResult | null | undefined> = {};
    for (const k of keys) {
      const p = parseCheckResult(req.body?.[k]);
      if (p === undefined && req.body?.[k] !== undefined) {
        return res.status(400).json({ error: `ค่า ${k} ไม่ถูกต้อง` });
      }
      parsed[k] = p;
    }

    const remarks =
      req.body?.remarks !== undefined ? (req.body.remarks == null ? null : String(req.body.remarks)) : undefined;

    const inspectorName =
      req.body?.inspectorName !== undefined
        ? req.body.inspectorName == null || String(req.body.inspectorName).trim() === ""
          ? null
          : String(req.body.inspectorName).trim()
        : undefined;

    const data = {
      vehicleId,
      inspectionDate: norm,
      airConditioning: parsed.airConditioning ?? null,
      engineOperation: parsed.engineOperation ?? null,
      tireCondition: parsed.tireCondition ?? null,
      cctvAnalog: parsed.cctvAnalog ?? null,
      cctvThinkware: parsed.cctvThinkware ?? null,
      engineStart5Min: parsed.engineStart5Min ?? null,
      remarks: remarks !== undefined ? remarks : null,
      inspectorName: inspectorName !== undefined ? inspectorName : null,
    } as Prisma.VehicleWeeklyInspectionUncheckedCreateInput;

    const row = await prisma.vehicleWeeklyInspection.upsert({
      where: {
        vehicleId_inspectionDate: { vehicleId, inspectionDate: norm },
      },
      create: data,
      update: {
        airConditioning: data.airConditioning,
        engineOperation: data.engineOperation,
        tireCondition: data.tireCondition,
        cctvAnalog: data.cctvAnalog,
        cctvThinkware: data.cctvThinkware,
        engineStart5Min: data.engineStart5Min,
        remarks: data.remarks,
        inspectorName: data.inspectorName,
      } as Prisma.VehicleWeeklyInspectionUncheckedUpdateInput,
    });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

vehiclesRouter.delete("/:vehicleId/weekly-inspection", async (req, res, next) => {
  try {
    const vehicleId = routeParam(req.params.vehicleId);
    const weekStart = String(req.query.weekStart ?? "").trim();
    const norm = yyyyMmDdUtcNoon(weekStart);
    if (!norm) return res.status(400).json({ error: "ระบุ weekStart=YYYY-MM-DD" });
    const existing = await prisma.vehicleWeeklyInspection.findUnique({
      where: { vehicleId_inspectionDate: { vehicleId, inspectionDate: norm } },
    });
    if (!existing) return res.status(404).json({ error: "ไม่พบบันทึก" });
    await prisma.vehicleWeeklyInspection.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

vehiclesRouter.get("/:id", async (req, res, next) => {
  try {
    const row = await prisma.vehicle.findUnique({
      where: { id: routeParam(req.params.id) },
      include: {
        vehicleType: true,
        workCategoryGroup: true,
        vehicleStatus: true,
        documents: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        maintenanceLogs: { orderBy: { date: "desc" } },
        fuelLogs: { orderBy: { date: "desc" } },
      },
    });
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

vehiclesRouter.post("/", async (req, res, next) => {
  try {
    const {
      brand,
      model,
      brandModel,
      licensePlate,
      assetCode,
      chassisNumber,
      engineNumber,
      color,
      vehicleTypeId,
      workCategoryGroupId,
      vehicleStatusId,
      currentMileage,
      notes,
      purchasedAt,
    } = req.body ?? {};
    const plate = String(licensePlate ?? "").trim();
    if (!plate) return res.status(400).json({ error: "licensePlate required" });
    const bm = combineBrandModel(brand, model, brandModel);
    if (!bm) return res.status(400).json({ error: "กรอกยี่ห้อและ/หรือรุ่น" });
    const b = (brand ?? "").trim();
    const m = (model ?? "").trim();
    const mileageDec = dec(currentMileage);
    if (hasNonEmptyDecimalInput(currentMileage) && mileageDec === undefined) {
      return res.status(400).json({ error: "เลขไมล์ไม่ถูกต้อง" });
    }
    const row = await prisma.vehicle.create({
      data: {
        brandModel: bm,
        brand: b || bm,
        model: m,
        licensePlate: plate,
        assetCode: assetCode?.trim() ? String(assetCode).trim() : null,
        chassisNumber: chassisNumber?.trim() || null,
        engineNumber: engineNumber?.trim() || null,
        color: color?.trim() || null,
        vehicleTypeId: vehicleTypeId?.trim() || null,
        workCategoryGroupId: workCategoryGroupId?.trim() || null,
        vehicleStatusId: vehicleStatusId?.trim() || null,
        currentMileage: mileageDec ?? new Prisma.Decimal(0),
        notes: notes !== undefined && notes !== null && String(notes).trim() ? String(notes).trim() : null,
        purchasedAt: parseOptionalDate(purchasedAt),
      },
      include: vehicleListInclude,
    });

    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    const afterSnap = vehicleAuditSnapshot(row);
    await writeAuditLog(prisma, {
      entityType: "Vehicle",
      entityId: row.id,
      action: "CREATE",
      summary: `ยานพาหนะ ${row.licensePlate}: สร้างใหม่`,
      after: afterSnap,
      actor,
      req,
    });

    const dn = (req.body as { dispositionNote?: unknown })?.dispositionNote;
    await logVehicleDispositionIfNeeded(prisma, {
      wasExcluded: false,
      vehicleId: row.id,
      licensePlate: row.licensePlate,
      brandModel: row.brandModel,
      nextStatus: row.vehicleStatus,
      note: dn != null ? String(dn) : undefined,
      actor: { actorUserId: actor.userId, actorUsername: actor.username },
    });

    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "ทะเบียนซ้ำ หรือเลขรหัสครุภัณฑ์ซ้ำ" });
    next(e);
  }
});

vehiclesRouter.put("/:id", async (req, res, next) => {
  try {
    const {
      brand,
      model,
      brandModel,
      licensePlate,
      assetCode,
      chassisNumber,
      engineNumber,
      color,
      vehicleTypeId,
      workCategoryGroupId,
      vehicleStatusId,
      currentMileage,
      notes,
      purchasedAt,
    } = req.body ?? {};
    const existing = await prisma.vehicle.findUnique({
      where: { id: routeParam(req.params.id) },
      include: { vehicleStatus: true },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });

    const dispositionNote = (req.body as { dispositionNote?: unknown })?.dispositionNote;

    const data: Prisma.VehicleUpdateInput = {};
    if (licensePlate !== undefined) {
      const p = String(licensePlate).trim();
      if (!p) return res.status(400).json({ error: "ทะเบียนต้องไม่ว่าง" });
      data.licensePlate = p;
    }
    if (assetCode !== undefined) data.assetCode = assetCode?.trim() ? String(assetCode).trim() : null;
    if (chassisNumber !== undefined) data.chassisNumber = chassisNumber?.trim() || null;
    if (engineNumber !== undefined) data.engineNumber = engineNumber?.trim() || null;
    if (color !== undefined) data.color = color?.trim() || null;
    if (vehicleTypeId !== undefined) {
      const raw = vehicleTypeId === null ? "" : String(vehicleTypeId).trim();
      data.vehicleType = raw ? { connect: { id: raw } } : { disconnect: true };
    }
    if (workCategoryGroupId !== undefined) {
      const raw = workCategoryGroupId === null ? "" : String(workCategoryGroupId).trim();
      data.workCategoryGroup = raw ? { connect: { id: raw } } : { disconnect: true };
    }
    if (vehicleStatusId !== undefined) {
      const raw = vehicleStatusId === null ? "" : String(vehicleStatusId).trim();
      data.vehicleStatus = raw ? { connect: { id: raw } } : { disconnect: true };
    }
    if (currentMileage !== undefined) {
      const d = dec(currentMileage);
      if (d !== undefined) data.currentMileage = d;
      else if (hasNonEmptyDecimalInput(currentMileage)) {
        return res.status(400).json({ error: "เลขไมล์ไม่ถูกต้อง" });
      }
    }
    if (notes !== undefined) data.notes = notes !== null && String(notes).trim() ? String(notes).trim() : null;
    if (purchasedAt !== undefined) data.purchasedAt = parseOptionalDate(purchasedAt);

    const nextBrand = brand !== undefined ? String(brand).trim() : existing.brand;
    const nextModel = model !== undefined ? String(model).trim() : existing.model;
    const bmFromBody = combineBrandModel(
      brand !== undefined ? String(brand) : undefined,
      model !== undefined ? String(model) : undefined,
      brandModel !== undefined ? String(brandModel) : undefined,
    );
    if (brand !== undefined) data.brand = nextBrand;
    if (model !== undefined) data.model = nextModel;
    if (brand !== undefined || model !== undefined || brandModel !== undefined) {
      data.brandModel = bmFromBody || combineBrandModel(nextBrand, nextModel, existing.brandModel);
    }

    const row = await prisma.vehicle.update({
      where: { id: routeParam(req.params.id) },
      data,
      include: vehicleListInclude,
    });

    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    const beforeSnap = vehicleAuditSnapshot(existing);
    const afterSnap = vehicleAuditSnapshot(row);
    await writeAuditLog(prisma, {
      entityType: "Vehicle",
      entityId: row.id,
      action: "UPDATE",
      summary: diffSummary(`ยานพาหนะ ${row.licensePlate}`, beforeSnap, afterSnap, VEHICLE_AUDIT_KEYS),
      before: beforeSnap,
      after: afterSnap,
      actor,
      req,
    });

    const wasExcluded = existing.vehicleStatus?.excludesFromFleetCare === true;
    await logVehicleDispositionIfNeeded(prisma, {
      wasExcluded,
      vehicleId: row.id,
      licensePlate: row.licensePlate,
      brandModel: row.brandModel,
      nextStatus: row.vehicleStatus,
      note: dispositionNote != null ? String(dispositionNote) : undefined,
      actor: { actorUserId: actor.userId, actorUsername: actor.username },
    });

    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "ทะเบียนซ้ำ หรือเลขรหัสครุภัณฑ์ซ้ำ" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "Not found" });
    next(e);
  }
});

vehiclesRouter.delete("/:id", requireAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.vehicle.findUnique({
      where: { id: routeParam(req.params.id) },
      include: { vehicleStatus: true },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });
    await prisma.vehicle.delete({ where: { id: existing.id } });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "Vehicle",
      entityId: existing.id,
      action: "DELETE",
      summary: `ยานพาหนะ ${existing.licensePlate}: ลบ`,
      before: vehicleAuditSnapshot(existing),
      actor,
      req,
    });
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "Not found" });
    next(e);
  }
});

// รูปหลายไฟล์ (image/* เท่านั้น)
vehiclesRouter.post("/:id/photos", upload.array("photos", 24), async (req, res, next) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files?.length) return res.status(400).json({ error: "เลือกรูปอย่างน้อย 1 ไฟล์" });
    const vehicleId = routeParam(req.params.id);
    const exists = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
    if (!exists) return res.status(404).json({ error: "ไม่พบรถ" });

    const maxSort = await prisma.vehicleDocument.aggregate({
      where: { vehicleId, kind: "PHOTO" },
      _max: { sortOrder: true },
    });
    let order = (maxSort._max.sortOrder ?? -1) + 1;
    const created: Awaited<ReturnType<typeof prisma.vehicleDocument.create>>[] = [];
    for (const f of files) {
      try {
        const saved = await persistUpload(f, {
          module: "vehicles",
          userId: req.auth?.userId,
          kind: "photo",
          forceImage: true,
        });
        const row = await prisma.vehicleDocument.create({
          data: {
            vehicleId,
            fileUrl: saved.publicPath,
            mimeType: saved.mimeType,
            originalName: saved.displayName,
            kind: "PHOTO",
            sortOrder: order++,
          },
        });
        created.push(row);
      } catch {
        /* skip invalid */
      }
    }
    if (!created.length) return res.status(400).json({ error: "อัปโหลดเฉพาะไฟล์รูปภาพ (image/*)" });
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

// Documents (เอกสารทั่วไป)
vehiclesRouter.post("/:id/documents", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file required" });
    const saved = await persistUpload(req.file, {
      module: "vehicles",
      userId: req.auth?.userId,
      kind: "doc",
      allowPdf: true,
    });
    const row = await prisma.vehicleDocument.create({
      data: {
        vehicleId: routeParam(req.params.id),
        fileUrl: saved.publicPath,
        mimeType: saved.mimeType,
        originalName: saved.displayName,
        kind: "DOCUMENT",
      },
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2003")
      return res.status(404).json({ error: "Vehicle not found" });
    if (e instanceof Error) return res.status(400).json({ error: e.message });
    next(e);
  }
});

vehiclesRouter.delete("/:vehicleId/documents/:docId", async (req, res, next) => {
  try {
    const existing = await prisma.vehicleDocument.findFirst({
      where: { id: routeParam(req.params.docId), vehicleId: routeParam(req.params.vehicleId) },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });
    await prisma.vehicleDocument.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

/** ตั้งรูปเป็นรูปหน้าการ์ด (sortOrder = 0) */
vehiclesRouter.post("/:vehicleId/documents/:docId/card-front", async (req, res, next) => {
  try {
    const vehicleId = routeParam(req.params.vehicleId);
    const docId = routeParam(req.params.docId);
    const target = await prisma.vehicleDocument.findFirst({
      where: { id: docId, vehicleId, kind: "PHOTO" },
    });
    if (!target) return res.status(404).json({ error: "ไม่พบรูปนี้" });

    const photos = await prisma.vehicleDocument.findMany({
      where: { vehicleId, kind: "PHOTO" },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    await prisma.$transaction(async (tx) => {
      let order = 1;
      for (const p of photos) {
        if (p.id === target.id) continue;
        await tx.vehicleDocument.update({
          where: { id: p.id },
          data: { sortOrder: order++ },
        });
      }
      await tx.vehicleDocument.update({
        where: { id: target.id },
        data: { sortOrder: 0 },
      });
    });

    const updated = await prisma.vehicleDocument.findMany({
      where: { vehicleId, kind: "PHOTO" },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

// Maintenance
vehiclesRouter.post("/:id/maintenance", async (req, res, next) => {
  try {
    const { date, detail, cost } = req.body;
    if (!date || !detail || cost === undefined) return res.status(400).json({ error: "date, detail, cost required" });
    const costDec = dec(cost);
    if (costDec === undefined) return res.status(400).json({ error: "จำนวนเงินไม่ถูกต้อง" });
    const row = await prisma.maintenanceLog.create({
      data: {
        vehicleId: routeParam(req.params.id),
        date: new Date(date),
        detail,
        cost: costDec,
      },
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

vehiclesRouter.put("/:vehicleId/maintenance/:logId", async (req, res, next) => {
  try {
    const existing = await prisma.maintenanceLog.findFirst({
      where: { id: routeParam(req.params.logId), vehicleId: routeParam(req.params.vehicleId) },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });
    const { date, detail, cost } = req.body;
    const data: Record<string, unknown> = {};
    if (date !== undefined) data.date = new Date(date);
    if (detail !== undefined) data.detail = detail;
    if (cost !== undefined) {
      const c = dec(cost);
      if (c === undefined && hasNonEmptyDecimalInput(cost)) {
        return res.status(400).json({ error: "จำนวนเงินไม่ถูกต้อง" });
      }
      if (c !== undefined) data.cost = c;
    }
    const row = await prisma.maintenanceLog.update({ where: { id: existing.id }, data });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

vehiclesRouter.delete("/:vehicleId/maintenance/:logId", async (req, res, next) => {
  try {
    const existing = await prisma.maintenanceLog.findFirst({
      where: { id: routeParam(req.params.logId), vehicleId: routeParam(req.params.vehicleId) },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });
    await prisma.maintenanceLog.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

// Fuel
vehiclesRouter.post("/:id/fuel", async (req, res, next) => {
  try {
    const { date, liters, cost, odometer, notes } = req.body;
    if (!date) return res.status(400).json({ error: "date required" });
    const row = await prisma.fuelConsumptionLog.create({
      data: {
        vehicleId: routeParam(req.params.id),
        date: new Date(date),
        liters: dec(liters),
        cost: dec(cost),
        odometer: dec(odometer),
        notes: notes || null,
      },
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

vehiclesRouter.put("/:vehicleId/fuel/:logId", async (req, res, next) => {
  try {
    const existing = await prisma.fuelConsumptionLog.findFirst({
      where: { id: routeParam(req.params.logId), vehicleId: routeParam(req.params.vehicleId) },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });
    const { date, liters, cost, odometer, notes } = req.body;
    const data: Record<string, unknown> = {};
    if (date !== undefined) data.date = new Date(date);
    if (liters !== undefined) data.liters = dec(liters);
    if (cost !== undefined) data.cost = dec(cost);
    if (odometer !== undefined) data.odometer = dec(odometer);
    if (notes !== undefined) data.notes = notes || null;
    const row = await prisma.fuelConsumptionLog.update({ where: { id: existing.id }, data });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

vehiclesRouter.delete("/:vehicleId/fuel/:logId", async (req, res, next) => {
  try {
    const existing = await prisma.fuelConsumptionLog.findFirst({
      where: { id: routeParam(req.params.logId), vehicleId: routeParam(req.params.vehicleId) },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });
    await prisma.fuelConsumptionLog.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
