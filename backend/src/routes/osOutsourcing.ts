import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { resolveActorLabel, writeAuditLog } from "../lib/auditLog.js";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";
import { documentCategorySlugFromName } from "../lib/upload/documentCategorySlug.js";
import { persistUpload, upload } from "../lib/upload.js";
import { requireAdmin } from "../middleware/auth.js";

export const osOutsourcingRouter = Router();

const OS_DOC_TYPE_NAME = "งานจ้าง OS";

function num(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v);
}

function parseOptionalDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function parseMonthYm(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(s)) return null;
  const m = Number(s.slice(5, 7));
  if (m < 1 || m > 12) return null;
  return s;
}

/** แปลง YYYY-MM → ปีงบ พ.ศ. (เดือนปฏิทินของปี ค.ศ. นั้น) */
function yearBeFromMonthYm(monthYm: string): number {
  const ce = Number(monthYm.slice(0, 4));
  return ce + 543;
}

function endOfMonth(monthYm: string): Date {
  const y = Number(monthYm.slice(0, 4));
  const m = Number(monthYm.slice(5, 7));
  return new Date(y, m, 0, 23, 59, 59, 999);
}

function startOfMonth(monthYm: string): Date {
  const y = Number(monthYm.slice(0, 4));
  const m = Number(monthYm.slice(5, 7));
  return new Date(y, m - 1, 1, 0, 0, 0, 0);
}

function monthWithinContract(monthYm: string, start: Date, end: Date): boolean {
  const ms = startOfMonth(monthYm).getTime();
  const me = endOfMonth(monthYm).getTime();
  return me >= start.getTime() && ms <= end.getTime();
}

function serializeDocLink(d: {
  id: string;
  libraryDocumentId: string;
  sortOrder: number;
  createdAt: Date;
  libraryDocument: {
    id: string;
    title: string;
    fileUrl: string | null;
    mimeType: string | null;
    originalName: string | null;
    createdAt: Date;
  };
}) {
  return {
    id: d.id,
    libraryDocumentId: d.libraryDocumentId,
    sortOrder: d.sortOrder,
    createdAt: d.createdAt,
    title: d.libraryDocument.title,
    fileUrl: d.libraryDocument.fileUrl,
    mimeType: d.libraryDocument.mimeType,
    originalName: d.libraryDocument.originalName,
  };
}

const libraryDocSelect = {
  id: true,
  title: true,
  fileUrl: true,
  mimeType: true,
  originalName: true,
  createdAt: true,
} as const;

const contractDocInclude = {
  documents: {
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
    include: { libraryDocument: { select: libraryDocSelect } },
  },
} satisfies Prisma.OsContractInclude;

const acceptanceDocInclude = {
  documents: {
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
    include: { libraryDocument: { select: libraryDocSelect } },
  },
} satisfies Prisma.OsMonthlyAcceptanceInclude;

function serializeContract(row: {
  id: string;
  areaGroupId: string;
  vendorName: string;
  contractNo: string | null;
  title: string | null;
  startDate: Date;
  endDate: Date;
  monthlyAmount: Prisma.Decimal | null;
  notes: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  areaGroup?: { id: string; code: string; name: string } | null;
  _count?: { acceptances: number };
  documents?: Array<{
    id: string;
    libraryDocumentId: string;
    sortOrder: number;
    createdAt: Date;
    libraryDocument: {
      id: string;
      title: string;
      fileUrl: string | null;
      mimeType: string | null;
      originalName: string | null;
      createdAt: Date;
    };
  }>;
}) {
  return {
    id: row.id,
    areaGroupId: row.areaGroupId,
    vendorName: row.vendorName,
    contractNo: row.contractNo,
    title: row.title,
    startDate: row.startDate,
    endDate: row.endDate,
    monthlyAmount: row.monthlyAmount == null ? null : num(row.monthlyAmount),
    notes: row.notes,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    areaGroup: row.areaGroup ?? null,
    _count: row._count,
    documents: (row.documents ?? []).map(serializeDocLink),
  };
}

