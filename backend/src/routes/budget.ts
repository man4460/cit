import { Router } from "express";
import { Prisma, type BudgetAccountKind, type BudgetFundingType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/auth.js";
import { routeParam } from "../lib/routeParam.js";
import { persistUpload, publicUploadPath, unlinkUploadFile, upload } from "../lib/upload.js";

export const budgetRouter = Router();

/** bucket: ปี พ.ศ. เป็นสตริง เช่น "2569" | "commitment" */
export type BudgetBucket = string;

function dec(v: unknown): Prisma.Decimal | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Prisma.Decimal) return v;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return new Prisma.Decimal(n);
}

function num(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  return Number(v.toString());
}

function normalizeDocUrl(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function parseYearBe(raw: unknown): number | null {
  const y = parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(y) || y < 2500 || y > 2800) return null;
  return y;
}

function parseKind(raw: unknown): BudgetAccountKind | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "EXPENSE" || s === "CAPEX") return s;
  return null;
}

function parseBucket(raw: unknown): BudgetBucket {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "commitment" || s === "commit" || s === "ผูกพัน" || s === "งบผูกพัน") return "commitment";
  const y = parseYearBe(s);
  if (y != null) return String(y);
  return "2569";
}

function bucketFilter(bucket: BudgetBucket): {
  yearBe?: number;
  fundingType: BudgetFundingType;
  label: string;
} {
  if (bucket === "commitment") return { fundingType: "COMMITMENT", label: "งบผูกพัน" };
  const yearBe = parseYearBe(bucket) ?? 2569;
  return { yearBe, fundingType: "ANNUAL", label: `ปี ${yearBe} (งบประจำปี)` };
}

type LineWithRelations = {
  id: string;
  fundingType: BudgetFundingType;
  allocatedAmount: Prisma.Decimal;
  carryInAmount: Prisma.Decimal;
  commitmentAmount: Prisma.Decimal;
  buyerName: string | null;
  requestingUnit: string | null;
  quantity: string | null;
  documentUrl: string | null;
  notes: string | null;
  fiscalYear?: { yearBe: number };
  account: {
    id: string;
    parentId: string | null;
    categoryId: string | null;
    category?: { id: string; name: string } | null;
    ciCode: string | null;
    superiorCi: string | null;
    fileRef: string | null;
    name: string;
    definition: string | null;
    kind: BudgetAccountKind;
    sortOrder: number;
    isSummary: boolean;
  };
  snapshots: { id: string; asOfDate: Date; spentAmount: Prisma.Decimal; source: string; notes: string | null }[];
  transactions: { amount: Prisma.Decimal }[];
};

function enrichLine(line: LineWithRelations) {
  const allocated = num(line.allocatedAmount);
  const carryIn = num(line.carryInAmount);
  const totalBudget = allocated + carryIn;
  const latestSnap = line.snapshots[0] ?? null;
  const snapshotSpent = latestSnap ? num(latestSnap.spentAmount) : null;
  const transactionTotal = line.transactions.reduce((s, t) => s + num(t.amount), 0);
  /** snapshot = ยอดตัดจากไฟล์/ERP · transactions = รายการที่กรอกในระบบ บวกเพิ่ม */
  const spent = (snapshotSpent ?? 0) + transactionTotal;
  const remaining = totalBudget - spent;
  const pctUsed = totalBudget > 0 ? spent / totalBudget : null;

  return {
    id: line.id,
    accountId: line.account.id,
    parentId: line.account.parentId,
    categoryId: line.account.categoryId,
    categoryName: line.account.category?.name ?? null,
    yearBe: line.fiscalYear?.yearBe ?? null,
    fundingType: line.fundingType,
    ciCode: line.account.ciCode,
    superiorCi: line.account.superiorCi,
    fileRef: line.account.fileRef,
    name: line.account.name,
    definition: line.account.definition,
    kind: line.account.kind,
    sortOrder: line.account.sortOrder,
    isSummary: line.account.isSummary,
    allocatedAmount: allocated,
    carryInAmount: carryIn,
    commitmentAmount: num(line.commitmentAmount),
    totalBudget,
    buyerName: line.buyerName,
    requestingUnit: line.requestingUnit,
    quantity: line.quantity,
    documentUrl: line.documentUrl,
    notes: line.notes,
    snapshotSpent,
    snapshotAsOf: latestSnap?.asOfDate?.toISOString() ?? null,
    transactionTotal,
    spent,
    remaining,
    pctUsed,
  };
}

const lineInclude = {
  account: { include: { category: { select: { id: true, name: true } } } },
  fiscalYear: { select: { yearBe: true } },
  snapshots: { orderBy: { asOfDate: "desc" as const }, take: 1 },
  transactions: { select: { amount: true } },
};

/** สร้างบรรทัดปีว่างให้บัญชีหัวข้อหลักครบทุกปี — เพื่อให้ลิงก์ย่อยโชว์ได้ทุกหน้าปี */
async function ensureAccountYearLines(accountId: string, fundingType: BudgetFundingType) {
  const years = await prisma.budgetFiscalYear.findMany({ orderBy: { yearBe: "asc" } });
  for (const fy of years) {
    await prisma.budgetYearLine.upsert({
      where: {
        fiscalYearId_accountId_fundingType: {
          fiscalYearId: fy.id,
          accountId,
          fundingType,
        },
      },
      create: {
        fiscalYearId: fy.id,
        accountId,
        fundingType,
        allocatedAmount: new Prisma.Decimal(0),
      },
      update: {},
    });
  }
}

/** ถ้ามีลูกที่ชี้ parent แต่ปียังไม่มีบรรทัดหัวข้อหลัก — สร้างให้แล้วรวมเข้าผลลัพธ์ */
async function withEnsuredParentLines(
  lines: Array<Prisma.BudgetYearLineGetPayload<{ include: typeof lineInclude }>>,
  fiscalYearId: string | null,
  fundingType: BudgetFundingType,
) {
  if (!fiscalYearId || !lines.length) return lines;
  const present = new Set(lines.map((l) => l.accountId));
  const missing = [
    ...new Set(
      lines
        .map((l) => l.account.parentId)
        .filter((id): id is string => Boolean(id) && !present.has(id!)),
    ),
  ];
  if (!missing.length) return lines;

  for (const accountId of missing) {
    await prisma.budgetYearLine.upsert({
      where: {
        fiscalYearId_accountId_fundingType: {
          fiscalYearId,
          accountId,
          fundingType,
        },
      },
      create: {
        fiscalYearId,
        accountId,
        fundingType,
        allocatedAmount: new Prisma.Decimal(0),
      },
      update: {},
    });
  }

  const extras = await prisma.budgetYearLine.findMany({
    where: { fiscalYearId, fundingType, accountId: { in: missing } },
    include: lineInclude,
  });
  return [...lines, ...extras].sort(
    (a, b) =>
      a.account.sortOrder - b.account.sortOrder || a.account.name.localeCompare(b.account.name, "th"),
  );
}

