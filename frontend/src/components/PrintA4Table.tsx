import type { ReactNode } from "react";

export type PrintA4Column = {
  label: string;
  className?: string;
};

/** ตารางสำหรับพิมพ์รายงาน A4 — ซ่อนบนจอ แสดงตอนพิมพ์ */
export function PrintA4Table({
  columns,
  rows,
  emptyText = "ไม่มีรายการ",
}: {
  columns: PrintA4Column[];
  rows: ReactNode[][];
  emptyText?: string;
}) {
  return (
    <div className="print-a4-report hidden print:block">
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm">{emptyText}</p>
      ) : (
        <table className="print-a4-table w-full border-collapse text-left">
          <thead>
            <tr>
              <th className="w-8">#</th>
              {columns.map((c) => (
                <th key={c.label} className={c.className}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((cells, i) => (
              <tr key={i}>
                <td className="tabular-nums">{i + 1}</td>
                {cells.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
