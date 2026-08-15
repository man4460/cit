import { BUDGET_BUCKETS, type BudgetBucket } from "./budgetFormat";

export function BudgetBucketTabs({
  value,
  onChange,
}: {
  value: BudgetBucket;
  onChange: (b: BudgetBucket) => void;
}) {
  return (
    <div className="inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-xl border border-[#e8e6fc] bg-[#faf9ff]/90 p-0.5 shadow-sm">
      {BUDGET_BUCKETS.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => onChange(b.id)}
          className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[11px] font-bold transition sm:h-9 sm:px-3 sm:text-xs ${
            value === b.id
              ? "bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-white shadow-md"
              : "text-[#4d47b6] hover:bg-[#0000BF]/8"
          }`}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}
