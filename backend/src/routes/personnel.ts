import { randomBytes } from "crypto";
import { Router, type Request } from "express";
import { diffSummary, resolveActorLabel, writeAuditLog } from "../lib/auditLog.js";
import { normalizeBloodType } from "../lib/bloodType.js";
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
  bloodType?: string | null;
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
    bloodType: p.bloodType ?? null,
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
  "bloodType",
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

function parseFlag(v: unknown): boolean {
  return v === true || v === "true" || v === "1" || v === "on";
}

function parseOptionalDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ข้อมูลที่ไม่เคลื่อนไหวครบ 2 ปีถูกพักการแสดงผล — เห็นเฉพาะแอดมิน */
function canSeeArchived(req: Request) {
  return req.auth?.role === "ADMIN";
}

personnelRouter.param("id", async (req, res, next, id: string) => {
  try {
    if (canSeeArchived(req)) return next();
    const p = await prisma.personnel.findUnique({ where: { id }, select: { archivedAt: true } });
    if (p?.archivedAt) return res.status(404).json({ error: "Not found" });
    next();
  } catch (e) {
    next(e);
  }
});

personnelRouter.get("/", async (req, res, next) => {
  try {
    const rows = await prisma.personnel.findMany({
      where: { purgedAt: null, ...(canSeeArchived(req) ? {} : { archivedAt: null }) },
      orderBy: { fullName: "asc" },
      include: personnelInclude,
    });
    res.json(rows.map(({ selfServiceToken: _t, ...r }) => r));
  } catch (e) {
    next(e);
  }
});

const SELF_LINK_DAYS = 30;

function newToken() {
  return randomBytes(24).toString("base64url");
}

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** ลิงก์ลงทะเบียนบุคลากรใหม่ (ใช้ร่วมกัน) */
personnelRouter.get("/self-invite", async (_req, res, next) => {
  try {
    const inv = await prisma.personnelSelfInvite.findFirst({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    res.json(inv);
  } catch (e) {
    next(e);
  }
});

personnelRouter.post("/self-invite", async (req, res, next) => {
  try {
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await prisma.personnelSelfInvite.updateMany({ where: { revokedAt: null }, data: { revokedAt: new Date() } });
    const inv = await prisma.personnelSelfInvite.create({
      data: { token: newToken(), expiresAt: daysFromNow(SELF_LINK_DAYS), createdBy: actor?.username ?? null },
    });
    res.status(201).json(inv);
  } catch (e) {
    next(e);
  }
});

personnelRouter.post("/self-invite/revoke", async (_req, res, next) => {
  try {
    await prisma.personnelSelfInvite.updateMany({ where: { revokedAt: null }, data: { revokedAt: new Date() } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** ลิงก์ให้บุคลากรรายบุคคลแก้ไขข้อมูลตนเอง — สร้างใหม่ทุกครั้ง (ลิงก์เดิมใช้ไม่ได้) */
personnelRouter.post("/:id/self-link", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const row = await prisma.personnel.update({
      where: { id },
      data: { selfServiceToken: newToken(), selfServiceTokenExpiresAt: daysFromNow(SELF_LINK_DAYS) },
      select: { selfServiceToken: true, selfServiceTokenExpiresAt: true },
    });
    res.json({ token: row.selfServiceToken, expiresAt: row.selfServiceTokenExpiresAt });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "Not found" });
    next(e);
  }
});

personnelRouter.get("/:id/self-link", async (req, res, next) => {
  try {
    const row = await prisma.personnel.findUnique({
      where: { id: routeParam(req.params.id) },
      select: { selfServiceToken: true, selfServiceTokenExpiresAt: true },
    });
    if (!row) return res.status(404).json({ error: "Not found" });
    const valid = row.selfServiceToken && (!row.selfServiceTokenExpiresAt || row.selfServiceTokenExpiresAt > new Date());
    res.json(valid ? { token: row.selfServiceToken, expiresAt: row.selfServiceTokenExpiresAt } : null);
  } catch (e) {
    next(e);
  }
});

personnelRouter.post("/:id/self-link/revoke", async (req, res, next) => {
  try {
    await prisma.personnel.update({
      where: { id: routeParam(req.params.id) },
      data: { selfServiceToken: null, selfServiceTokenExpiresAt: null },
    });
    res.json({ ok: true });
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
    if (!row || (row.archivedAt && !canSeeArchived(req))) return res.status(404).json({ error: "Not found" });
    const { selfServiceToken: _t, ...rest } = row;
    res.json(rest);
  } catch (e) {
    next(e);
  }
});

personnelRouter.post("/:id/unarchive", async (req, res, next) => {
  try {
    if (!canSeeArchived(req)) return res.status(403).json({ error: "ต้องเป็นผู้ดูแลระบบ" });
    const id = routeParam(req.params.id);
    const row = await prisma.personnel.update({
      where: { id },
      data: { archivedAt: null, lastActivityAt: new Date() },
      include: personnelInclude,
    });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "Personnel",
      entityId: id,
      action: "UPDATE",
      summary: `บุคลากร ${row.fullName}: แอดมินนำข้อมูลกลับมาแสดง`,
      actor,
      req,
    });
    const { selfServiceToken: _t, ...rest } = row;
    res.json(rest);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "Not found" });
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
      bloodType,
      birthDate,
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
      annualTravelInsurance,
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
        bloodType: normalizeBloodType(bloodType) ?? null,
        birthDate: parseOptionalDate(birthDate),
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
        annualTravelInsurance: parseFlag(annualTravelInsurance),
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
      bloodType,
      birthDate,
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
      annualTravelInsurance,
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
    if (bloodType !== undefined) data.bloodType = normalizeBloodType(bloodType) ?? null;
    if (birthDate !== undefined) data.birthDate = parseOptionalDate(birthDate);
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
    if (personnelCategoryId !== undefined) {
      if (personnelCategoryId) {
        const c = await prisma.personnelCategory.findUnique({ where: { id: String(personnelCategoryId) } });
        if (!c) return res.status(400).json({ error: "ประเภทบุคลากรไม่ถูกต้อง" });
      }
      data.personnelCategoryId = personnelCategoryId || null;
    }
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
    if (annualTravelInsurance !== undefined) data.annualTravelInsurance = parseFlag(annualTravelInsurance);
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
          lastActivityAt: new Date(),
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
