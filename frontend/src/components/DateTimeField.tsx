/** ช่องวันเวลา พร้อมไอคอนปฏิทินให้มองเห็นชัด */
export function DateTimeField({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div className="block">
      <label htmlFor={id} className="text-xs font-semibold text-slate-600">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-[11px] leading-snug text-slate-700">{hint}</p> : null}
      <div className="relative mt-1">
        <span
          className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-[#0000BF]"
          aria-hidden
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </span>
        <input
          id={id}
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-12 pr-3 text-sm text-slate-900 shadow-sm [color-scheme:light] outline-none focus:border-[#0000BF] focus:ring-2 focus:ring-[#0000BF]/20"
        />
      </div>
    </div>
  );
}
