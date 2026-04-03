import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { useAuth } from "../context/AuthContext";
import { APP_VERSION } from "../version";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive ? "bg-teal-600/20 text-teal-300" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
  }`;

const mainNav = [
  { to: "/", label: "แดชบอร์ด" },
  { to: "/missions", label: "ภารกิจ" },
  { to: "/routes", label: "เส้นทางภารกิจ" },
  { to: "/personnel", label: "บุคลากร" },
  { to: "/training", label: "ทะเบียนการอบรม" },
  { to: "/vehicles", label: "ยานพาหนะ" },
  { to: "/disposition-registry", label: "ทะเบียนจำหน่าย/ส่งคืน" },
  { to: "/documents", label: "คลังเอกสาร" },
  { to: "/assets", label: "ครุภัณฑ์ & QR" },
  { to: "/activities", label: "กิจกรรม" },
  { to: "/reports", label: "รายงาน" },
  { to: "/scan", label: "สแกน QR" },
];

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

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      {open ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      )}
    </svg>
  );
}

export function Shell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setNavOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  const closeNav = () => setNavOpen(false);

  return (
    <div className="flex min-h-screen min-h-[100dvh] flex-col bg-slate-950">
      {navOpen && (
        <button
          type="button"
          aria-label="ปิดเมนู"
          className="no-print fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] lg:hidden"
          onClick={closeNav}
        />
      )}

      <header
        className="no-print sticky top-0 z-30 flex w-full shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/90 px-3 py-2.5 backdrop-blur-md supports-[backdrop-filter]:bg-slate-950/80 lg:px-6 lg:py-3"
        style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            className="rounded-lg p-2 text-slate-200 hover:bg-slate-800 hover:text-white lg:hidden"
            aria-expanded={navOpen}
            aria-controls="app-sidebar"
            aria-label={navOpen ? "ปิดเมนู" : "เปิดเมนู"}
            onClick={() => setNavOpen((v) => !v)}
          >
            <HamburgerIcon open={navOpen} />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-600/90">ระบบปฏิบัติการ</p>
            <BrandLogo
              variant="horizontal"
              className="mt-0.5 h-5 w-auto max-w-[min(100%,9.5rem)] object-contain object-left sm:max-w-[10rem] lg:h-6 lg:max-w-[11rem]"
            />
          </div>
        </div>
        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden min-w-0 text-right md:block">
            <p className="max-w-[14rem] truncate text-sm text-slate-300" title={user?.username}>
              {user?.fullName || user?.username}
            </p>
            <p className="text-[10px] uppercase text-slate-600">{user?.role}</p>
          </div>
          <NavLink
            to="/profile"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 px-2.5 py-2 text-sm font-medium text-slate-200 hover:border-teal-700/60 hover:bg-slate-800/80 hover:text-teal-200 lg:px-3"
            aria-label="โปรไฟล์"
          >
            <UserCircleIcon className="h-5 w-5 shrink-0 text-teal-500/90 lg:h-4 lg:w-4" />
            <span className="hidden lg:inline">โปรไฟล์</span>
          </NavLink>
          <button
            type="button"
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
            className="hidden rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white lg:inline"
          >
            ออกจากระบบ
          </button>
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
        <aside
          id="app-sidebar"
          className={`no-print fixed inset-y-0 left-0 z-50 flex w-[min(18rem,calc(100vw-2.5rem))] max-w-[18rem] flex-col border-r border-slate-800 bg-slate-900/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl shadow-black/40 backdrop-blur-md transition-transform duration-200 ease-out motion-reduce:transition-none lg:static lg:z-auto lg:max-h-none lg:max-w-none lg:w-56 lg:shrink-0 lg:translate-x-0 lg:self-stretch lg:bg-slate-900/80 lg:shadow-none lg:pt-4 ${
            navOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }`}
        >
          <div className="mb-3 flex justify-end lg:hidden">
            <button
              type="button"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="ปิดเมนู"
              onClick={closeNav}
            >
              <HamburgerIcon open />
            </button>
          </div>
          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain pb-4 lg:pt-0" onClick={closeNav}>
          {mainNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                linkClass({
                  isActive:
                    isActive ||
                    (item.to === "/reports" && location.pathname.startsWith("/reports/")),
                })
              }
            >
              {item.label}
            </NavLink>
          ))}
          {user?.role === "ADMIN" && (
            <NavLink to="/admin" className={linkClass}>
              จัดการผู้ใช้ (Admin)
            </NavLink>
          )}
        </nav>
        <div className="mt-auto shrink-0 space-y-3 border-t border-slate-800 pt-4">
          <div className="rounded-xl border border-teal-900/30 bg-slate-950/50 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-600/90">จัดทำโดย</p>
            <p className="mt-1.5 text-xs font-semibold leading-snug text-slate-200">พ.ต.ต.เร๊าะมัน หะนิแร</p>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">แดชบอร์ด</p>
            <p className="mt-1.5 font-mono text-[10px] text-slate-600">version {APP_VERSION}</p>
          </div>
          <div>
            <p className="truncate px-2 text-xs text-slate-500" title={user?.username}>
              {user?.fullName || user?.username}
            </p>
            <p className="px-2 text-[10px] uppercase text-slate-600">{user?.role}</p>
            <NavLink
              to="/profile"
              onClick={closeNav}
              className="mt-2 block w-full rounded-lg px-3 py-2.5 text-left text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              โปรไฟล์
            </NavLink>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate("/login", { replace: true });
              }}
              className="mt-0.5 w-full rounded-lg px-3 py-2.5 text-left text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              ออกจากระบบ
            </button>
          </div>
        </div>
        </aside>

        <main
          className="min-w-0 flex-1 px-3 py-4 print:max-w-none print:px-4 print:py-3 sm:px-5 sm:py-6 lg:px-8 lg:py-8"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto w-full min-w-0 max-w-7xl print:max-w-none">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
