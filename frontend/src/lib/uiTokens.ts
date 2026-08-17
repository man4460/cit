/** คลาสโทนแบรนด์แบบ Ai Cluster — น้ำเงิน → ม่วง → ชมพู */
export const brandGradientFillClass =
  "bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777]";

export const brandGradientBarClass = "bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899]";

export const brandCtaButtonClass =
  `${brandGradientFillClass} text-white shadow-lg shadow-fuchsia-500/25`;

/** ปุ่มหลัก — ไล่สีแบรนด์ + ตัวอักษรขาว */
export const primaryButtonClass =
  `inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-bold disabled:pointer-events-none disabled:opacity-50 ${brandCtaButtonClass}`;

/** ปุ่มหลักขนาดกะทัดรัด */
export const primaryButtonSmClass =
  `inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-bold disabled:pointer-events-none disabled:opacity-50 ${brandCtaButtonClass}`;

/** ปุ่มรอง — ขอบแบรนด์ พื้นขาว ตัวอักษรเข้ม */
export const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-full border border-[#0000BF]/25 bg-white px-4 py-2 text-sm font-semibold text-[#2e2a58] shadow-sm hover:bg-[#0000BF]/5 disabled:pointer-events-none disabled:opacity-50";

/** แถบเครื่องมือหน้า — ปุ่มมาสเตอร์ข้อมูล (กะทัดรัด) */
export const toolbarMasterBtnClass =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg px-2.5 text-[11px] font-bold text-[#4d47b6] transition hover:bg-[#0000BF]/8 sm:h-9 sm:px-3 sm:text-xs";

/** แถบเครื่องมือหน้า — ลิงก์/ทางลัด */
export const toolbarLinkBtnClass =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-xl border border-[#dcd8f0] bg-white px-2.5 text-[11px] font-bold text-[#2e2a58] shadow-sm transition hover:border-[#0000BF]/25 hover:bg-[#0000BF]/5 sm:h-9 sm:px-3 sm:text-xs";

/** แถบเครื่องมือหน้า — ปุ่มหลัก */
export const toolbarPrimaryBtnClass =
  `inline-flex h-8 shrink-0 items-center justify-center rounded-full px-3 text-[11px] font-black disabled:pointer-events-none disabled:opacity-50 sm:h-9 sm:px-3.5 sm:text-xs ${brandCtaButtonClass}`;

/** เปลือกกลุ่มปุ่มมาสเตอร์ */
export const toolbarMasterGroupClass =
  "inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-xl border border-[#e8e6fc] bg-[#faf9ff]/90 p-0.5 shadow-sm";

export const brandNavActiveClass =
  "bg-[#0000BF]/10 text-[#2e2a58] ring-1 ring-[#0000BF]/20";

export const surfaceCardClass =
  "rounded-2xl border border-white/80 bg-white/85 shadow-[0_10px_40px_-20px_rgba(76,58,180,0.22)] backdrop-blur-md";

/** การ์ดรายการ — โทน Ai Cluster */
export const listCardClass =
  "group relative flex h-full flex-col overflow-hidden rounded-[1.15rem] border border-[#e8e6fc] bg-gradient-to-br from-white/95 via-[#faf9ff]/90 to-[#fdf2f8]/50 p-3.5 shadow-[0_12px_32px_-22px_rgba(30,27,75,0.38)] transition hover:border-[#0000BF]/35 hover:shadow-[0_16px_36px_-20px_rgba(68,49,127,0.35)]";

/** แถบสีด้านซ้ายการ์ด — สลับโทน */
export const listCardAccentBars = [
  "bg-gradient-to-b from-[#0000BF] via-[#8b5cf6] to-[#ec4899]",
  "bg-gradient-to-b from-[#8b5cf6] via-[#ec4899] to-[#f97316]",
  "bg-gradient-to-b from-[#06b6d4] via-[#0000BF] to-[#8b5cf6]",
  "bg-gradient-to-b from-[#ec4899] via-[#8b5cf6] to-[#0000BF]",
] as const;

export function listCardAccentClass(index: number): string {
  return listCardAccentBars[index % listCardAccentBars.length]!;
}

/** เปลือกหัวหมวด + แถบเมนู (แบบ Ai Cluster module chrome) */
export const moduleGlassShellClass =
  "overflow-hidden rounded-[2rem] max-md:rounded-[1.5rem] border border-[#e8e6fc]/80 bg-gradient-to-br from-white/80 via-[#f5f3ff]/70 to-[#fdf2f8]/55 shadow-[0_24px_60px_-28px_rgba(30,27,75,0.28)] backdrop-blur-2xl";

export const moduleAccentBarClass = `h-1.5 w-full rounded-full ${brandGradientBarClass}`;

export const moduleNavActiveClass = `text-white shadow-md ${brandGradientFillClass}`;

export const moduleNavIdleClass = "text-slate-500 hover:bg-white/55 hover:text-slate-700";

export const moduleNavItemClass =
  "flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-black transition-all sm:text-sm";

export const moduleCollapseBtnClass =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#0000BF]/25 bg-white/80 text-[#4d47b6] shadow-sm hover:bg-white";

export const chartGridStroke = "#d8d6ec";
export const chartAxisFill = "#66638c";
export const chartSeries = {
  cargo: "#4d47b6",
  expense: "#ec4899",
  containers: "#f59e0b",
  gasoline: "#8b5cf6",
  diesel: "#0000BF",
  maintenance: "#7c3aed",
} as const;

/** ประกอบ URL สื่อ (/uploads/...) กับ VITE_API_URL / proxy
 *  ถ้าเป็น absolute ที่ชี้ localhost หรือโดเมนแอปเอง → ตัดเหลือ path เพื่อให้ผ่าน Cloudflare/proxy ได้
 */
export function mediaUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  let raw = String(pathOrUrl).trim();
  if (!raw) return null;

  const publicOrigin = (import.meta.env.VITE_PUBLIC_ORIGIN ?? "").replace(/\/$/, "");
  const apiBase = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const host = u.hostname.toLowerCase();
      const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
      const isAppHost =
        (publicOrigin && raw.startsWith(publicOrigin)) ||
        (apiBase && raw.startsWith(apiBase)) ||
        host === "allforone.ma-well.com" ||
        host.endsWith(".ma-well.com");
      if ((isLocal || isAppHost) && u.pathname.startsWith("/uploads/")) {
        raw = u.pathname;
      } else {
        return raw;
      }
    } catch {
      return raw;
    }
  }

  const p = raw.startsWith("/") ? raw : `/${raw}`;
  return apiBase ? `${apiBase}${p}` : p;
}