function serializeAcceptance(row: {
  id: string;
  contractId: string;
  monthYm: string;
  acceptedAmount: Prisma.Decimal;
  acceptedAt: Date;
  remarks: string | null;
  budgetTransactionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  documents?: Array<{
    id: string;
    libraryDocumentId: string;
    sortOrder: number;
    createdAt: Date;
    libraryDocument: {
      id: string;
      title: string;
      fileUrl: string | null;
      mimeType: string | null;
      originalName: string | null;
      createdAt: Date;
    };
  }>;
}) {
  return {
    id: row.id,
    contractId: row.contractId,
    monthYm: row.monthYm,
    acceptedAmount: num(row.acceptedAmount),
    acceptedAt: row.acceptedAt,
    remarks: row.remarks,
    budgetTransactionId: row.budgetTransactionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    documents: (row.documents ?? []).map(serializeDocLink),
  };
}

async function resolveOsDocumentTypeId(): Promise<string> {
  const existing = await prisma.documentType.findUnique({ where: { name: OS_DOC_TYPE_NAME } });
  if (existing) return existing.id;
  const created = await prisma.documentType.create({
    data: { name: OS_DOC_TYPE_NAME, sortOrder: 99 },
  });
  return created.id;
}

async function persistOsLibraryFile(params: {
  file: Express.Multer.File;
  title: string;
  details: string;
  userId?: string | null;
  tx?: Prisma.TransactionClient;
}) {
  const db = params.tx ?? prisma;
  const documentTypeId = await resolveOsDocumentTypeId();
  const saved = await persistUpload(params.file, {
    module: "library",
    userId: params.userId ?? undefined,
    kind: "doc",
    categorySlug: documentCategorySlugFromName(OS_DOC_TYPE_NAME),
    categoryLabel: OS_DOC_TYPE_NAME,
    displayTitle: params.title,
    allowPdf: true,
    allowOfficeDocs: true,
  });
  return db.libraryDocument.create({
    data: {
      title: params.title,
      details: params.details,
      documentTypeId,
      fileUrl: saved.publicPath,
      mimeType: saved.mimeType,
      originalName: saved.displayName,
    },
  });
}

async function createLinkedAcceptanceDocument(params: {
  file: Express.Multer.File;
  title: string;
  details: string;
  userId?: string | null;
  acceptanceId: string;
  tx?: Prisma.TransactionClient;
}) {
  const db = params.tx ?? prisma;
  const doc = await persistOsLibraryFile(params);
  return db.osAcceptanceDocument.create({
    data: {
      acceptanceId: params.acceptanceId,
      libraryDocumentId: doc.id,
    },
    include: { libraryDocument: { select: libraryDocSelect } },
  });
}

async function createLinkedContractDocument(params: {
  file: Express.Multer.File;
  title: string;
  details: string;
  userId?: string | null;
  contractId: string;
  tx?: Prisma.TransactionClient;
}) {
  const db = params.tx ?? prisma;
  const doc = await persistOsLibraryFile(params);
  return db.osContractDocument.create({
    data: {
      contractId: params.contractId,
      libraryDocumentId: doc.id,
    },
    include: { libraryDocument: { select: libraryDocSelect } },
  });
}

const groupInclude = {
  budgetAccount: { select: { id: true, name: true, ciCode: true } },
  contracts: {
    orderBy: [{ active: "desc" as const }, { endDate: "desc" as const }],
    include: {
      _count: { select: { acceptances: true } },
      ...contractDocInclude,
    },
  },
} satisfies Prisma.OsAreaGroupInclude;

// --------------------------------------------------------------------------
// กลุ่มพื้นที่
// --------------------------------------------------------------------------

osOutsourcingRouter.get("/groups", async (_req, res, next) => {
  try {
    const rows = await prisma.osAreaGroup.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      include: groupInclude,
    });
    res.json(
      rows.map((g) => ({
        ...g,
        contracts: g.contracts.map(serializeContract),
      })),
    );
  } catch (e) {
    next(e);
  }
});

