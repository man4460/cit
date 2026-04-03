import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";
import { publicFileUrl, upload } from "../lib/upload.js";

export const vehiclesRouter = Router();

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

vehiclesRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.vehicle.findMany({
      orderBy: { licensePlate: "asc" },
      include: vehicleListInclude,
    });
    res.json(rows);
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
    const existing = await prisma.vehicle.findUnique({ where: { id: routeParam(req.params.id) } });
    if (!existing) return res.status(404).json({ error: "Not found" });

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
    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "ทะเบียนซ้ำ หรือเลขรหัสครุภัณฑ์ซ้ำ" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "Not found" });
    next(e);
  }
});

vehiclesRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.vehicle.delete({ where: { id: routeParam(req.params.id) } });
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
      const mime = f.mimetype ?? "";
      if (!mime.startsWith("image/")) continue;
      const row = await prisma.vehicleDocument.create({
        data: {
          vehicleId,
          fileUrl: publicFileUrl(f.filename),
          mimeType: mime,
          originalName: f.originalname,
          kind: "PHOTO",
          sortOrder: order++,
        },
      });
      created.push(row);
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
    const row = await prisma.vehicleDocument.create({
      data: {
        vehicleId: routeParam(req.params.id),
        fileUrl: publicFileUrl(req.file.filename),
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
        kind: "DOCUMENT",
      },
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2003")
      return res.status(404).json({ error: "Vehicle not found" });
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
