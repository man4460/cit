import { Router } from "express";
import { diffSummary, resolveActorLabel, writeAuditLog } from "../lib/auditLog.js";
import { logAssetDispositionIfNeeded } from "../lib/dispositionLog.js";
import { assetFleetCareActiveWhere, assetRetiredFromFleetCareWhere } from "../lib/fleetCareWhere.js";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";
import { requireAdmin } from "../middleware/auth.js";
import { persistUpload, upload } from "../lib/upload.js";

export const assetsRouter = Router();

function assetAuditSnapshot(a: {
  id: string;
  serialNumber: string;
  itemName: string;
  location: string;
  assetItemStatusId: string | null;
  assetCategoryId: string | null;
  notes: string | null;
  assetItemStatus?: { name: string } | null;
}) {
  return {
    id: a.id,
    serialNumber: a.serialNumber,
    itemName: a.itemName,
    location: a.location,
    assetItemStatusId: a.assetItemStatusId,
    assetItemStatusName: a.assetItemStatus?.name ?? null,
    assetCategoryId: a.assetCategoryId,
    notes: a.notes,
  };
}

const ASSET_AUDIT_KEYS = [
  "serialNumber",
  "itemName",
  "location",
  "assetItemStatusId",
  "assetItemStatusName",
  "assetCategoryId",
  "notes",
];

function parseOptionalDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseOptionalInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

const assetListInclude = {
  assetCategory: true,
  assetRoutine: true,
  assetAffiliation: true,
  assetItemStatus: true,
  auditor: { select: { id: true, fullName: true } },
  documents: {
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
    take: 48,
  },
  _count: { select: { documents: true } },
};

