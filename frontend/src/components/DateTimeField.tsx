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
      <label htmlFor={id} className="text-xs font-medium text-slate-300">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{hint}</p> : null}
      <div className="relative mt-1">
        <span
          className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-teal-500"
          aria-hidden
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
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
          className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 pl-11 pr-3 text-sm text-white [color-scheme:dark] focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
        />
      </div>
    </div>
  );
}
