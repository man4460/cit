type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** หัวข้อที่แสดงเฉพาะตอนพิมพ์ */
  printTitle?: string;
  className?: string;
};

export function PageFilterPrintBar({
  value,
  onChange,
  placeholder = "กรองข้อมูล…",
  printTitle,
  className,
}: Props) {
  return (
    <div className={className}>
      {printTitle ? (
        <h2 className="mb-3 hidden text-xl font-bold text-black print:block">{printTitle}</h2>
      ) : null}
      <div className="no-print mb-4 mt-4 flex flex-wrap items-center gap-2 sm:mt-5">
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-w-[12rem] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white sm:max-w-md"
          aria-label="กรองข้อมูล"
        />
        <button
          type="button"
          onClick={() => window.print()}
          className="shrink-0 rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
        >
          พิมพ์
        </button>
      </div>
    </div>
  );
}
