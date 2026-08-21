import { MissionStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { normalizePersonCounts, parseCalcMeta } from "./estimatePersonCounts.js";
import {
  computeEstimateTotals,
  lineKey,
  type EstimateLineInput,
} from "./missionEstimateTemplate.js";

function dec(v: string | number | undefined | null) {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return new Prisma.Decimal(n);
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

export function parseEstimateLines(raw: unknown): EstimateLineInput[] {
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

export const estimateInclude = {
  lines: { orderBy: { sortOrder: "asc" as const } },
  mission: { include: { route: true } },
  previousMission: { select: { id: true, code: true, title: true, plannedStart: true, plannedEnd: true } },
};

export function serializeEstimate(row: {
  id: string;
  missionId: string;
  previousMissionId: string | null;
  currentLabel: string | null;
  previousLabel: string | null;
  currentDateRange: string | null;
  previousDateRange: string | null;
  notes: string | null;
  personCounts: Prisma.JsonValue | null;
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

/** บันทึกประมาณการให้ภารกิจที่มีอยู่แล้ว — ไม่สร้างภารกิจใหม่ ไม่แตะค่าใช้จ่ายจริง */
export async function upsertEstimateForMission(missionId: string, body: Record<string, unknown>) {
  const mission = await prisma.mission.findUnique({ where: { id: missionId }, select: { id: true } });
  if (!mission) throw Object.assign(new Error("ไม่พบภารกิจ"), { status: 404 });

  const parsed = totalsFromLines(parseEstimateLines(body.lines));
  if (!parsed.lines.length) throw Object.assign(new Error("ต้องมีรายการประมาณการ"), { status: 400 });

  let previousId =
    typeof body.previousMissionId === "string" && body.previousMissionId ? body.previousMissionId : null;
  if (previousId) {
    const prev = await prisma.mission.findUnique({ where: { id: previousId }, select: { id: true } });
    if (!prev) previousId = null;
  }

  const header = {
    previousMissionId: previousId,
    currentLabel: typeof body.currentLabel === "string" ? body.currentLabel : null,
    previousLabel: typeof body.previousLabel === "string" ? body.previousLabel : null,
    currentDateRange: typeof body.currentDateRange === "string" ? body.currentDateRange : null,
    previousDateRange: typeof body.previousDateRange === "string" ? body.previousDateRange : null,
    notes: typeof body.notes === "string" ? body.notes : null,
    personCounts: { ...normalizePersonCounts(body.personCounts), ...parseCalcMeta(body.personCounts ?? body.calcMeta) },
    reserveAmount: (() => {
      const n = Number(parsed.totals.reserveAmount);
      return new Prisma.Decimal(Number.isFinite(n) ? n : 0);
    })(),
    roundedSpend: (() => {
      const n = Number(parsed.totals.roundedSpend);
      return new Prisma.Decimal(Number.isFinite(n) ? n : 0);
    })(),
    approvalTotal: (() => {
      const n = Number(parsed.totals.approvalTotal);
      return new Prisma.Decimal(Number.isFinite(n) ? n : 0);
    })(),
  };

  const lineCreates = parsed.lines.map((line) => {
    const amountN = Number(line.amount ?? 0);
    return {
      sortOrder: line.sortOrder ?? 0,
      kind: line.kind,
      groupCode: line.groupCode ?? null,
      itemCode: line.itemCode ?? null,
      name: line.name,
      payoutMethod: line.payoutMethod ?? null,
      quantity: dec(line.quantity as string | number | null),
      unitPrice: dec(line.unitPrice as string | number | null),
      amount: new Prisma.Decimal(Number.isFinite(amountN) ? amountN : 0),
      previousAmount: dec(line.previousAmount as string | number | null),
      qtyEditable: Boolean(line.qtyEditable),
      rateEditable: Boolean(line.rateEditable),
      amountEditable: line.amountEditable !== false,
      includeInTotal: line.includeInTotal !== false,
      isReserve: Boolean(line.isReserve),
      expenseTypeName: line.expenseTypeName ?? null,
    };
  });

  const existing = await prisma.missionEstimate.findUnique({ where: { missionId } });

  if (existing) {
    await prisma.missionEstimateLine.deleteMany({ where: { estimateId: existing.id } });
    await prisma.missionEstimate.update({
      where: { id: existing.id },
      data: { ...header, lines: { create: lineCreates } },
    });
  } else {
    await prisma.missionEstimate.create({
      data: { missionId, ...header, lines: { create: lineCreates } },
    });
  }

  const row = await prisma.missionEstimate.findUniqueOrThrow({
    where: { missionId },
    include: estimateInclude,
  });
  return serializeEstimate(row);
}

export async function getEstimateByMissionId(missionId: string) {
  const row = await prisma.missionEstimate.findUnique({
    where: { missionId },
    include: estimateInclude,
  });
  return row ? serializeEstimate(row) : null;
}
