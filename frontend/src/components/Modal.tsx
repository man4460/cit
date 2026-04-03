import { useEffect } from "react";

export type ModalFrameSize = "sm" | "form" | "wide";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /**
   * sm — แคบ (ยืนยันสั้นๆ)
   * form — ฟอร์มเพิ่มข้อมูลมาตรฐาน (ความกว้างเดียวกันทุกหน้า)
   * wide — ฟอร์มยาว (บุคลากร / ภารกิจ)
   */
  size?: ModalFrameSize;
  /** z-index ชั้น overlay (ค่าเริ่มต้น z-[60]) — ใช้ z-[100] เมื่อต้องทับ modal อื่น */
  overlayZClass?: string;
};

/** ความกว้างคงที่ต่อ preset — popup เพิ่มข้อมูลทั่วไปใช้ form เดียวกันทุกหน้า */
const FRAME: Record<ModalFrameSize, string> = {
  sm: "w-full max-w-md",
  form: "w-full max-w-2xl",
  wide: "w-full max-w-5xl",
};

const PANEL_MAX_H: Record<ModalFrameSize, string> = {
  sm: "max-h-[min(90dvh,40rem)]",
  form: "max-h-[min(90dvh,52rem)]",
  wide: "max-h-[min(94dvh,60rem)]",
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

  return (
    <div
      className={`print:hidden fixed inset-0 ${overlayZClass} flex items-center justify-center p-3 sm:p-6`}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
        aria-label="ปิดหน้าต่าง"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`relative flex ${PANEL_MAX_H[size]} ${FRAME[size]} flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-6 sm:py-4">
          <h2 id="modal-title" className="min-w-0 flex-1 text-base font-semibold tracking-tight text-white sm:text-lg">
            {title}
          </h2>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
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
    </div>
  );
}

export { ModalFormActions, ModalFormBody, ModalFormSection } from "./ModalTemplate";