osOutsourcingRouter.patch("/groups/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const data: Prisma.OsAreaGroupUpdateInput = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: "ชื่อกลุ่มว่างไม่ได้" });
      data.name = name;
    }
    if (req.body?.budgetAccountId !== undefined) {
      const accountId = req.body.budgetAccountId ? String(req.body.budgetAccountId).trim() : null;
      if (accountId) {
        const acc = await prisma.budgetAccount.findUnique({ where: { id: accountId } });
        if (!acc) return res.status(400).json({ error: "บัญชีงบประมาณไม่ถูกต้อง" });
        data.budgetAccount = { connect: { id: accountId } };
      } else {
        data.budgetAccount = { disconnect: true };
      }
    }
    const row = await prisma.osAreaGroup.update({ where: { id }, data, include: groupInclude });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "os-area-group",
      entityId: row.id,
      action: "UPDATE",
      summary: `แก้ไขกลุ่มงานจ้าง OS: ${row.name}`,
      after: row,
      actor,
      req,
    });
    res.json({ ...row, contracts: row.contracts.map(serializeContract) });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบกลุ่ม" });
    next(e);
  }
});

// --------------------------------------------------------------------------
// สัญญา
// --------------------------------------------------------------------------

osOutsourcingRouter.get("/contracts", async (req, res, next) => {
  try {
    const areaGroupId = String(req.query.areaGroupId ?? "").trim();
    const where: Prisma.OsContractWhereInput = {};
    if (areaGroupId) where.areaGroupId = areaGroupId;
    if (String(req.query.active ?? "") === "1") where.active = true;
    const rows = await prisma.osContract.findMany({
      where,
      orderBy: [{ endDate: "desc" }],
      include: {
        areaGroup: { select: { id: true, code: true, name: true } },
        _count: { select: { acceptances: true } },
        ...contractDocInclude,
      },
    });
    res.json(rows.map(serializeContract));
  } catch (e) {
    next(e);
  }
});

osOutsourcingRouter.get("/contracts/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const row = await prisma.osContract.findUnique({
      where: { id },
      include: {
        areaGroup: { include: { budgetAccount: { select: { id: true, name: true, ciCode: true } } } },
        _count: { select: { acceptances: true } },
        ...contractDocInclude,
      },
    });
    if (!row) return res.status(404).json({ error: "ไม่พบสัญญา" });
    res.json(serializeContract(row));
  } catch (e) {
    next(e);
  }
});

osOutsourcingRouter.post("/contracts", async (req, res, next) => {
  try {
    const areaGroupId = String(req.body?.areaGroupId ?? "").trim();
    if (!areaGroupId) return res.status(400).json({ error: "เลือกกลุ่มพื้นที่" });
    const group = await prisma.osAreaGroup.findUnique({ where: { id: areaGroupId } });
    if (!group) return res.status(400).json({ error: "กลุ่มพื้นที่ไม่ถูกต้อง" });

    const vendorName = String(req.body?.vendorName ?? "").trim();
    if (!vendorName) return res.status(400).json({ error: "กรอกชื่อผู้รับจ้าง / บริษัท" });

    const startDate = parseOptionalDate(req.body?.startDate);
    const endDate = parseOptionalDate(req.body?.endDate);
    if (!startDate || !endDate) return res.status(400).json({ error: "ระบุวันเริ่มและสิ้นสุดสัญญา" });
    if (endDate.getTime() < startDate.getTime())
      return res.status(400).json({ error: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม" });

    let monthlyAmount: number | null = null;
    if (req.body?.monthlyAmount !== undefined && req.body?.monthlyAmount !== null && req.body?.monthlyAmount !== "") {
      const n = Number(req.body.monthlyAmount);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: "ยอดรายเดือนไม่ถูกต้อง" });
      monthlyAmount = n;
    }

    const row = await prisma.osContract.create({
      data: {
        areaGroupId,
        vendorName,
        contractNo: req.body?.contractNo != null ? String(req.body.contractNo).trim() || null : null,
        title: req.body?.title != null ? String(req.body.title).trim() || null : null,
        startDate,
        endDate,
        monthlyAmount,
        notes: req.body?.notes != null ? String(req.body.notes) : null,
        active: req.body?.active === undefined ? true : Boolean(req.body.active),
      },
      include: {
        areaGroup: { select: { id: true, code: true, name: true } },
        _count: { select: { acceptances: true } },
        ...contractDocInclude,
      },
    });

    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "os-contract",
      entityId: row.id,
      action: "CREATE",
      summary: `เพิ่มสัญญางานจ้าง OS: ${row.vendorName} (${group.name})`,
      after: serializeContract(row),
      actor,
      req,
    });
    res.status(201).json(serializeContract(row));
  } catch (e) {
    next(e);
  }
});

