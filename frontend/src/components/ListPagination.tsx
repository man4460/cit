/** แถบแบ่งหน้าแบบกะทัดรัด */
export function ListPagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  className = "",
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (total <= 0 || pageCount <= 1) {
    if (total <= 0) return null;
    return (
      <p className={`mt-4 text-center text-xs text-slate-600 ${className}`.trim()}>
        ทั้งหมด {total.toLocaleString("th-TH")} รายการ
      </p>
    );
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(pageCount, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages: number[] = [];
  for (let i = start; i <= end; i++) pages.push(i);

  const btn =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-[#dcd8f0] bg-white px-2 text-xs font-bold text-[#4d47b6] hover:bg-[#0000BF]/8 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className={`mt-4 flex flex-wrap items-center justify-between gap-2 ${className}`.trim()}>
      <p className="text-xs text-slate-600">
        แสดง {from.toLocaleString("th-TH")}–{to.toLocaleString("th-TH")} จาก {total.toLocaleString("th-TH")} รายการ
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPageChange(1)} aria-label="หน้าแรก">
          «
        </button>
        <button
          type="button"
          className={btn}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="ก่อนหน้า"
        >
          ก่อนหน้า
        </button>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            className={`${btn} ${p === page ? "!border-[#0000BF] !bg-[#0000BF]/12 !text-[#0000BF]" : ""}`}
            onClick={() => onPageChange(p)}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          className={btn}
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          aria-label="ถัดไป"
        >
          ถัดไป
        </button>
        <button
          type="button"
          className={btn}
          disabled={page >= pageCount}
          onClick={() => onPageChange(pageCount)}
          aria-label="หน้าสุดท้าย"
        >
          »
        </button>
      </div>
    </div>
  );
}
