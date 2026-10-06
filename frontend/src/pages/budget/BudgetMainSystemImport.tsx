import { Fragment, useMemo, useState } from "react";
import { toolbarPrimaryBtnClass } from "../../lib/uiTokens";
import { formatBaht, formatPct, kindLabel, pctToneClass, type BudgetKind } from "./budgetFormat";

export type BudgetImportBatch = {
  id: string;
  yearBe: number;
  asOfDate: string;
  fileName: string | null;
  unitLabel: string | null;
  createdAt: string;
};

export type BudgetImportRow = {
  id: string;
  sortOrder: number;
  rowType: "TOTAL" | "SECTION" | "GROUP" | "ITEM";
  kind: "EXPENSE" | "CAPEX" | "OTHER" | null;
  code: string | null;
  name: string;
  ciCode: string | null;
  parentCi: string | null;
  yearLineId: string | null;
  approved: number;
  carryIn: number;
  midYear: number;
  netBudget: number;
  spent: number;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  pr: number;
  po: number;
  reserved: number;
  carryOut: number;
  earmark: number;
  remaining: number;
  pctSpent: number | null;
  commitmentTotal: number;
  commitmentYears: { yearAd: number; amount: number }[];
};

export type BudgetImportData = {
  batch: BudgetImportBatch | null;
  rows: BudgetImportRow[];
  history: BudgetImportBatch[];
};

export type BudgetImportResult = {
  batch: BudgetImportBatch;
  totalRows: number;
  itemCount: number;
  matchedCount: number;
  matchedItemCount: number;
  createdItems?: { code: string | null; name: string; ciCode: string | null; categoryName: string | null }[];
  missingInFile?: { name: string; ciCode: string | null; kind: string; netBudget: number }[];
  unmatched: {
    code: string | null;
    name: string;
    ciCode: string | null;
    kind: string | null;
    spent: number;
    netBudget: number;
  }[];
};

export type Quarter = 1 | 2 | 3 | 4;
const QUARTERS: Quarter[] = [1, 2, 3, 4];
const QUARTER_MONTHS: Record<Quarter, string> = {
  1: "ม.ค. – มี.ค.",
  2: "เม.ย. – มิ.ย.",
  3: "ก.ค. – ก.ย.",
  4: "ต.ค. – ธ.ค.",
};

function qOf(row: BudgetImportRow, q: Quarter): number {
  return q === 1 ? row.q1 : q === 2 ? row.q2 : q === 3 ? row.q3 : row.q4;
}

export function formatThaiDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

function rowLabel(row: BudgetImportRow): string {
  return row.code ? `${row.code} ${row.name}` : row.name;
}

