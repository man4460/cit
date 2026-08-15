import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { itemVisual, NavGlyph } from "../lib/navVisuals";
import {
  toolbarLinkBtnClass,
  toolbarMasterGroupClass,
  toolbarPrimaryBtnClass,
} from "../lib/uiTokens";

export type PageFilterConfig = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  printTitle?: string;
  trailing?: ReactNode;
  defaultOpen?: boolean;
  /** แสดงปุ่มกรอง+ช่องค้นหา (ค่าเริ่มต้น true) — ปิดได้ถ้าต้องการแค่พิมพ์ */
  showSearch?: boolean;
};

type Props = {
  /** ว่าง/ไม่ส่ง = ไม่แสดงหัวข้อ เหลือแค่แถบเครื่องมือ */
  title?: string;
  /** จำนวนแถวที่แสดง — พิมพ์ต่อท้ายหัวข้อแบบตัวเล็ก */
  count?: number | null;
  subtitle?: ReactNode;
  /** แท็บสลับหมวด (เช่น ยานพาหนะ / ครุภัณฑ์) */
  segments?: ReactNode;
  /** กลุ่มปุ่มมาสเตอร์ข้อมูล */
  masters?: ReactNode;
  /** ลิงก์หรือปุ่มรอง */
  extras?: ReactNode;
  /** ปุ่ม/แท็บก่อนกรอง-พิมพ์ (ชิดกลุ่มขวา) */
  beforeFilter?: ReactNode;
  /** ปุ่มหลัก */
  primary?: ReactNode;
  /** กรอง + พิมพ์ */
  filter?: PageFilterConfig;
  className?: string;
};

function ToolDivider() {
  return <span className="mx-0.5 hidden h-5 w-px shrink-0 bg-[#dcd8f0] sm:inline-block" aria-hidden />;
}

/** หัวหน้า + ปุ่มเมนูทั้งหมดในแถวเดียวกัน */
export function PageHeaderBar({
  title,
  count,
  subtitle,
  segments,
  masters,
  extras,
  beforeFilter,
  primary,
  filter,
  className,
}: Props) {
  const { pathname } = useLocation();
  const [filterOpen, setFilterOpen] = useState(filter?.defaultOpen ?? false);
  const hasFilter = Boolean(filter?.value.trim());
  const showSearch = filter?.showSearch !== false;
  const hasTools = Boolean(segments || masters || extras || beforeFilter || primary || filter);
  const showTitle = Boolean(title?.trim());
  const visual = itemVisual(pathname);
  const showCount = typeof count === "number" && Number.isFinite(count);
  const countLabel = showCount ? count.toLocaleString("th-TH") : "";

  return (
    <div className={className}>
      {filter?.printTitle ? (
        <h2 className="mb-2 hidden text-base font-bold text-black print:mb-1.5 print:block print:text-[12pt] print:leading-tight">
          {filter.printTitle}
          {showCount ? (
            <span className="ml-1.5 text-[10pt] font-semibold text-slate-600">({countLabel})</span>
          ) : null}
        </h2>
      ) : null}
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-2 print:hidden ${
          showTitle ? "justify-between" : "justify-end"
        }`}
      >
        {showTitle ? (
          <div className="flex min-w-0 shrink items-center gap-2.5 sm:gap-3">
            <span
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 sm:h-11 sm:w-11 sm:rounded-2xl ${visual.chip}`}
            >
              <NavGlyph name={visual.icon} className="h-5 w-5 sm:h-[1.35rem] sm:w-[1.35rem]" />
            </span>
            <div className="min-w-0">
              <h1 className={`text-xl font-black tracking-tight sm:text-2xl ${visual.tone}`}>
                {title}
                {showCount ? (
                  <span className="ml-1.5 align-middle text-[11px] font-bold tabular-nums text-slate-500 sm:text-xs">
                    ({countLabel})
                  </span>
                ) : null}
              </h1>
              {subtitle ? <div className="mt-0.5 text-sm text-slate-600">{subtitle}</div> : null}
            </div>
          </div>
        ) : null}

        {hasTools ? (
          <div className="no-print flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1 sm:gap-1.5">
            {beforeFilter ? <div className="flex flex-wrap items-center gap-1">{beforeFilter}</div> : null}

            {filter ? (
              <>
                {beforeFilter ? <ToolDivider /> : null}
                <div className={toolbarMasterGroupClass}>
                  {showSearch ? (
                    <button
                      type="button"
                      onClick={() => setFilterOpen((v) => !v)}
                      className={`relative inline-flex h-8 items-center rounded-lg px-2.5 text-[11px] font-bold transition sm:h-9 sm:px-3 sm:text-xs ${
                        filterOpen ? "bg-[#0000BF]/12 text-[#0000BF]" : "text-[#4d47b6] hover:bg-[#0000BF]/8"
                      }`}
                      aria-expanded={filterOpen}
                      aria-label={filterOpen ? "ซ่อนตัวกรอง" : "แสดงตัวกรอง"}
                    >
                      กรอง
                      {hasFilter && !filterOpen ? (
                        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#ec4899] ring-2 ring-white" />
                      ) : null}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className={`${toolbarPrimaryBtnClass} !rounded-lg !px-2.5 sm:!px-3`}
                  >
                    พิมพ์
                  </button>
                </div>
              </>
            ) : null}

            {segments ? (
              <>
                {filter || beforeFilter ? <ToolDivider /> : null}
                {segments}
              </>
            ) : null}

            {masters ? (
              <>
                {filter || beforeFilter || segments ? <ToolDivider /> : null}
                {masters}
              </>
            ) : null}

            {extras ? (
              <>
                {filter || beforeFilter || segments || masters ? <ToolDivider /> : null}
                <div className="flex flex-wrap items-center gap-1">{extras}</div>
              </>
            ) : null}

            {primary ? (
              <>
                {filter || beforeFilter || segments || masters || extras ? <ToolDivider /> : null}
                <div className="flex flex-wrap items-center gap-1">{primary}</div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {filter && showSearch && filterOpen ? (
        <div className="no-print mt-2 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={filter.value}
            onChange={(e) => filter.onChange(e.target.value)}
            placeholder={filter.placeholder ?? "กรอง…"}
            className="min-w-[12rem] flex-1 rounded-full border border-[#dcd8f0] bg-white/90 px-4 py-2 text-sm text-[#1e1b3a] shadow-sm outline-none ring-[#0000BF]/20 placeholder:text-slate-400 focus:ring-2 sm:max-w-lg"
            aria-label="กรองข้อมูล"
            autoFocus
          />
          {filter.trailing}
          {hasFilter ? (
            <button type="button" onClick={() => filter.onChange("")} className={toolbarLinkBtnClass}>
              ล้าง
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
