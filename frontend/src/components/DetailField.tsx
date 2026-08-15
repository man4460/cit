import type { ReactNode } from "react";

/** ช่องแสดงรายละเอียดใน popup ดูข้อมูล (โทนเดียวกับเหตุการณ์ไม่ปกติ / บุคลากร) */
export function DetailField({
  label,
  value,
  className = "",
  mono,
}: {
  label: string;
  value: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div className={className}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 break-words text-sm text-[#1e1b4b] ${mono ? "font-mono text-xs" : ""}`}>
        {value === null || value === undefined || value === "" ? "—" : value}
      </p>
    </div>
  );
}
