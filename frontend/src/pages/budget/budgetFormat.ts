export type BudgetKind = "EXPENSE" | "CAPEX";
export type BudgetFundingType = "ANNUAL" | "COMMITMENT";
/** "commitment" หรือปี พ.ศ. เป็นสตริง เช่น "2569" */
export type BudgetBucket = string;

export const BUDGET_BUCKETS: { id: BudgetBucket; label: string }[] = [
  { id: "2568", label: "ปี 2568" },
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

export function pctToneClass(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return "text-slate-500";
  if (pct >= 0.9) return "font-bold text-rose-600";
  if (pct >= 0.5) return "font-semibold text-amber-700";
  return "font-semibold text-emerald-700";
}

export function kindLabel(kind: BudgetKind): string {
  return kind === "CAPEX" ? "สินทรัพย์ถาวร" : "ค่าใช้จ่าย";
}
