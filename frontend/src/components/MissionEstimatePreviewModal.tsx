import { Modal } from "./Modal";
import { formatBaht, formatInt, parseLooseNumber } from "../lib/formatNumber";
import {
  computeEstimateTotals,
  isEstimateItemLine,
  lineCurrentAmount,
  type EstimateFormLine,
} from "../lib/missionEstimate";

function deltaClass(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "text-slate-600";
  return n > 0 ? "text-rose-700" : "text-emerald-700";
}

export function MissionEstimatePreviewModal({
  open,
  onClose,
  title,
  currentLabel,
  previousLabel,
  currentDateRange,
  previousDateRange,
  notes,
  lines,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  currentLabel: string;
  previousLabel: string;
  currentDateRange: string;
  previousDateRange: string;
  notes: string;
  lines: EstimateFormLine[];
}) {
  const totals = computeEstimateTotals(lines);

  return (
    <Modal open={open} onClose={onClose} title="พรีวิวประมาณการค่าใช้จ่าย" size="viewer">
      <div className="space-y-4 print:text-black">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-[#1e1b3a]">{title || "ประมาณการค่าใช้จ่ายภารกิจ"}</h3>
            <p className="mt-1 text-xs text-slate-600">เทียบประมาณการครั้งนี้กับประมาณการก่อนหน้าในเส้นทางเดียวกัน</p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#2e2a58] hover:bg-slate-50 print:hidden"
            onClick={() => window.print()}
          >
            พิมพ์
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">ประมาณการก่อนหน้า</p>
            <p className="mt-0.5 text-sm font-bold text-[#2e2a58]">{previousLabel || "—"}</p>
            <p className="text-xs text-slate-600">{previousDateRange || "—"}</p>
          </div>
          <div className="rounded-xl border border-[#0000BF]/20 bg-[#0000BF]/5 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-wide text-[#4d47b6]">ประมาณการครั้งนี้</p>
            <p className="mt-0.5 text-sm font-bold text-[#1e1b3a]">{currentLabel || "—"}</p>
            <p className="text-xs text-slate-600">{currentDateRange || "—"}</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-[720px] w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-[11px] text-slate-600">
                <th className="border-b border-slate-200 px-2 py-2 font-bold">ที่</th>
                <th className="border-b border-slate-200 px-2 py-2 font-bold">รายการ</th>
                <th className="border-b border-slate-200 px-2 py-2 text-right font-bold">จำนวนคน</th>
                <th className="border-b border-slate-200 px-2 py-2 text-right font-bold">อัตรา</th>
                <th className="border-b border-slate-200 px-2 py-2 text-right font-bold">ประมาณการครั้งนี้</th>
                <th className="border-b border-slate-200 px-2 py-2 text-right font-bold">ประมาณการก่อนหน้า</th>
                <th className="border-b border-slate-200 px-2 py-2 text-right font-bold">ผลต่าง</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const current = line.includeInTotal === false ? NaN : lineCurrentAmount(line);
                const previous = parseLooseNumber(line.previousAmount);
                const delta =
                  Number.isFinite(current) && Number.isFinite(previous) ? current - previous : NaN;
                const isGroup = line.kind === "GROUP";
                const isItem = isEstimateItemLine(line);
                return (
                  <tr
                    key={`${line.kind}-${line.groupCode}-${line.itemCode}-${line.sortOrder}`}
                    className={isGroup ? "bg-[#faf9ff]" : ""}
                  >
                    <td className="border-b border-slate-100 px-2 py-1.5 font-mono text-[11px] text-slate-500">
                      {line.itemCode || line.groupCode}
                    </td>
                    <td
                      className={`border-b border-slate-100 py-1.5 ${
                        isGroup ? "px-2 font-black text-[#1e1b3a]" : isItem ? "pl-8 pr-2 text-slate-800" : "px-2 text-slate-800"
                      }`}
                    >
                      {line.name}
                      {line.payoutMethod ? (
                        <span className="ml-2 text-[10px] font-medium text-slate-500">{line.payoutMethod}</span>
                      ) : null}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-1.5 text-right tabular-nums">
                      {isItem ? formatInt(line.quantity, "") : ""}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-1.5 text-right tabular-nums">
                      {isItem ? formatBaht(line.unitPrice, { empty: "" }) : ""}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-1.5 text-right tabular-nums font-semibold">
                      {line.includeInTotal === false ? "" : formatBaht(current)}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-1.5 text-right tabular-nums text-slate-600">
                      {line.includeInTotal === false ? "" : formatBaht(previous, { empty: "—" })}
                    </td>
                    <td
                      className={`border-b border-slate-100 px-2 py-1.5 text-right tabular-nums ${deltaClass(delta)}`}
                    >
                      {Number.isFinite(delta) ? formatBaht(delta) : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm sm:grid-cols-2">
          <p>
            ยอดใช้จ่าย (ปัดกลม){" "}
            <span className="font-black tabular-nums">{formatBaht(totals.roundedSpend)}</span>
          </p>
          <p className="text-slate-600">
            ประมาณการก่อนหน้า{" "}
            <span className="font-semibold tabular-nums">
              {formatBaht(totals.previousApproval - totals.previousReserve)}
            </span>
          </p>
          <p>
            สำรองค่าใช้จ่าย{" "}
            <span className="font-black tabular-nums">{formatBaht(totals.reserveAmount)}</span>
          </p>
          <p className="text-slate-600">
            ประมาณการก่อนหน้า{" "}
            <span className="font-semibold tabular-nums">{formatBaht(totals.previousReserve)}</span>
          </p>
          <p className="sm:col-span-2 text-base">
            รวมขออนุมัติครั้งนี้{" "}
            <span className="font-black tabular-nums text-[#0000BF]">{formatBaht(totals.approvalTotal)}</span>
            <span className="ml-3 text-sm font-medium text-slate-600">
              ประมาณการก่อนหน้า {formatBaht(totals.previousApproval)}
            </span>
          </p>
        </div>

        {notes.trim() ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950 whitespace-pre-wrap">
            <p className="mb-1 font-black">หมายเหตุ</p>
            {notes}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
