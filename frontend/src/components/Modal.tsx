import { useEffect } from "react";
import { createPortal } from "react-dom";

export type ModalFrameSize = "sm" | "form" | "wide" | "viewer";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  size?: ModalFrameSize;
  overlayZClass?: string;
};

/** ใช้ w-[min(...)] แทน w-full+max-w เพื่อให้ flex จัดกึ่งกลางได้จริง */
const FRAME: Record<ModalFrameSize, string> = {
  sm: "w-[min(100%,28rem)]",
  form: "w-[min(100%,42rem)]",
  wide: "w-[min(100%,64rem)]",
  viewer: "w-[min(100%,min(96vw,80rem))]",
};

const PANEL_MAX_H: Record<ModalFrameSize, string> = {
  sm: "max-h-[min(90dvh,40rem)]",
  form: "max-h-[min(90dvh,52rem)]",
  wide: "max-h-[min(94dvh,60rem)]",
  viewer: "max-h-[min(96dvh,100dvh)]",
};

export function Modal({ open, onClose, title, children, size = "form", overlayZClass = "z-[60]" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={`print:hidden fixed inset-0 ${overlayZClass} flex items-center justify-center p-3 sm:p-6`}
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#1e1b3a]/40 backdrop-blur-[2px]"
        aria-label="ปิดหน้าต่าง"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`relative mx-auto flex ${PANEL_MAX_H[size]} ${FRAME[size]} shrink-0 flex-col overflow-hidden rounded-3xl border border-white/80 bg-white/95 shadow-[0_24px_60px_-20px_rgba(68,49,127,0.35)] backdrop-blur-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#d8d9ff]/80 px-4 py-3 sm:px-6 sm:py-4">
          <h2
            id="modal-title"
            className="min-w-0 flex-1 text-base font-black tracking-tight text-[#1e1b3a] sm:text-lg"
          >
            {title}
          </h2>
          <button
            type="button"
            className="rounded-xl p-2 text-slate-700 transition-colors hover:bg-slate-100 hover:text-[#2e2a58]"
            aria-label="ปิด"
            onClick={onClose}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export { ModalFormActions, ModalFormBody, ModalFormSection } from "./ModalTemplate";
