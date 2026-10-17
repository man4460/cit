import { budgetPace, formatPct, type PctToneOpts } from "./budgetFormat";

type Props = {
  spentPct: number | null | undefined;
  yearBe?: number | null;
  asOfIso?: string | null;
  remaining?: number | null;
  netBudget?: number | null;
  /** แสดงชิปสถานะเมื่อล่าช้า / เกินงบ */
  showChip?: boolean;
  className?: string;
};

/** แถบใช้ไป + เส้นเวลาปีงบ — สีตามจังหวะ (ช้า = เตือน ไม่ใช่ใกล้หมด = แดง) */
export function BudgetPaceBar({
  spentPct,
  yearBe,
  asOfIso,
  remaining,
  netBudget,
  showChip = false,
  className = "",
}: Props) {
  const opts: PctToneOpts = { yearBe, asOfIso, remaining, netBudget };
  const pace = budgetPace(spentPct, opts);
  const fill = Math.min(100, Math.max(0, (pace.spentPct || 0) * 100));
  const elapsedPct = Math.min(100, Math.max(0, pace.elapsed * 100));
  const title = [
    `ใช้ไป ${formatPct(pace.spentPct)}`,
    yearBe != null ? `เวลาผ่านไป ${formatPct(pace.elapsed)}` : null,
    pace.label !== "—" ? pace.label : null,
    pace.hint,
  ]
    .filter(Boolean)
    .join(" · ");

  const attention = pace.kind === "lagging" || pace.kind === "behind" || pace.kind === "over";

  return (
    <div className={`min-w-0 ${className}`} title={title}>
      <div className="relative pt-3">
        {yearBe != null ? (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold tabular-nums text-slate-500"
            style={{ left: `${elapsedPct}%` }}
          >
            เวลา {formatPct(pace.elapsed)}
          </div>
        ) : null}
        <div className="relative h-1.5 overflow-visible rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-[width] ${pace.barClass}`}
            style={{ width: `${fill}%` }}
          />
          {yearBe != null ? (
            <div
              className="absolute bottom-[-3px] top-[-3px] w-0.5 rounded-full bg-[#1e1b4b]/80"
              style={{ left: `calc(${elapsedPct}% - 1px)` }}
              aria-hidden
            />
          ) : null}
        </div>
      </div>
      {showChip && attention ? (
        <span
          className={`mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1 ring-inset ${pace.chipClass}`}
        >
          {pace.label}
        </span>
      ) : null}
    </div>
  );
}