budgetRouter.get("/years", async (_req, res, next) => {
  try {
    const years = await prisma.budgetFiscalYear.findMany({ orderBy: { yearBe: "asc" } });
    const yearBuckets = years.map((y) => ({
      id: String(y.yearBe),
      label: `ปี ${y.yearBe}`,
      yearBe: y.yearBe,
      fundingType: "ANNUAL" as const,
    }));
    const currentBe = new Date().getFullYear() + 543;
    const maxAllowedYearBe = currentBe + 1;

    /** ปีล่าสุดสำหรับงบประจำ / สร้างปีถัดไป — ไม่นับปีที่มีแต่รายการผูกพัน */
    const annualByFy = await prisma.budgetYearLine.groupBy({
      by: ["fiscalYearId"],
      where: { fundingType: "ANNUAL" },
      _count: { _all: true },
    });
    const annualFyIds = new Set(annualByFy.map((g) => g.fiscalYearId));
    const annualYearBes = years.filter((y) => annualFyIds.has(y.id)).map((y) => y.yearBe);
    const maxAnnualYearBe = annualYearBes.length ? Math.max(...annualYearBes) : null;
    const maxYearBe =
      maxAnnualYearBe != null
        ? Math.min(maxAnnualYearBe, maxAllowedYearBe)
        : years.length
          ? Math.min(years[years.length - 1]!.yearBe, maxAllowedYearBe)
          : null;
    const nextYearBe = maxYearBe != null ? maxYearBe + 1 : currentBe;

    res.json({
      years: years.map((y) => ({
        id: y.id,
        yearBe: y.yearBe,
        status: y.status,
        notes: y.notes,
      })),
      maxYearBe,
      nextYearBe,
      /** ปีสูงสุดที่อนุญาตสร้างล่วงหน้า (ปีปัจจุบัน พ.ศ. + 1) */
      maxAllowedYearBe,
      buckets: yearBuckets,
    });
  } catch (e) {
    next(e);
  }
});

budgetRouter.post("/years", requireAdmin, async (req, res, next) => {
  try {
    const yearBe = parseYearBe(req.body?.yearBe);
    if (yearBe == null) return res.status(400).json({ error: "ปีงบประมาณไม่ถูกต้อง" });
    const notes = req.body?.notes != null ? String(req.body.notes) : null;
    const created = await prisma.budgetFiscalYear.upsert({
      where: { yearBe },
      create: { yearBe, notes },
      update: { notes: notes ?? undefined },
    });
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

async function copyAnnualYear(fromYearBe: number, toYearBe: number) {
  const fromFy = await prisma.budgetFiscalYear.findUnique({ where: { yearBe: fromYearBe } });
  if (!fromFy) throw Object.assign(new Error(`ไม่พบข้อมูลงบปี ${fromYearBe}`), { status: 404 });

  const toFy = await prisma.budgetFiscalYear.upsert({
    where: { yearBe: toYearBe },
    create: { yearBe: toYearBe },
    update: {},
  });

  const sourceLines = await prisma.budgetYearLine.findMany({
    where: { fiscalYearId: fromFy.id, fundingType: "ANNUAL" },
    include: { account: { select: { id: true, isSummary: true } } },
  });

  const sourceReqs = await prisma.budgetRequest.findMany({
    where: { targetYearBe: fromYearBe },
  });
  const reqByAccount = new Map(sourceReqs.map((r) => [r.accountId, num(r.requestedAmount)]));

  let linesCreated = 0;
  let linesSkipped = 0;
  let requestsCreated = 0;
  let requestsSkipped = 0;

  for (const line of sourceLines) {
    if (line.account.isSummary) {
      linesSkipped += 1;
      continue;
    }

    const existing = await prisma.budgetYearLine.findUnique({
      where: {
        fiscalYearId_accountId_fundingType: {
          fiscalYearId: toFy.id,
          accountId: line.accountId,
          fundingType: "ANNUAL",
        },
      },
    });

    if (!existing) {
      await prisma.budgetYearLine.create({
        data: {
          fiscalYearId: toFy.id,
          accountId: line.accountId,
          fundingType: "ANNUAL",
          allocatedAmount: 0,
          carryInAmount: 0,
          commitmentAmount: 0,
          buyerName: line.buyerName,
          requestingUnit: line.requestingUnit,
          quantity: line.quantity,
          documentUrl: line.documentUrl,
          notes: line.notes,
        },
      });
      linesCreated += 1;
    } else {
      linesSkipped += 1;
    }

    const requestedAmount = reqByAccount.get(line.accountId) ?? num(line.allocatedAmount);
    const existingReq = await prisma.budgetRequest.findUnique({
      where: {
        accountId_targetYearBe: { accountId: line.accountId, targetYearBe: toYearBe },
      },
    });
    if (!existingReq) {
      await prisma.budgetRequest.create({
        data: {
          accountId: line.accountId,
          targetYearBe: toYearBe,
          requestedAmount,
        },
      });
      requestsCreated += 1;
    } else {
      requestsSkipped += 1;
    }
  }

  return {
    fromYearBe,
    toYearBe,
    linesCreated,
    linesSkipped,
    requestsCreated,
    requestsSkipped,
  };
}

/** คัดลอกรายการงบปีต้นทาง → ปีปลายทาง (โครงรายการ + ยอดคำขอจากยอดอนุมัติปีก่อน) */
budgetRouter.post("/years/copy", requireAdmin, async (req, res, next) => {
  try {
    const fromYearBe = parseYearBe(req.body?.fromYearBe);
    const toYearBe = parseYearBe(req.body?.toYearBe);
    if (fromYearBe == null || toYearBe == null) {
      return res.status(400).json({ error: "ปีงบประมาณไม่ถูกต้อง" });
    }
    if (fromYearBe === toYearBe) {
      return res.status(400).json({ error: "ปีต้นทางและปลายทางต้องต่างกัน" });
    }
    const result = await copyAnnualYear(fromYearBe, toYearBe);
    res.json(result);
  } catch (e) {
    if (e && typeof e === "object" && "status" in e && (e as { status: number }).status === 404) {
      return res.status(404).json({ error: e instanceof Error ? e.message : "ไม่พบ" });
    }
    next(e);
  }
});

/** สร้างปีถัดไปจากปีล่าสุดที่มีงบประจำ — คัดลอกโครงรายการเป็นพื้นฐาน */
budgetRouter.post("/years/next", requireAdmin, async (req, res, next) => {
  try {
    const forcedFrom = parseYearBe(req.body?.fromYearBe);
    const currentBe = new Date().getFullYear() + 543;
    const maxAllowed = currentBe + 1;

    let fromYearBe = forcedFrom;
    if (fromYearBe == null) {
      const annualGroups = await prisma.budgetYearLine.groupBy({
        by: ["fiscalYearId"],
        where: { fundingType: "ANNUAL" },
        _count: { _all: true },
      });
      if (annualGroups.length) {
        const fys = await prisma.budgetFiscalYear.findMany({
          where: { id: { in: annualGroups.map((g) => g.fiscalYearId) } },
          orderBy: { yearBe: "desc" },
          take: 1,
        });
        fromYearBe = fys[0]?.yearBe ?? null;
      }
    }
    if (fromYearBe == null) {
      const agg = await prisma.budgetFiscalYear.aggregate({ _max: { yearBe: true } });
      fromYearBe = agg._max.yearBe;
    }
    if (fromYearBe == null) {
      return res.status(400).json({ error: "ยังไม่มีปีงบประมาณต้นทาง — สร้างปีก่อนหน้าก่อน" });
    }
    const toYearBe = parseYearBe(req.body?.toYearBe) ?? fromYearBe + 1;
    if (toYearBe <= fromYearBe) {
      return res.status(400).json({ error: "ปีถัดไปต้องมากกว่าปีต้นทาง" });
    }
    if (toYearBe > maxAllowed) {
      return res.status(400).json({
        error: `ยังสร้างปี ${toYearBe} ไม่ได้ — สร้างล่วงหน้าได้ถึงปี ${maxAllowed}`,
      });
    }
    const result = await copyAnnualYear(fromYearBe, toYearBe);
    res.status(201).json(result);
  } catch (e) {
    if (e && typeof e === "object" && "status" in e && (e as { status: number }).status === 404) {
      return res.status(404).json({ error: e instanceof Error ? e.message : "ไม่พบ" });
    }
    next(e);
  }
});

budgetRouter.get("/accounts", async (req, res, next) => {
  try {
    const kind = parseKind(req.query.kind);
    const q = String(req.query.q ?? "").trim();
    const accounts = await prisma.budgetAccount.findMany({
      where: {
        AND: [
          kind ? { kind } : {},
          q
            ? {
                OR: [
                  { name: { contains: q } },
                  { ciCode: { contains: q } },
                  { fileRef: { contains: q } },
                  { superiorCi: { contains: q } },
                ],
              }
            : {},
        ],
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    res.json(accounts);
  } catch (e) {
    next(e);
  }
});

budgetRouter.post("/accounts", requireAdmin, async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "ต้องระบุชื่อบัญชีงบ" });
    const kind = parseKind(req.body?.kind) ?? "EXPENSE";
    const created = await prisma.budgetAccount.create({
      data: {
        name,
        kind,
        parentId: req.body?.parentId ? String(req.body.parentId) : null,
        categoryId: req.body?.categoryId ? String(req.body.categoryId) : null,
        ciCode: req.body?.ciCode != null ? String(req.body.ciCode).trim() || null : null,
        superiorCi: req.body?.superiorCi != null ? String(req.body.superiorCi).trim() || null : null,
        fileRef: req.body?.fileRef != null ? String(req.body.fileRef).trim() || null : null,
        definition: req.body?.definition != null ? String(req.body.definition) : null,
        sortOrder: Number(req.body?.sortOrder) || 0,
        isSummary: Boolean(req.body?.isSummary),
      },
    });
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

budgetRouter.patch("/accounts/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.budgetAccount.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "ไม่พบบัญชีงบ" });
    const data: Prisma.BudgetAccountUpdateInput = {};
    if (req.body?.name != null) data.name = String(req.body.name).trim();
    if (req.body?.kind != null) {
      const k = parseKind(req.body.kind);
      if (k) data.kind = k;
    }
    if (req.body?.parentId !== undefined) {
      data.parent = req.body.parentId ? { connect: { id: String(req.body.parentId) } } : { disconnect: true };
    }
    if (req.body?.categoryId !== undefined) {
      data.category = req.body.categoryId
        ? { connect: { id: String(req.body.categoryId) } }
        : { disconnect: true };
    }
    if (req.body?.ciCode !== undefined) data.ciCode = String(req.body.ciCode).trim() || null;
    if (req.body?.superiorCi !== undefined) data.superiorCi = String(req.body.superiorCi).trim() || null;
    if (req.body?.fileRef !== undefined) data.fileRef = String(req.body.fileRef).trim() || null;
    if (req.body?.definition !== undefined) data.definition = String(req.body.definition);
    if (req.body?.sortOrder !== undefined) data.sortOrder = Number(req.body.sortOrder) || 0;
    if (req.body?.isSummary !== undefined) data.isSummary = Boolean(req.body.isSummary);
    const updated = await prisma.budgetAccount.update({ where: { id }, data });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

budgetRouter.delete("/accounts/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    await prisma.budgetAccount.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

const DEFAULT_EXPENSE_CATS = [
  "ค่าใช้จ่ายเกี่ยวกับพนักงาน",
  "ค่าจ้างงานรักษาความปลอดภัย",
  "ค่าจ้าง / ค่าตอบแทน",
  "ค่าซ่อมบำรุงและวัสดุ",
  "ค่าใช้จ่ายดำเนินงานทั่วไป",
  "ค่าสิทธิ์การใช้โปรแกรม",
];
const DEFAULT_CAPEX_CATS = [
  "ระบบรักษาความปลอดภัย",
  "ครุภัณฑ์คอมพิวเตอร์",
  "เครื่องเสียง / ขยายเสียง",
  "อุปกรณ์ป้องกัน",
  "ยานพาหนะและขนส่ง",
  "งานติดตั้ง / ระบบ",
  "ครุภัณฑ์สำนักงาน",
  "ครุภัณฑ์อื่น",
];

async function ensureDefaultCategories() {
  const count = await prisma.budgetCategory.count();
  if (count > 0) return;
  await prisma.budgetCategory.createMany({
    data: [
      ...DEFAULT_EXPENSE_CATS.map((name, i) => ({ name, kind: "EXPENSE" as const, sortOrder: i + 1 })),
      ...DEFAULT_CAPEX_CATS.map((name, i) => ({ name, kind: "CAPEX" as const, sortOrder: i + 1 })),
    ],
  });
}

budgetRouter.get("/categories", async (req, res, next) => {
  try {
    await ensureDefaultCategories();
    const kind = parseKind(req.query.kind);
    const rows = await prisma.budgetCategory.findMany({
      where: kind ? { kind } : undefined,
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { accounts: true } } },
    });
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        sortOrder: r.sortOrder,
        accountCount: r._count.accounts,
      })),
    });
  } catch (e) {
    next(e);
  }
});

