import { Router } from "express";
import { diffSummary, resolveActorLabel, writeAuditLog } from "../lib/auditLog.js";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";
import { persistUpload, upload } from "../lib/upload.js";

export const personnelRouter = Router();

const personnelInclude = {
  personnelCategory: true,
  organizationUnitType: true,
  policeStation: true,
  beneficiaries: { orderBy: { sortOrder: "asc" as const } },
} as const;

function personnelAuditSnapshot(p: {
  id: string;
  fullName: string;
  idNumber: string;
  employeeCode?: string | null;
  rank: string | null;
  position: string | null;
  phone: string | null;
  gradeLevel?: string | null;
  perDiemRate?: { toString(): string } | number | null;
  vehicleTravelAllowance?: { toString(): string } | number | null;
  policeStationId?: string | null;
  personnelCategoryId: string | null;
  organizationUnitTypeId: string | null;
  remarks: string | null;
  personnelCategory?: { name: string } | null;
  organizationUnitType?: { name: string } | null;
}) {
  return {
    id: p.id,
    fullName: p.fullName,
    idNumber: p.idNumber,
    employeeCode: p.employeeCode ?? null,
    rank: p.rank,
    position: p.position,
    phone: p.phone,
    gradeLevel: p.gradeLevel ?? null,
    perDiemRate: p.perDiemRate == null ? null : String(p.perDiemRate),
    vehicleTravelAllowance: p.vehicleTravelAllowance == null ? null : String(p.vehicleTravelAllowance),
    policeStationId: p.policeStationId ?? null,
    personnelCategoryId: p.personnelCategoryId,
    personnelCategoryName: p.personnelCategory?.name ?? null,
    organizationUnitTypeId: p.organizationUnitTypeId,
    organizationUnitTypeName: p.organizationUnitType?.name ?? null,
    remarks: p.remarks,
  };
}

const PERSONNEL_AUDIT_KEYS = [
  "fullName",
  "idNumber",
  "employeeCode",
  "rank",
  "position",
  "phone",
  "gradeLevel",
  "perDiemRate",
  "vehicleTravelAllowance",
  "policeStationId",
  "personnelCategoryId",
  "personnelCategoryName",
  "organizationUnitTypeId",
  "organizationUnitTypeName",
  "remarks",
];

function parseOptionalDecimal(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

type BenInput = {
  fullName: string;
  relationship: string | null;
  phone: string | null;
  idNumber: string | null;
};

function parseBeneficiaries(raw: unknown): BenInput[] {
  if (raw == null || raw === "") return [];
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const out: BenInput[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const fn = String(o.fullName ?? "").trim();
    if (!fn) continue;
    out.push({
      fullName: fn,
      relationship: o.relationship != null && String(o.relationship).trim() ? String(o.relationship).trim() : null,
      phone: o.phone != null && String(o.phone).trim() ? String(o.phone).trim() : null,
      idNumber: o.idNumber != null && String(o.idNumber).trim() ? String(o.idNumber).trim() : null,
    });
  }
  return out;
}

function parseOptionalDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

personnelRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.personnel.findMany({
      orderBy: { fullName: "asc" },
      include: personnelInclude,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

personnelRouter.get("/:id/missions", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const person = await prisma.personnel.findUnique({ where: { id }, select: { id: true } });
    if (!person) return res.status(404).json({ error: "Not found" });

    const rows = await prisma.missionPersonnel.findMany({
      where: { personnelId: id },
      include: {
        personnelRole: true,
        mission: {
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            plannedStart: true,
            plannedEnd: true,
            route: { select: { startLocation: true, endLocation: true } },
          },
        },
      },
      orderBy: { mission: { plannedStart: "desc" } },
    });

    const compensationTotal = rows.reduce(
      (s, r) => s + Number(r.compensationRate ?? 0),
      0,
    );

    res.json({
      personnelId: id,
      missionCount: rows.length,
      compensationTotal: String(compensationTotal),
      missions: rows.map((r) => ({
        assignmentId: r.id,
        missionId: r.mission.id,
        code: r.mission.code,
        title: r.mission.title,
        status: r.mission.status,
        plannedStart: r.mission.plannedStart?.toISOString() ?? null,
        plannedEnd: r.mission.plannedEnd?.toISOString() ?? null,
        routeLabel: r.mission.route
          ? `${r.mission.route.startLocation} → ${r.mission.route.endLocation}`
          : null,
        roleName: r.personnelRole.name,
        compensationRate: r.compensationRate.toString(),
      })),
    });
  } catch (e) {
    next(e);
  }
});

