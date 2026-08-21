import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { computeEstimateTotals, type EstimateLineInput } from "./missionEstimateTemplate.js";

function dec(v: string | number | undefined | null) {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return new Prisma.Decimal(n);
}

function toNumStr(v: Prisma.Decimal | number | string | null | undefined): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "object" && v && "toString" in v) return v.toString();
  return String(v);
}

export function parseActualExpenseLines(raw: unknown): EstimateLineInput[] {
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
  const withAmounts = lines.map((line, i) => {
    // ค่าใช้จ่ายจริงเก็บยอดรวมตรง ๆ — ไม่คูณจำนวน × อัตราต่อหน่วย
    const amount = Number(line.amount ?? 0);
    return {
      ...line,
      amount: Number.isFinite(amount) ? amount : 0,
      quantity: null,
      unitPrice: null,
      qtyEditable: false,
      rateEditable: false,
      amountEditable: line.amountEditable !== false,
      sortOrder: line.sortOrder ?? i,
    };
  });
  const totals = computeEstimateTotals(withAmounts);
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

export const actualExpenseInclude = {
  lines: { orderBy: { sortOrder: "asc" as const } },
  mission: { include: { route: true } },
};

export function serializeActualExpense(row: {
  id: string;
  missionId: string;
  currentLabel: string | null;
  currentDateRange: string | null;
  notes: string | null;
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
    routeId: string | null;
    plannedStart: Date | null;
    plannedEnd: Date | null;
    actualStart: Date | null;
    actualEnd: Date | null;
    budgetAmount: Prisma.Decimal | null;
    route?: {
      id: string;
      name: string | null;
      startLocation: string;
      endLocation: string;
    } | null;
  };
}) {
  return {
    id: row.id,
    missionId: row.missionId,
    currentLabel: row.currentLabel,
    currentDateRange: row.currentDateRange,
    notes: row.notes,
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
          routeId: row.mission.routeId,
          plannedStart: row.mission.plannedStart?.toISOString() ?? null,
          plannedEnd: row.mission.plannedEnd?.toISOString() ?? null,
          actualStart: row.mission.actualStart?.toISOString() ?? null,
          actualEnd: row.mission.actualEnd?.toISOString() ?? null,
          budgetAmount: toNumStr(row.mission.budgetAmount),
          route: row.mission.route ?? null,
        }
      : undefined,
  };
}

function safeDecimal(v: unknown) {
  const n = typeof v === "number" ? v : Number(String(v ?? 0).replace(/,/g, ""));
  return new Prisma.Decimal(Number.isFinite(n) ? n : 0);
}

function buildExpenseSummaries(lines: EstimateLineInput[]) {
  const totalsByType = new Map<string, Prisma.Decimal>();
  for (const line of lines) {
    if (line.kind !== "ITEM" && line.includeInTotal === false) continue;
    if (line.includeInTotal === false || line.isReserve || !line.expenseTypeName) continue;
    const amount = safeDecimal(line.amount);
    if (amount.lte(0)) continue;
    const current = totalsByType.get(line.expenseTypeName) ?? new Prisma.Decimal(0);
    totalsByType.set(line.expenseTypeName, current.add(amount));
  }
  return totalsByType;
}

/** บันทึกค่าใช้จ่ายจริงแบบบรรทัดย่อย และสรุปลง MissionExpense ตามหมวด */
export async function upsertActualExpenseForMission(missionId: string, body: Record<string, unknown>) {
  const mission = await prisma.mission.findUnique({ where: { id: missionId }, select: { id: true } });
  if (!mission) throw Object.assign(new Error("ไม่พบภารกิจ"), { status: 404 });

  const parsed = totalsFromLines(parseActualExpenseLines(body.lines));
  if (!parsed.lines.length) throw Object.assign(new Error("ต้องมีรายการค่าใช้จ่ายจริง"), { status: 400 });

  const totalsByType = buildExpenseSummaries(parsed.lines);
  const expenseTypeNames = [...totalsByType.keys()];
  const existingExpenseTypes = expenseTypeNames.length
    ? await prisma.missionExpenseTypeMaster.findMany({
        where: { name: { in: expenseTypeNames } },
        select: { id: true, name: true },
      })
    : [];
  const expenseTypeIdByName = new Map(existingExpenseTypes.map((row) => [row.name, row.id]));
  const missingExpenseTypes = expenseTypeNames.filter((name) => !expenseTypeIdByName.has(name));
  // สร้างหมวดที่ขาดอัตโนมัติ (เทมเพลตมีชื่อหมวดเกิน seed เดิม เช่น ค่ารับรอง / ประกันภัย)
  if (missingExpenseTypes.length) {
    const maxSort = await prisma.missionExpenseTypeMaster.aggregate({ _max: { sortOrder: true } });
    let sortOrder = (maxSort._max.sortOrder ?? 0) + 1;
    for (const name of missingExpenseTypes.sort((a, b) => a.localeCompare(b, "th"))) {
      const created = await prisma.missionExpenseTypeMaster.upsert({
        where: { name },
        create: { name, sortOrder: sortOrder++ },
        update: {},
        select: { id: true, name: true },
      });
      expenseTypeIdByName.set(created.name, created.id);
    }
  }

  const header = {
    currentLabel: typeof body.currentLabel === "string" ? body.currentLabel : null,
    currentDateRange: typeof body.currentDateRange === "string" ? body.currentDateRange : null,
    notes: typeof body.notes === "string" ? body.notes : null,
    reserveAmount: safeDecimal(parsed.totals.reserveAmount),
    roundedSpend: safeDecimal(parsed.totals.roundedSpend),
    approvalTotal: safeDecimal(parsed.totals.approvalTotal),
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
    amount: safeDecimal(line.amount),
    previousAmount: dec(line.previousAmount as string | number | null),
    qtyEditable: Boolean(line.qtyEditable),
    rateEditable: Boolean(line.rateEditable),
    amountEditable: line.amountEditable !== false,
    includeInTotal: line.includeInTotal !== false,
    isReserve: Boolean(line.isReserve),
    expenseTypeName: line.expenseTypeName ?? null,
  }));

  await prisma.$transaction(async (tx) => {
    const existing = await tx.missionActualExpense.findUnique({ where: { missionId }, select: { id: true } });

    if (existing) {
      await tx.missionActualExpenseLine.deleteMany({ where: { actualId: existing.id } });
      await tx.missionActualExpense.update({
        where: { id: existing.id },
        data: { ...header, lines: { create: lineCreates } },
      });
    } else {
      await tx.missionActualExpense.create({
        data: { missionId, ...header, lines: { create: lineCreates } },
      });
    }

    await tx.missionExpense.deleteMany({ where: { missionId } });
    if (totalsByType.size) {
      await tx.missionExpense.createMany({
        data: [...totalsByType.entries()].map(([name, amount]) => ({
          missionId,
          expenseTypeId: expenseTypeIdByName.get(name)!,
          amount,
          description: "Summarized from actual expense lines",
        })),
      });
    }
  });

  const row = await prisma.missionActualExpense.findUniqueOrThrow({
    where: { missionId },
    include: actualExpenseInclude,
  });
  return serializeActualExpense(row);
}

export async function getActualExpenseByMissionId(missionId: string) {
  const row = await prisma.missionActualExpense.findUnique({
    where: { missionId },
    include: actualExpenseInclude,
  });
  return row ? serializeActualExpense(row) : null;
}
