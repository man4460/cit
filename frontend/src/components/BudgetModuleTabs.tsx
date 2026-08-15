import { useCallback, useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { apiJson } from "../api/client";
import { itemMatchesPath, type NavItem } from "../lib/navConfig";
import { itemVisual, NavGlyph } from "../lib/navVisuals";
import {
  moduleNavActiveClass,
  moduleNavIdleClass,
  moduleNavItemClass,
} from "../lib/uiTokens";

export const BUDGET_YEARS_CHANGED_EVENT = "afo-budget-years-changed";

export function notifyBudgetYearsChanged() {
  window.dispatchEvent(new Event(BUDGET_YEARS_CHANGED_EVENT));
}

type YearBucket = {
  id: string;
  label: string;
  yearBe: number | null;
  fundingType: string;
};

type YearsRes = {
  years: { yearBe: number }[];
  maxYearBe: number | null;
  nextYearBe: number;
  maxAllowedYearBe?: number;
  buckets: YearBucket[];
};

function fallbackBuckets(): YearBucket[] {
  return [
    { id: "2569", label: "ปี 2569", yearBe: 2569, fundingType: "ANNUAL" },
    { id: "2570", label: "ปี 2570", yearBe: 2570, fundingType: "ANNUAL" },
  ];
}

function bucketToNavItem(b: YearBucket): NavItem {
  return { to: `/budget/year/${b.id}`, label: b.label };
}

export function BudgetModuleTabs({
  isAdmin,
  compact = false,
}: {
  isAdmin?: boolean;
  compact?: boolean;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [buckets, setBuckets] = useState<YearBucket[]>(fallbackBuckets);
  const [nextYearBe, setNextYearBe] = useState(2571);
  const [maxYearBe, setMaxYearBe] = useState<number | null>(2570);
  const [maxAllowedYearBe, setMaxAllowedYearBe] = useState(2570);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiJson<YearsRes>("/api/budget/years");
      const onlyYears = (res.buckets ?? []).filter((b) => b.id !== "commitment" && b.yearBe != null);
      setBuckets(onlyYears.length ? onlyYears : fallbackBuckets());
      setNextYearBe(res.nextYearBe ?? (res.maxYearBe != null ? res.maxYearBe + 1 : 2571));
      setMaxYearBe(res.maxYearBe);
      setMaxAllowedYearBe(res.maxAllowedYearBe ?? new Date().getFullYear() + 543 + 1);
    } catch {
      /* ใช้ fallback */
    }
  }, []);

  useEffect(() => {
    void load();
    const sync = () => void load();
    window.addEventListener(BUDGET_YEARS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(BUDGET_YEARS_CHANGED_EVENT, sync);
  }, [load]);

  const canCreateNext = nextYearBe <= maxAllowedYearBe;

  async function createNextYear() {
    if (!isAdmin || busy) return;
    if (!canCreateNext) {
      window.alert(`ยังสร้างปี ${nextYearBe} ไม่ได้ — สร้างล่วงหน้าได้ถึงปี ${maxAllowedYearBe}`);
      return;
    }
    const from = maxYearBe ?? nextYearBe - 1;
    if (
      !window.confirm(
        `สร้างปี ${nextYearBe} โดยคัดลอกจากปี ${from} เป็นพื้นฐาน?\n\n• โครงรายการตามปีก่อน\n• ยอดคำขอจากยอดอนุมัติ/คำขอปีก่อน\n• ไม่ทับรายการที่มีอยู่แล้ว`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await apiJson<{
        fromYearBe: number;
        toYearBe: number;
        linesCreated: number;
        linesSkipped: number;
        requestsCreated: number;
        requestsSkipped: number;
      }>("/api/budget/years/next", { method: "POST", body: JSON.stringify({}) });
      notifyBudgetYearsChanged();
      await load();
      window.alert(
        `สร้างปี ${res.toYearBe} แล้ว\nรายการใหม่ ${res.linesCreated} (ข้าม ${res.linesSkipped})\nคำขอใหม่ ${res.requestsCreated} (ข้าม ${res.requestsSkipped})`,
      );
      navigate(`/budget/year/${res.toYearBe}`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "สร้างปีถัดไปไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const items = buckets.map(bucketToNavItem);

  if (compact) {
    return (
      <ul className="flex gap-0.5 sm:gap-1">
        {items.map((item) => {
          const active = itemMatchesPath(pathname, item);
          const visual = itemVisual(item.to);
          return (
            <li key={item.to} className="shrink-0">
              <NavLink
                to={item.to}
                end={item.end}
                className={`inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-black transition-all sm:h-9 sm:rounded-xl sm:px-2.5 sm:text-xs ${
                  active ? "bg-white text-[#4d47b6] shadow-md" : "text-white/85 hover:bg-white/15 hover:text-white"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <NavGlyph
                  name={visual.icon}
                  className={`h-3.5 w-3.5 shrink-0 ${active ? visual.tone : "text-white/90"}`}
                />
                {item.label}
              </NavLink>
            </li>
          );
        })}
        {isAdmin ? (
          <li className="shrink-0">
            <button
              type="button"
              disabled={busy}
              onClick={() => void createNextYear()}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/35 bg-white/15 px-2 text-[10px] font-black text-white hover:bg-white/25 disabled:opacity-60 sm:h-9 sm:rounded-xl sm:px-2.5 sm:text-xs"
              title={
                canCreateNext
                  ? `สร้างปี ${nextYearBe} จากปีก่อน`
                  : `สร้างปี ${nextYearBe} (ยังสร้างล่วงหน้าได้ถึงปี ${maxAllowedYearBe})`
              }
            >
              <NavGlyph name="year" className="h-3.5 w-3.5 shrink-0" />
              สร้างปีถัดไป
            </button>
          </li>
        ) : null}
      </ul>
    );
  }

  return (
    <nav aria-label="เมนูงบประมาณ" className="print:hidden">
      <ul className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const active = itemMatchesPath(pathname, item);
          const visual = itemVisual(item.to);
          return (
            <li key={item.to} className="min-w-[5.5rem] flex-1 sm:min-w-0">
              <NavLink
                to={item.to}
                end={item.end}
                className={`${moduleNavItemClass} ${active ? moduleNavActiveClass : moduleNavIdleClass}`}
                aria-current={active ? "page" : undefined}
              >
                <NavGlyph
                  name={visual.icon}
                  className={`h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${active ? "text-white" : visual.tone}`}
                />
                <span className="truncate">{item.label}</span>
              </NavLink>
            </li>
          );
        })}
        {isAdmin ? (
          <li className="min-w-[7rem] flex-1 sm:min-w-0 sm:flex-none">
            <button
              type="button"
              disabled={busy}
              onClick={() => void createNextYear()}
              className={`${moduleNavItemClass} border border-dashed border-emerald-500/40 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/15 disabled:opacity-60`}
              title={
                canCreateNext
                  ? `สร้างปี ${nextYearBe} จากปีก่อน`
                  : `สร้างปี ${nextYearBe} (ยังสร้างล่วงหน้าได้ถึงปี ${maxAllowedYearBe})`
              }
            >
              <NavGlyph name="year" className="h-3.5 w-3.5 shrink-0 text-emerald-700 sm:h-4 sm:w-4" />
              <span className="truncate">{busy ? "กำลังสร้าง…" : "สร้างปีถัดไป"}</span>
            </button>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
