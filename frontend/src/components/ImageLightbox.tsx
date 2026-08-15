import { useEffect } from "react";
import { createPortal } from "react-dom";

type ImageLightboxProps = {
  open: boolean;
  onClose: () => void;
  title?: string | null;
  /** โหมดรูปเดียว */
  url?: string | null;
  /** โหมดหลายรูป — ใช้คู่กับ index / onIndexChange */
  urls?: string[];
  index?: number;
  onIndexChange?: (i: number) => void;
};

/** แสดงรูปเต็มจอ — คลิกพื้นหลังหรือปิด หรือกด Esc; หลายรูปมีปุ่มและลูกศรซ้าย/ขวา */
export function ImageLightbox({
  open,
  onClose,
  title,
  url,
  urls,
  index = 0,
  onIndexChange,
}: ImageLightboxProps) {
  const list = urls?.length ? urls : url ? [url] : [];
  const canNav = list.length > 1 && !!onIndexChange;
  const idx = canNav ? Math.min(Math.max(0, index), list.length - 1) : 0;
  const current = list[idx] ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (!canNav || !onIndexChange) return;
      if (e.key === "ArrowLeft") onIndexChange(idx > 0 ? idx - 1 : list.length - 1);
      if (e.key === "ArrowRight") onIndexChange(idx < list.length - 1 ? idx + 1 : 0);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, canNav, onIndexChange, idx, list.length]);

  if (!open || !current) return null;

  return createPortal(
    <div className="print:hidden fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-8">
      <button
        type="button"
        className="absolute inset-0 bg-black/85 backdrop-blur-sm"
        aria-label="ปิด"
        onClick={onClose}
      />
      <div
        className="relative z-10 mx-auto flex max-h-[90vh] w-[min(100%,56rem)] shrink-0 flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex w-full items-center justify-between gap-3 px-1">
          <p className="truncate text-sm font-medium text-white">
            {title}
            {canNav ? (
              <span className="ml-2 text-slate-300 tabular-nums">
                {idx + 1}/{list.length}
              </span>
            ) : null}
          </p>
          <button
            type="button"
            className="shrink-0 rounded-lg bg-slate-100/90 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
            onClick={onClose}
          >
            ปิด
          </button>
        </div>
        <div className="relative flex w-full items-center justify-center gap-2">
          {canNav && onIndexChange ? (
            <button
              type="button"
              aria-label="ก่อนหน้า"
              className="absolute left-0 z-20 rounded-lg bg-white/95 px-2 py-4 text-lg text-[#1e1b3a] hover:bg-slate-50 sm:static sm:px-3"
              onClick={() => onIndexChange(idx > 0 ? idx - 1 : list.length - 1)}
            >
              ‹
            </button>
          ) : null}
          <img
            src={current}
            alt=""
            className="max-h-[min(80vh,48rem)] w-auto max-w-full rounded-lg border border-slate-200 object-contain shadow-2xl"
          />
          {canNav && onIndexChange ? (
            <button
              type="button"
              aria-label="ถัดไป"
              className="absolute right-0 z-20 rounded-lg bg-white/95 px-2 py-4 text-lg text-[#1e1b3a] hover:bg-slate-50 sm:static sm:px-3"
              onClick={() => onIndexChange(idx < list.length - 1 ? idx + 1 : 0)}
            >
              ›
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
