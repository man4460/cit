import { useState, type ChangeEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { copyToClipboard } from "../lib/centralMemo";

export function MemoBackButton({ fallback }: { fallback: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
        if (idx > 0) navigate(-1);
        else navigate(fallback);
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
    >
      <span aria-hidden>←</span> ย้อนกลับ
    </button>
  );
}

export function Section({
  n,
  title,
  hint,
  copyText,
  copyHtml,
  copyLabel,
  children,
}: {
  n: string;
  title: string;
  hint?: string;
  copyText?: string | (() => string);
  copyHtml?: string;
  copyLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <span className="rounded-lg bg-indigo-50 px-2 py-0.5 text-xs font-black text-indigo-700">{n}</span>
            {title}
          </h2>
          {hint ? <p className="mt-0.5 text-xs text-slate-400">{hint}</p> : null}
        </div>
        {copyText ? <CopyButton text={copyText} html={copyHtml} label={copyLabel} /> : null}
      </div>
      {children}
    </section>
  );
}

export function SubBlock({
  title,
  copyText,
  copyHtml,
  actions,
  children,
}: {
  title: string;
  copyText?: string;
  copyHtml?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-700">{title}</h3>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {copyText ? <CopyButton text={copyText} html={copyHtml} /> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

export function CopyButton({
  text,
  html,
  label = "คัดลอก",
  primary = false,
}: {
  /** ส่งเป็นฟังก์ชันได้ เมื่อข้อความต้องคำนวณตอนกดคัดลอก */
  text: string | (() => string);
  html?: string;
  label?: string;
  primary?: boolean;
}) {
  const [done, setDone] = useState<boolean | null>(null);
  async function run() {
    const ok = await copyToClipboard(typeof text === "function" ? text() : text, html);
    setDone(ok);
    window.setTimeout(() => setDone(null), 1600);
  }
  const base = primary
    ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
    : "border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50";
  return (
    <button
      type="button"
      onClick={() => void run()}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold shadow-sm transition sm:text-sm ${
        done ? "border-emerald-300 bg-emerald-50 text-emerald-700" : done === false ? "border-rose-300 bg-rose-50 text-rose-700" : base
      }`}
    >
      {done ? "คัดลอกแล้ว ✓" : done === false ? "คัดลอกไม่สำเร็จ" : label}
    </button>
  );
}

export function EditableText({
  value,
  onChange,
  edited,
  onReset,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  edited?: boolean;
  onReset?: () => void;
  rows?: number;
}) {
  return (
    <div className="min-w-0">
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border px-3 py-2 text-sm leading-relaxed text-slate-800 focus:border-indigo-300 focus:outline-none ${
          edited ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"
        }`}
      />
      {edited && onReset ? (
        <button type="button" onClick={onReset} className="text-[11px] font-semibold text-amber-700 hover:underline">
          แก้ไขเองแล้ว · ใช้ข้อความอัตโนมัติ
        </button>
      ) : null}
    </div>
  );
}

export function CopyField({
  label,
  value,
  onChange,
  edited,
  onReset,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  edited?: boolean;
  onReset?: () => void;
  multiline?: boolean;
}) {
  const cls = `w-full rounded-lg border px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-300 focus:outline-none ${
    edited ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"
  }`;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-slate-500">{label}</p>
      <div className="flex items-start gap-2">
        {multiline ? (
          <textarea rows={3} value={value} onChange={onChange} className={cls} />
        ) : (
          <input value={value} onChange={onChange} className={cls} />
        )}
        <CopyButton text={value} />
      </div>
      {edited && onReset ? (
        <button type="button" onClick={onReset} className="text-[11px] font-semibold text-amber-700 hover:underline">
          แก้ไขเองแล้ว · ใช้ข้อความอัตโนมัติ
        </button>
      ) : null}
    </div>
  );
}

export function SmallInput({
  label,
  value,
  onChange,
  type = "text",
  wide = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  wide?: boolean;
  placeholder?: string;
}) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-300 focus:outline-none"
      />
    </label>
  );
}

/** ตารางแก้ไขได้ — คอลัมน์ใน multiline แสดงเป็นกล่องหลายบรรทัด (เช่น รายชื่อในรถคันเดียวกัน) */
export function EditableTable({
  head,
  rows,
  onChange,
  multiline = [],
  widths = [],
  footer,
}: {
  head: string[];
  rows: string[][];
  onChange: (rows: string[][]) => void;
  multiline?: number[];
  widths?: string[];
  footer?: ReactNode;
}) {
  const setCell = (r: number, c: number, v: string) =>
    onChange(rows.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? v : cell)) : row)));
  const move = (r: number, d: number) => {
    const t = r + d;
    if (t < 0 || t >= rows.length) return;
    const next = [...rows];
    [next[r], next[t]] = [next[t], next[r]];
    onChange(next);
  };
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`px-2 py-2 text-left font-semibold ${widths[i] ?? ""}`}>
                {h}
              </th>
            ))}
            <th className="w-20" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, r) => (
            <tr key={r} className="align-top">
              {row.map((cell, c) => (
                <td key={c} className="px-1 py-1">
                  {multiline.includes(c) ? (
                    <textarea
                      rows={Math.max(1, cell.split("\n").length)}
                      value={cell}
                      onChange={(e) => setCell(r, c, e.target.value)}
                      className="w-full resize-y rounded border border-transparent px-1.5 py-1 hover:border-slate-200 focus:border-indigo-300 focus:outline-none"
                    />
                  ) : (
                    <input
                      value={cell}
                      onChange={(e) => setCell(r, c, e.target.value)}
                      className="w-full rounded border border-transparent px-1.5 py-1 hover:border-slate-200 focus:border-indigo-300 focus:outline-none"
                    />
                  )}
                </td>
              ))}
              <td className="whitespace-nowrap px-1 py-1 text-right text-xs text-slate-400">
                <button type="button" title="เลื่อนขึ้น" onClick={() => move(r, -1)} className="px-1 hover:text-slate-700">
                  ↑
                </button>
                <button type="button" title="เลื่อนลง" onClick={() => move(r, 1)} className="px-1 hover:text-slate-700">
                  ↓
                </button>
                <button
                  type="button"
                  title="ลบแถว"
                  onClick={() => onChange(rows.filter((_, i) => i !== r))}
                  className="px-1 hover:text-rose-600"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
        <button
          type="button"
          onClick={() => onChange([...rows, head.map(() => "")])}
          className="text-xs font-semibold text-indigo-600 hover:underline"
        >
          + เพิ่มแถว
        </button>
        {footer}
      </div>
    </div>
  );
}
