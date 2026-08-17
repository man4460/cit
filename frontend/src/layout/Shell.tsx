import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { DATA_REFRESH_EVENT, refreshAppData } from "../api/client";
import { useAuth } from "../context/AuthContext";
import {
  filterGroupItems,
  findGroupForPath,
  navGroups,
  resolveGroupEntryPath,
} from "../lib/navConfig";
import { groupTone, NavGlyph } from "../lib/navVisuals";
import { mediaUrl } from "../lib/uiTokens";
import { APP_VERSION } from "../version";
import {
  ModuleHeaderBarNav,
  ModuleSectionChrome,
  MODULE_HEADER_COLLAPSE_EVENT,
  readModuleHeaderCollapsed,
} from "./ModuleSectionChrome";

const SIDEBAR_COLLAPSE_KEY = "afo_sidebar_collapsed";

function UserCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function PanelToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      {collapsed ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h16" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
      )}
    </svg>
  );
}

function LogoutDoorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.85} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H12"
      />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.85} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
      />
    </svg>
  );
}

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      {open ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      )}
    </svg>
  );
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

export function Shell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [moduleHeaderCollapsed, setModuleHeaderCollapsed] = useState(readModuleHeaderCollapsed);
  const [dataEpoch, setDataEpoch] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const activeGroup = findGroupForPath(location.pathname, user?.role);

  useEffect(() => {
    const onRefresh = () => {
      setDataEpoch((n) => n + 1);
      setRefreshing(false);
    };
    window.addEventListener(DATA_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(DATA_REFRESH_EVENT, onRefresh);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setMobileOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    const sync = () => setModuleHeaderCollapsed(readModuleHeaderCollapsed());
    sync();
    window.addEventListener(MODULE_HEADER_COLLAPSE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MODULE_HEADER_COLLAPSE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const closeMobile = () => setMobileOpen(false);
  const toggleDesktop = () => setCollapsed((v) => !v);

  const goGroup = (groupId: string) => {
    const group = navGroups.find((g) => g.id === groupId);
    if (!group) return;
    const items = filterGroupItems(group, user?.role);
    if (!items.length) return;
    closeMobile();
    navigate(resolveGroupEntryPath(group, user?.role));
  };

  const navBody = (
    <>
      <nav
        className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-0.5 pb-2 pt-1"
        aria-label="หมวดเมนู"
      >
        {navGroups.map((group) => {
          const items = filterGroupItems(group, user?.role);
          if (!items.length) return null;
          const isActive = activeGroup?.id === group.id;
          const tone = groupTone(group.id);
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => goGroup(group.id)}
              className={`w-full rounded-xl border px-2.5 py-1.5 text-left transition-all ${
                isActive
                  ? `border-transparent bg-gradient-to-br from-white via-white to-[#fdf2f8]/60 shadow-sm ring-2 ${tone.ring}`
                  : "border-[#e8e6fc]/70 bg-gradient-to-br from-white/70 via-white/50 to-[#fdf2f8]/40 hover:border-[#0000BF]/20 hover:bg-white/80"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${tone.chip}`}
                >
                  <NavGlyph name={tone.icon} className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-black leading-tight ${isActive ? tone.text : "text-[#2e2a58]"}`}>
                    {group.titleTh}
                  </p>
                  <p className="mt-0.5 text-[9px] font-medium leading-tight tracking-wide text-slate-500">
                    {group.titleEn}
                    <span className="text-[#66638c]"> · {items.length}</span>
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </nav>
      <div className="mt-auto shrink-0 border-t border-[#d8d9ff]/80 pt-2.5">
        <div className="rounded-xl border border-[#0000BF]/15 bg-gradient-to-br from-[#0000BF]/8 via-[#8b5cf6]/8 to-[#ec4899]/8 px-2.5 py-2">
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[#0000BF]/80">จัดทำโดย</p>
          <p className="mt-1 text-[11px] font-bold leading-snug text-[#2e2a58]">พ.ต.ต.เร๊าะมัน หะนิแร</p>
          <p className="mt-0.5 font-mono text-[9px] text-slate-600">version {APP_VERSION}</p>
        </div>
      </div>
    </>
  );

  return (
    <div className="app-shell flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-hidden print:h-auto print:max-h-none print:overflow-visible">
      {mobileOpen && (
        <button
          type="button"
          aria-label="ปิดเมนู"
          className="no-print fixed inset-0 z-40 bg-[#1e1b3a]/35 backdrop-blur-[2px] lg:hidden"
          onClick={closeMobile}
        />
      )}

      <header
        className="no-print app-glass-panel sticky top-0 z-30 flex w-full shrink-0 items-center justify-between gap-3 border-b border-white/60 px-3 py-2.5 lg:px-6 lg:py-3"
        style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top, 0px))" }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            className="rounded-xl p-2 text-[#2e2a58] hover:bg-white/80 lg:hidden"
            aria-expanded={mobileOpen}
            aria-controls="app-sidebar-mobile"
            aria-label={mobileOpen ? "ปิดเมนู" : "เปิดเมนู"}
            onClick={() => setMobileOpen((v) => !v)}
          >
            <HamburgerIcon open={mobileOpen} />
          </button>
          <button
            type="button"
            className="hidden rounded-xl p-2 text-[#2e2a58] hover:bg-white/80 lg:inline-flex"
            aria-expanded={!collapsed}
            aria-controls="app-sidebar-desktop"
            aria-label={collapsed ? "แสดงแถบเมนู" : "ซ่อนแถบเมนู"}
            title={collapsed ? "แสดงแถบเมนู" : "ซ่อนแถบเมนู"}
            onClick={toggleDesktop}
          >
            <PanelToggleIcon collapsed={collapsed} />
          </button>
          <div className={`min-w-0 ${moduleHeaderCollapsed ? "hidden sm:block" : ""}`}>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#0000BF]/80">ระบบปฏิบัติการ</p>
            <img
              src="/logo-login.png"
              alt="ALL FOR ONE"
              decoding="async"
              draggable={false}
              className="mt-0.5 h-4 w-auto max-w-[min(100%,8rem)] object-contain object-left sm:h-5 sm:max-w-[9.5rem] lg:h-5 lg:max-w-[10.5rem]"
            />
          </div>
          {moduleHeaderCollapsed ? <ModuleHeaderBarNav role={user?.role} /> : null}
        </div>
        <div className="flex min-w-0 shrink-0 items-center gap-1.5 border-l border-[#0000BF]/15 pl-2.5 sm:gap-2 sm:pl-3">
          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              refreshAppData();
            }}
            disabled={refreshing}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#0000BF]/20 bg-white/80 text-[#58547f] shadow-sm transition hover:border-[#0000BF]/35 hover:bg-white hover:text-[#0000BF] disabled:opacity-60"
            title="รีเฟรชข้อมูล"
            aria-label="รีเฟรชข้อมูล"
          >
            <RefreshIcon className={`h-[1.125rem] w-[1.125rem] ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <NavLink
            to="/profile"
            className="inline-flex min-w-0 items-center gap-2 rounded-xl border border-[#0000BF]/20 bg-white/80 py-1 pl-1 pr-2.5 text-[#2e2a58] shadow-sm hover:bg-white sm:pr-3"
            aria-label="โปรไฟล์"
            title="โปรไฟล์"
          >
            {mediaUrl(user?.avatarUrl) ? (
              <img
                src={mediaUrl(user?.avatarUrl)!}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full object-cover ring-2 ring-white"
              />
            ) : (
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0000BF]/10 text-[#0000BF] ring-2 ring-white">
                <UserCircleIcon className="h-5 w-5" />
              </span>
            )}
            <span className="hidden min-w-0 md:block">
              <span className="block max-w-[10rem] truncate text-sm font-bold leading-tight lg:max-w-[14rem]">
                {user?.fullName || user?.username}
              </span>
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">{user?.role}</span>
            </span>
          </NavLink>
          <button
            type="button"
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#0000BF]/20 bg-white/80 text-[#58547f] shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            title="ออกจากระบบ"
            aria-label="ออกจากระบบ"
          >
            <LogoutDoorIcon className="h-[1.125rem] w-[1.125rem]" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden print:overflow-visible lg:flex-row">
        <aside
          id="app-sidebar-mobile"
          className={`no-print app-glass-panel fixed inset-y-0 left-0 z-50 flex w-[min(20rem,calc(100vw-2.5rem))] max-w-[20rem] flex-col border-r border-white/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_20px_50px_-20px_rgba(68,49,127,0.28)] transition-transform duration-200 ease-out motion-reduce:transition-none lg:hidden ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-[#2e2a58]">หมวด</p>
            <button
              type="button"
              className="rounded-xl p-2 text-slate-700 hover:bg-white/80 hover:text-[#2e2a58]"
              aria-label="ปิดเมนู"
              onClick={closeMobile}
            >
              <HamburgerIcon open />
            </button>
          </div>
          {navBody}
        </aside>

        <aside
          id="app-sidebar-desktop"
          className={`no-print app-glass-panel relative hidden min-h-0 shrink-0 flex-col overflow-hidden border-r border-white/50 transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex lg:self-stretch ${
            collapsed ? "w-0 border-transparent p-0" : "w-64 p-3 pt-3"
          }`}
          aria-hidden={collapsed}
        >
          {!collapsed ? navBody : null}
        </aside>

        <main
          className={`min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-3 pb-4 print:max-w-none print:overflow-visible print:p-0 sm:px-5 sm:pb-6 lg:px-6 lg:pb-8 ${
            moduleHeaderCollapsed ? "pt-2 sm:pt-2 lg:pt-2" : "pt-4 sm:pt-6 lg:pt-8"
          }`}
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="w-full min-w-0 max-w-none print:max-w-none">
            <ModuleSectionChrome role={user?.role} />
            <div
              className={`app-card-surface w-full rounded-[1.5rem] border border-white/70 px-4 pb-4 sm:px-6 sm:pb-6 ${
                moduleHeaderCollapsed ? "pt-3 sm:pt-4" : "pt-4 sm:pt-6"
              }`}
            >
              <Outlet key={dataEpoch} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
