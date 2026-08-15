import { useState, type ReactNode } from "react";
import {
  toolbarLinkBtnClass,
  toolbarMasterGroupClass,
  toolbarPrimaryBtnClass,
} from "../lib/uiTokens";

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  printTitle?: string;
  className?: string;
  collapsible?: boolean;
  /** ตัวควบคุมในแถวเดียวกับกรอง/พิมพ์ (วันที่, ลิงก์) */
  trailing?: ReactNode;
};

/** แถบกรอง+พิมพ์+ตัวควบคุม — ปุ่มอยู่แถวเดียว (ใช้ในหน้ารายงานย่อย) */
export function PageFilterPrintBar({
  value,
  onChange,
  placeholder = "กรอง…",
  printTitle,
  className,
  collapsible = true,
  trailing,
}: Props) {
  const [open, setOpen] = useState(!collapsible);
  const hasFilter = value.trim().length > 0;

  return (
    <div className={className}>
      {printTitle ? (
        <h2 className="mb-3 hidden text-xl font-bold text-black print:block">{printTitle}</h2>
      ) : null}
      <div className="no-print mb-3 flex flex-wrap items-center gap-1.5">
        <div className={toolbarMasterGroupClass}>
          {collapsible ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={`relative inline-flex h-8 items-center rounded-lg px-2.5 text-[11px] font-bold transition sm:h-9 sm:px-3 sm:text-xs ${
                open ? "bg-[#0000BF]/12 text-[#0000BF]" : "text-[#4d47b6] hover:bg-[#0000BF]/8"
              }`}
              aria-expanded={open}
            >
              กรอง
              {hasFilter && !open ? (
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
        {trailing ? <div className="flex flex-wrap items-center gap-1">{trailing}</div> : null}
        {(open || !collapsible) && (
          <>
            <input
              type="search"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="min-w-[10rem] flex-1 rounded-full border border-[#dcd8f0] bg-white/90 px-3 py-1.5 text-sm text-[#1e1b3a] shadow-sm outline-none ring-[#0000BF]/20 placeholder:text-slate-400 focus:ring-2 sm:max-w-md"
              aria-label="กรองข้อมูล"
            />
            {hasFilter ? (
              <button type="button" onClick={() => onChange("")} className={toolbarLinkBtnClass}>
                ล้าง
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
