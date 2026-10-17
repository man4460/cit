export type BudgetKind = "EXPENSE" | "CAPEX";
export type BudgetFundingType = "ANNUAL" | "COMMITMENT";
/** "commitment" หรือปี พ.ศ. เป็นสตริง เช่น "2569" */
export type BudgetBucket = string;

export const BUDGET_BUCKETS: { id: BudgetBucket; label: string }[] = [
  { id: "2569", label: "ปี 2569" },
  { id: "2570", label: "ปี 2570" },
];

export function parseBudgetYearBe(raw: string | undefined | null): number | null {
  const y = parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(y) || y < 2500 || y > 2800) return null;
  return y;
}
export type BudgetYearLineRow = {
  id: string;
  accountId: string;
  parentId: string | null;
  categoryId: string | null;
  categoryName: string | null;
  yearBe: number | null;
  fundingType: BudgetFundingType;
  ciCode: string | null;
  superiorCi: string | null;
  fileRef: string | null;
  name: string;
  definition: string | null;
  kind: BudgetKind;
  sortOrder: number;
  isSummary: boolean;
  allocatedAmount: number;
  carryInAmount: number;
  midYearAmount?: number;
  commitmentAmount: number;
  totalBudget: number;
  buyerName: string | null;
  requestingUnit: string | null;
  quantity: string | null;
  documentUrl: string | null;
  notes: string | null;
  snapshotSpent: number | null;
  snapshotAsOf: string | null;
  transactionTotal: number;
  spent: number;
  remaining: number;
  pctUsed: number | null;
  /** กลุ่มย่อยที่ผูกระบบงานจ้าง OS — ยอดสัญญา (งวดในปี) / ยอดตรวจรับจริง */
  osContractAmount?: number | null;
  osAcceptedAmount?: number;
  osAcceptedMonths?: number;
};

export function formatBaht(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const rounded = Math.abs(n - Math.round(n)) < 0.001 ? Math.round(n) : n;
  return rounded.toLocaleString("th-TH", {
    maximumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
  });
}

export function formatPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`;
}

/** ปีงบ = ปีปฏิทิน — สัดส่วนเวลาที่ผ่านไป ณ asOf (หรือวันนี้) */
export function elapsedOfYear(yearBe: number, asOfIso?: string | null): number {
  const yearAd = yearBe - 543;
  const start = Date.UTC(yearAd, 0, 1);
  const end = Date.UTC(yearAd + 1, 0, 1);
  const asOf = asOfIso ? new Date(asOfIso).getTime() : Date.now();
  if (!Number.isFinite(asOf)) return 0;
  return Math.min(1, Math.max(0, (asOf - start) / (end - start)));
}

export type BudgetPaceKind = "over" | "lagging" | "behind" | "on_pace" | "done";

export type BudgetPace = {
  kind: BudgetPaceKind;
  /** gap = elapsed - spentPct (บวก = ใช้ช้ากว่าเวลา) */
  gap: number;
  elapsed: number;
  spentPct: number;
  label: string;
  hint: string;
  /** ชิปสถานะสั้น */
  chipClass: string;
  /** สีตัวเลข / % */
  textClass: string;
  /** สี fill แถบเดียว */
  barClass: string;
};

export type PctToneOpts = {
  yearBe?: number | null;
  asOfIso?: string | null;
  remaining?: number | null;
  netBudget?: number | null;
};

/** จังหวะการใช้จ่ายเทียบเวลาปีงบ — โฟกัสงบที่ใช้น้อย/ช้า ไม่ใช่ใกล้หมด */
export function budgetPace(
  spentPct: number | null | undefined,
  opts?: PctToneOpts,
): BudgetPace {
  const pct = spentPct != null && Number.isFinite(spentPct) ? Math.max(0, spentPct) : 0;
  const remaining = opts?.remaining;
  const net = opts?.netBudget;
  const yearBe = opts?.yearBe;
  const elapsed = yearBe != null && Number.isFinite(yearBe) ? elapsedOfYear(yearBe, opts?.asOfIso) : 0;
  const gap = elapsed - pct;
  const tol =
    net != null && Number.isFinite(net) ? Math.max(100, Math.abs(net) * 0.005) : 100;

  if (remaining != null && Number.isFinite(remaining) && remaining < -0.004) {
    return {
      kind: "over",
      gap,
      elapsed,
      spentPct: pct,
      label: "เกินงบ",
      hint: "เบิก/ผูกพันเกินงบสุทธิ",
      chipClass: "bg-rose-100 text-rose-700 ring-rose-200",
      textClass: "font-bold text-rose-600",
      barClass: "bg-rose-500",
    };
  }

  if (
    remaining != null &&
    Number.isFinite(remaining) &&
    remaining <= tol &&
    (net == null || Math.abs(net) > 0.004)
  ) {
    return {
      kind: "done",
      gap,
      elapsed,
      spentPct: pct,
      label: "ใช้ครบแล้ว",
      hint: "ใช้หรือผูกพันเกือบเต็มงบตามแผน",
      chipClass: "bg-slate-100 text-slate-600 ring-slate-200",
      textClass: "font-semibold text-slate-600",
      barClass: "bg-slate-400",
    };
  }

  if (yearBe == null || !Number.isFinite(yearBe)) {
    return {
      kind: "on_pace",
      gap: 0,
      elapsed: 0,
      spentPct: pct,
      label: "—",
      hint: "ยังไม่เทียบจังหวะปีงบ",
      chipClass: "bg-slate-100 text-slate-500 ring-slate-200",
      textClass: "font-semibold text-slate-500",
      barClass: "bg-slate-300",
    };
  }

  if (gap > 0.25) {
    return {
      kind: "lagging",
      gap,
      elapsed,
      spentPct: pct,
      label: "ควรเร่ง",
      hint: "เบิกจ่ายช้ากว่าเวลาที่ผ่านไปเกิน 25%",
      chipClass: "bg-rose-100 text-rose-700 ring-rose-200",
      textClass: "font-bold text-rose-600",
      barClass: "bg-rose-500",
    };
  }
  if (gap > 0.1) {
    return {
      kind: "behind",
      gap,
      elapsed,
      spentPct: pct,
      label: "ช้าเล็กน้อย",
      hint: "เบิกจ่ายช้ากว่าเวลาที่ผ่านไป 10–25%",
      chipClass: "bg-amber-100 text-amber-800 ring-amber-200",
      textClass: "font-semibold text-amber-700",
      barClass: "bg-amber-400",
    };
  }
  return {
    kind: "on_pace",
    gap,
    elapsed,
    spentPct: pct,
    label: "ตามแผน",
    hint: "เบิกจ่ายใกล้เคียงหรือเร็วกว่าเวลาที่ผ่านไป",
    chipClass: "bg-emerald-100 text-emerald-700 ring-emerald-200",
    textClass: "font-semibold text-emerald-700",
    barClass: "bg-[#0000BF]",
  };
}

export function paceBarFillClass(spentPct: number | null | undefined, opts?: PctToneOpts): string {
  return budgetPace(spentPct, opts).barClass;
}

/** สีตัวเลข % ตามจังหวะปีงบ (ไม่ใช้กฎใช้ไปมาก = แดง) */
export function pctToneClass(pct: number | null | undefined, opts?: PctToneOpts): string {
  if (pct == null || !Number.isFinite(pct)) return "text-slate-500";
  return budgetPace(pct, opts).textClass;
}

export function kindLabel(kind: BudgetKind): string {
  return kind === "CAPEX" ? "สินทรัพย์ถาวร" : "ค่าใช้จ่าย";
}
