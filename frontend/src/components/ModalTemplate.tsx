import type { ReactNode } from "react";

/** เนื้อหาฟอร์มใน popup — ระยะห่างแนวตั้งสม่ำเสมอ */
export function ModalFormBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`space-y-6 ${className}`.trim()}>{children}</div>;
}

/** หัวข้อกลุ่มฟิลด์ใน popup */
export function ModalFormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="border-b border-slate-800/80 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-500/90">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** แถวปุ่มด้านล่างฟอร์ม */
export function ModalFormActions({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-3 border-t border-slate-800 pt-5 ${className}`.trim()}>{children}</div>
  );
}