osOutsourcingRouter.patch("/contracts/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.osContract.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "ไม่พบสัญญา" });

    const data: Prisma.OsContractUncheckedUpdateInput = {};
    if (req.body?.vendorName !== undefined) {
      const vendorName = String(req.body.vendorName).trim();
      if (!vendorName) return res.status(400).json({ error: "ชื่อผู้รับจ้างว่างไม่ได้" });
      data.vendorName = vendorName;
    }
    if (req.body?.contractNo !== undefined)
      data.contractNo = req.body.contractNo == null ? null : String(req.body.contractNo).trim() || null;
    if (req.body?.title !== undefined)
      data.title = req.body.title == null ? null : String(req.body.title).trim() || null;
    if (req.body?.notes !== undefined) data.notes = req.body.notes == null ? null : String(req.body.notes);
    if (req.body?.active !== undefined) data.active = Boolean(req.body.active);

    if (req.body?.startDate !== undefined) {
      const startDate = parseOptionalDate(req.body.startDate);
      if (!startDate) return res.status(400).json({ error: "วันเริ่มไม่ถูกต้อง" });
      data.startDate = startDate;
    }
    if (req.body?.endDate !== undefined) {
      const endDate = parseOptionalDate(req.body.endDate);
      if (!endDate) return res.status(400).json({ error: "วันสิ้นสุดไม่ถูกต้อง" });
      data.endDate = endDate;
    }
    const nextStart = (data.startDate as Date | undefined) ?? existing.startDate;
    const nextEnd = (data.endDate as Date | undefined) ?? existing.endDate;
    if (nextEnd.getTime() < nextStart.getTime())
      return res.status(400).json({ error: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม" });

    if (req.body?.monthlyAmount !== undefined) {
      if (req.body.monthlyAmount === null || req.body.monthlyAmount === "") data.monthlyAmount = null;
      else {
        const n = Number(req.body.monthlyAmount);
        if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: "ยอดรายเดือนไม่ถูกต้อง" });
        data.monthlyAmount = n;
      }
    }
    if (req.body?.areaGroupId !== undefined) {
      const areaGroupId = String(req.body.areaGroupId).trim();
      const group = await prisma.osAreaGroup.findUnique({ where: { id: areaGroupId } });
      if (!group) return res.status(400).json({ error: "กลุ่มพื้นที่ไม่ถูกต้อง" });
      data.areaGroupId = areaGroupId;
    }

    const row = await prisma.osContract.update({
      where: { id },
      data,
      include: {
        areaGroup: { select: { id: true, code: true, name: true } },
        _count: { select: { acceptances: true } },
        ...contractDocInclude,
      },
    });
    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "os-contract",
      entityId: row.id,
      action: "UPDATE",
      summary: `แก้ไขสัญญางานจ้าง OS: ${row.vendorName}`,
      after: serializeContract(row),
      actor,
      req,
    });
    res.json(serializeContract(row));
  } catch (e) {
    next(e);
  }
});

