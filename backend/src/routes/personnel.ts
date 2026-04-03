import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";
import { publicFileUrl, upload } from "../lib/upload.js";

export const personnelRouter = Router();

const personnelInclude = {
  personnelCategory: true,
  organizationUnitType: true,
  beneficiaries: { orderBy: { sortOrder: "asc" as const } },
} as const;

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
      phone,
      rank,
      position,
      personnelCategoryId,
      organizationUnitTypeId,
      insuranceCompany,
      insurancePolicyNumber,
      insuranceExpiry,
      insuranceNotes,
      remarks,
      beneficiaries: benRaw,
    } = b;

    if (!fullName || !idNumber || !organizationUnitTypeId)
      return res.status(400).json({ error: "ต้องกรอก ชื่อ–สกุล เลขประจำตัว และประเภทหน่วยงาน" });

    const exists = await prisma.organizationUnitType.findUnique({
      where: { id: String(organizationUnitTypeId) },
    });
    if (!exists) return res.status(400).json({ error: "ประเภทหน่วยงานไม่ถูกต้อง" });

    if (personnelCategoryId) {
      const c = await prisma.personnelCategory.findUnique({ where: { id: String(personnelCategoryId) } });
      if (!c) return res.status(400).json({ error: "ประเภทบุคลากรไม่ถูกต้อง" });
    }

    const beneficiaries = parseBeneficiaries(benRaw);
    const photoUrl = req.file ? publicFileUrl(req.file.filename) : b.photoUrl || null;

    const row = await prisma.personnel.create({
      data: {
        fullName: String(fullName),
        idNumber: String(idNumber),
        rank: rank ? String(rank) : null,
        position: position ? String(position) : null,
        phone: phone ? String(phone) : null,
        personnelCategoryId: personnelCategoryId ? String(personnelCategoryId) : null,
        organizationUnitTypeId: String(organizationUnitTypeId),
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
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "เลขประจำตัวซ้ำ" });
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
      phone,
      rank,
      position,
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
    if (phone !== undefined) data.phone = phone || null;
    if (rank !== undefined) data.rank = rank ? String(rank) : null;
    if (position !== undefined) data.position = position ? String(position) : null;
    if (personnelCategoryId !== undefined) data.personnelCategoryId = personnelCategoryId || null;
    if (organizationUnitTypeId !== undefined) {
      if (!organizationUnitTypeId) return res.status(400).json({ error: "ประเภทหน่วยงานต้องไม่ว่าง" });
      const ex = await prisma.organizationUnitType.findUnique({ where: { id: String(organizationUnitTypeId) } });
      if (!ex) return res.status(400).json({ error: "ประเภทหน่วยงานไม่ถูกต้อง" });
      data.organizationUnitTypeId = String(organizationUnitTypeId);
    }
    if (insuranceCompany !== undefined) data.insuranceCompany = insuranceCompany ? String(insuranceCompany) : null;
    if (insurancePolicyNumber !== undefined)
      data.insurancePolicyNumber = insurancePolicyNumber ? String(insurancePolicyNumber) : null;
    if (insuranceExpiry !== undefined) data.insuranceExpiry = parseOptionalDate(insuranceExpiry);
    if (insuranceNotes !== undefined) data.insuranceNotes = insuranceNotes ? String(insuranceNotes) : null;
    if (remarks !== undefined) data.remarks = remarks || null;
    if (req.file) data.photoUrl = publicFileUrl(req.file.filename);
    else if (bodyPhoto !== undefined) data.photoUrl = bodyPhoto || null;

    const beneficiaries = benRaw !== undefined ? parseBeneficiaries(benRaw) : null;

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

    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "Not found" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "เลขประจำตัวซ้ำ" });
    next(e);
  }
});

personnelRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.personnel.delete({ where: { id: routeParam(req.params.id) } });
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "Not found" });
    next(e);
  }
});
