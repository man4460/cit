import { Router } from "express";
import { MissionStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";
import { buildEstimateWorkbook, type EstimateExportPayload } from "../lib/missionEstimateExcel.js";
import { normalizePersonCounts, parseCalcMeta } from "../lib/estimatePersonCounts.js";
import { trip2569Meta } from "../lib/applyTrip2569ToEstimate.js";
import {
  computeEstimateTotals,
  defaultEstimateTemplate,
  lineKey,
  type EstimateLineInput,
} from "../lib/missionEstimateTemplate.js";
import {
  findTrip2569ByRouteText,
  getTrip2569ByMissionCode,
  parseTrip2569No,
} from "../lib/missionTrip2569Workbook.js";

export const missionEstimatesRouter = Router();

function dec(v: string | number | undefined | null) {
  if (v === undefined || v === null || v === "") return null;
  return new Prisma.Decimal(v);
}

function n(v: Prisma.Decimal | number | string | null | undefined): number {
  if (v == null || v === "") return 0;
  const x = typeof v === "object" && "toNumber" in v ? v.toNumber() : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function toNumStr(v: Prisma.Decimal | number | string | null | undefined): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "object" && v && "toString" in v) return v.toString();
  return String(v);
}

async function generateNextMissionCode(): Promise<string> {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const prefix = `M-${y}${mo}${day}-`;
  const existing = await prisma.mission.findMany({
    where: { code: { startsWith: prefix } },
    select: { code: true },
  });
  let maxN = 0;
  for (const e of existing) {
    if (!e.code) continue;
    const suf = e.code.slice(prefix.length);
    const parsed = parseInt(suf, 10);
    if (!Number.isNaN(parsed) && parsed > maxN) maxN = parsed;
  }
  return `${prefix}${String(maxN + 1).padStart(4, "0")}`;
}

function serializeLine(line: {
  sortOrder: number;
  kind: string;
  groupCode: string | null;
  itemCode: string | null;
  name: string;
  payoutMethod: string | null;
  quantity: Prisma.Decimal | null;
  unitPrice: Prisma.Decimal | null;
  amount: Prisma.Decimal;
  previousAmount: Prisma.Decimal | null;
  qtyEditable: boolean;
  rateEditable: boolean;
  amountEditable: boolean;
  includeInTotal: boolean;
  isReserve: boolean;
  expenseTypeName: string | null;
}) {
  return {
    sortOrder: line.sortOrder,
    kind: line.kind,
    groupCode: line.groupCode,
    itemCode: line.itemCode,
    name: line.name,
    payoutMethod: line.payoutMethod,
    quantity: toNumStr(line.quantity),
    unitPrice: toNumStr(line.unitPrice),
    amount: toNumStr(line.amount) ?? "0",
    previousAmount: toNumStr(line.previousAmount),
    qtyEditable: line.qtyEditable,
    rateEditable: line.rateEditable,
    amountEditable: line.amountEditable,
    includeInTotal: line.includeInTotal,
    isReserve: line.isReserve,
    expenseTypeName: line.expenseTypeName,
  };
}

function serializeEstimate(row: {
  id: string;
  missionId: string;
  previousMissionId: string | null;
  currentLabel: string | null;
  previousLabel: string | null;
  currentDateRange: string | null;
  previousDateRange: string | null;
  notes: string | null;
  personCounts?: Prisma.JsonValue | null;
  reserveAmount: Prisma.Decimal;
  roundedSpend: Prisma.Decimal;
  approvalTotal: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
  lines: Parameters<typeof serializeLine>[0][];
  mission?: {
    id: string;
    code: string | null;
    title: string | null;
    status: MissionStatus;
    routeId: string | null;
    plannedStart: Date | null;
    plannedEnd: Date | null;
    budgetAmount: Prisma.Decimal | null;
    route?: {
      id: string;
      name: string | null;
      startLocation: string;
      endLocation: string;
    } | null;
  };
  previousMission?: {
    id: string;
    code: string | null;
    title: string | null;
    plannedStart: Date | null;
    plannedEnd: Date | null;
  } | null;
}) {
  return {
    id: row.id,
    missionId: row.missionId,
    previousMissionId: row.previousMissionId,
    currentLabel: row.currentLabel,
    previousLabel: row.previousLabel,
    currentDateRange: row.currentDateRange,
    previousDateRange: row.previousDateRange,
    notes: row.notes,
    personCounts: normalizePersonCounts(row.personCounts),
    calcMeta: parseCalcMeta(row.personCounts),
    reserveAmount: toNumStr(row.reserveAmount),
    roundedSpend: toNumStr(row.roundedSpend),
    approvalTotal: toNumStr(row.approvalTotal),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lines: row.lines.map(serializeLine),
    mission: row.mission
      ? {
          id: row.mission.id,
          code: row.mission.code,
          title: row.mission.title,
          status: row.mission.status,
          routeId: row.mission.routeId,
          plannedStart: row.mission.plannedStart?.toISOString() ?? null,
          plannedEnd: row.mission.plannedEnd?.toISOString() ?? null,
          budgetAmount: toNumStr(row.mission.budgetAmount),
          route: row.mission.route ?? null,
        }
      : undefined,
    previousMission: row.previousMission
      ? {
          id: row.previousMission.id,
          code: row.previousMission.code,
          title: row.previousMission.title,
          plannedStart: row.previousMission.plannedStart?.toISOString() ?? null,
          plannedEnd: row.previousMission.plannedEnd?.toISOString() ?? null,
        }
      : null,
  };
}