osOutsourcingRouter.delete("/contracts/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.osContract.findUnique({
      where: { id },
      include: {
        acceptances: {
          select: {
            id: true,
            budgetTransactionId: true,
            documents: { select: { libraryDocumentId: true } },
          },
        },
        documents: { select: { libraryDocumentId: true } },
      },
    });
    if (!existing) return res.status(404).json({ error: "ไม่พบสัญญา" });

    const txIds = existing.acceptances.map((a) => a.budgetTransactionId).filter(Boolean) as string[];
    const libraryIds = [
      ...existing.documents.map((d) => d.libraryDocumentId),
      ...existing.acceptances.flatMap((a) => a.documents.map((d) => d.libraryDocumentId)),
    ];

    await prisma.$transaction(async (tx) => {
      if (txIds.length) {
        await tx.osMonthlyAcceptance.updateMany({
          where: { contractId: id },
          data: { budgetTransactionId: null },
        });
        await tx.budgetTransaction.deleteMany({ where: { id: { in: txIds } } });
      }
      await tx.osContract.delete({ where: { id } });
      if (libraryIds.length) {
        await tx.libraryDocument.deleteMany({ where: { id: { in: libraryIds } } });
      }
    });

    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "os-contract",
      entityId: id,
      action: "DELETE",
      summary: `ลบสัญญางานจ้าง OS: ${existing.vendorName}`,
      before: existing,
      actor,
      req,
    });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

osOutsourcingRouter.post(
  "/contracts/:id/documents",
  requireAdmin,
  upload.single("file"),
  async (req, res, next) => {
    try {
      const id = routeParam(req.params.id);
      if (!req.file) return res.status(400).json({ error: "แนบไฟล์เอกสาร" });
      const contract = await prisma.osContract.findUnique({
        where: { id },
        include: { areaGroup: true },
      });
      if (!contract) return res.status(404).json({ error: "ไม่พบสัญญา" });

      const title =
        String(req.body?.title ?? "").trim() ||
        `สัญญา ${contract.vendorName}${contract.contractNo ? ` · ${contract.contractNo}` : ""}`;

      await createLinkedContractDocument({
        file: req.file,
        title,
        details:
          String(req.body?.details ?? "").trim() ||
          [
            contract.areaGroup.name,
            contract.contractNo ? `เลขสัญญา ${contract.contractNo}` : null,
            contract.title,
          ]
            .filter(Boolean)
            .join("\n"),
        userId: req.auth?.userId,
        contractId: contract.id,
      });

      const actor = await resolveActorLabel(prisma, req.auth?.userId);
      await writeAuditLog(prisma, {
        entityType: "os-contract-document",
        entityId: id,
        action: "CREATE",
        summary: `แนบเอกสารสัญญา OS: ${title}`,
        actor,
        req,
      });

      const fresh = await prisma.osContract.findUniqueOrThrow({
        where: { id },
        include: {
          areaGroup: { select: { id: true, code: true, name: true } },
          _count: { select: { acceptances: true } },
          ...contractDocInclude,
        },
      });
      res.status(201).json(serializeContract(fresh));
    } catch (e) {
      next(e);
    }
  },
);

osOutsourcingRouter.delete("/contracts/:id/documents/:linkId", requireAdmin, async (req, res, next) => {
  try {
    const contractId = routeParam(req.params.id);
    const linkId = routeParam(req.params.linkId);
    const link = await prisma.osContractDocument.findFirst({
      where: { id: linkId, contractId },
      include: { libraryDocument: true },
    });
    if (!link) return res.status(404).json({ error: "ไม่พบเอกสารแนบ" });

    await prisma.$transaction(async (tx) => {
      await tx.osContractDocument.delete({ where: { id: linkId } });
      await tx.libraryDocument.delete({ where: { id: link.libraryDocumentId } }).catch(() => undefined);
    });

    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "os-contract-document",
      entityId: linkId,
      action: "DELETE",
      summary: `ลบเอกสารสัญญา OS: ${link.libraryDocument.title}`,
      before: link,
      actor,
      req,
    });

    const fresh = await prisma.osContract.findUniqueOrThrow({
      where: { id: contractId },
      include: {
        areaGroup: { select: { id: true, code: true, name: true } },
        _count: { select: { acceptances: true } },
        ...contractDocInclude,
      },
    });
    res.json(serializeContract(fresh));
  } catch (e) {
    next(e);
  }
});

