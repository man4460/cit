import type { ReactNode } from "react";
import { NavGlyph, type NavIconKey } from "../lib/navVisuals";

export type BudgetStatTone = {
  chip: string;
  label: string;
};

export const BUDGET_STAT_TONES = {
  approve: {
    chip: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/25",
    label: "text-emerald-800/80",
  },
  request: {
    chip: "bg-teal-500/12 text-teal-700 ring-teal-500/25",
    label: "text-teal-800/80",
  },
  spent: {
    chip: "bg-rose-500/12 text-rose-700 ring-rose-500/25",
    label: "text-rose-800/80",
  },
  remain: {
    chip: "bg-sky-500/12 text-sky-700 ring-sky-500/25",
    label: "text-sky-800/80",
  },
  pct: {
    chip: "bg-indigo-500/12 text-indigo-700 ring-indigo-500/25",
    label: "text-indigo-800/80",
  },
  status: {
    chip: "bg-amber-500/15 text-amber-800 ring-amber-500/30",
    label: "text-amber-800/80",
  },
  expense: {
    chip: "bg-violet-500/12 text-violet-700 ring-violet-500/25",
    label: "text-violet-800/80",
  },
  capex: {
    chip: "bg-orange-500/12 text-orange-700 ring-orange-500/25",
    label: "text-orange-800/80",
  },
} as const;

type Props = {
  label: string;
  /** ข้อความเล็กต่อท้ายหัวข้อการ์ด (แนวเดียวกัน) */
  labelHint?: ReactNode;
  /** ไม่ส่ง = ไม่แสดงไอคอน (การ์ดสรุป KPI) */
  icon?: NavIconKey;
  tone: BudgetStatTone;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  active?: boolean;
  trailing?: ReactNode;
};

export function BudgetStatCard({
  label,
  labelHint,
  icon,
  tone,
  children,
  className = "",
  onClick,
  active,
  trailing,
}: Props) {
  const base =
    onClick != null
      ? `min-w-0 rounded-[1.25rem] border p-4 text-left transition ${
          active
            ? "border-[#0000BF]/40 bg-gradient-to-br from-[#0000BF]/10 via-[#8b5cf6]/10 to-[#ec4899]/10 shadow-md ring-2 ring-[#0000BF]/20"
            : "border-[#e8e6fc] bg-white/90 hover:border-[#0000BF]/25 hover:bg-[#0000BF]/[0.03]"
        }`
      : `min-w-0 rounded-[1.25rem] border border-[#e8e6fc] bg-gradient-to-br from-white via-[#faf9ff] to-[#fdf2f8]/60 p-4 shadow-sm`;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon ? (
            <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${tone.chip}`}>
              <NavGlyph name={icon} className="h-4 w-4" />
            </span>
          ) : null}
          <div className={`flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] font-bold uppercase tracking-wide ${tone.label}`}>
            <span className="shrink-0">{label}</span>
            {labelHint ? <span className="font-semibold normal-case tracking-normal text-slate-500">{labelHint}</span> : null}
          </div>
        </div>
        {trailing}
      </div>
      <div className={icon ? "mt-2" : "mt-1"}>{children}</div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} ${className}`.trim()}>
        {body}
      </button>
    );
  }
  return <div className={`${base} ${className}`.trim()}>{body}</div>;
}