budgetRouter.post("/categories", requireAdmin, async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "ต้องระบุชื่อหมวดหมู่" });
    const kind = parseKind(req.body?.kind) ?? "EXPENSE";
    const maxSort = await prisma.budgetCategory.aggregate({
      where: { kind },
      _max: { sortOrder: true },
    });
    const created = await prisma.budgetCategory.create({
      data: {
        name,
        kind,
        sortOrder: Number(req.body?.sortOrder) || (maxSort._max.sortOrder ?? 0) + 1,
      },
    });
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

budgetRouter.patch("/categories/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.budgetCategory.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "ไม่พบหมวดหมู่" });
    const data: Prisma.BudgetCategoryUpdateInput = {};
    if (req.body?.name != null) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: "ชื่อหมวดหมู่ว่างไม่ได้" });
      data.name = name;
    }
    if (req.body?.kind != null) {
      const k = parseKind(req.body.kind);
      if (k) data.kind = k;
    }
    if (req.body?.sortOrder !== undefined) data.sortOrder = Number(req.body.sortOrder) || 0;
    const updated = await prisma.budgetCategory.update({ where: { id }, data });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

budgetRouter.delete("/categories/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const linked = await prisma.budgetAccount.count({ where: { categoryId: id } });
    if (linked > 0) {
      return res.status(400).json({ error: `ลบไม่ได้ — มีรายการผูกอยู่ ${linked} รายการ` });
    }
    await prisma.budgetCategory.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

budgetRouter.get("/lines", async (req, res, next) => {
  try {
    const bucket = parseBucket(req.query.bucket ?? req.query.yearBe);
    const bf = bucketFilter(bucket);
    const kind = parseKind(req.query.kind);
    const fundingOverride = String(req.query.fundingType ?? "").trim().toUpperCase();
    const fundingType: BudgetFundingType =
      fundingOverride === "COMMITMENT"
        ? "COMMITMENT"
        : fundingOverride === "ANNUAL"
          ? "ANNUAL"
          : bf.fundingType;

    /** งบผูกพันรายปี: ต้องระบุปี (bucket เป็นปี) — ไม่รวมทุกปีรวมกัน */
    let yearBe = bf.yearBe;
    if (bucket === "commitment") {
      yearBe = parseYearBe(req.query.yearBe) ?? undefined;
    }

    const where: Prisma.BudgetYearLineWhereInput = {
      fundingType,
      ...(yearBe != null ? { fiscalYear: { yearBe } } : {}),
      ...(kind ? { account: { kind } } : {}),
    };

    const lines = await prisma.budgetYearLine.findMany({
      where,
      include: lineInclude,
      orderBy: [
        { fiscalYear: { yearBe: "asc" } },
        { account: { sortOrder: "asc" } },
        { account: { name: "asc" } },
      ],
    });

    let fiscalYearId: string | null = null;
    if (yearBe != null) {
      const fy = await prisma.budgetFiscalYear.findUnique({ where: { yearBe } });
      fiscalYearId = fy?.id ?? null;
    } else if (lines[0]?.fiscalYear) {
      const fy = await prisma.budgetFiscalYear.findUnique({
        where: { yearBe: lines[0].fiscalYear.yearBe },
      });
      fiscalYearId = fy?.id ?? null;
    }

    const withParents =
      yearBe != null ? await withEnsuredParentLines(lines, fiscalYearId, fundingType) : lines;

    res.json({
      bucket,
      label:
        fundingType === "COMMITMENT"
          ? yearBe != null
            ? `งบผูกพันปี ${yearBe}`
            : "งบผูกพัน"
          : bf.label,
      yearBe: yearBe ?? null,
      fundingType,
      lines: withParents.map(enrichLine),
    });
  } catch (e) {
    next(e);
  }
});

budgetRouter.get("/years/:yearBe/lines", async (req, res, next) => {
  try {
    const yearBe = parseYearBe(routeParam(req.params.yearBe));
    if (yearBe == null) return res.status(400).json({ error: "ปีงบประมาณไม่ถูกต้อง" });
    const kind = parseKind(req.query.kind);
    const fundingRaw = String(req.query.fundingType ?? "ANNUAL").toUpperCase();
    const fundingType: BudgetFundingType = fundingRaw === "COMMITMENT" ? "COMMITMENT" : "ANNUAL";
    const fy = await prisma.budgetFiscalYear.findUnique({ where: { yearBe } });
    if (!fy) return res.json({ yearBe, fundingType, lines: [] });

    const lines = await prisma.budgetYearLine.findMany({
      where: {
        fiscalYearId: fy.id,
        fundingType,
        ...(kind ? { account: { kind } } : {}),
      },
      include: lineInclude,
      orderBy: [{ account: { sortOrder: "asc" } }, { account: { name: "asc" } }],
    });
    const withParents = await withEnsuredParentLines(lines, fy.id, fundingType);
    res.json({ yearBe, fundingType, fiscalYearId: fy.id, lines: withParents.map(enrichLine) });
  } catch (e) {
    next(e);
  }
});

budgetRouter.patch("/year-lines/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.budgetYearLine.findUnique({
      where: { id },
      include: { account: true },
    });
    if (!existing) return res.status(404).json({ error: "ไม่พบรายการงบปี" });

    const accountData: Prisma.BudgetAccountUpdateInput = {};
    if (req.body?.name != null) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: "ชื่อรายการว่างไม่ได้" });
      accountData.name = name;
    }
    if (req.body?.kind != null) {
      const k = parseKind(req.body.kind);
      if (k) accountData.kind = k;
    }
    if (req.body?.parentId !== undefined) {
      accountData.parent = req.body.parentId
        ? { connect: { id: String(req.body.parentId) } }
        : { disconnect: true };
    }
    if (req.body?.categoryId !== undefined) {
      accountData.category = req.body.categoryId
        ? { connect: { id: String(req.body.categoryId) } }
        : { disconnect: true };
    }
    if (req.body?.ciCode !== undefined) accountData.ciCode = String(req.body.ciCode).trim() || null;
    if (req.body?.superiorCi !== undefined) accountData.superiorCi = String(req.body.superiorCi).trim() || null;
    if (req.body?.fileRef !== undefined) accountData.fileRef = String(req.body.fileRef).trim() || null;
    if (req.body?.definition !== undefined) accountData.definition = String(req.body.definition);

    if (Object.keys(accountData).length) {
      await prisma.budgetAccount.update({ where: { id: existing.accountId }, data: accountData });
    }

    /** เมื่อตั้งเป็นย่อย — ให้หัวข้อหลักมีบรรทัดครบทุกปี */
    if (req.body?.parentId) {
      await ensureAccountYearLines(String(req.body.parentId), existing.fundingType);
    } else if (req.body?.parentId === null || req.body?.parentId === "") {
      /** เป็นหัวข้อหลักเอง — มีบรรทัดครบทุกปีด้วย */
      await ensureAccountYearLines(existing.accountId, existing.fundingType);
    }

    const data: Prisma.BudgetYearLineUpdateInput = {};
    if (req.body?.allocatedAmount !== undefined) {
      const d = dec(req.body.allocatedAmount);
      if (d != null) data.allocatedAmount = d;
    }
    if (req.body?.carryInAmount !== undefined) {
      const d = dec(req.body.carryInAmount);
      if (d != null) data.carryInAmount = d;
    }
    if (req.body?.commitmentAmount !== undefined) {
      const d = dec(req.body.commitmentAmount);
      if (d != null) data.commitmentAmount = d;
    }
    if (req.body?.buyerName !== undefined) data.buyerName = String(req.body.buyerName).trim() || null;
    if (req.body?.requestingUnit !== undefined) data.requestingUnit = String(req.body.requestingUnit).trim() || null;
    if (req.body?.quantity !== undefined) data.quantity = String(req.body.quantity).trim() || null;
    if (req.body?.documentUrl !== undefined) data.documentUrl = normalizeDocUrl(req.body.documentUrl);
    if (req.body?.notes !== undefined) data.notes = String(req.body.notes);

    const updated = await prisma.budgetYearLine.update({
      where: { id },
      data,
      include: lineInclude,
    });
    res.json(enrichLine(updated));
  } catch (e) {
    next(e);
  }
});