// --------------------------------------------------------------------------
// ตรวจรับรายเดือน → หักงบ (ADMIN)
// --------------------------------------------------------------------------

osOutsourcingRouter.get("/contracts/:id/acceptances", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const year = Number(req.query.year);
    const where: Prisma.OsMonthlyAcceptanceWhereInput = { contractId: id };
    if (Number.isFinite(year) && year >= 2000 && year <= 2100) {
      where.monthYm = { startsWith: `${year}-` };
    }
    const rows = await prisma.osMonthlyAcceptance.findMany({
      where,
      orderBy: { monthYm: "asc" },
      include: acceptanceDocInclude,
    });
    res.json(rows.map(serializeAcceptance));
  } catch (e) {
    next(e);
  }
});

osOutsourcingRouter.post(
  "/contracts/:id/acceptances",
  requireAdmin,
  upload.single("file"),
  async (req, res, next) => {
  try {
    const contractId = routeParam(req.params.id);
    const contract = await prisma.osContract.findUnique({
      where: { id: contractId },
      include: { areaGroup: true },
    });
    if (!contract) return res.status(404).json({ error: "ไม่พบสัญญา" });
    if (!contract.active) return res.status(400).json({ error: "สัญญานี้ปิดใช้งานแล้ว" });

    const monthYm = parseMonthYm(req.body?.monthYm);
    if (!monthYm) return res.status(400).json({ error: "รูปแบบเดือนต้องเป็น YYYY-MM" });
    if (!monthWithinContract(monthYm, contract.startDate, contract.endDate))
      return res.status(400).json({ error: "เดือนนี้อยู่นอกช่วงสัญญา" });

    const existing = await prisma.osMonthlyAcceptance.findUnique({
      where: { contractId_monthYm: { contractId, monthYm } },
    });
    if (existing) return res.status(409).json({ error: "เดือนนี้ตรวจรับแล้ว" });

    let amount =
      req.body?.acceptedAmount !== undefined && req.body?.acceptedAmount !== null && req.body?.acceptedAmount !== ""
        ? Number(req.body.acceptedAmount)
        : contract.monthlyAmount != null
          ? num(contract.monthlyAmount)
          : NaN;
    if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: "ระบุยอดตรวจรับ" });

    if (!contract.areaGroup.budgetAccountId)
      return res.status(400).json({
        error: `กลุ่ม «${contract.areaGroup.name}» ยังไม่ผูกบัญชีงบประมาณ — ผูกบัญชีก่อนตรวจรับ`,
      });

    const yearBe = yearBeFromMonthYm(monthYm);
    const fiscalYear = await prisma.budgetFiscalYear.findUnique({ where: { yearBe } });
    if (!fiscalYear)
      return res.status(400).json({ error: `ยังไม่มีปีงบ ${yearBe} ในระบบ — สร้างปีงบก่อน` });

    const yearLine = await prisma.budgetYearLine.findUnique({
      where: {
        fiscalYearId_accountId_fundingType: {
          fiscalYearId: fiscalYear.id,
          accountId: contract.areaGroup.budgetAccountId,
          fundingType: "ANNUAL",
        },
      },
    });
    if (!yearLine)
      return res.status(400).json({
        error: `ยังไม่มีรายการงบปี ${yearBe} ของบัญชีกลุ่มนี้ — เพิ่มในงบประมาณก่อน`,
      });

    const occurredAt = endOfMonth(monthYm);
    const mm = monthYm.slice(5, 7);
    const yyyyCe = monthYm.slice(0, 4);
    const description = `ตรวจรับงานจ้าง OS · ${contract.areaGroup.name} · ${mm}/${yyyyCe}`;
    const monthBeLabel = new Date(Number(yyyyCe), Number(mm) - 1, 1).toLocaleDateString("th-TH", {
      month: "long",
      year: "numeric",
    });

    const result = await prisma.$transaction(async (tx) => {
      const txn = await tx.budgetTransaction.create({
        data: {
          yearLineId: yearLine.id,
          amount,
          occurredAt,
          description,
          refNo: contract.contractNo,
        },
      });
      const acceptance = await tx.osMonthlyAcceptance.create({
        data: {
          contractId,
          monthYm,
          acceptedAmount: amount,
          acceptedAt: new Date(),
          remarks: req.body?.remarks != null ? String(req.body.remarks).trim() || null : null,
          budgetTransactionId: txn.id,
        },
      });

      if (req.file) {
        await createLinkedAcceptanceDocument({
          file: req.file,
          title: `ตรวจรับ ${contract.areaGroup.name} · ${monthBeLabel}`,
          details: [
            contract.vendorName,
            contract.contractNo ? `เลขสัญญา ${contract.contractNo}` : null,
            description,
            amount ? `ยอด ${amount.toLocaleString("th-TH")} บาท` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          userId: req.auth?.userId,
          acceptanceId: acceptance.id,
          tx,
        });
      }

      return tx.osMonthlyAcceptance.findUniqueOrThrow({
        where: { id: acceptance.id },
        include: acceptanceDocInclude,
      });
    });

    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "os-monthly-acceptance",
      entityId: result.id,
      action: "CREATE",
      summary: `${description} · ${amount.toLocaleString("th-TH")} บาท`,
      after: serializeAcceptance(result),
      actor,
      req,
    });
    res.status(201).json(serializeAcceptance(result));
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "เดือนนี้ตรวจรับแล้ว" });
    next(e);
  }
});