assetsRouter.get("/", async (req, res, next) => {
  try {
    const all = String(req.query.all ?? "") === "1";
    const rows = await prisma.asset.findMany({
      where: all ? undefined : assetFleetCareActiveWhere,
      orderBy: { itemName: "asc" },
      include: assetListInclude,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

assetsRouter.get("/registry/retired", async (_req, res, next) => {
  try {
    const rows = await prisma.asset.findMany({
      where: assetRetiredFromFleetCareWhere,
      orderBy: { serialNumber: "asc" },
      include: assetListInclude,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

assetsRouter.get("/registry/disposition-log", async (_req, res, next) => {
  try {
    const rows = await prisma.assetDispositionLog.findMany({
      orderBy: { recordedAt: "desc" },
      include: {
        asset: { select: { id: true, serialNumber: true, itemName: true, assetItemStatusId: true } },
      },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

assetsRouter.get("/by-token/:token", async (req, res, next) => {
  try {
    const asset = await prisma.asset.findUnique({
      where: { qrToken: req.params.token },
      include: {
        assetCategory: true,
        assetRoutine: true,
        assetAffiliation: true,
        assetItemStatus: true,
        auditor: true,
        documents: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        inspections: { orderBy: { inspectedAt: "desc" }, take: 10 },
      },
    });
    if (!asset) return res.status(404).json({ error: "Unknown QR token" });
    res.json(asset);
  } catch (e) {
    next(e);
  }
});

assetsRouter.post("/:id/photos", upload.array("photos", 24), async (req, res, next) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files?.length) return res.status(400).json({ error: "เลือกรูปอย่างน้อย 1 ไฟล์" });
    const assetId = routeParam(req.params.id);
    const exists = await prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } });
    if (!exists) return res.status(404).json({ error: "ไม่พบครุภัณฑ์" });

    const maxSort = await prisma.assetDocument.aggregate({
      where: { assetId, kind: "PHOTO" },
      _max: { sortOrder: true },
    });
    let order = (maxSort._max.sortOrder ?? -1) + 1;
    const created: Awaited<ReturnType<typeof prisma.assetDocument.create>>[] = [];
    for (const f of files) {
      try {
        const saved = await persistUpload(f, {
          module: "assets",
          userId: req.auth?.userId,
          kind: "photo",
          forceImage: true,
        });
        const row = await prisma.assetDocument.create({
          data: {
            assetId,
            fileUrl: saved.publicPath,
            mimeType: saved.mimeType,
            originalName: saved.displayName,
            kind: "PHOTO",
            sortOrder: order++,
          },
        });
        created.push(row);
      } catch {
        /* skip */
      }
    }
    if (!created.length) return res.status(400).json({ error: "อัปโหลดเฉพาะไฟล์รูปภาพ (image/*)" });
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

/** แทนที่ใบอนุญาต (ไฟล์เดียว — ลบ PERMIT เดิมทั้งหมด) */
assetsRouter.post("/:id/permit", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "เลือกไฟล์" });
    const assetId = routeParam(req.params.id);
    const exists = await prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } });
    if (!exists) return res.status(404).json({ error: "ไม่พบครุภัณฑ์" });

    await prisma.assetDocument.deleteMany({ where: { assetId, kind: "PERMIT" } });
    const saved = await persistUpload(req.file, {
      module: "assets",
      userId: req.auth?.userId,
      kind: "permit",
      allowPdf: true,
    });
    const row = await prisma.assetDocument.create({
      data: {
        assetId,
        fileUrl: saved.publicPath,
        mimeType: saved.mimeType,
        originalName: saved.displayName,
        kind: "PERMIT",
        sortOrder: 0,
      },
    });
    res.status(201).json(row);
  } catch (e) {
    if (e instanceof Error) return res.status(400).json({ error: e.message });
    next(e);
  }
});

assetsRouter.delete("/:assetId/documents/:docId", async (req, res, next) => {
  try {
    const existing = await prisma.assetDocument.findFirst({
      where: { id: routeParam(req.params.docId), assetId: routeParam(req.params.assetId) },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });
    await prisma.assetDocument.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

assetsRouter.get("/:id", async (req, res, next) => {
  try {
    const row = await prisma.asset.findUnique({
      where: { id: routeParam(req.params.id) },
      include: {
        assetCategory: true,
        assetRoutine: true,
        assetAffiliation: true,
        assetItemStatus: true,
        auditor: true,
        documents: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        inspections: { orderBy: { inspectedAt: "desc" }, take: 20 },
      },
    });
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

assetsRouter.post("/", async (req, res, next) => {
  try {
    const {
      serialNumber,
      itemName,
      location,
      machineSerialNumber,
      notes,
      costCenter,
      deviceBrand,
      deviceModel,
      assetCategoryId,
      assetRoutineId,
      assetAffiliationId,
      assetItemStatusId,
      auditorId,
      registryLineNo,
      armorLevel,
      armorWearStyle,
      armorModel,
      armorUnitNumber,
      permitDocumentNo,
      permitExpiresAt,
      purchasedAt,
      armorExpiresAt,
    } = req.body ?? {};
    if (!serialNumber || !itemName || !location)
      return res.status(400).json({ error: "serialNumber, itemName, location required" });

    const row = await prisma.asset.create({
      data: {
        serialNumber: String(serialNumber).trim(),
        itemName: String(itemName).trim(),
        location: String(location).trim(),
        machineSerialNumber: machineSerialNumber?.trim() ? String(machineSerialNumber).trim() : null,
        notes: notes?.trim() ? String(notes).trim() : null,
        costCenter: costCenter?.trim() ? String(costCenter).trim() : null,
        deviceBrand: deviceBrand?.trim() ? String(deviceBrand).trim() : null,
        deviceModel: deviceModel?.trim() ? String(deviceModel).trim() : null,
        assetCategoryId: assetCategoryId?.trim() || null,
        assetRoutineId: assetRoutineId?.trim() || null,
        assetAffiliationId: assetAffiliationId?.trim() || null,
        assetItemStatusId: assetItemStatusId?.trim() || null,
        auditorId: auditorId?.trim() || null,
        registryLineNo: parseOptionalInt(registryLineNo),
        armorLevel: armorLevel?.trim() ? String(armorLevel).trim() : null,
        armorWearStyle: armorWearStyle?.trim() ? String(armorWearStyle).trim() : null,
        armorModel: armorModel?.trim() ? String(armorModel).trim() : null,
        armorUnitNumber: armorUnitNumber?.trim() ? String(armorUnitNumber).trim() : null,
        permitDocumentNo: permitDocumentNo?.trim() ? String(permitDocumentNo).trim() : null,
        permitExpiresAt: parseOptionalDate(permitExpiresAt),
        purchasedAt: parseOptionalDate(purchasedAt),
        armorExpiresAt: parseOptionalDate(armorExpiresAt),
      },
      include: assetListInclude,
    });

    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "Asset",
      entityId: row.id,
      action: "CREATE",
      summary: `วัสดุ ${row.serialNumber}: สร้างใหม่`,
      after: assetAuditSnapshot(row),
      actor,
      req,
    });

    const dn = (req.body as { dispositionNote?: unknown })?.dispositionNote;
    await logAssetDispositionIfNeeded(prisma, {
      wasExcluded: false,
      assetId: row.id,
      serialNumber: row.serialNumber,
      itemName: row.itemName,
      nextStatus: row.assetItemStatus,
      note: dn != null ? String(dn) : undefined,
      actor: { actorUserId: actor.userId, actorUsername: actor.username },
    });

    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "เลขครุภัณฑ์ซ้ำ" });
    next(e);
  }
});

assetsRouter.put("/:id", async (req, res, next) => {
  try {
    const {
      serialNumber,
      itemName,
      location,
      machineSerialNumber,
      notes,
      costCenter,
      deviceBrand,
      deviceModel,
      assetCategoryId,
      assetRoutineId,
      assetAffiliationId,
      assetItemStatusId,
      auditorId,
      registryLineNo,
      armorLevel,
      armorWearStyle,
      armorModel,
      armorUnitNumber,
      permitDocumentNo,
      permitExpiresAt,
      purchasedAt,
      armorExpiresAt,
    } = req.body ?? {};

    const existing = await prisma.asset.findUnique({
      where: { id: routeParam(req.params.id) },
      include: { assetItemStatus: true },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });

    const dispositionNote = (req.body as { dispositionNote?: unknown })?.dispositionNote;

    const data: Record<string, unknown> = {};
    if (serialNumber !== undefined) data.serialNumber = String(serialNumber).trim();
    if (itemName !== undefined) data.itemName = String(itemName).trim();
    if (location !== undefined) data.location = String(location).trim();
    if (machineSerialNumber !== undefined)
      data.machineSerialNumber = machineSerialNumber?.trim() ? String(machineSerialNumber).trim() : null;
    if (notes !== undefined) data.notes = notes?.trim() ? String(notes).trim() : null;
    if (costCenter !== undefined) data.costCenter = costCenter?.trim() ? String(costCenter).trim() : null;
    if (deviceBrand !== undefined) data.deviceBrand = deviceBrand?.trim() ? String(deviceBrand).trim() : null;
    if (deviceModel !== undefined) data.deviceModel = deviceModel?.trim() ? String(deviceModel).trim() : null;
    if (assetCategoryId !== undefined) data.assetCategoryId = assetCategoryId?.trim() || null;
    if (assetRoutineId !== undefined) data.assetRoutineId = assetRoutineId?.trim() || null;
    if (assetAffiliationId !== undefined) data.assetAffiliationId = assetAffiliationId?.trim() || null;
    if (assetItemStatusId !== undefined) data.assetItemStatusId = assetItemStatusId?.trim() || null;
    if (auditorId !== undefined) data.auditorId = auditorId?.trim() || null;
    if (registryLineNo !== undefined) data.registryLineNo = parseOptionalInt(registryLineNo);
    if (armorLevel !== undefined) data.armorLevel = armorLevel?.trim() ? String(armorLevel).trim() : null;
    if (armorWearStyle !== undefined)
      data.armorWearStyle = armorWearStyle?.trim() ? String(armorWearStyle).trim() : null;
    if (armorModel !== undefined) data.armorModel = armorModel?.trim() ? String(armorModel).trim() : null;
    if (armorUnitNumber !== undefined)
      data.armorUnitNumber = armorUnitNumber?.trim() ? String(armorUnitNumber).trim() : null;
    if (permitDocumentNo !== undefined)
      data.permitDocumentNo = permitDocumentNo?.trim() ? String(permitDocumentNo).trim() : null;
    if (permitExpiresAt !== undefined) data.permitExpiresAt = parseOptionalDate(permitExpiresAt);
    if (purchasedAt !== undefined) data.purchasedAt = parseOptionalDate(purchasedAt);
    if (armorExpiresAt !== undefined) data.armorExpiresAt = parseOptionalDate(armorExpiresAt);

    const row = await prisma.asset.update({
      where: { id: routeParam(req.params.id) },
      data,
      include: assetListInclude,
    });

    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    const beforeSnap = assetAuditSnapshot(existing);
    const afterSnap = assetAuditSnapshot(row);
    await writeAuditLog(prisma, {
      entityType: "Asset",
      entityId: row.id,
      action: "UPDATE",
      summary: diffSummary(`วัสดุ ${row.serialNumber}`, beforeSnap, afterSnap, ASSET_AUDIT_KEYS),
      before: beforeSnap,
      after: afterSnap,
      actor,
      req,
    });

    const wasExcluded = existing.assetItemStatus?.excludesFromFleetCare === true;
    await logAssetDispositionIfNeeded(prisma, {
      wasExcluded,
      assetId: row.id,
      serialNumber: row.serialNumber,
      itemName: row.itemName,
      nextStatus: row.assetItemStatus,
      note: dispositionNote != null ? String(dispositionNote) : undefined,
      actor: { actorUserId: actor.userId, actorUsername: actor.username },
    });

    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "เลขครุภัณฑ์ซ้ำ" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "Not found" });
    next(e);
  }
});

assetsRouter.delete("/:id", requireAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.asset.findUnique({
      where: { id: routeParam(req.params.id) },
      include: { assetItemStatus: true },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });
    await prisma.asset.delete({ where: { id: existing.id } });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "Asset",
      entityId: existing.id,
      action: "DELETE",
      summary: `วัสดุ ${existing.serialNumber}: ลบ`,
      before: assetAuditSnapshot(existing),
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

assetsRouter.post("/:id/inspections", async (req, res, next) => {
  try {
    const { personnelId, status, notes } = req.body;
    const row = await prisma.assetInspection.create({
      data: {
        assetId: routeParam(req.params.id),
        personnelId: personnelId || null,
        status: status || "OK",
        notes: notes || null,
      },
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2003")
      return res.status(404).json({ error: "Asset or personnel not found" });
    next(e);
  }
});