const estimateInclude = {
  lines: { orderBy: { sortOrder: "asc" as const } },
  mission: { include: { route: true } },
  previousMission: { select: { id: true, code: true, title: true, plannedStart: true, plannedEnd: true } },
};

function parseLines(raw: unknown): EstimateLineInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row, i) => {
    const r = row as EstimateLineInput;
    return {
      kind: r.kind === "GROUP" ? "GROUP" : "ITEM",
      groupCode: r.groupCode ?? null,
      itemCode: r.itemCode ?? null,
      name: String(r.name ?? "").trim() || `รายการ ${i + 1}`,
      payoutMethod: r.payoutMethod ?? null,
      quantity: r.quantity ?? null,
      unitPrice: r.unitPrice ?? null,
      amount: r.amount ?? 0,
      previousAmount: r.previousAmount ?? null,
      qtyEditable: Boolean(r.qtyEditable),
      rateEditable: Boolean(r.rateEditable),
      amountEditable: r.amountEditable !== false,
      includeInTotal: r.includeInTotal !== false,
      isReserve: Boolean(r.isReserve),
      expenseTypeName: r.expenseTypeName ?? null,
      sortOrder: typeof r.sortOrder === "number" ? r.sortOrder : i,
    };
  });
}

function totalsFromLines(lines: EstimateLineInput[]) {
  const totals = computeEstimateTotals(lines);
  const withAmounts = lines.map((line, i) => {
    const qty = line.quantity == null || line.quantity === "" ? NaN : Number(line.quantity);
    const rate = line.unitPrice == null || line.unitPrice === "" ? NaN : Number(line.unitPrice);
    let amount = Number(line.amount ?? 0);
    if (line.qtyEditable && line.rateEditable && Number.isFinite(qty) && Number.isFinite(rate)) {
      amount = qty * rate;
    }
    return { ...line, amount, sortOrder: line.sortOrder ?? i };
  });
  return { totals, lines: withAmounts };
}

function formatThaiDateRange(start: Date | null | undefined, end: Date | null | undefined): string | null {
  if (!start) return null;
  const fmt = (d: Date) =>
    d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
  if (!end) return `วันที่ ${fmt(start)}`;
  return `ระหว่างวันที่ ${fmt(start)} – ${fmt(end)}`;
}

type PreviousEstimateLineValue = {
  amount: number;
  quantity: number | null;
  unitPrice: number | null;
};

/** ประมาณการก่อนหน้าบนเส้นทางเดียวกัน — ไม่ใช้ค่าใช้จ่ายจริงของภารกิจ */
async function findPreviousEstimate(opts: {
  routeId: string;
  excludeMissionId?: string | null;
  plannedStart?: string | null;
}) {
  const plannedStart = opts.plannedStart ? new Date(opts.plannedStart) : null;
  const startOk = Boolean(plannedStart && !Number.isNaN(plannedStart.getTime()));
  return prisma.missionEstimate.findFirst({
    where: {
      mission: {
        routeId: opts.routeId,
        status: { not: MissionStatus.CANCELLED },
        ...(opts.excludeMissionId ? { id: { not: opts.excludeMissionId } } : {}),
        ...(startOk
          ? {
              OR: [
                { plannedStart: { lt: plannedStart! } },
                { AND: [{ plannedStart: null }, { createdAt: { lt: plannedStart! } }] },
              ],
            }
          : {}),
      },
    },
    orderBy: [{ mission: { plannedStart: "desc" } }, { createdAt: "desc" }],
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      mission: { include: { route: true } },
    },
  });
}