budgetRouter.post("/year-lines", requireAdmin, async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "ต้องระบุชื่อรายการ" });
    const kind = parseKind(req.body?.kind) ?? "EXPENSE";
    const bucket = parseBucket(req.body?.bucket ?? req.body?.yearBe);
    const bf = bucketFilter(bucket);
    const fundingRaw = String(req.body?.fundingType ?? "").trim().toUpperCase();
    const fundingType: BudgetFundingType =
      fundingRaw === "COMMITMENT" ? "COMMITMENT" : fundingRaw === "ANNUAL" ? "ANNUAL" : bf.fundingType;
    const amount = dec(req.body?.allocatedAmount) ?? new Prisma.Decimal(0);

    let yearBe = bf.yearBe;
    if (yearBe == null) {
      yearBe = parseYearBe(req.body?.yearBe) ?? 2569;
    }
    const fy = await prisma.budgetFiscalYear.upsert({
      where: { yearBe },
      create: { yearBe },
      update: {},
    });

    const account = await prisma.budgetAccount.create({
      data: {
        name,
        kind,
        parentId: req.body?.parentId ? String(req.body.parentId) : null,
        categoryId: req.body?.categoryId ? String(req.body.categoryId) : null,
        ciCode: req.body?.ciCode != null ? String(req.body.ciCode).trim() || null : null,
        superiorCi: req.body?.superiorCi != null ? String(req.body.superiorCi).trim() || null : null,
        fileRef: req.body?.fileRef != null ? String(req.body.fileRef).trim() || null : null,
        definition: req.body?.definition != null ? String(req.body.definition) : null,
        sortOrder: Number(req.body?.sortOrder) || 0,
        isSummary: false,
      },
    });

    const line = await prisma.budgetYearLine.create({
      data: {
        fiscalYearId: fy.id,
        accountId: account.id,
        fundingType,
        allocatedAmount: amount,
        carryInAmount: dec(req.body?.carryInAmount) ?? new Prisma.Decimal(0),
        commitmentAmount: dec(req.body?.commitmentAmount) ?? new Prisma.Decimal(0),
        buyerName: req.body?.buyerName != null ? String(req.body.buyerName).trim() || null : null,
        requestingUnit: req.body?.requestingUnit != null ? String(req.body.requestingUnit).trim() || null : null,
        quantity: req.body?.quantity != null ? String(req.body.quantity).trim() || null : null,
        documentUrl: req.body?.documentUrl != null ? normalizeDocUrl(req.body.documentUrl) : null,
        notes: req.body?.notes != null ? String(req.body.notes) : null,
      },
      include: lineInclude,
    });

    /** หัวข้อหลัก/ย่อย ต้องมีบรรทัดครบทุกปี — ปีอื่นยอด 0 */
    await ensureAccountYearLines(account.id, fundingType);
    if (account.parentId) {
      await ensureAccountYearLines(account.parentId, fundingType);
    }

    if (req.body?.asRequest && yearBe != null) {
      await prisma.budgetRequest.upsert({
        where: { accountId_targetYearBe: { accountId: account.id, targetYearBe: yearBe } },
        create: { accountId: account.id, targetYearBe: yearBe, requestedAmount: amount },
        update: { requestedAmount: amount },
      });
    }

    const refreshed = await prisma.budgetYearLine.findUniqueOrThrow({
      where: { id: line.id },
      include: lineInclude,
    });
    res.status(201).json(enrichLine(refreshed));
  } catch (e) {
    next(e);
  }
});

