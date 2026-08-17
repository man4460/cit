import { NavLink, useLocation } from "react-router-dom";
import { itemMatchesPath, type NavItem } from "../lib/navConfig";
import { itemVisual, NavGlyph } from "../lib/navVisuals";
import { toolbarMasterGroupClass } from "../lib/uiTokens";

/** เมนูย่อยสรุปงบในหมวดสรุปภาพรวม */
export const BUDGET_OVERVIEW_SUB: NavItem[] = [
  { to: "/budget/overview/2568", label: "ปี 2568", end: true },
  { to: "/budget/overview/2569", label: "ปี 2569", end: true },
  { to: "/budget/overview/2570", label: "ปี 2570", end: true },
];

export function BudgetOverviewSubNav({ className = "" }: { className?: string }) {
  const { pathname } = useLocation();

  return (
    <nav aria-label="เมนูย่อยสรุปงบประมาณ" className={`${toolbarMasterGroupClass} ${className}`.trim()}>
      {BUDGET_OVERVIEW_SUB.map((item) => {
        const active = itemMatchesPath(pathname, item);
        const yearHint = item.to.includes("2570")
          ? "/budget/year/2570"
          : item.to.includes("2568")
            ? "/budget/year/2568"
            : "/budget/year/2569";
        const visual = itemVisual(yearHint);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={`inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold transition sm:h-9 sm:px-3 sm:text-xs ${
              active
                ? "bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-white shadow-md"
                : "text-[#4d47b6] hover:bg-[#0000BF]/8"
            }`}
            aria-current={active ? "page" : undefined}
          >
            <NavGlyph name={visual.icon} className={`h-3.5 w-3.5 shrink-0 ${active ? "text-white" : visual.tone}`} />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