/** แถบเบิกจ่ายรายไตรมาสของหมวดที่กำลังดู — คลิกเพื่อดูรายการที่จ่ายในไตรมาสนั้น */
export function BudgetQuarterStrip({
  data,
  kind,
  onOpenQuarter,
}: {
  data: BudgetImportData;
  kind: BudgetKind;
  onOpenQuarter: (q: Quarter) => void;
}) {
  const section = data.rows.find((r) => r.rowType === "SECTION" && r.kind === kind);
  if (!data.batch || !section) return null;
  const maxQ = Math.max(...QUARTERS.map((q) => Math.abs(qOf(section, q))), 1);

  return (
    <section className="overflow-hidden rounded-[1.25rem] border border-[#e8e6fc] bg-white/90">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ecebff] bg-gradient-to-r from-[#faf9ff] to-[#fdf2f8] px-3 py-2">
        <h2 className="text-xs font-black text-[#1e1b4b]">
          เบิกจ่ายรายไตรมาส · {kindLabel(kind)}
          <span className="ml-1.5 text-[11px] font-bold text-slate-500">
            (ระบบหลัก ณ {formatThaiDate(data.batch.asOfDate)})
          </span>
        </h2>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
          <span>
            งบสุทธิ <b className="tabular-nums text-[#1e1b4b]">{formatBaht(section.netBudget)}</b>
          </span>
          <span>
            PR <b className="tabular-nums text-[#1e1b4b]">{formatBaht(section.pr)}</b>
          </span>
          <span>
            PO <b className="tabular-nums text-[#1e1b4b]">{formatBaht(section.po)}</b>
          </span>
          <span>
            กันเงิน <b className="tabular-nums text-[#1e1b4b]">{formatBaht(section.reserved)}</b>
          </span>
          <span>
            คงเหลือ <b className="tabular-nums text-[#1e1b4b]">{formatBaht(section.remaining)}</b>
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3 lg:grid-cols-4">
        {QUARTERS.map((q) => {
          const amount = qOf(section, q);
          const share = section.netBudget > 0 ? amount / section.netBudget : null;
          return (
            <button
              key={q}
              type="button"
              onClick={() => onOpenQuarter(q)}
              className="group rounded-xl border border-[#e8e6fc] bg-white px-3 py-2 text-left transition hover:border-[#0000BF]/30 hover:bg-[#0000BF]/[0.03]"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-black text-[#4d47b6]">ไตรมาส {q}</span>
                <span className="text-[10px] text-slate-400">{QUARTER_MONTHS[q]}</span>
              </div>
              <div className="mt-0.5 text-base font-black tabular-nums text-[#1e1b4b]">{formatBaht(amount)}</div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899]"
                  style={{ width: `${Math.min(100, (Math.abs(amount) / maxQ) * 100)}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                <span>{formatPct(share)} ของงบสุทธิ</span>
                <span className="font-bold text-[#4d47b6] opacity-0 transition group-hover:opacity-100">ดูรายการ →</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** รายการที่เบิกจ่ายในไตรมาสที่เลือก จัดกลุ่มตาม Superior CI */
export function BudgetQuarterModal({
  data,
  kind,
  quarter,
  onChangeQuarter,
  onClose,
}: {
  data: BudgetImportData;
  kind: BudgetKind;
  quarter: Quarter;
  onChangeQuarter: (q: Quarter) => void;
  onClose: () => void;
}) {
  const [showZero, setShowZero] = useState(false);
  const groups = useMemo(() => {
    const kindRows = data.rows.filter((r) => r.kind === kind);
    return kindRows
      .filter((r) => r.rowType === "GROUP")
      .map((g) => ({
        group: g,
        items: kindRows.filter((r) => r.rowType === "ITEM" && r.parentCi === g.ciCode),
      }));
  }, [data.rows, kind]);
  const section = data.rows.find((r) => r.rowType === "SECTION" && r.kind === kind);
  const total = section ? qOf(section, quarter) : groups.reduce((s, g) => s + qOf(g.group, quarter), 0);
  const visible = groups
    .map((g) => ({ ...g, items: showZero ? g.items : g.items.filter((i) => qOf(i, quarter) !== 0) }))
    .filter((g) => showZero || qOf(g.group, quarter) !== 0 || g.items.length);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-3 sm:items-center print:hidden" onClick={onClose}>
      <div
        className="flex max-h-[min(94vh,56rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#e8e6fc] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[#ecebff] bg-gradient-to-r from-[#faf9ff] via-white to-[#fdf2f8] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#4d47b6]">
                {kindLabel(kind)} · ระบบหลัก ณ {data.batch ? formatThaiDate(data.batch.asOfDate) : "—"}
              </div>
              <h2 className="mt-1 text-base font-black text-[#1e1b4b]">
                เบิกจ่ายไตรมาส {quarter} ({QUARTER_MONTHS[quarter]})
              </h2>
              <div className="mt-1 text-sm font-black tabular-nums text-[#0000BF]">รวม {formatBaht(total)} บาท</div>
            </div>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-sm font-bold text-[#4d47b6] hover:bg-[#0000BF]/8"
              onClick={onClose}
            >
              ปิด
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {QUARTERS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onChangeQuarter(q)}
                className={`rounded-lg px-3 py-1 text-xs font-black transition ${
                  q === quarter
                    ? "bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-white shadow"
                    : "border border-[#e8e6fc] bg-white text-[#4d47b6] hover:bg-[#0000BF]/5"
                }`}
              >
                Q{q}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-600">
              <input type="checkbox" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} />
              แสดงรายการที่ไม่มีการเบิกจ่าย
            </label>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {visible.length ? (
            <ul className="overflow-hidden rounded-xl border border-[#e8e6fc] divide-y divide-[#ecebff]">
              {visible.map(({ group, items }) => (
                <Fragment key={group.id}>
                  <li className="flex items-center justify-between gap-3 bg-[#faf9ff] px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-[12px] font-bold text-[#1e1b4b]">{rowLabel(group)}</div>
                      <div className="font-mono text-[10px] text-slate-400">{group.ciCode}</div>
                    </div>
                    <div className="shrink-0 text-right text-[12px] font-black tabular-nums text-[#1e1b4b]">
                      {formatBaht(qOf(group, quarter))}
                    </div>
                  </li>
                  {items.map((it) => {
                    const amount = qOf(it, quarter);
                    return (
                      <li key={it.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                        <div className="min-w-0 border-l-2 border-[#c4b5fd] pl-3">
                          <div className="text-[12px] font-semibold text-[#6d28d9]">{rowLabel(it)}</div>
                          <div className="font-mono text-[10px] text-slate-400">{it.ciCode}</div>
                        </div>
                        <div className="shrink-0 text-right text-[11px] leading-tight">
                          <div className={`font-semibold tabular-nums ${amount ? "text-slate-800" : "text-slate-400"}`}>
                            {formatBaht(amount)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            สะสม {formatBaht(it.spent)} / {formatBaht(it.netBudget)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </Fragment>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">ไม่มีการเบิกจ่ายในไตรมาสนี้</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** รายละเอียดจากระบบหลักของรายการเดียว — ใช้ในลิ้นชักรายการ */
export function BudgetImportRowBreakdown({ row, asOfDate }: { row: BudgetImportRow; asOfDate: string | null }) {
  const maxQ = Math.max(...QUARTERS.map((q) => Math.abs(qOf(row, q))), 1);
  const cell = (label: string, value: number, strong = false) => (
    <div className="rounded-lg border border-[#ecebff] bg-white px-2.5 py-1.5">
      <div className="text-[10px] font-bold text-slate-500">{label}</div>
      <div className={`tabular-nums ${strong ? "font-black text-[#1e1b4b]" : "font-semibold text-slate-700"}`}>
        {formatBaht(value)}
      </div>
    </div>
  );
  return (
    <section className="space-y-2 rounded-xl border border-[#e8e6fc] bg-[#faf9ff]/80 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-black uppercase tracking-wide text-[#66638c]">ข้อมูลจากระบบหลัก</h3>
        {asOfDate ? <span className="text-[11px] text-slate-500">ณ {formatThaiDate(asOfDate)}</span> : null}
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-sm">
        {cell("งบที่ได้รับอนุมัติ", row.approved)}
        {cell("งบเหลื่อมปี", row.carryIn)}
        {cell("งบจัดสรรระหว่างปี", row.midYear)}
        {cell("งบสุทธิ", row.netBudget, true)}
      </div>
      <div className="rounded-lg border border-[#ecebff] bg-white p-2.5">
        <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
          <span className="font-bold text-slate-500">เบิกจ่ายรายไตรมาส</span>
          <span className={`font-black tabular-nums ${pctToneClass(row.pctSpent)}`}>
            รวม {formatBaht(row.spent)} ({formatPct(row.pctSpent)})
          </span>
        </div>
        <ul className="space-y-1">
          {QUARTERS.map((q) => {
            const amount = qOf(row, q);
            return (
              <li key={q} className="grid grid-cols-[2rem_minmax(0,1fr)_6.5rem] items-center gap-2 text-[11px]">
                <span className="font-black text-[#4d47b6]">Q{q}</span>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899]"
                    style={{ width: `${Math.min(100, (Math.abs(amount) / maxQ) * 100)}%` }}
                  />
                </div>
                <span className={`text-right tabular-nums ${amount ? "font-semibold text-slate-800" : "text-slate-400"}`}>
                  {formatBaht(amount)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-sm">
        {cell("PR", row.pr)}
        {cell("PO", row.po)}
        {cell("กันเงิน งปม.", row.reserved)}
        {row.carryOut ? cell("ยกไปเหลื่อมปี", row.carryOut) : null}
        {row.earmark ? cell("Earmark", row.earmark) : null}
        {cell("งบคงเหลือ", row.remaining, true)}
      </div>
      {row.commitmentTotal ? (
        <p className="text-[10px] text-slate-500">
          มีงบผูกพันปีถัดไป {formatBaht(row.commitmentTotal)} บาท — ดูรายละเอียดที่หน้า “งบผูกพัน”
        </p>
      ) : null}
    </section>
  );
}

function commitmentYearsOf(rows: BudgetImportRow[]): number[] {
  const years = new Set<number>();
  for (const r of rows) for (const c of r.commitmentYears) years.add(c.yearAd);
  return [...years].sort((a, b) => a - b);
}

function commitmentAmount(row: BudgetImportRow, yearAd: number): number {
  return row.commitmentYears.find((c) => c.yearAd === yearAd)?.amount ?? 0;
}

/** หน้างบผูกพัน: งบผูกพันปีถัดไปจากระบบหลัก แยกรายปี + เทียบกับสัญญา (PO) ปีนี้ */
export function BudgetCommitmentPanel({
  data,
  onOpenRow,
}: {
  data: BudgetImportData;
  onOpenRow?: (row: BudgetImportRow) => void;
}) {
  const items = useMemo(
    () => data.rows.filter((r) => r.rowType === "ITEM" && Math.abs(r.commitmentTotal) > 0.004),
    [data.rows],
  );
  const groupName = useMemo(
    () => new Map(data.rows.filter((r) => r.rowType === "GROUP" && r.ciCode).map((g) => [g.ciCode!, g.name])),
    [data.rows],
  );
  if (!data.batch) return null;
  const years = commitmentYearsOf(items);
  const total = items.reduce((s, r) => s + r.commitmentTotal, 0);
  const totalRow = data.rows.find((r) => r.rowType === "TOTAL");
  const fileTotal = totalRow?.commitmentTotal ?? total;
  const reconciled = Math.abs(fileTotal - total) < 1;

  return (
    <section className="overflow-hidden rounded-[1.25rem] border border-[#e8e6fc] bg-white/90">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ecebff] bg-gradient-to-r from-[#faf9ff] to-[#fdf2f8] px-3 py-2">
        <h2 className="text-xs font-black text-[#1e1b4b]">
          งบผูกพันปีถัดไปจากระบบหลัก
          <span className="ml-1.5 text-[11px] font-bold text-slate-500">(ณ {formatThaiDate(data.batch.asOfDate)})</span>
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
            reconciled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"
          }`}
        >
          {reconciled ? "ยอดตรงกับระบบหลัก" : `ต่างจากยอดรวมไฟล์ ${formatBaht(fileTotal - total)}`}
        </span>
      </div>

      <div className="space-y-3 p-3">
        <div className={`grid gap-2 ${years.length > 2 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-3"}`}>
          <div className="rounded-xl border border-[#e8e6fc] bg-white px-3 py-2">
            <div className="text-[10px] font-bold text-slate-500">งบผูกพันรวม</div>
            <div className="text-lg font-black tabular-nums text-[#0000BF]">{formatBaht(total)}</div>
            <div className="text-[10px] text-slate-500">{items.length} รายการ</div>
          </div>
          {years.map((y) => {
            const amount = items.reduce((s, r) => s + commitmentAmount(r, y), 0);
            return (
              <div key={y} className="rounded-xl border border-[#e8e6fc] bg-white px-3 py-2">
                <div className="text-[10px] font-bold text-slate-500">ผูกพันปี {y + 543}</div>
                <div className="text-lg font-black tabular-nums text-[#1e1b4b]">{formatBaht(amount)}</div>
                <div className="text-[10px] text-slate-500">{formatPct(total ? amount / total : null)} ของทั้งหมด</div>
              </div>
            );
          })}
        </div>

        {items.length ? (
          <div className="overflow-x-auto rounded-xl border border-[#e8e6fc]">
            <table className="w-full min-w-[44rem] text-[11px]">
              <thead className="bg-[#faf9ff] text-[10px] font-black uppercase tracking-wide text-[#66638c]">
                <tr>
                  <th className="px-3 py-2 text-left">รายการ</th>
                  <th className="px-2 py-2 text-right">ปีนี้: งบสุทธิ / PO</th>
                  {years.map((y) => (
                    <th key={y} className="px-2 py-2 text-right">
                      ปี {y + 543}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">รวมผูกพัน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ecebff]">
                {items.map((r) => (
                  <tr
                    key={r.id}
                    className={onOpenRow ? "cursor-pointer hover:bg-[#0000BF]/[0.03]" : ""}
                    onClick={() => onOpenRow?.(r)}
                  >
                    <td className="px-3 py-1.5">
                      <div className="font-semibold text-[#1e1b4b]">{rowLabel(r)}</div>
                      <div className="text-[10px] text-slate-400">
                        <span className="font-mono">{r.ciCode}</span>
                        {r.parentCi && groupName.get(r.parentCi) ? ` · ${groupName.get(r.parentCi)}` : ""}
                        {r.kind === "EXPENSE" || r.kind === "CAPEX" ? ` · ${kindLabel(r.kind)}` : ""}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                      {formatBaht(r.netBudget)}
                      <div className="text-[10px] text-violet-700">PO {formatBaht(r.po)}</div>
                    </td>
                    {years.map((y) => {
                      const v = commitmentAmount(r, y);
                      return (
                        <td key={y} className={`px-2 py-1.5 text-right tabular-nums ${v ? "text-slate-800" : "text-slate-300"}`}>
                          {v ? formatBaht(v) : "—"}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-right font-black tabular-nums text-[#0000BF]">{formatBaht(r.commitmentTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#faf9ff] font-black">
                <tr>
                  <td className="px-3 py-2 text-[#1e1b4b]">รวม</td>
                  <td className="px-2 py-2" />
                  {years.map((y) => (
                    <td key={y} className="px-2 py-2 text-right tabular-nums text-[#1e1b4b]">
                      {formatBaht(items.reduce((s, r) => s + commitmentAmount(r, y), 0))}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums text-[#0000BF]">{formatBaht(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-slate-500">ไม่มีงบผูกพันปีถัดไปในไฟล์ระบบหลัก</p>
        )}
        <p className="text-[10px] leading-snug text-slate-500">
          งบผูกพัน = วงเงินสัญญาหลายปีที่ต้องจ่ายในปีถัดไป (ยังไม่นับในงบปีนี้) — ปีถัดไปต้องตั้งงบประจำปีรองรับยอดเหล่านี้
        </p>
      </div>
    </section>
  );
}

/** ลิ้นชักรายการในหน้างบผูกพัน */
export function BudgetCommitmentBreakdown({ row, asOfDate }: { row: BudgetImportRow; asOfDate: string | null }) {
  return (
    <section className="space-y-2 rounded-xl border border-[#e8e6fc] bg-[#faf9ff]/80 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-black uppercase tracking-wide text-[#66638c]">งบผูกพันจากระบบหลัก</h3>
        {asOfDate ? <span className="text-[11px] text-slate-500">ณ {formatThaiDate(asOfDate)}</span> : null}
      </div>
      <div className="rounded-lg border border-[#ecebff] bg-white px-2.5 py-1.5">
        <div className="text-[10px] font-bold text-slate-500">งบผูกพัน (รวม)</div>
        <div className="text-base font-black tabular-nums text-[#0000BF]">{formatBaht(row.commitmentTotal)}</div>
      </div>
      {row.commitmentYears.length ? (
        <ul className="space-y-1 text-[12px]">
          {row.commitmentYears.map((c) => (
            <li key={c.yearAd} className="flex justify-between rounded-lg border border-[#ecebff] bg-white px-2.5 py-1">
              <span className="font-bold text-[#4d47b6]">ปี {c.yearAd + 543}</span>
              <span className="font-semibold tabular-nums">{formatBaht(c.amount)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid grid-cols-3 gap-1.5 text-[11px]">
        <div className="rounded-lg border border-[#ecebff] bg-white px-2 py-1">
          <div className="text-[10px] text-slate-500">งบสุทธิปีนี้</div>
          <div className="font-semibold tabular-nums">{formatBaht(row.netBudget)}</div>
        </div>
        <div className="rounded-lg border border-[#ecebff] bg-white px-2 py-1">
          <div className="text-[10px] text-slate-500">เบิกปีนี้</div>
          <div className="font-semibold tabular-nums">{formatBaht(row.spent)}</div>
        </div>
        <div className="rounded-lg border border-[#ecebff] bg-white px-2 py-1">
          <div className="text-[10px] text-slate-500">PO ปีนี้</div>
          <div className="font-semibold tabular-nums">{formatBaht(row.po)}</div>
        </div>
      </div>
    </section>
  );
}

/** ความเคลื่อนไหวงบของหมวด: อนุมัติ → เหลื่อมปี → จัดสรรระหว่างปี → สุทธิ → เบิกจ่าย/ผูกพัน → คงเหลือ + ตรวจยอดกับระบบเรา */
export function BudgetMovementPanel({
  data,
  kind,
  systemNet,
  systemSpent,
}: {
  data: BudgetImportData;
  kind: BudgetKind;
  systemNet: number;
  systemSpent: number;
}) {
  const [open, setOpen] = useState(true);
  const section = data.rows.find((r) => r.rowType === "SECTION" && r.kind === kind);
  const groupByCi = useMemo(
    () => new Map(data.rows.filter((r) => r.rowType === "GROUP" && r.ciCode).map((g) => [g.ciCode!, g])),
    [data.rows],
  );
  const moves = useMemo(
    () =>
      data.rows
        .filter((r) => r.rowType === "ITEM" && r.kind === kind && Math.abs(r.midYear) > 0.004)
        .sort((a, b) => b.midYear - a.midYear),
    [data.rows, kind],
  );
  if (!data.batch || !section) return null;

  const committed = section.pr + section.po + section.reserved;
  const other = section.carryOut + section.earmark;
  const moveIn = moves.filter((m) => m.midYear > 0).reduce((s, m) => s + m.midYear, 0);
  const moveOut = moves.filter((m) => m.midYear < 0).reduce((s, m) => s + m.midYear, 0);
  const netDiff = Math.round((systemNet - section.netBudget) * 100) / 100;
  const spentDiff = Math.round((systemSpent - section.spent) * 100) / 100;
  const reconciled = Math.abs(netDiff) < 1 && Math.abs(spentDiff) < 1;
  const recharge = data.rows.find((r) => r.rowType === "GROUP" && r.kind === "OTHER");

  const steps: { label: string; value: number; sign: string; tone: string }[] = [
    { label: "งบที่ได้รับอนุมัติ", value: section.approved, sign: "", tone: "text-[#1e1b4b]" },
    { label: "งบเหลื่อมปี", value: section.carryIn, sign: "+", tone: "text-sky-700" },
    { label: "จัดสรรระหว่างปี", value: section.midYear, sign: section.midYear < 0 ? "−" : "+", tone: "text-violet-700" },
    { label: "งบสุทธิ", value: section.netBudget, sign: "=", tone: "text-[#0000BF]" },
    { label: "เบิกจ่ายแล้ว", value: section.spent, sign: "−", tone: "text-rose-700" },
    { label: "ผูกพัน (PR+PO+กันเงิน)", value: committed, sign: "−", tone: "text-amber-700" },
    ...(other ? [{ label: "ยกไปเหลื่อมปี/Earmark", value: other, sign: "−", tone: "text-slate-600" }] : []),
    { label: "งบคงเหลือ", value: section.remaining, sign: "=", tone: "text-emerald-700" },
  ];

  return (
    <section className="overflow-hidden rounded-[1.25rem] border border-[#e8e6fc] bg-white/90">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center justify-between gap-2 border-b border-[#ecebff] bg-gradient-to-r from-[#faf9ff] to-[#fdf2f8] px-3 py-2 text-left"
      >
        <h2 className="text-xs font-black text-[#1e1b4b]">
          ความเคลื่อนไหวงบ · {kindLabel(kind)}
          <span className="ml-1.5 text-[11px] font-bold text-slate-500">(ระบบหลัก ณ {formatThaiDate(data.batch.asOfDate)})</span>
        </h2>
        <span className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
              reconciled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"
            }`}
          >
            {reconciled ? "ยอดตรงกับระบบหลัก" : "ยอดยังไม่ตรง"}
          </span>
          <span className="text-[11px] font-bold text-[#4d47b6]">{open ? "ซ่อน" : "แสดง"}</span>
        </span>
      </button>
      {open ? (
        <div className="space-y-3 p-3">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-8">
            {steps.map((s) => (
              <div key={s.label} className="rounded-xl border border-[#ecebff] bg-white px-2.5 py-1.5">
                <div className="text-[10px] font-bold leading-tight text-slate-500">
                  {s.sign ? <span className="mr-0.5 font-black">{s.sign}</span> : null}
                  {s.label}
                </div>
                <div className={`text-sm font-black tabular-nums ${s.tone}`}>{formatBaht(Math.abs(s.value))}</div>
              </div>
            ))}
          </div>

          {!reconciled ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
              งบสุทธิในระบบ {formatBaht(systemNet)} (ต่าง {formatBaht(netDiff)}) · ใช้ไปในระบบ {formatBaht(systemSpent)} (ต่าง{" "}
              {formatBaht(spentDiff)}) — นำเข้าไฟล์ล่าสุดอีกครั้งเพื่อปรับยอด
            </p>
          ) : null}

          <div>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[11px] font-black uppercase tracking-wide text-[#66638c]">
                จัดสรรระหว่างปี ({moves.length} รายการ)
              </h3>
              <div className="flex flex-wrap gap-x-3 text-[11px] text-slate-600">
                <span>
                  รับเพิ่ม <b className="tabular-nums text-emerald-700">+{formatBaht(moveIn)}</b>
                </span>
                <span>
                  โอนออก/ลด <b className="tabular-nums text-rose-700">−{formatBaht(Math.abs(moveOut))}</b>
                </span>
                <span>
                  สุทธิ{" "}
                  <b className={`tabular-nums ${moveIn + moveOut >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {moveIn + moveOut >= 0 ? "+" : "−"}
                    {formatBaht(Math.abs(moveIn + moveOut))}
                  </b>
                </span>
              </div>
            </div>
            {moves.length ? (
              <ul className="overflow-hidden rounded-xl border border-[#e8e6fc] divide-y divide-[#ecebff]">
                {moves.map((m) => {
                  const g = m.parentCi ? groupByCi.get(m.parentCi) : undefined;
                  return (
                    <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-[#1e1b4b]">{rowLabel(m)}</div>
                        <div className="text-[10px] text-slate-400">
                          {g ? rowLabel(g) : ""} · อนุมัติ {formatBaht(m.approved)} → สุทธิ {formatBaht(m.netBudget)}
                        </div>
                      </div>
                      <div
                        className={`shrink-0 text-right text-[12px] font-black tabular-nums ${
                          m.midYear > 0 ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {m.midYear > 0 ? "+" : "−"}
                        {formatBaht(Math.abs(m.midYear))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[11px] text-slate-500">ไม่มีการจัดสรรระหว่างปีในหมวดนี้</p>
            )}
          </div>

          {recharge ? (
            <p className="text-[10px] leading-snug text-slate-500">
              หมายเหตุ: “{recharge.name}” ({formatBaht(recharge.netBudget)} · เบิก {formatBaht(recharge.spent)}) เป็นรายการหักกลบทางบัญชี
              ไม่นับรวมในงบประมาณรายจ่ายประจำของฝ่าย
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export type AvailabilityStatus = "OVER" | "NEEDED" | "IDLE" | "SAVINGS" | "DONE";

export const AVAILABILITY_META: Record<
  AvailabilityStatus,
  { label: string; hint: string; chip: string; amountTone: string }
> = {
  OVER: {
    label: "เกินงบ — ต้องถัวเข้า",
    hint: "เบิก/ผูกพันเกินงบสุทธิ ต้องหาเงินจากรายการอื่นมาถัว",
    chip: "bg-rose-100 text-rose-700 ring-rose-200",
    amountTone: "text-rose-700",
  },
  NEEDED: {
    label: "เหลือแต่ต้องใช้ต่อ",
    hint: "รายจ่ายประจำ (ไม่มี PO) — คาดว่าต้องใช้เงินคงเหลือจนสิ้นปีตามอัตราเฉลี่ยรายไตรมาส",
    chip: "bg-amber-100 text-amber-800 ring-amber-200",
    amountTone: "text-amber-700",
  },
  IDLE: {
    label: "ยังไม่เริ่มใช้",
    hint: "ยังไม่มีเบิกจ่าย PR PO หรือกันเงิน — ถ้าไม่มีแผนใช้ในปีนี้ ถัวไปรายการอื่นได้ทั้งก้อน",
    chip: "bg-sky-100 text-sky-700 ring-sky-200",
    amountTone: "text-sky-700",
  },
  SAVINGS: {
    label: "มีเงินเหลือ — ใช้ต่อ/ถัวได้",
    hint: "เริ่มใช้หรือจัดซื้อแล้ว แต่ยังเหลือเงิน (รวมเงินเหลือจ่ายหลังทำสัญญา)",
    chip: "bg-emerald-100 text-emerald-700 ring-emerald-200",
    amountTone: "text-emerald-700",
  },
  DONE: {
    label: "ใช้/ผูกพันครบแล้ว",
    hint: "เบิกจ่ายหรือผูกพันเกือบเต็มงบ ไม่มีเงินเหลือให้ถัว",
    chip: "bg-slate-100 text-slate-600 ring-slate-200",
    amountTone: "text-slate-500",
  },
};

const AVAILABILITY_ORDER: AvailabilityStatus[] = ["OVER", "NEEDED", "IDLE", "SAVINGS", "DONE"];

/**
 * ประมาณยอดที่ยังต้องจ่ายจนสิ้นปี เฉพาะรายจ่ายประจำที่ไม่มี PO/PR (เช่น OT เบี้ยเลี้ยง)
 * = ค่าเฉลี่ยไตรมาสที่ผ่านมา × ไตรมาสที่เหลือ (หักยอดที่จ่ายไปแล้วในไตรมาสปัจจุบัน) — ปีงบ = ปีปฏิทิน
 */
function projectedNeed(r: BudgetImportRow, asOf: Date): number {
  if (r.kind !== "EXPENSE" || r.po + r.pr > 0) return 0;
  const qs = [r.q1, r.q2, r.q3, r.q4];
  const current = Math.min(3, Math.floor(asOf.getMonth() / 3));
  if (current === 0) return 0;
  const avg = qs.slice(0, current).reduce((s, v) => s + v, 0) / current;
  if (avg <= 0) return 0;
  return Math.max(0, avg - qs[current]) + avg * (3 - current);
}

export type AvailabilityItem = { row: BudgetImportRow; status: AvailabilityStatus; need: number; free: number };

export function availabilityOf(r: BudgetImportRow, asOf: Date): AvailabilityItem {
  const tolerance = Math.max(100, Math.abs(r.netBudget) * 0.005);
  if (r.remaining < -0.004) return { row: r, status: "OVER", need: 0, free: r.remaining };
  if (r.remaining <= tolerance) return { row: r, status: "DONE", need: 0, free: 0 };
  const need = projectedNeed(r, asOf);
  const free = r.remaining - need;
  if (free <= tolerance) return { row: r, status: "NEEDED", need, free };
  const activity = r.spent + r.pr + r.po + r.reserved + r.earmark + r.carryOut;
  return { row: r, status: Math.abs(activity) < 0.005 ? "IDLE" : "SAVINGS", need, free };
}

/** แถบสัดส่วน: เบิกแล้ว | PO | PR+กันเงิน | คงเหลือ */
export function UsageBar({ row }: { row: BudgetImportRow }) {
  const parts = [
    { v: row.spent, cls: "bg-[#0000BF]" },
    { v: row.po, cls: "bg-violet-500" },
    { v: row.pr + row.reserved + row.earmark + row.carryOut, cls: "bg-amber-400" },
    { v: Math.max(0, row.remaining), cls: "bg-emerald-300" },
  ];
  const total = parts.reduce((s, p) => s + Math.max(0, p.v), 0);
  if (total <= 0) return <div className="h-2 rounded-full bg-slate-100" />;
  return (
    <div className={`flex h-2 overflow-hidden rounded-full bg-slate-100 ${row.remaining < 0 ? "ring-1 ring-rose-400" : ""}`}>
      {parts.map((p, i) =>
        p.v > 0 ? <div key={i} className={p.cls} style={{ width: `${(p.v / total) * 100}%` }} /> : null,
      )}
    </div>
  );
}

/** งบรายการไหนใช้/จัดซื้อแล้ว และเหลือเท่าไรสำหรับใช้ต่อหรือถัว */
export function BudgetAvailabilityPanel({
  data,
  kind,
  onOpenRow,
}: {
  data: BudgetImportData;
  kind: BudgetKind;
  onOpenRow?: (row: BudgetImportRow) => void;
}) {
  const [open, setOpen] = useState(true);
  const [statusFilter, setStatusFilter] = useState<AvailabilityStatus | "ALL">("ALL");
  const [query, setQuery] = useState("");

  const asOfIso = data.batch?.asOfDate ?? null;
  const items = useMemo(() => {
    const asOf = asOfIso ? new Date(asOfIso) : new Date();
    return data.rows
      .filter((r) => r.rowType === "ITEM" && r.kind === kind && (r.netBudget !== 0 || r.spent !== 0 || r.remaining !== 0))
      .map((r) => availabilityOf(r, asOf));
  }, [data.rows, kind, asOfIso]);
  const groupName = useMemo(
    () => new Map(data.rows.filter((r) => r.rowType === "GROUP" && r.ciCode).map((g) => [g.ciCode!, g.name])),
    [data.rows],
  );
  if (!data.batch || !items.length) return null;

  const totals = AVAILABILITY_ORDER.map((s) => {
    const list = items.filter((i) => i.status === s);
    const amount =
      s === "NEEDED" ? list.reduce((a, i) => a + i.row.remaining, 0) : list.reduce((a, i) => a + i.free, 0);
    return { status: s, count: list.length, amount };
  });
  const freeAmount = totals.filter((t) => t.status === "IDLE" || t.status === "SAVINGS").reduce((a, t) => a + t.amount, 0);
  const overAmount = Math.abs(totals.find((t) => t.status === "OVER")?.amount ?? 0);
  const asOf = new Date(data.batch.asOfDate);
  const lastQuarter = asOf.getMonth() >= 9;

  const q = query.trim().toLowerCase();
  const visible = items
    .filter((i) => statusFilter === "ALL" || i.status === statusFilter)
    .filter((i) => !q || `${i.row.code ?? ""} ${i.row.name} ${i.row.ciCode ?? ""}`.toLowerCase().includes(q));

  return (
    <section className="overflow-hidden rounded-[1.25rem] border border-[#e8e6fc] bg-white/90">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center justify-between gap-2 border-b border-[#ecebff] bg-gradient-to-r from-[#faf9ff] to-[#fdf2f8] px-3 py-2 text-left"
      >
        <h2 className="text-xs font-black text-[#1e1b4b]">
          งบคงเหลือ / ถัวได้ · {kindLabel(kind)}
          <span className="ml-1.5 text-[11px] font-bold text-slate-500">(ระบบหลัก ณ {formatThaiDate(data.batch.asOfDate)})</span>
        </h2>
        <span className="flex items-center gap-2 text-[11px]">
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-black text-emerald-700">
            ถัวได้ {formatBaht(freeAmount)}
          </span>
          {overAmount ? (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 font-black text-rose-700">ต้องถัวเข้า {formatBaht(overAmount)}</span>
          ) : null}
          <span className="font-bold text-[#4d47b6]">{open ? "ซ่อน" : "แสดง"}</span>
        </span>
      </button>

      {open ? (
        <div className="space-y-3 p-3">
          {lastQuarter ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
              อยู่ในไตรมาสสุดท้ายของปีงบ — รายการ “ยังไม่เริ่มใช้” และ “มีเงินเหลือ” ควรตัดสินใจใช้หรือถัวก่อนสิ้นปี
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            {totals.map((t) => {
              const meta = AVAILABILITY_META[t.status];
              const active = statusFilter === t.status;
              return (
                <button
                  key={t.status}
                  type="button"
                  title={meta.hint}
                  onClick={() => setStatusFilter(active ? "ALL" : t.status)}
                  className={`rounded-xl border px-3 py-2 text-left transition ${
                    active ? "border-[#0000BF]/40 bg-[#0000BF]/[0.04] shadow-sm" : "border-[#e8e6fc] bg-white hover:bg-[#faf9ff]"
                  }`}
                >
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ring-1 ${meta.chip}`}>
                    {meta.label}
                  </span>
                  <div className={`mt-1 text-base font-black tabular-nums ${meta.amountTone}`}>
                    {t.status === "DONE" ? `${t.count} รายการ` : formatBaht(Math.abs(t.amount))}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {t.status === "DONE"
                      ? "ไม่มีเงินเหลือ"
                      : `${t.count} รายการ · ${
                          t.status === "OVER" ? "เกินงบรวม" : t.status === "NEEDED" ? "คงเหลือ (สำรองใช้ต่อ)" : "ถัวได้โดยประมาณ"
                        }`}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm bg-[#0000BF]" /> เบิกจ่ายแล้ว</span>
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm bg-violet-500" /> PO (สั่งซื้อแล้ว)</span>
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm bg-amber-400" /> PR / กันเงิน</span>
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm bg-emerald-300" /> คงเหลือ</span>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหารายการ / CI…"
              className="w-48 rounded-lg border border-[#dcd8f0] px-2.5 py-1 text-xs"
            />
          </div>

          {AVAILABILITY_ORDER.filter((s) => statusFilter === "ALL" || s === statusFilter).map((s) => {
            const list = visible.filter((i) => i.status === s).sort((a, b) => b.free - a.free || b.row.remaining - a.row.remaining);
            if (s === "OVER") list.reverse();
            if (!list.length) return null;
            const meta = AVAILABILITY_META[s];
            return (
              <div key={s}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <h3 className="text-[11px] font-black text-[#66638c]">
                    {meta.label} <span className="font-bold text-slate-400">({list.length})</span>
                  </h3>
                  <span className="text-[10px] text-slate-400">{meta.hint}</span>
                </div>
                <ul className="overflow-hidden rounded-xl border border-[#e8e6fc] divide-y divide-[#ecebff]">
                  {list.map(({ row, need, free }) => {
                    const used = row.netBudget > 0 ? (row.netBudget - row.remaining) / row.netBudget : null;
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          disabled={!onOpenRow || !row.yearLineId}
                          onClick={() => onOpenRow?.(row)}
                          className="grid w-full grid-cols-1 gap-1.5 px-3 py-2 text-left enabled:hover:bg-[#0000BF]/[0.03] sm:grid-cols-[minmax(0,1.4fr)_minmax(8rem,1fr)_auto] sm:items-center sm:gap-3"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-[12px] font-semibold text-[#1e1b4b]">{rowLabel(row)}</div>
                            <div className="truncate text-[10px] text-slate-400">
                              <span className="font-mono">{row.ciCode}</span>
                              {row.parentCi && groupName.get(row.parentCi) ? ` · ${groupName.get(row.parentCi)}` : ""}
                            </div>
                          </div>
                          <div>
                            <UsageBar row={row} />
                            <div className="mt-0.5 flex justify-between text-[10px] text-slate-500">
                              <span>
                                เบิก {formatBaht(row.spent)}
                                {row.po ? ` · PO ${formatBaht(row.po)}` : ""}
                                {row.pr + row.reserved ? ` · PR/กัน ${formatBaht(row.pr + row.reserved)}` : ""}
                              </span>
                              <span>{formatPct(used)}</span>
                            </div>
                          </div>
                          <div className="text-right text-[11px] leading-tight sm:min-w-[7.5rem]">
                            <div className="text-[10px] text-slate-400">งบสุทธิ {formatBaht(row.netBudget)}</div>
                            <div className={`text-[13px] font-black tabular-nums ${meta.amountTone}`}>
                              {row.remaining < 0 ? "−" : ""}
                              {formatBaht(Math.abs(row.remaining))}
                            </div>
                            <div className="text-[10px] text-slate-400">{row.remaining < 0 ? "เกินงบ" : "คงเหลือ"}</div>
                            {need > 0 ? (
                              <div className="mt-0.5 text-[10px] leading-tight">
                                <span className="text-amber-700">คาดใช้ต่อ ~{formatBaht(Math.round(need))}</span>
                                <br />
                                <span className={free > 0 ? "font-bold text-emerald-700" : "font-bold text-rose-700"}>
                                  {free > 0 ? `ถัวได้ ~${formatBaht(Math.round(free))}` : `อาจไม่พอ ~${formatBaht(Math.round(-free))}`}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {!visible.length ? <p className="py-4 text-center text-sm text-slate-500">ไม่พบรายการ</p> : null}
        </div>
      ) : null}
    </section>
  );
}

export function BudgetImportResultModal({
  result,
  onClose,
}: {
  result: BudgetImportResult;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-3 sm:items-center print:hidden" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#e8e6fc] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[#ecebff] px-4 py-3">
          <h2 className="text-base font-black text-[#1e1b4b]">นำเข้าไฟล์ระบบหลักสำเร็จ</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            ข้อมูล ณ {formatThaiDate(result.batch.asOfDate)}
            {result.batch.fileName ? ` · ${result.batch.fileName}` : ""}
          </p>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
              <div className="text-[11px] font-bold text-emerald-700">อัปเดตรายการในระบบ</div>
              <div className="text-lg font-black tabular-nums text-emerald-800">
                {result.matchedItemCount} / {result.itemCount}
              </div>
              <div className="text-[10px] text-emerald-700">รายการ CI ที่จับคู่ได้</div>
            </div>
            <div className="rounded-xl border border-[#e8e6fc] bg-[#faf9ff] px-3 py-2">
              <div className="text-[11px] font-bold text-[#4d47b6]">รวมหัวข้อสรุป</div>
              <div className="text-lg font-black tabular-nums text-[#1e1b4b]">{result.matchedCount}</div>
              <div className="text-[10px] text-slate-500">แถวที่อัปเดตงบ/ยอดใช้ไป</div>
            </div>
          </div>
          <p className="text-[11px] leading-snug text-slate-500">
            รายการที่จับคู่ได้ถูกอัปเดต งบอนุมัติ งบเหลื่อมปี งบจัดสรรระหว่างปี และยอดใช้ไป ณ วันที่ในไฟล์ ส่วนรายละเอียดรายไตรมาส
            PR PO กันเงิน ดูได้จากแถบความเคลื่อนไหวงบ เบิกจ่ายรายไตรมาส และปุ่ม “ใช้จ่าย” ของแต่ละรายการ
          </p>
          {result.createdItems?.length ? (
            <section>
              <h3 className="mb-1 text-xs font-black text-[#4d47b6]">
                เพิ่มรายการใหม่จากระบบหลัก ({result.createdItems.length})
              </h3>
              <ul className="overflow-hidden rounded-xl border border-[#e8e6fc] divide-y divide-[#ecebff]">
                {result.createdItems.map((c, i) => (
                  <li key={`${c.ciCode}-${i}`} className="px-3 py-1.5">
                    <div className="text-[12px] font-semibold text-slate-800">
                      {c.code ? `${c.code} ` : ""}
                      {c.name}
                    </div>
                    <div className="font-mono text-[10px] text-slate-400">
                      {c.ciCode}
                      {c.categoryName ? ` · หมวด ${c.categoryName}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {result.missingInFile?.length ? (
            <section>
              <h3 className="mb-1 text-xs font-black text-rose-700">
                มีในระบบเราแต่ไม่มีในไฟล์ระบบหลัก ({result.missingInFile.length}) — ทำให้ยอดรวมรายการย่อยสูงกว่าจริง
              </h3>
              <ul className="overflow-hidden rounded-xl border border-rose-200 divide-y divide-rose-100">
                {result.missingInFile.map((m, i) => (
                  <li key={`${m.ciCode}-${i}`} className="flex items-start justify-between gap-2 px-3 py-1.5">
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-slate-800">{m.name}</div>
                      <div className="font-mono text-[10px] text-slate-400">{m.ciCode}</div>
                    </div>
                    <div className="shrink-0 text-right text-[11px] tabular-nums text-slate-600">งบ {formatBaht(m.netBudget)}</div>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-slate-500">
                ตรวจสอบว่ารายการเหล่านี้ย้ายไปส่วนกลาง/ส่วนงานอื่นหรือไม่ — แก้ยอดเป็น 0 หรือลบได้จากปุ่ม “แก้ไข”
              </p>
            </section>
          ) : null}
          {result.unmatched.length ? (
            <section>
              <h3 className="mb-1 text-xs font-black text-amber-700">
                ไม่ได้นำเข้าเป็นรายการ ({result.unmatched.length}) — รายการนอกหมวดค่าใช้จ่าย/สินทรัพย์ เช่น รายการหักกลบ
              </h3>
              <ul className="overflow-hidden rounded-xl border border-amber-200 divide-y divide-amber-100">
                {result.unmatched.map((u, i) => (
                  <li key={`${u.ciCode}-${i}`} className="flex items-start justify-between gap-2 px-3 py-1.5">
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-slate-800">
                        {u.code ? `${u.code} ` : ""}
                        {u.name}
                      </div>
                      <div className="font-mono text-[10px] text-slate-400">
                        {u.ciCode}
                        {u.kind === "EXPENSE" || u.kind === "CAPEX" ? ` · ${kindLabel(u.kind)}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[11px] tabular-nums text-slate-600">
                      <div>งบ {formatBaht(u.netBudget)}</div>
                      <div>ใช้ {formatBaht(u.spent)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <div className="flex justify-end border-t border-[#ecebff] px-4 py-3">
          <button type="button" className={toolbarPrimaryBtnClass} onClick={onClose}>
            ตกลง
          </button>
        </div>
      </div>
    </div>
  );
}