budgetRouter.delete("/year-lines/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.budgetYearLine.findUnique({
      where: { id },
      include: { fiscalYear: { select: { yearBe: true } } },
    });
    if (!existing) return res.status(404).json({ error: "ไม่พบรายการงบปี" });

    const accountId = existing.accountId;
    const yearBe = existing.fiscalYear.yearBe;

    await prisma.budgetYearLine.delete({ where: { id } });
    await prisma.budgetRequest.deleteMany({
      where: { accountId, targetYearBe: yearBe },
    });

    const leftoverLines = await prisma.budgetYearLine.count({ where: { accountId } });
    const leftoverReqs = await prisma.budgetRequest.count({ where: { accountId } });
    if (leftoverLines === 0 && leftoverReqs === 0) {
      await prisma.budgetAccount.delete({ where: { id: accountId } }).catch(() => undefined);
    }

    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

budgetRouter.get("/year-lines/:id/snapshots", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const rows = await prisma.budgetSpendSnapshot.findMany({
      where: { yearLineId: id },
      orderBy: { asOfDate: "desc" },
    });
    res.json(
      rows.map((r) => ({
        id: r.id,
        asOfDate: r.asOfDate.toISOString(),
        spentAmount: num(r.spentAmount),
        source: r.source,
        notes: r.notes,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  } catch (e) {
    next(e);
  }
});

budgetRouter.post("/year-lines/:id/snapshots", requireAdmin, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const line = await prisma.budgetYearLine.findUnique({ where: { id } });
    if (!line) return res.status(404).json({ error: "ไม่พบรายการงบปี" });
    const spent = dec(req.body?.spentAmount);
    if (spent == null) return res.status(400).json({ error: "ต้องระบุยอดใช้ไป" });
    const asOf = req.body?.asOfDate ? new Date(String(req.body.asOfDate)) : new Date();
    if (Number.isNaN(asOf.getTime())) return res.status(400).json({ error: "วันที่ไม่ถูกต้อง" });
    const created = await prisma.budgetSpendSnapshot.create({
      data: {
        yearLineId: id,
        asOfDate: asOf,
        spentAmount: spent,
        source: req.body?.source === "IMPORT" ? "IMPORT" : "MANUAL",
        notes: req.body?.notes != null ? String(req.body.notes) : null,
      },
    });
    res.status(201).json({
      id: created.id,
      asOfDate: created.asOfDate.toISOString(),
      spentAmount: num(created.spentAmount),
      source: created.source,
      notes: created.notes,
    });
  } catch (e) {
    next(e);
  }
});

budgetRouter.get("/year-lines/:id/transactions", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const rows = await prisma.budgetTransaction.findMany({
      where: { yearLineId: id },
      orderBy: { occurredAt: "desc" },
    });
    res.json(
      rows.map((r) => ({
        id: r.id,
        amount: num(r.amount),
        occurredAt: r.occurredAt.toISOString(),
        description: r.description,
        refNo: r.refNo,
      })),
    );
  } catch (e) {
    next(e);
  }
});

budgetRouter.post("/year-lines/:id/transactions", requireAdmin, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const line = await prisma.budgetYearLine.findUnique({ where: { id } });
    if (!line) return res.status(404).json({ error: "ไม่พบรายการงบปี" });
    const amount = dec(req.body?.amount);
    if (amount == null) return res.status(400).json({ error: "ต้องระบุจำนวนเงิน" });
    const occurredAt = req.body?.occurredAt ? new Date(String(req.body.occurredAt)) : new Date();
    if (Number.isNaN(occurredAt.getTime())) return res.status(400).json({ error: "วันที่ไม่ถูกต้อง" });
    const created = await prisma.budgetTransaction.create({
      data: {
        yearLineId: id,
        amount,
        occurredAt,
        description: req.body?.description != null ? String(req.body.description) : null,
        refNo: req.body?.refNo != null ? String(req.body.refNo).trim() || null : null,
      },
    });
    res.status(201).json({
      id: created.id,
      amount: num(created.amount),
      occurredAt: created.occurredAt.toISOString(),
      description: created.description,
      refNo: created.refNo,
    });
  } catch (e) {
    next(e);
  }
});