osOutsourcingRouter.post(
  "/acceptances/:id/documents",
  requireAdmin,
  upload.single("file"),
  async (req, res, next) => {
    try {
      const id = routeParam(req.params.id);
      if (!req.file) return res.status(400).json({ error: "แนบไฟล์เอกสาร" });
      const acceptance = await prisma.osMonthlyAcceptance.findUnique({
        where: { id },
        include: { contract: { include: { areaGroup: true } } },
      });
      if (!acceptance) return res.status(404).json({ error: "ไม่พบรายการตรวจรับ" });

      const mm = acceptance.monthYm.slice(5, 7);
      const yyyyCe = acceptance.monthYm.slice(0, 4);
      const monthBeLabel = new Date(Number(yyyyCe), Number(mm) - 1, 1).toLocaleDateString("th-TH", {
        month: "long",
        year: "numeric",
      });
      const title =
        String(req.body?.title ?? "").trim() ||
        `ตรวจรับ ${acceptance.contract.areaGroup.name} · ${monthBeLabel}`;

      const link = await createLinkedAcceptanceDocument({
        file: req.file,
        title,
        details: String(req.body?.details ?? "").trim() || `เอกสารตรวจรับงานจ้าง OS · ${acceptance.monthYm}`,
        userId: req.auth?.userId,
        acceptanceId: acceptance.id,
      });

      const actor = await resolveActorLabel(prisma, req.auth?.userId);
      await writeAuditLog(prisma, {
        entityType: "os-acceptance-document",
        entityId: link.id,
        action: "CREATE",
        summary: `แนบเอกสารตรวจรับ OS: ${title}`,
        after: link,
        actor,
        req,
      });

      const fresh = await prisma.osMonthlyAcceptance.findUniqueOrThrow({
        where: { id },
        include: acceptanceDocInclude,
      });
      res.status(201).json(serializeAcceptance(fresh));
    } catch (e) {
      next(e);
    }
  },
);

osOutsourcingRouter.delete("/acceptances/:id/documents/:linkId", requireAdmin, async (req, res, next) => {
  try {
    const acceptanceId = routeParam(req.params.id);
    const linkId = routeParam(req.params.linkId);
    const link = await prisma.osAcceptanceDocument.findFirst({
      where: { id: linkId, acceptanceId },
      include: { libraryDocument: true },
    });
    if (!link) return res.status(404).json({ error: "ไม่พบเอกสารแนบ" });

    // ลบลิงก์ + เอกสารในคลัง (สร้างจากตรวจรับนี้)
    await prisma.$transaction(async (tx) => {
      await tx.osAcceptanceDocument.delete({ where: { id: linkId } });
      await tx.libraryDocument.delete({ where: { id: link.libraryDocumentId } }).catch(() => undefined);
    });

    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "os-acceptance-document",
      entityId: linkId,
      action: "DELETE",
      summary: `ลบเอกสารตรวจรับ OS: ${link.libraryDocument.title}`,
      before: link,
      actor,
      req,
    });

    const fresh = await prisma.osMonthlyAcceptance.findUniqueOrThrow({
      where: { id: acceptanceId },
      include: acceptanceDocInclude,
    });
    res.json(serializeAcceptance(fresh));
  } catch (e) {
    next(e);
  }
});

