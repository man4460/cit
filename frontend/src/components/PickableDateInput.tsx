import { useId, useRef } from "react";

const inputBase =
  "block w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 py-2 pl-3 pr-11 text-sm text-white [color-scheme:dark] focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600";

/**
 * ช่อง date/month บนธีมเข้ม — ไอคอน native ของ Chrome/Edge มักเป็นสีดำมองไม่เห็น
 * จึงซ่อน pseudo แล้วใช้ปุ่ม SVG + HTMLInputElement.showPicker()
 */
export function PickableDateInput({
  type,
  value,
  onChange,
  className = "",
  disabled,
  id: idProp,
  "aria-label": ariaLabel,
}: {
  type: "date" | "month";
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}) {
  const genId = useId();
  const id = idProp ?? genId;
  const ref = useRef<HTMLInputElement>(null);

  function openPicker() {
    const el = ref.current;
    if (!el || disabled) return;
    try {
      if (typeof el.showPicker === "function") {
        void el.showPicker();
        return;
      }
    } catch {
      /* showPicker อาจ throw ในบางสถานะ */
    }
    el.focus();
  }

  return (
    <div className="pickable-date-wrap relative isolate min-w-0">
      <input
        ref={ref}
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputBase} ${className}`.trim()}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={openPicker}
        className="absolute right-1.5 top-1/2 z-10 -translate-y-1/2 rounded-md p-1 text-teal-400 shadow-sm hover:bg-slate-800 hover:text-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-40"
        aria-label={type === "month" ? "เปิดตัวเลือกเดือน" : "เปิดปฏิทิน"}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </button>
    </div>
  );
}