personnelRouter.get("/:id", async (req, res, next) => {
  try {
    const row = await prisma.personnel.findUnique({
      where: { id: routeParam(req.params.id) },
      include: personnelInclude,
    });
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

personnelRouter.post("/", upload.single("photo"), async (req, res, next) => {
  try {
    const b = req.body;
    const {
      fullName,
      idNumber,
      employeeCode,
      phone,
      rank,
      position,
      gradeLevel,
      perDiemRate,
      vehicleTravelAllowance,
      policeStationId,
      personnelCategoryId,
      organizationUnitTypeId,
      insuranceCompany,
      insurancePolicyNumber,
      insuranceExpiry,
      insuranceNotes,
      remarks,
      beneficiaries: benRaw,
    } = b;

    if (!fullName || !idNumber)
      return res.status(400).json({ error: "ต้องกรอก ชื่อ–สกุล และเลขบัตรประชาชน" });

    const parsedPerDiem = parseOptionalDecimal(perDiemRate);
    if (perDiemRate !== undefined && perDiemRate !== null && perDiemRate !== "" && parsedPerDiem === undefined)
      return res.status(400).json({ error: "อัตราเบี้ยเลี้ยงไม่ถูกต้อง" });
    const parsedVehicleTravel = parseOptionalDecimal(vehicleTravelAllowance);
    if (
      vehicleTravelAllowance !== undefined &&
      vehicleTravelAllowance !== null &&
      vehicleTravelAllowance !== "" &&
      parsedVehicleTravel === undefined
    )
      return res.status(400).json({ error: "เงินช่วยเหลือยานพาหนะไม่ถูกต้อง" });

    let resolvedOrgUnitId: string | null = null;
    if (organizationUnitTypeId) {
      const exists = await prisma.organizationUnitType.findUnique({
        where: { id: String(organizationUnitTypeId) },
      });
      if (!exists) return res.status(400).json({ error: "ประเภทหน่วยงานไม่ถูกต้อง" });
      resolvedOrgUnitId = String(organizationUnitTypeId);
    }

    if (personnelCategoryId) {
      const c = await prisma.personnelCategory.findUnique({ where: { id: String(personnelCategoryId) } });
      if (!c) return res.status(400).json({ error: "ประเภทบุคลากรไม่ถูกต้อง" });
    }

    let resolvedPoliceStationId: string | null = null;
    if (policeStationId) {
      const s = await prisma.policeStationMaster.findUnique({ where: { id: String(policeStationId) } });
      if (!s) return res.status(400).json({ error: "สถานีตำรวจไม่ถูกต้อง" });
      resolvedPoliceStationId = String(policeStationId);
    }

    const beneficiaries = parseBeneficiaries(benRaw);
    let photoUrl: string | null = b.photoUrl || null;
    if (req.file) {
      try {
        const saved = await persistUpload(req.file, {
          module: "personnel",
          userId: req.auth?.userId,
          kind: "photo",
          forceImage: true,
        });
        photoUrl = saved.publicPath;
      } catch (e) {
        return res.status(400).json({ error: e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ" });
      }
    }

    const row = await prisma.personnel.create({
      data: {
        fullName: String(fullName),
        idNumber: String(idNumber),
        employeeCode: employeeCode != null && String(employeeCode).trim() ? String(employeeCode).trim() : null,
        rank: rank ? String(rank) : null,
        position: position ? String(position) : null,
        phone: phone ? String(phone) : null,
        gradeLevel: gradeLevel != null && String(gradeLevel).trim() ? String(gradeLevel).trim() : null,
        perDiemRate: parsedPerDiem ?? null,
        vehicleTravelAllowance: parsedVehicleTravel ?? null,
        policeStationId: resolvedPoliceStationId,
        personnelCategoryId: personnelCategoryId ? String(personnelCategoryId) : null,
        organizationUnitTypeId: resolvedOrgUnitId,
        insuranceCompany: insuranceCompany ? String(insuranceCompany) : null,
        insurancePolicyNumber: insurancePolicyNumber ? String(insurancePolicyNumber) : null,
        insuranceExpiry: parseOptionalDate(insuranceExpiry),
        insuranceNotes: insuranceNotes ? String(insuranceNotes) : null,
        remarks: remarks ? String(remarks) : null,
        photoUrl,
        beneficiaries: {
          create: beneficiaries.map((x, i) => ({
            fullName: x.fullName,
            relationship: x.relationship,
            phone: x.phone,
            idNumber: x.idNumber,
            sortOrder: i,
          })),
        },
      },
      include: personnelInclude,
    });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "Personnel",
      entityId: row.id,
      action: "CREATE",
      summary: `บุคลากร ${row.fullName}: สร้างใหม่`,
      after: personnelAuditSnapshot(row),
      actor,
      req,
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "เลขบัตรประชาชนซ้ำ" });
    next(e);
  }
});

personnelRouter.put("/:id", upload.single("photo"), async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const b = req.body;
    const {
      fullName,
      idNumber,
      employeeCode,
      phone,
      rank,
      position,
      gradeLevel,
      perDiemRate,
      vehicleTravelAllowance,
      policeStationId,
      personnelCategoryId,
      organizationUnitTypeId,
      insuranceCompany,
      insurancePolicyNumber,
      insuranceExpiry,
      insuranceNotes,
      remarks,
      photoUrl: bodyPhoto,
      beneficiaries: benRaw,
    } = b;

    const data: Record<string, unknown> = {};
    if (fullName !== undefined) data.fullName = fullName;
    if (idNumber !== undefined) data.idNumber = idNumber;
    if (employeeCode !== undefined)
      data.employeeCode = employeeCode == null || employeeCode === "" ? null : String(employeeCode).trim() || null;
    if (phone !== undefined) data.phone = phone || null;
    if (rank !== undefined) data.rank = rank ? String(rank) : null;
    if (position !== undefined) data.position = position ? String(position) : null;
    if (gradeLevel !== undefined)
      data.gradeLevel = gradeLevel == null || gradeLevel === "" ? null : String(gradeLevel).trim() || null;
    if (perDiemRate !== undefined) {
      const parsed = parseOptionalDecimal(perDiemRate);
      if (perDiemRate !== null && perDiemRate !== "" && parsed === undefined)
        return res.status(400).json({ error: "อัตราเบี้ยเลี้ยงไม่ถูกต้อง" });
      data.perDiemRate = parsed ?? null;
    }
    if (vehicleTravelAllowance !== undefined) {
      const parsed = parseOptionalDecimal(vehicleTravelAllowance);
      if (vehicleTravelAllowance !== null && vehicleTravelAllowance !== "" && parsed === undefined)
        return res.status(400).json({ error: "เงินช่วยเหลือยานพาหนะไม่ถูกต้อง" });
      data.vehicleTravelAllowance = parsed ?? null;
    }
    if (policeStationId !== undefined) {
      if (!policeStationId) {
        data.policeStationId = null;
      } else {
        const s = await prisma.policeStationMaster.findUnique({ where: { id: String(policeStationId) } });
        if (!s) return res.status(400).json({ error: "สถานีตำรวจไม่ถูกต้อง" });
        data.policeStationId = String(policeStationId);
      }
    }
    if (personnelCategoryId !== undefined) data.personnelCategoryId = personnelCategoryId || null;
    if (organizationUnitTypeId !== undefined) {
      if (!organizationUnitTypeId) {
        data.organizationUnitTypeId = null;
      } else {
        const ex = await prisma.organizationUnitType.findUnique({ where: { id: String(organizationUnitTypeId) } });
        if (!ex) return res.status(400).json({ error: "ประเภทหน่วยงานไม่ถูกต้อง" });
        data.organizationUnitTypeId = String(organizationUnitTypeId);
      }
    }
    if (insuranceCompany !== undefined) data.insuranceCompany = insuranceCompany ? String(insuranceCompany) : null;
    if (insurancePolicyNumber !== undefined)
      data.insurancePolicyNumber = insurancePolicyNumber ? String(insurancePolicyNumber) : null;
    if (insuranceExpiry !== undefined) data.insuranceExpiry = parseOptionalDate(insuranceExpiry);
    if (insuranceNotes !== undefined) data.insuranceNotes = insuranceNotes ? String(insuranceNotes) : null;
    if (remarks !== undefined) data.remarks = remarks || null;
    if (req.file) {
      try {
        const saved = await persistUpload(req.file, {
          module: "personnel",
          userId: req.auth?.userId,
          kind: "photo",
          forceImage: true,
        });
        data.photoUrl = saved.publicPath;
      } catch (e) {
        return res.status(400).json({ error: e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ" });
      }
    } else if (bodyPhoto !== undefined) data.photoUrl = bodyPhoto || null;

    const beneficiaries = benRaw !== undefined ? parseBeneficiaries(benRaw) : null;

    const existing = await prisma.personnel.findUnique({
      where: { id },
      include: { personnelCategory: true, organizationUnitType: true },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });

    const row = await prisma.$transaction(async (tx) => {
      if (beneficiaries !== null) {
        await tx.personnelBeneficiary.deleteMany({ where: { personnelId: id } });
      }
      return tx.personnel.update({
        where: { id },
        data: {
          ...data,
          ...(beneficiaries !== null
            ? {
                beneficiaries: {
                  create: beneficiaries.map((x, i) => ({
                    fullName: x.fullName,
                    relationship: x.relationship,
                    phone: x.phone,
                    idNumber: x.idNumber,
                    sortOrder: i,
                  })),
                },
              }
            : {}),
        },
        include: personnelInclude,
      });
    });

    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    const beforeSnap = personnelAuditSnapshot(existing);
    const afterSnap = personnelAuditSnapshot(row);
    await writeAuditLog(prisma, {
      entityType: "Personnel",
      entityId: row.id,
      action: "UPDATE",
      summary: diffSummary(`บุคลากร ${row.fullName}`, beforeSnap, afterSnap, PERSONNEL_AUDIT_KEYS),
      before: beforeSnap,
      after: afterSnap,
      actor,
      req,
    });

    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "Not found" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "เลขบัตรประชาชนซ้ำ" });
    next(e);
  }
});

personnelRouter.delete("/:id", async (req, res, next) => {
  try {
    const existing = await prisma.personnel.findUnique({
      where: { id: routeParam(req.params.id) },
      include: { personnelCategory: true, organizationUnitType: true },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });
    await prisma.personnel.delete({ where: { id: existing.id } });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "Personnel",
      entityId: existing.id,
      action: "DELETE",
      summary: `บุคลากร ${existing.fullName}: ลบ`,
      before: personnelAuditSnapshot(existing),
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