osOutsourcingRouter.patch("/acceptances/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.osMonthlyAcceptance.findUnique({
      where: { id },
      include: {
        contract: { include: { areaGroup: true } },
        ...acceptanceDocInclude,
      },
    });
    if (!existing) return res.status(404).json({ error: "ไม่พบรายการตรวจรับ" });

    const data: Prisma.OsMonthlyAcceptanceUpdateInput = {};
    let nextAmount = num(existing.acceptedAmount);

    if (req.body?.acceptedAmount !== undefined && req.body?.acceptedAmount !== null && req.body?.acceptedAmount !== "") {
      const amount = Number(req.body.acceptedAmount);
      if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: "ยอดตรวจรับไม่ถูกต้อง" });
      data.acceptedAmount = amount;
      nextAmount = amount;
    }
    if (req.body?.remarks !== undefined) {
      data.remarks = req.body.remarks == null || req.body.remarks === "" ? null : String(req.body.remarks).trim() || null;
    }
    if (Object.keys(data).length === 0) return res.status(400).json({ error: "ไม่มีข้อมูลแก้ไข" });

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.osMonthlyAcceptance.update({
        where: { id },
        data,
        include: acceptanceDocInclude,
      });
      if (existing.budgetTransactionId && data.acceptedAmount !== undefined) {
        const mm = existing.monthYm.slice(5, 7);
        const yyyyCe = existing.monthYm.slice(0, 4);
        await tx.budgetTransaction.update({
          where: { id: existing.budgetTransactionId },
          data: {
            amount: nextAmount,
            description: `ตรวจรับงานจ้าง OS · ${existing.contract.areaGroup.name} · ${mm}/${yyyyCe}`,
          },
        });
      }
      return row;
    });

    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "os-monthly-acceptance",
      entityId: id,
      action: "UPDATE",
      summary: `แก้ไขตรวจรับ OS ${existing.monthYm} · ${existing.contract.areaGroup.name} · ${nextAmount.toLocaleString("th-TH")} บาท`,
      before: serializeAcceptance(existing),
      after: serializeAcceptance(updated),
      actor,
      req,
    });
    res.json(serializeAcceptance(updated));
  } catch (e) {
    next(e);
  }
});

osOutsourcingRouter.delete("/acceptances/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.osMonthlyAcceptance.findUnique({
      where: { id },
      include: {
        contract: { include: { areaGroup: true } },
        ...acceptanceDocInclude,
      },
    });
    if (!existing) return res.status(404).json({ error: "ไม่พบรายการตรวจรับ" });

    const libraryIds = existing.documents.map((d) => d.libraryDocumentId);

    await prisma.$transaction(async (tx) => {
      await tx.osMonthlyAcceptance.delete({ where: { id } });
      if (existing.budgetTransactionId) {
        await tx.budgetTransaction.delete({ where: { id: existing.budgetTransactionId } }).catch(() => undefined);
      }
      if (libraryIds.length) {
        await tx.libraryDocument.deleteMany({ where: { id: { in: libraryIds } } });
      }
    });

    const actor = await resolveActorLabel(prisma, req.auth?.userId);
    await writeAuditLog(prisma, {
      entityType: "os-monthly-acceptance",
      entityId: id,
      action: "DELETE",
      summary: `ยกเลิกตรวจรับ OS ${existing.monthYm} · ${existing.contract.areaGroup.name}`,
      before: serializeAcceptance(existing),
      actor,
      req,
    });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
