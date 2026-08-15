import { useCallback, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { BudgetModuleTabs } from "../components/BudgetModuleTabs";
import {
  filterGroupItems,
  findGroupForPath,
  itemMatchesPath,
  writeGroupLastPath,
  type NavGroup,
} from "../lib/navConfig";
import { groupTone, itemVisual, NavGlyph } from "../lib/navVisuals";
import {
  brandGradientFillClass,
  moduleCollapseBtnClass,
  moduleGlassShellClass,
  moduleNavActiveClass,
  moduleNavIdleClass,
  moduleNavItemClass,
} from "../lib/uiTokens";

const HEADER_COLLAPSE_KEY = "afo_module_header_collapsed";
export const MODULE_HEADER_COLLAPSE_EVENT = "afo-module-header-collapsed";

export function readModuleHeaderCollapsed(): boolean {
  try {
    return localStorage.getItem(HEADER_COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeModuleHeaderCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(HEADER_COLLAPSE_KEY, collapsed ? "1" : "0");
    window.dispatchEvent(new Event(MODULE_HEADER_COLLAPSE_EVENT));
  } catch {
    /* ignore */
  }
}

function CollapseGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
      <path d="M4 8h16M4 12h16M4 16h10" strokeLinecap="round" />
    </svg>
  );
}

function moduleTabItems(group: NavGroup, role?: string) {
  return filterGroupItems(group, role);
}

function ModuleTabs({ group, role }: { group: NavGroup; role?: string }) {
  if (group.id === "budget") {
    return <BudgetModuleTabs isAdmin={role === "ADMIN"} />;
  }

  const { pathname } = useLocation();
  const items = moduleTabItems(group, role);

  return (
    <nav aria-label={`เมนู${group.titleTh}`} className="print:hidden">
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
      </ul>
    </nav>
  );
}

export function ModuleHeaderBarNav({ role }: { role?: string }) {
  const { pathname } = useLocation();
  const group = findGroupForPath(pathname, role);
  if (!group) return null;
  const items = moduleTabItems(group, role);
  const isBudget = group.id === "budget";

  return (
    <div className={`no-print flex min-w-0 flex-1 items-center gap-1 rounded-2xl ${brandGradientFillClass} px-1.5 py-1 shadow-md sm:gap-2 sm:px-2`}>
      <nav
        className="min-w-0 flex-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={`เมนู${group.titleTh}`}
      >
        {isBudget ? (
          <BudgetModuleTabs isAdmin={role === "ADMIN"} compact />
        ) : (
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
          </ul>
        )}
      </nav>
      <p className="hidden max-w-[8rem] shrink-0 truncate text-right text-[10px] font-black text-white xl:block xl:max-w-[12rem]">
        {group.titleTh}
      </p>
      <button
        type="button"
        onClick={() => writeModuleHeaderCollapsed(false)}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/35 bg-white/15 text-white hover:bg-white/25 sm:h-9 sm:w-9 sm:rounded-xl"
        aria-label="แสดงหัวหมวด"
        title="แสดงหัวหมวด"
      >
        <CollapseGlyph />
      </button>
    </div>
  );
}

export function ModuleSectionChrome({ role }: { role?: string }) {
  const { pathname } = useLocation();
  const group = findGroupForPath(pathname, role);
  const [collapsed, setCollapsed] = useState(readModuleHeaderCollapsed);

  useEffect(() => {
    const sync = () => setCollapsed(readModuleHeaderCollapsed());
    sync();
    window.addEventListener(MODULE_HEADER_COLLAPSE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MODULE_HEADER_COLLAPSE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!group) return;
    writeGroupLastPath(group.id, pathname);
  }, [group, pathname]);

  const toggle = useCallback(() => {
    writeModuleHeaderCollapsed(!collapsed);
  }, [collapsed]);

  if (!group || collapsed) return null;
  const tone = groupTone(group.id);

  return (
    <header className={`no-print mb-4 ${moduleGlassShellClass} p-4 sm:px-6 sm:py-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 sm:h-12 sm:w-12 ${tone.chip}`}
          >
            <NavGlyph name={tone.icon} className="h-5 w-5 sm:h-6 sm:w-6" />
          </span>
          <div className="min-w-0">
            <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${tone.text}`}>{group.titleEn}</p>
            <h2 className={`mt-0.5 text-xl font-black tracking-tight sm:text-2xl ${tone.text}`}>{group.titleTh}</h2>
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          className={moduleCollapseBtnClass}
          aria-label="ซ่อนหัวหมวด"
          title="ซ่อนหัวหมวด"
          aria-pressed={false}
        >
          <CollapseGlyph />
        </button>
      </div>
      <div className="mt-4" aria-hidden>
        <div className={`h-1.5 w-full rounded-full bg-gradient-to-r ${tone.bar}`} />
      </div>
      <div className="mt-4 border-t border-white/40 pt-4">
        <ModuleTabs group={group} role={role} />
      </div>
    </header>
  );
}