function previousLinesByKey(
  previous: NonNullable<Awaited<ReturnType<typeof findPreviousEstimate>>>,
): Record<string, PreviousEstimateLineValue> {
  const linesByKey: Record<string, PreviousEstimateLineValue> = {};
  for (const line of previous.lines) {
    linesByKey[lineKey(line)] = {
      amount: n(line.amount),
      quantity: line.quantity == null ? null : n(line.quantity),
      unitPrice: line.unitPrice == null ? null : n(line.unitPrice),
    };
  }
  return linesByKey;
}

async function resolveTrip2569ForTemplate(opts: {
  missionCode?: string;
  missionId?: string;
  routeId?: string;
}) {
  let code = opts.missionCode?.trim() || "";
  if (!code && opts.missionId) {
    const mission = await prisma.mission.findUnique({
      where: { id: opts.missionId },
      select: { code: true, title: true, route: { select: { name: true, startLocation: true, endLocation: true } } },
    });
    code = mission?.code?.trim() || "";
    if (!code && mission?.route) {
      const rt = mission.route.name ?? `${mission.route.startLocation} → ${mission.route.endLocation}`;
      const byRoute = findTrip2569ByRouteText(rt);
      if (byRoute) return byRoute;
    }
  }
  const byCode = getTrip2569ByMissionCode(code);
  if (byCode) return byCode;

  const tripNoRaw = parseTrip2569No(code);
  if (tripNoRaw) return getTrip2569ByMissionCode(`TRIP-2569-${String(tripNoRaw).padStart(2, "0")}`);

  if (opts.routeId) {
    const route = await prisma.routeMaster.findUnique({
      where: { id: opts.routeId },
      select: { name: true, startLocation: true, endLocation: true },
    });
    if (route) {
      const text = route.name ?? `${route.startLocation} → ${route.endLocation}`;
      return findTrip2569ByRouteText(text);
    }
  }
  return null;
}

missionEstimatesRouter.get("/template", async (req, res, next) => {
  try {
    const routeId = typeof req.query.routeId === "string" ? req.query.routeId.trim() : "";
    const excludeMissionId =
      typeof req.query.excludeMissionId === "string" ? req.query.excludeMissionId.trim() : "";
    const plannedStart = typeof req.query.plannedStart === "string" ? req.query.plannedStart : "";
    const missionCode = typeof req.query.missionCode === "string" ? req.query.missionCode.trim() : "";
    const missionId = typeof req.query.missionId === "string" ? req.query.missionId.trim() : "";

    let template = defaultEstimateTemplate();
    let trip2569Payload: ReturnType<typeof trip2569Meta> | null = null;

    try {
      const trip2569 = await resolveTrip2569ForTemplate({ missionCode, missionId, routeId });
      if (trip2569) {
        trip2569Payload = trip2569Meta(trip2569);
      }
    } catch (workbookErr) {
      console.warn("[mission-estimates/template] trip2569 workbook:", workbookErr);
    }

    let previousPayload: {
      missionId: string;
      estimateId: string;
      code: string | null;
      title: string | null;
      plannedStart: string | null;
      plannedEnd: string | null;
      dateRange: string | null;
      label: string | null;
      notes: string | null;
      amountsByKey: Record<string, number>;
      linesByKey: Record<string, PreviousEstimateLineValue>;
      approvalTotal: number | null;
    } | null = null;

    if (routeId) {
      const previous = await findPreviousEstimate({
        routeId,
        excludeMissionId: excludeMissionId || null,
        plannedStart: plannedStart || null,
      });
      if (previous) {
        const linesByKey = previousLinesByKey(previous);
        const amountsByKey: Record<string, number> = {};
        for (const [k, v] of Object.entries(linesByKey)) amountsByKey[k] = v.amount;
        previousPayload = {
          missionId: previous.missionId,
          estimateId: previous.id,
          code: previous.mission.code,
          title: previous.mission.title,
          plannedStart: previous.mission.plannedStart?.toISOString() ?? null,
          plannedEnd: previous.mission.plannedEnd?.toISOString() ?? null,
          dateRange: previous.currentDateRange || formatThaiDateRange(previous.mission.plannedStart, previous.mission.plannedEnd),
          label:
            previous.currentLabel ||
            previous.mission.title ||
            (previous.mission.route
              ? `${previous.mission.route.startLocation} → ${previous.mission.route.endLocation}`
              : previous.mission.code),
          notes: previous.notes ?? null,
          amountsByKey,
          linesByKey,
          approvalTotal: n(previous.approvalTotal),
        };
      }
    }

    res.json({ template, previous: previousPayload, trip2569: trip2569Payload });
  } catch (e) {
    next(e);
  }
});

missionEstimatesRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.missionEstimate.findMany({
      orderBy: { updatedAt: "desc" },
      include: estimateInclude,
    });
    res.json(rows.map(serializeEstimate));
  } catch (e) {
    next(e);
  }
});

missionEstimatesRouter.post("/export", async (req, res, next) => {
  try {
    const body = req.body as EstimateExportPayload;
    const buf = buildEstimateWorkbook({
      currentLabel: body.currentLabel,
      previousLabel: body.previousLabel,
      currentDateRange: body.currentDateRange,
      previousDateRange: body.previousDateRange,
      notes: body.notes,
      previousTitle: body.previousTitle,
      currentTitle: body.currentTitle,
      lines: parseLines(body.lines),
    });
    const filename = `ประมาณการค่าใช้จ่าย.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buf);
  } catch (e) {
    next(e);
  }
});

missionEstimatesRouter.get("/:id/export", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const row = await prisma.missionEstimate.findUnique({
      where: { id },
      include: estimateInclude,
    });
    if (!row) return res.status(404).json({ error: "ไม่พบประมาณการ" });
    const buf = buildEstimateWorkbook({
      currentLabel: row.currentLabel,
      previousLabel: row.previousLabel,
      currentDateRange: row.currentDateRange,
      previousDateRange: row.previousDateRange,
      notes: row.notes,
      previousTitle: row.previousMission?.title ?? row.previousMission?.code,
      currentTitle: row.mission.title ?? row.mission.code,
      lines: row.lines.map((line) => ({
        ...serializeLine(line),
        kind: line.kind === "GROUP" ? "GROUP" : "ITEM",
        quantity: line.quantity?.toString() ?? null,
        unitPrice: line.unitPrice?.toString() ?? null,
        amount: line.amount.toString(),
        previousAmount: line.previousAmount?.toString() ?? null,
      })),
    });
    const filename = `ประมาณการค่าใช้จ่าย_${row.mission.code ?? row.id.slice(0, 8)}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buf);
  } catch (e) {
    next(e);
  }
});

missionEstimatesRouter.get("/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const row = await prisma.missionEstimate.findUnique({
      where: { id },
      include: estimateInclude,
    });
    if (!row) return res.status(404).json({ error: "ไม่พบประมาณการ" });
    res.json(serializeEstimate(row));
  } catch (e) {
    next(e);
  }
});