budgetRouter.delete("/year-lines/:id/transactions/:txId", requireAdmin, async (req, res, next) => {
  try {
    const txId = routeParam(req.params.txId);
    await prisma.budgetTransaction.delete({ where: { id: txId } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

budgetRouter.get("/requests", async (req, res, next) => {
  try {
    const yearBe = parseYearBe(req.query.yearBe) ?? 2570;
    const baseYearBe = yearBe - 1;
    const requests = await prisma.budgetRequest.findMany({
      where: { targetYearBe: yearBe },
      include: { account: true },
      orderBy: [{ account: { sortOrder: "asc" } }, { account: { name: "asc" } }],
    });

    const fy = await prisma.budgetFiscalYear.findUnique({ where: { yearBe: baseYearBe } });
    const baseLines = fy
      ? await prisma.budgetYearLine.findMany({
          where: { fiscalYearId: fy.id },
          include: lineInclude,
        })
      : [];
    const baseByAccount = new Map(baseLines.map((l) => [l.accountId, enrichLine(l)]));

    res.json({
      targetYearBe: yearBe,
      baseYearBe,
      items: requests.map((r) => {
        const base = baseByAccount.get(r.accountId);
        return {
          id: r.id,
          accountId: r.accountId,
          ciCode: r.account.ciCode,
          fileRef: r.account.fileRef,
          name: r.account.name,
          definition: r.account.definition,
          kind: r.account.kind,
          isSummary: r.account.isSummary,
          sortOrder: r.account.sortOrder,
          baseAllocated: base?.allocatedAmount ?? 0,
          baseSpent: base?.spent ?? 0,
          basePctUsed: base?.pctUsed ?? null,
          requestedAmount: num(r.requestedAmount),
          deltaAmount: r.deltaAmount != null ? num(r.deltaAmount) : null,
          deltaPercent: r.deltaPercent != null ? num(r.deltaPercent) : null,
          changeDirection: r.changeDirection,
          reason: r.reason,
          planEndAmount: r.planEndAmount != null ? num(r.planEndAmount) : null,
        };
      }),
    });
  } catch (e) {
    next(e);
  }
});

budgetRouter.post("/requests", requireAdmin, async (req, res, next) => {
  try {
    const accountId = String(req.body?.accountId ?? "").trim();
    const targetYearBe = parseYearBe(req.body?.targetYearBe);
    const requestedAmount = dec(req.body?.requestedAmount);
    const planEndAmount = dec(req.body?.planEndAmount);
    if (!accountId || targetYearBe == null || (requestedAmount == null && planEndAmount == null)) {
      return res.status(400).json({ error: "ข้อมูลคำขอไม่ครบ" });
    }
    const existing = await prisma.budgetRequest.findUnique({
      where: { accountId_targetYearBe: { accountId, targetYearBe } },
    });
    if (!existing) {
      const created = await prisma.budgetRequest.create({
        data: {
          accountId,
          targetYearBe,
          requestedAmount: requestedAmount ?? new Prisma.Decimal(0),
          deltaAmount: dec(req.body?.deltaAmount) ?? undefined,
          deltaPercent: dec(req.body?.deltaPercent) ?? undefined,
          changeDirection: req.body?.changeDirection != null ? String(req.body.changeDirection) : null,
          reason: req.body?.reason != null ? String(req.body.reason) : null,
          planEndAmount: planEndAmount ?? undefined,
        },
      });
      return res.status(201).json(created);
    }
    const data: Prisma.BudgetRequestUpdateInput = {};
    if (requestedAmount != null) data.requestedAmount = requestedAmount;
    if (req.body?.deltaAmount !== undefined) data.deltaAmount = dec(req.body.deltaAmount);
    if (req.body?.deltaPercent !== undefined) data.deltaPercent = dec(req.body.deltaPercent);
    if (req.body?.changeDirection !== undefined) {
      data.changeDirection = req.body.changeDirection != null ? String(req.body.changeDirection) : null;
    }
    if (req.body?.reason !== undefined) data.reason = req.body.reason != null ? String(req.body.reason) : null;
    if (planEndAmount != null || req.body?.planEndAmount !== undefined) {
      data.planEndAmount = planEndAmount;
    }
    const updated = await prisma.budgetRequest.update({ where: { id: existing.id }, data });
    res.status(201).json(updated);
  } catch (e) {
    next(e);
  }
});

budgetRouter.patch("/requests/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.budgetRequest.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "ไม่พบคำขอ" });
    const data: Prisma.BudgetRequestUpdateInput = {};
    if (req.body?.requestedAmount !== undefined) {
      const d = dec(req.body.requestedAmount);
      if (d != null) data.requestedAmount = d;
    }
    if (req.body?.deltaAmount !== undefined) data.deltaAmount = dec(req.body.deltaAmount);
    if (req.body?.deltaPercent !== undefined) data.deltaPercent = dec(req.body.deltaPercent);
    if (req.body?.changeDirection !== undefined) data.changeDirection = String(req.body.changeDirection);
    if (req.body?.reason !== undefined) data.reason = String(req.body.reason);
    if (req.body?.planEndAmount !== undefined) data.planEndAmount = dec(req.body.planEndAmount);
    const updated = await prisma.budgetRequest.update({ where: { id }, data });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

budgetRouter.delete("/requests/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    await prisma.budgetRequest.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

budgetRouter.get("/dashboard", async (req, res, next) => {
  try {
    const bucket = parseBucket(req.query.bucket ?? req.query.yearBe ?? "2569");
    const bf = bucketFilter(bucket);
    const years = await prisma.budgetFiscalYear.findMany({ orderBy: { yearBe: "desc" } });

    const where: Prisma.BudgetYearLineWhereInput = {
      fundingType: bf.fundingType,
      ...(bf.yearBe != null ? { fiscalYear: { yearBe: bf.yearBe } } : {}),
    };

    const lines = await prisma.budgetYearLine.findMany({
      where,
      include: lineInclude,
    });
    const enrichedAll = lines.map(enrichLine);

    // งบประจำปี: ใช้ยอดหมวดสรุปถ้ามี — กันซ้ำจากรายการย่อย
    // งบผูกพัน: รวมรายการที่ไม่ใช่ summary
    let enriched = enrichedAll.filter((l) => !l.isSummary);
    if (bf.fundingType === "ANNUAL") {
      const sectionExpense = enrichedAll.find(
        (l) => l.isSummary && l.kind === "EXPENSE" && /หมวดค่าใช้จ่าย/.test(l.name),
      );
      const sectionCapex = enrichedAll.find(
        (l) => l.isSummary && l.kind === "CAPEX" && /สินทรัพย์ถาวร/.test(l.name),
      );
      if (sectionExpense || sectionCapex) {
        enriched = [sectionExpense, sectionCapex].filter(Boolean) as typeof enriched;
      } else {
        enriched = enrichedAll.filter((l) => !l.isSummary && Boolean(l.ciCode));
      }
    }

    const sum = (arr: typeof enriched, pick: (x: (typeof enriched)[0]) => number) =>
      arr.reduce((s, x) => s + pick(x), 0);

    const totalsAllocated = sum(enriched, (x) => x.allocatedAmount);
    const totalsCarryIn = bf.fundingType === "ANNUAL" ? 0 : sum(enriched, (x) => x.carryInAmount);
    const totalsBudget = totalsAllocated + totalsCarryIn;
    const totalsSpent = sum(enriched, (x) => x.spent);
    const totalsRemaining = totalsBudget - totalsSpent;

    const kinds: BudgetAccountKind[] = ["EXPENSE", "CAPEX"];
    const byKind = kinds.map((kind) => {
      const subset = enriched.filter((x) => x.kind === kind);
      const allocated = sum(subset, (x) => x.allocatedAmount);
      const carryIn = bf.fundingType === "ANNUAL" ? 0 : sum(subset, (x) => x.carryInAmount);
      const totalBudget = allocated + carryIn;
      const spent = sum(subset, (x) => x.spent);
      return {
        kind,
        allocated,
        carryIn,
        totalBudget,
        spent,
        remaining: totalBudget - spent,
        pctUsed: totalBudget > 0 ? spent / totalBudget : null,
        lineCount: enrichedAll.filter((x) => !x.isSummary && x.kind === kind && (bf.fundingType === "COMMITMENT" || x.ciCode)).length,
      };
    });

    const detailForLists =
      bf.fundingType === "COMMITMENT"
        ? enrichedAll.filter((l) => !l.isSummary)
        : enrichedAll.filter((l) => !l.isSummary && Boolean(l.ciCode));

    const alerts = detailForLists
      .filter((x) => x.totalBudget > 0 && x.pctUsed != null && x.pctUsed >= 0.9)
      .sort((a, b) => (b.pctUsed ?? 0) - (a.pctUsed ?? 0))
      .slice(0, 12)
      .map((x) => ({
        yearLineId: x.id,
        name: x.name,
        ciCode: x.ciCode,
        kind: x.kind,
        totalBudget: x.totalBudget,
        spent: x.spent,
        pctUsed: x.pctUsed,
        remaining: x.remaining,
      }));

    const topSpent = [...detailForLists]
      .sort((a, b) =>
        bf.fundingType === "COMMITMENT" || bucket === "2570"
          ? b.allocatedAmount - a.allocatedAmount
          : b.spent - a.spent,
      )
      .slice(0, 10)
      .map((x) => ({
        yearLineId: x.id,
        name: x.name,
        ciCode: x.ciCode,
        kind: x.kind,
        spent: x.spent,
        totalBudget: x.allocatedAmount,
        pctUsed: x.allocatedAmount > 0 ? x.spent / x.allocatedAmount : null,
      }));

    res.json({
      bucket,
      label: bf.label,
      yearBe: bf.yearBe,
      fundingType: bf.fundingType,
      availableYears: years.map((y) => y.yearBe),
      buckets: [
        { id: "2569", label: "ปี 2569" },
        { id: "2570", label: "ปี 2570" },
        { id: "commitment", label: "งบผูกพัน" },
      ],
      totals: {
        allocated: totalsAllocated,
        carryIn: totalsCarryIn,
        totalBudget: totalsBudget,
        spent: totalsSpent,
        remaining: totalsRemaining,
        pctUsed: totalsBudget > 0 ? totalsSpent / totalsBudget : null,
      },
      byKind,
      alerts,
      topSpent,
    });
  } catch (e) {
    next(e);
  }
});

/** สรุปเสนอผู้ใหญ่ — โครงสร้างตามสไลด์ Executive Summary */
budgetRouter.get("/executive", async (_req, res, next) => {
  try {
    const baseYear = 2569;
    const requestYear = 2570;

    const [fy69, fy70] = await Promise.all([
      prisma.budgetFiscalYear.findUnique({ where: { yearBe: baseYear } }),
      prisma.budgetFiscalYear.findUnique({ where: { yearBe: requestYear } }),
    ]);

    const lines69 = fy69
      ? (
          await prisma.budgetYearLine.findMany({
            where: { fiscalYearId: fy69.id, fundingType: "ANNUAL" },
            include: lineInclude,
          })
        ).map(enrichLine)
      : [];
    const lines70 = fy70
      ? (
          await prisma.budgetYearLine.findMany({
            where: { fiscalYearId: fy70.id, fundingType: "ANNUAL" },
            include: lineInclude,
          })
        ).map(enrichLine)
      : [];
    const commitLines = (
      await prisma.budgetYearLine.findMany({
        where: { fundingType: "COMMITMENT" },
        include: lineInclude,
      })
    ).map(enrichLine);

    /** รายการบัญชีที่มีรหัส CI — ไม่นับรายการย่อย (เช่น กลุ่มพื้นที่ OS) เพื่อกันยอดซ้ำ */
    const detail69 = lines69.filter((l) => !l.isSummary && Boolean(l.ciCode));
    const detail70 = lines70.filter((l) => !l.isSummary && Boolean(l.ciCode));
    const leafCommit = commitLines.filter((l) => !l.isSummary);

    const sum = <T>(arr: T[], pick: (x: T) => number) => arr.reduce((s, x) => s + pick(x), 0);

    /** ยอดหมวดจากแถวสรุปในไฟล์ (ตรงสไลด์ PDF) — ห้ามรวมลูกทุกใบ */
    const sectionOf = (lines: ReturnType<typeof enrichLine>[], kind: BudgetAccountKind) => {
      const re = kind === "EXPENSE" ? /หมวดค่าใช้จ่าย/ : /สินทรัพย์ถาวร/;
      return lines.find((l) => l.isSummary && l.kind === kind && re.test(l.name)) ?? null;
    };

    const kindBlock = (kind: BudgetAccountKind) => {
      const s69 = sectionOf(lines69, kind);
      const s70 = sectionOf(lines70, kind);
      const fallback69 = detail69.filter((x) => x.kind === kind);
      const fallback70 = detail70.filter((x) => x.kind === kind);
      // ใช้ยอดจัดสรรของหมวด (ไม่บวกเหลื่อมปีใน headline ให้ตรงสไลด์)
      const budget69 = s69 ? s69.allocatedAmount : sum(fallback69, (x) => x.allocatedAmount);
      const spent69 = s69 ? s69.spent : sum(fallback69, (x) => x.spent);
      const budget70 = s70 ? s70.allocatedAmount : sum(fallback70, (x) => x.allocatedAmount);
      const delta = budget70 - budget69;
      return {
        kind,
        label: kind === "EXPENSE" ? "หมวดค่าใช้จ่าย" : "หมวดสินทรัพย์ถาวร",
        year69: budget69,
        year70: budget70,
        spent69,
        remaining69: budget69 - spent69,
        pctUsed69: budget69 > 0 ? spent69 / budget69 : null,
        delta,
        deltaPct: budget69 > 0 ? delta / budget69 : null,
        source: s69 || s70 ? "section" : "ci-lines",
      };
    };

    const byKind = [kindBlock("EXPENSE"), kindBlock("CAPEX")];
    const total69 = sum(byKind, (x) => x.year69);
    const total70 = sum(byKind, (x) => x.year70);
    const spent69 = sum(byKind, (x) => x.spent69);
    const delta = total70 - total69;

    const topSpendExpense = detail69
      .filter((x) => x.kind === "EXPENSE" && x.totalBudget > 0)
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 5)
      .map((x) => ({
        name: x.name,
        ciCode: x.ciCode,
        budget: x.allocatedAmount,
        spent: x.spent,
        pctUsed: x.allocatedAmount > 0 ? x.spent / x.allocatedAmount : null,
        remaining: x.allocatedAmount - x.spent,
      }));

    const topSpendCapex = detail69
      .filter((x) => x.kind === "CAPEX" && x.allocatedAmount > 0)
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 5)
      .map((x) => ({
        name: x.name,
        ciCode: x.ciCode,
        budget: x.allocatedAmount,
        spent: x.spent,
        pctUsed: x.allocatedAmount > 0 ? x.spent / x.allocatedAmount : null,
        remaining: x.allocatedAmount - x.spent,
      }));

    const requests = await prisma.budgetRequest.findMany({
      where: { targetYearBe: requestYear },
      include: { account: true },
    });
    const reqItems = requests
      .filter((r) => !r.account.isSummary && Boolean(r.account.ciCode))
      .map((r) => {
        const base = detail69.find((l) => l.accountId === r.accountId);
        const requested = num(r.requestedAmount);
        const baseAmt = base?.allocatedAmount ?? 0;
        const deltaAmt = r.deltaAmount != null ? num(r.deltaAmount) : requested - baseAmt;
        return {
          name: r.account.name,
          ciCode: r.account.ciCode,
          kind: r.account.kind as BudgetAccountKind,
          year69: baseAmt,
          year70: requested,
          delta: deltaAmt,
          deltaPct: r.deltaPercent != null ? num(r.deltaPercent) : baseAmt > 0 ? deltaAmt / baseAmt : null,
          reason: r.reason,
          changeDirection: r.changeDirection,
        };
      });

    const increases = (kind: BudgetAccountKind) =>
      reqItems
        .filter((x) => x.kind === kind && x.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 8);
    const decreases = (kind: BudgetAccountKind) =>
      reqItems
        .filter((x) => x.kind === kind && x.delta < 0)
        .sort((a, b) => a.delta - b.delta)
        .slice(0, 8);

    const commitmentSectionReq = requests.find(
      (r) => r.account.isSummary && /หมวดค่าใช้จ่าย/.test(r.account.name) && r.planEndAmount != null,
    );
    const commitmentAllocated = sum(leafCommit, (x) => x.allocatedAmount);
    const commitmentTotal =
      commitmentAllocated > 0
        ? commitmentAllocated
        : commitmentSectionReq
          ? num(commitmentSectionReq.planEndAmount!)
          : sum(
              requests.filter((r) => !r.account.isSummary && r.planEndAmount != null),
              (r) => num(r.planEndAmount!),
            );

    res.json({
      title: "ภาพรวมงบประมาณปี 2570 เทียบปี 2569",
      subtitle: "ฝ่ายรักษาความปลอดภัย | Executive Summary",
      unitNote: "ตัวเลขแสดงเป็นบาท — ในการนำเสนออาจปัดเป็นล้านบาท",
      asOfLabel: "ใช้ไป ณ 31 ก.ค. 69",
      totalsNote:
        "ยอดหมวดใช้แถวสรุปจากไฟล์คำของบ (ไม่รวมรายการย่อยซ้ำ) ให้ตรงสไลด์เสนอ ผผ.",
      headline: {
        year69Budget: total69,
        year70Request: total70,
        delta,
        deltaPct: total69 > 0 ? delta / total69 : null,
        spent69,
        spentPct: total69 > 0 ? spent69 / total69 : null,
        remaining69: total69 - spent69,
        commitmentTotal,
        expenseShare70: total70 > 0 ? (byKind.find((k) => k.kind === "EXPENSE")?.year70 ?? 0) / total70 : null,
        capexShare70: total70 > 0 ? (byKind.find((k) => k.kind === "CAPEX")?.year70 ?? 0) / total70 : null,
      },
      byKind,
      spend69: {
        expense: topSpendExpense,
        capex: topSpendCapex,
      },
      request70: {
        expenseIncreases: increases("EXPENSE"),
        expenseDecreases: decreases("EXPENSE"),
        capexIncreases: increases("CAPEX"),
        capexDecreases: decreases("CAPEX"),
      },
    });
  } catch (e) {
    next(e);
  }
});

function fileUrlToRelativeUpload(fileUrl: string | null | undefined): string | null {
  if (!fileUrl) return null;
  try {
    const pathPart = fileUrl.includes("://") ? new URL(fileUrl).pathname : fileUrl;
    const m = pathPart.match(/\/uploads\/(.+)$/);
    return m?.[1] ? m[1].replace(/\\/g, "/") : null;
  } catch {
    return null;
  }
}

function mapBudgetDoc(row: {
  id: string;
  bucketKey: string;
  title: string;
  notes: string | null;
  categoryId: string | null;
  category?: { id: string; name: string } | null;
  fileUrl: string;
  mimeType: string | null;
  originalName: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    bucketKey: row.bucketKey,
    title: row.title,
    notes: row.notes,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    fileUrl: row.fileUrl,
    mimeType: row.mimeType,
    originalName: row.originalName,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const budgetDocInclude = { category: { select: { id: true, name: true } } } as const;

budgetRouter.get("/document-categories", async (_req, res, next) => {
  try {
    const rows = await prisma.budgetDocumentCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

budgetRouter.post("/document-categories", requireAdmin, async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "กรอกชื่อหมวดหมู่" });
    const row = await prisma.budgetDocumentCategory.create({
      data: {
        name,
        sortOrder: req.body?.sortOrder !== undefined ? Number(req.body.sortOrder) : 0,
      },
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "ชื่อหมวดหมู่ซ้ำ" });
    next(e);
  }
});

budgetRouter.patch("/document-categories/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const data: Prisma.BudgetDocumentCategoryUpdateInput = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: "ชื่อว่างไม่ได้" });
      data.name = name;
    }
    if (req.body?.sortOrder !== undefined) data.sortOrder = Number(req.body.sortOrder);
    const row = await prisma.budgetDocumentCategory.update({ where: { id }, data });
    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "ชื่อหมวดหมู่ซ้ำ" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});

budgetRouter.delete("/document-categories/:id", requireAdmin, async (req, res, next) => {
  try {
    await prisma.budgetDocumentCategory.delete({ where: { id: routeParam(req.params.id) } });
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2003")
      return res.status(409).json({ error: "มีเอกสารอ้างอิงหมวดนี้อยู่ — ลบหรือย้ายเอกสารก่อน" });
    next(e);
  }
});

budgetRouter.get("/documents", async (req, res, next) => {
  try {
    const bucket = parseBucket(req.query.bucket);
    const rows = await prisma.budgetDocument.findMany({
      where: { bucketKey: bucket },
      include: budgetDocInclude,
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    });
    res.json({ bucket, items: rows.map(mapBudgetDoc) });
  } catch (e) {
    next(e);
  }
});

budgetRouter.post("/documents", requireAdmin, upload.single("file"), async (req, res, next) => {
  try {
    const bucket = parseBucket(req.body?.bucket ?? req.query.bucket);
    const title = String(req.body?.title ?? "").trim();
    if (!title) return res.status(400).json({ error: "กรอกชื่อหัวข้อเอกสาร" });
    const notes = String(req.body?.notes ?? "").trim() || null;
    const categoryRaw = req.body?.categoryId != null ? String(req.body.categoryId).trim() : "";
    const categoryId = categoryRaw || null;
    if (!req.file) return res.status(400).json({ error: "แนบไฟล์ Word Excel PowerPoint หรือ PDF" });

    if (categoryId) {
      const cat = await prisma.budgetDocumentCategory.findUnique({ where: { id: categoryId } });
      if (!cat) return res.status(400).json({ error: "ไม่พบหมวดหมู่เอกสาร" });
    }

    let saved;
    try {
      saved = await persistUpload(req.file, {
        module: "budget",
        userId: req.auth?.userId,
        kind: "doc",
        allowOfficeDocs: true,
      });
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ" });
    }

    const row = await prisma.budgetDocument.create({
      data: {
        bucketKey: bucket,
        title,
        notes,
        categoryId,
        fileUrl: saved.publicPath || publicUploadPath(saved.relativePath),
        mimeType: saved.mimeType,
        originalName: saved.displayName,
      },
      include: budgetDocInclude,
    });
    res.status(201).json(mapBudgetDoc(row));
  } catch (e) {
    next(e);
  }
});

budgetRouter.patch("/documents/:id", requireAdmin, upload.single("file"), async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.budgetDocument.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "ไม่พบเอกสาร" });

    const data: Prisma.BudgetDocumentUpdateInput = {};
    if (req.body?.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title) return res.status(400).json({ error: "ชื่อหัวข้อต้องไม่ว่าง" });
      data.title = title;
    }
    if (req.body?.notes !== undefined) {
      data.notes = String(req.body.notes).trim() || null;
    }
    if (req.body?.bucket !== undefined) {
      data.bucketKey = parseBucket(req.body.bucket);
    }
    if (req.body?.categoryId !== undefined) {
      const categoryRaw = String(req.body.categoryId ?? "").trim();
      if (!categoryRaw) {
        data.category = { disconnect: true };
      } else {
        const cat = await prisma.budgetDocumentCategory.findUnique({ where: { id: categoryRaw } });
        if (!cat) return res.status(400).json({ error: "ไม่พบหมวดหมู่เอกสาร" });
        data.category = { connect: { id: categoryRaw } };
      }
    }

    if (req.file) {
      try {
        const saved = await persistUpload(req.file, {
          module: "budget",
          userId: req.auth?.userId,
          kind: "doc",
          allowOfficeDocs: true,
        });
        const oldRel = fileUrlToRelativeUpload(existing.fileUrl);
        data.fileUrl = saved.publicPath || publicUploadPath(saved.relativePath);
        data.mimeType = saved.mimeType;
        data.originalName = saved.displayName;
        if (oldRel) unlinkUploadFile(oldRel);
      } catch (e) {
        return res.status(400).json({ error: e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ" });
      }
    }

    const row = await prisma.budgetDocument.update({
      where: { id },
      data,
      include: budgetDocInclude,
    });
    res.json(mapBudgetDoc(row));
  } catch (e) {
    next(e);
  }
});

budgetRouter.delete("/documents/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.budgetDocument.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "ไม่พบเอกสาร" });
    await prisma.budgetDocument.delete({ where: { id } });
    const rel = fileUrlToRelativeUpload(existing.fileUrl);
    if (rel) unlinkUploadFile(rel);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