async function upsertEstimate(opts: {
  estimateId?: string | null;
  body: Record<string, unknown>;
}) {
  const {
    title,
    routeId,
    plannedStart,
    plannedEnd,
    status,
    currentLabel,
    previousLabel,
    currentDateRange,
    previousDateRange,
    notes,
    previousMissionId,
  } = opts.body;
  const parsed = totalsFromLines(parseLines(opts.body.lines));
  if (!parsed.lines.length) throw Object.assign(new Error("ต้องมีรายการประมาณการ"), { status: 400 });

  if (status && !Object.values(MissionStatus).includes(status as MissionStatus)) {
    throw Object.assign(new Error("สถานะภารกิจไม่ถูกต้อง"), { status: 400 });
  }

  let previousId = typeof previousMissionId === "string" && previousMissionId ? previousMissionId : null;
  if (previousId) {
    const prev = await prisma.mission.findUnique({ where: { id: previousId }, select: { id: true } });
    if (!prev) previousId = null;
  }

  const existing = opts.estimateId
    ? await prisma.missionEstimate.findUnique({ where: { id: opts.estimateId }, select: { id: true, missionId: true } })
    : null;
  if (opts.estimateId && !existing) throw Object.assign(new Error("ไม่พบประมาณการ"), { status: 404 });

  const missionData = {
    title: typeof title === "string" && title.trim() ? title.trim() : "ประมาณการค่าใช้จ่ายภารกิจ",
    status: (status as MissionStatus | undefined) ?? MissionStatus.DRAFT,
    routeId: typeof routeId === "string" && routeId ? routeId : null,
    plannedStart: typeof plannedStart === "string" && plannedStart ? new Date(plannedStart) : null,
    plannedEnd: typeof plannedEnd === "string" && plannedEnd ? new Date(plannedEnd) : null,
  };

  if (missionData.routeId) {
    const route = await prisma.routeMaster.findUnique({
      where: { id: missionData.routeId },
      select: { id: true },
    });
    if (!route) throw Object.assign(new Error("ไม่พบเส้นทาง"), { status: 400 });
  }

  const header = {
    previousMissionId: previousId,
    currentLabel: typeof currentLabel === "string" ? currentLabel : null,
    previousLabel: typeof previousLabel === "string" ? previousLabel : null,
    currentDateRange: typeof currentDateRange === "string" ? currentDateRange : null,
    previousDateRange: typeof previousDateRange === "string" ? previousDateRange : null,
    notes: typeof notes === "string" ? notes : null,
    personCounts: {
      ...normalizePersonCounts(opts.body.personCounts),
      ...parseCalcMeta(opts.body.personCounts ?? opts.body.calcMeta),
    },
    reserveAmount: new Prisma.Decimal(parsed.totals.reserveAmount),
    roundedSpend: new Prisma.Decimal(parsed.totals.roundedSpend),
    approvalTotal: new Prisma.Decimal(parsed.totals.approvalTotal),
  };

  const lineCreates = parsed.lines.map((line) => ({
    sortOrder: line.sortOrder ?? 0,
    kind: line.kind,
    groupCode: line.groupCode ?? null,
    itemCode: line.itemCode ?? null,
    name: line.name,
    payoutMethod: line.payoutMethod ?? null,
    quantity: dec(line.quantity as string | number | null),
    unitPrice: dec(line.unitPrice as string | number | null),
    amount: new Prisma.Decimal(line.amount ?? 0),
    previousAmount: dec(line.previousAmount as string | number | null),
    qtyEditable: Boolean(line.qtyEditable),
    rateEditable: Boolean(line.rateEditable),
    amountEditable: line.amountEditable !== false,
    includeInTotal: line.includeInTotal !== false,
    isReserve: Boolean(line.isReserve),
    expenseTypeName: line.expenseTypeName ?? null,
  }));

  let estimateId: string;
  let missionId: string;

  if (existing) {
    missionId = existing.missionId;
    await prisma.mission.update({ where: { id: missionId }, data: missionData });
    await prisma.missionEstimateLine.deleteMany({ where: { estimateId: existing.id } });
    await prisma.missionEstimate.update({
      where: { id: existing.id },
      data: {
        ...header,
        lines: { create: lineCreates },
      },
    });
    estimateId = existing.id;
  } else {
    const created = await prisma.mission.create({
      data: {
        ...missionData,
        code: await generateNextMissionCode(),
        estimate: {
          create: {
            ...header,
            lines: { create: lineCreates },
          },
        },
      },
      include: { estimate: true },
    });
    missionId = created.id;
    estimateId = created.estimate!.id;
  }

  return prisma.missionEstimate.findUniqueOrThrow({
    where: { id: estimateId },
    include: estimateInclude,
  });
}

missionEstimatesRouter.post("/", async (req, res, next) => {
  try {
    const row = await upsertEstimate({ body: req.body as Record<string, unknown> });
    res.status(201).json(serializeEstimate(row));
  } catch (e) {
    if (e && typeof e === "object" && "status" in e) {
      return res.status(Number((e as { status: number }).status)).json({
        error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ",
      });
    }
    next(e);
  }
});

missionEstimatesRouter.put("/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const row = await upsertEstimate({ estimateId: id, body: req.body as Record<string, unknown> });
    res.json(serializeEstimate(row));
  } catch (e) {
    if (e && typeof e === "object" && "status" in e) {
      return res.status(Number((e as { status: number }).status)).json({
        error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ",
      });
    }
    next(e);
  }
});
