import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FitSingleLine } from "../../components/FitSingleLine";
import { Modal } from "../../components/Modal";
import { chartAxisFill, chartGridStroke } from "../../lib/uiTokens";
import { formatPct, kindLabel, type BudgetKind } from "./budgetFormat";
import {
  AVAILABILITY_META,
  availabilityOf,
  formatThaiDate,
  type AvailabilityItem,
  type AvailabilityStatus,
  type BudgetImportData,
  type BudgetImportRow,
} from "./BudgetMainSystemImport";

type Fmt = (n: number | null | undefined) => string;

type Totals = {
  net: number;
  spent: number;
  po: number;
  pending: number;
  remaining: number;
  q: [number, number, number, number];
};

const KINDS: BudgetKind[] = ["EXPENSE", "CAPEX"];

function totalsOf(rows: BudgetImportRow[]): Totals {
  return rows.reduce<Totals>(
    (t, r) => ({
      net: t.net + r.netBudget,
      spent: t.spent + r.spent,
      po: t.po + r.po,
      pending: t.pending + r.pr + r.reserved + r.earmark + r.carryOut,
      remaining: t.remaining + r.remaining,
      q: [t.q[0] + r.q1, t.q[1] + r.q2, t.q[2] + r.q3, t.q[3] + r.q4],
    }),
    { net: 0, spent: 0, po: 0, pending: 0, remaining: 0, q: [0, 0, 0, 0] },
  );
}

/** ปีงบ = ปีปฏิทิน — สัดส่วนเวลาที่ผ่านไป ณ วันที่ข้อมูล */
function elapsedOfYear(yearBe: number, asOfIso: string): number {
  const yearAd = yearBe - 543;
  const start = Date.UTC(yearAd, 0, 1);
  const end = Date.UTC(yearAd + 1, 0, 1);
  const asOf = new Date(asOfIso).getTime();
  if (!Number.isFinite(asOf)) return 0;
  return Math.min(1, Math.max(0, (asOf - start) / (end - start)));
}

type Pace = { label: string; chip: string; hint: string };

function paceOf(spentPct: number, elapsed: number): Pace {
  const gap = elapsed - spentPct;
  if (gap <= 0.1)
    return {
      label: "ตามแผน",
      chip: "bg-emerald-100 text-emerald-700 ring-emerald-200",
      hint: "เบิกจ่ายใกล้เคียงหรือเร็วกว่าเวลาที่ผ่านไป",
    };
  if (gap <= 0.25)
    return {
      label: "ช้ากว่าแผนเล็กน้อย",
      chip: "bg-amber-100 text-amber-800 ring-amber-200",
      hint: "เบิกจ่ายช้ากว่าเวลาที่ผ่านไป 10–25%",
    };
  return {
    label: "ล่าช้า ควรเร่งรัด",
    chip: "bg-rose-100 text-rose-700 ring-rose-200",
    hint: "เบิกจ่ายช้ากว่าเวลาที่ผ่านไปเกิน 25%",
  };
}

function ratio(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

/** แถบ เบิกแล้ว | PO | PR/กันเงิน | คงเหลือ พร้อมเส้นเวลาที่ผ่านไป */
function ProgressBar({ t, elapsed, tall }: { t: Totals; elapsed: number; tall?: boolean }) {
  const parts = [
    { v: t.spent, cls: "bg-[#0000BF]" },
    { v: t.po, cls: "bg-violet-500" },
    { v: t.pending, cls: "bg-amber-400" },
    { v: Math.max(0, t.remaining), cls: "bg-emerald-300" },
  ];
  const total = parts.reduce((s, p) => s + Math.max(0, p.v), 0) || 1;
  return (
    <div className="relative pt-4">
      <div
        className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-slate-500"
        style={{ left: `${elapsed * 100}%` }}
      >
        เวลา {formatPct(elapsed)}
      </div>
      <div className={`flex overflow-hidden rounded-full bg-slate-100 ${tall ? "h-4" : "h-2.5"}`}>
        {parts.map((p, i) =>
          p.v > 0 ? <div key={i} className={p.cls} style={{ width: `${(p.v / total) * 100}%` }} /> : null,
        )}
      </div>
      <div
        className={`absolute bottom-[-3px] w-0.5 rounded bg-[#1e1b4b] ${tall ? "h-[22px]" : "h-[16px]"}`}
        style={{ left: `${elapsed * 100}%` }}
        aria-hidden
      />
    </div>
  );
}

function Legend4() {
  const items = [
    { cls: "bg-[#0000BF]", label: "เบิกจ่ายแล้ว" },
    { cls: "bg-violet-500", label: "PO (ทำสัญญาแล้ว)" },
    { cls: "bg-amber-400", label: "PR / กันเงิน" },
    { cls: "bg-emerald-300", label: "คงเหลือ" },
  ];
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1">
          <span className={`h-2.5 w-2.5 rounded-sm ${i.cls}`} />
          {i.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <span className="h-3 w-0.5 rounded bg-[#1e1b4b]" />
        เวลาที่ผ่านไปของปีงบ
      </span>
    </div>
  );
}

function Kpi({
  label,
  value,
  unit,
  sub,
  tone = "text-[#1e1b4b]",
}: {
  label: string;
  value: string;
  unit: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-[#e8e6fc] bg-white/90 px-3 py-2">
      <div className="text-[11px] font-bold text-slate-500">{label}</div>
      <FitSingleLine className={`font-black tabular-nums ${tone}`} maxPx={22} minPx={11} title={`${value} ${unit}`}>
        {value} <span className="text-[0.6em] font-bold text-[#66638c]">{unit}</span>
      </FitSingleLine>
      {sub ? <div className="mt-0.5 truncate text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function totalsByKind(data: BudgetImportData): Record<BudgetKind, Totals> {
  const out = {} as Record<BudgetKind, Totals>;
  for (const k of KINDS) out[k] = totalsOf(data.rows.filter((r) => r.rowType === "SECTION" && r.kind === k));
  return out;
}

/** การ์ดค่าใช้จ่าย / สินทรัพย์ถาวร — คลิกเพื่อกรองหัวข้อใหญ่ */
export function BudgetExecutiveKindCards({
  data,
  yearBe,
  fmt,
  unit,
  activeKind,
  onSelectKind,
  className = "grid gap-3 md:grid-cols-2",
  hint,
}: {
  data: BudgetImportData;
  yearBe: number;
  fmt: Fmt;
  unit: string;
  activeKind?: BudgetKind | null;
  onSelectKind: (k: BudgetKind) => void;
  className?: string;
  hint?: string;
}) {
  const byKind = useMemo(() => totalsByKind(data), [data]);
  if (!data.batch) return null;
  const elapsed = elapsedOfYear(yearBe, data.batch.asOfDate);
  return (
    <div className={className}>
      {KINDS.map((k) => {
        const t = byKind[k];
        const p = ratio(t.spent, t.net);
        const kp = paceOf(p, elapsed);
        const active = activeKind === k;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onSelectKind(k)}
            className={`flex min-w-0 flex-col justify-center rounded-[1.25rem] border p-3 text-left transition ${
              active
                ? "border-[#0000BF]/40 bg-gradient-to-br from-[#0000BF]/10 via-[#8b5cf6]/10 to-[#ec4899]/10 shadow-md ring-2 ring-[#0000BF]/20"
                : "border-[#e8e6fc] bg-white/90 hover:border-[#0000BF]/25 hover:bg-[#0000BF]/[0.03]"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black text-[#1e1b4b]">{kindLabel(k)}</span>
              <div className="flex items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${kp.chip}`}>{kp.label}</span>
                {active ? (
                  <span className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-2 py-0.5 text-[10px] font-bold text-white">
                    กำลังดู
                  </span>
                ) : null}
              </div>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <FitSingleLine className="font-black tabular-nums text-[#1e1b4b]" maxPx={22} minPx={11} title={fmt(t.net)}>
                {fmt(t.net)} <span className="text-[0.6em] font-bold text-[#66638c]">{unit}</span>
              </FitSingleLine>
              <span className="shrink-0 text-lg font-black tabular-nums text-[#0000BF]">{formatPct(p)}</span>
            </div>
            <ProgressBar t={t} elapsed={elapsed} />
            <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
              <div className="min-w-0">
                <dt className="text-slate-500">เบิกแล้ว</dt>
                <dd className="truncate font-semibold tabular-nums text-[#0000BF]">{fmt(t.spent)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-slate-500">ผูกพัน</dt>
                <dd className="truncate font-semibold tabular-nums text-violet-700">{fmt(t.po + t.pending)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-slate-500">คงเหลือ</dt>
                <dd className={`truncate font-semibold tabular-nums ${t.remaining < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                  {fmt(t.remaining)}
                </dd>
              </div>
            </dl>
            {hint ? <p className="mt-1.5 text-[10.5px] font-bold text-[#4d47b6]">{hint}</p> : null}
          </button>
        );
      })}
    </div>
  );
}

function watchAdvice(w: AvailabilityItem, fmt: Fmt, unit: string, elapsed: number): { text: string; action: string } {
  const r = w.row;
  switch (w.status) {
    case "OVER":
      return {
        text: `เบิกจ่าย/ผูกพันเกินงบสุทธิ ${fmt(Math.abs(w.free))} ${unit}`,
        action: "หาเงินจากรายการที่มีเงินเหลือหรือยังไม่เริ่มใช้มาถัวเข้า และตรวจสอบว่ามีการผูกพันซ้ำหรือไม่",
      };
    case "IDLE":
      return {
        text: `ยังไม่มีการเบิกจ่าย PR PO หรือกันเงินเลย ทั้งที่ผ่านไปแล้ว ${formatPct(elapsed)} ของปีงบ`,
        action: `สอบถามเจ้าของงบว่ามีแผนใช้ในปีนี้หรือไม่ — ถ้าไม่มี ถัวไปรายการอื่นได้ประมาณ ${fmt(w.free)} ${unit}`,
      };
    case "SAVINGS":
      return {
        text: `คงเหลือ ${fmt(r.remaining)} ${unit}${w.need > 0 ? ` · คาดว่าต้องใช้ต่อ ${fmt(w.need)} ${unit}` : ""}`,
        action: `ถัวได้ประมาณ ${fmt(w.free)} ${unit} (รวมเงินเหลือจ่ายหลังทำสัญญา) — ยืนยันกับเจ้าของงบก่อนถัว`,
      };
    case "NEEDED":
      return {
        text: `คงเหลือ ${fmt(r.remaining)} ${unit} แต่คาดว่าต้องใช้ต่อจนสิ้นปี ${fmt(w.need)} ${unit} ตามอัตราเฉลี่ยรายไตรมาส`,
        action: "ไม่ควรถัวออก — ติดตามอัตราการเบิกรายไตรมาส หากเร่งขึ้นอาจต้องหาเงินเพิ่ม",
      };
    default:
      return { text: "ใช้/ผูกพันครบแล้ว", action: "—" };
  }
}

function WatchDetailModal({
  item,
  yearBe,
  fmt,
  unit,
  elapsed,
  onClose,
}: {
  item: AvailabilityItem;
  yearBe: number;
  fmt: Fmt;
  unit: string;
  elapsed: number;
  onClose: () => void;
}) {
  const r = item.row;
  const meta = AVAILABILITY_META[item.status];
  const advice = watchAdvice(item, fmt, unit, elapsed);
  const bound = r.po + r.pr + r.reserved + r.earmark + r.carryOut;
  const spentPct = ratio(r.spent, r.netBudget);
  const quarters = [r.q1, r.q2, r.q3, r.q4];
  const qMax = Math.max(1, ...quarters.map((q) => Math.abs(q)));
  const t: Totals = {
    net: r.netBudget,
    spent: r.spent,
    po: r.po,
    pending: r.pr + r.reserved + r.earmark + r.carryOut,
    remaining: r.remaining,
    q: [r.q1, r.q2, r.q3, r.q4],
  };
  const cell = (label: string, value: number, tone = "text-[#1e1b4b]") => (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`font-semibold tabular-nums ${tone}`}>{fmt(value)}</dd>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="form"
      title={
        <span className="block min-w-0">
          <span className="block truncate">{r.name}</span>
          <span className="block text-[11px] font-semibold text-slate-500">
            {[r.code, r.ciCode, r.kind ? kindLabel(r.kind as BudgetKind) : null].filter(Boolean).join(" · ")}
          </span>
        </span>
      }
    >
      <div className="space-y-3 text-[12px]">
        <div className="rounded-xl border border-[#ecebff] bg-[#faf9ff] p-3">
          <span className={`inline-block rounded-full px-2 py-0.5 text-[10.5px] font-bold ring-1 ${meta.chip}`}>{meta.label}</span>
          <p className="mt-1.5 font-semibold text-[#1e1b4b]">{advice.text}</p>
          <p className="mt-1">
            <span className="font-bold text-emerald-700">ควรทำ: </span>
            {advice.action}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { k: "งบสุทธิ", v: r.netBudget, tone: "text-[#1e1b4b]" },
            { k: `เบิกแล้ว (${formatPct(spentPct)})`, v: r.spent, tone: "text-[#0000BF]" },
            { k: "ผูกพัน", v: bound, tone: "text-violet-700" },
            { k: "คงเหลือ", v: r.remaining, tone: r.remaining < 0 ? "text-rose-700" : "text-emerald-700" },
          ].map((c) => (
            <div key={c.k} className="min-w-0 rounded-xl border border-[#e8e6fc] bg-white px-2.5 py-1.5">
              <div className="truncate text-[10.5px] font-bold text-slate-500">{c.k}</div>
              <FitSingleLine className={`font-black tabular-nums ${c.tone}`} maxPx={16} minPx={10} title={fmt(c.v)}>
                {fmt(c.v)}
              </FitSingleLine>
            </div>
          ))}
        </div>

        <div>
          <ProgressBar t={t} elapsed={elapsed} />
          <div className="mt-1.5">
            <Legend4 />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <section className="rounded-xl border border-[#ecebff] p-2.5">
            <h3 className="mb-1 text-[11px] font-black text-[#2e2a58]">ที่มาของงบ ({unit})</h3>
            <dl>
              {cell("อนุมัติ", r.approved)}
              {cell("ยกมา", r.carryIn)}
              {cell("ปรับระหว่างปี", r.midYear, r.midYear < 0 ? "text-rose-700" : r.midYear > 0 ? "text-emerald-700" : "text-[#1e1b4b]")}
              <div className="mt-1 border-t border-[#ecebff] pt-1">{cell("งบสุทธิ", r.netBudget)}</div>
            </dl>
          </section>
          <section className="rounded-xl border border-[#ecebff] p-2.5">
            <h3 className="mb-1 text-[11px] font-black text-[#2e2a58]">การใช้งบ ({unit})</h3>
            <dl>
              {cell("เบิกจ่ายแล้ว", r.spent, "text-[#0000BF]")}
              {cell("PO (ทำสัญญาแล้ว)", r.po, "text-violet-700")}
              {cell("PR", r.pr, "text-amber-700")}
              {cell("กันเงิน / สำรอง", r.reserved + r.earmark + r.carryOut, "text-amber-700")}
              <div className="mt-1 border-t border-[#ecebff] pt-1">
                {cell("คงเหลือ", r.remaining, r.remaining < 0 ? "text-rose-700" : "text-emerald-700")}
              </div>
            </dl>
          </section>
        </div>

        <section className="rounded-xl border border-[#ecebff] p-2.5">
          <h3 className="mb-1.5 text-[11px] font-black text-[#2e2a58]">เบิกจ่ายรายไตรมาส ({unit})</h3>
          <div className="grid grid-cols-4 gap-2">
            {quarters.map((q, i) => (
              <div key={i} className="text-center">
                <div className="flex h-14 items-end justify-center">
                  <div
                    className="w-8 rounded-t bg-[#8b5cf6]"
                    style={{ height: `${(Math.abs(q) / qMax) * 100}%`, minHeight: q !== 0 ? 2 : 0 }}
                  />
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">Q{i + 1}</div>
                <div className="text-[11px] font-semibold tabular-nums text-[#1e1b4b]">{fmt(q)}</div>
              </div>
            ))}
          </div>
          {item.need > 0 ? (
            <p className="mt-1.5 text-[11px] text-slate-500">คาดว่าต้องใช้ต่อจนสิ้นปี {fmt(item.need)} {unit} (ประมาณจากค่าเฉลี่ยไตรมาสที่ผ่านมา)</p>
          ) : null}
        </section>

        {r.commitmentTotal > 0 ? (
          <section className="rounded-xl border border-[#ecebff] p-2.5">
            <h3 className="mb-1 text-[11px] font-black text-[#2e2a58]">
              งบผูกพันปีถัดไป {fmt(r.commitmentTotal)} {unit}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {r.commitmentYears.map((y) => (
                <span key={y.yearAd} className="rounded-lg bg-[#f3f1ff] px-2 py-0.5 text-[11px]">
                  <b>ปี {y.yearAd + 543}</b> <span className="tabular-nums">{fmt(y.amount)}</span>
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <div className="flex justify-end">
          <Link to={`/budget/year/${yearBe}?tab=availability`} className="text-[11px] font-bold text-[#0000BF] hover:underline">
            เปิดในหน้ารายละเอียดปี {yearBe} →
          </Link>
        </div>
      </div>
    </Modal>
  );
}

export type BudgetExecutiveView = "overview" | "watch";

const WATCH_STATUSES: AvailabilityStatus[] = ["OVER", "IDLE", "SAVINGS", "NEEDED"];

const panelClass = "flex min-h-0 min-w-0 flex-col rounded-[1.25rem] border border-[#e8e6fc] bg-white/90 p-3";
const panelTitleClass = "text-xs font-black text-[#1e1b4b]";
const watchGridClass =
  "grid grid-cols-[minmax(10rem,1fr)_repeat(4,minmax(5.5rem,7.5rem))_0.75rem] gap-x-3 px-3 min-w-[38rem]";
const moreLinkClass = "text-[11px] font-bold text-[#0000BF] hover:underline";

function availabilityItems(data: BudgetImportData) {
  const asOfIso = data.batch?.asOfDate ?? "";
  const asOf = asOfIso ? new Date(asOfIso) : new Date();
  return data.rows
    .filter(
      (r) =>
        r.rowType === "ITEM" &&
        (r.kind === "EXPENSE" || r.kind === "CAPEX") &&
        (r.netBudget !== 0 || r.spent !== 0 || r.remaining !== 0),
    )
    .map((r) => availabilityOf(r, asOf));
}

/** จำนวนรายการที่ควรติดตาม (ไม่นับ "ต้องการงบเพิ่ม") — ใช้แสดงเป็น badge ที่เมนูประเด็นติดตาม */
export function budgetWatchCount(data: BudgetImportData | null | undefined): number {
  if (!data?.batch) return 0;
  return availabilityItems(data).filter((i) => i.status !== "NEEDED" && WATCH_STATUSES.includes(i.status)).length;
}

export function BudgetExecutiveSummary({
  data,
  yearBe,
  fmt,
  unit,
  view,
  onSelectKind,
}: {
  data: BudgetImportData;
  yearBe: number;
  fmt: Fmt;
  unit: string;
  view: BudgetExecutiveView;
  onSelectKind: (k: BudgetKind) => void;
}) {
  const asOfIso = data.batch?.asOfDate ?? "";
  const elapsed = elapsedOfYear(yearBe, asOfIso);
  const [pickedStatus, setWatchStatus] = useState<AvailabilityStatus | null>(null);
  const [detail, setDetail] = useState<AvailabilityItem | null>(null);

  const byKind = useMemo(() => totalsByKind(data), [data]);
  const all = useMemo(() => totalsOf(data.rows.filter((r) => r.rowType === "SECTION" && r.kind !== "OTHER")), [data.rows]);

  const items = useMemo(() => availabilityItems(data), [data]);

  const moves = useMemo(() => {
    const list = data.rows.filter(
      (r) => r.rowType === "ITEM" && (r.kind === "EXPENSE" || r.kind === "CAPEX") && Math.abs(r.midYear) > 0.004,
    );
    const inc = list.filter((r) => r.midYear > 0).reduce((s, r) => s + r.midYear, 0);
    const out = list.filter((r) => r.midYear < 0).reduce((s, r) => s + r.midYear, 0);
    return { count: list.length, inc, out, net: inc + out };
  }, [data.rows]);

  const commitment = useMemo(() => {
    const byYear = new Map<number, number>();
    let total = 0;
    const list: BudgetImportRow[] = [];
    for (const r of data.rows) {
      if (r.rowType !== "ITEM" || !(r.commitmentTotal > 0)) continue;
      total += r.commitmentTotal;
      list.push(r);
      for (const y of r.commitmentYears ?? []) byYear.set(y.yearAd, (byYear.get(y.yearAd) ?? 0) + y.amount);
    }
    const years = [...byYear.entries()].filter(([, v]) => Math.abs(v) > 0.004).sort((a, b) => a[0] - b[0]);
    list.sort((a, b) => b.commitmentTotal - a.commitmentTotal);
    return { total, count: list.length, years, list };
  }, [data.rows]);

  if (!data.batch) return null;

  const spentPct = ratio(all.spent, all.net);
  const boundPct = ratio(all.spent + all.po, all.net);
  const pace = paceOf(spentPct, elapsed);
  const base = `/budget/year/${yearBe}`;

  const statusTotals = WATCH_STATUSES.map((s) => {
    const list = items.filter((i) => i.status === s);
    const amount = s === "NEEDED" ? list.reduce((a, i) => a + i.row.remaining, 0) : list.reduce((a, i) => a + i.free, 0);
    return { status: s, count: list.length, amount };
  });
  const reallocatable = statusTotals
    .filter((s) => s.status === "IDLE" || s.status === "SAVINGS")
    .reduce((a, s) => a + s.amount, 0);

  if (view === "watch") {
    const watchStatus = pickedStatus ?? statusTotals.find((s) => s.count > 0)?.status ?? "OVER";
    const list: AvailabilityItem[] = items
      .filter((i) => i.status === watchStatus)
      .sort((a, b) =>
        watchStatus === "OVER" ? a.free - b.free : watchStatus === "NEEDED" ? b.row.remaining - a.row.remaining : b.free - a.free,
      );
    const activeMeta = AVAILABILITY_META[watchStatus];
    return (
      <div className="flex flex-col gap-3 lg:h-full">
        <div className="grid shrink-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {statusTotals.map((s) => {
            const meta = AVAILABILITY_META[s.status];
            const active = watchStatus === s.status;
            return (
              <button
                key={s.status}
                type="button"
                onClick={() => setWatchStatus(s.status)}
                title={meta.hint}
                className={`rounded-xl border px-3 py-2 text-left transition ${
                  active
                    ? "border-[#0000BF]/40 bg-[#0000BF]/[0.05] shadow-sm ring-2 ring-[#0000BF]/20"
                    : "border-[#ecebff] bg-white/90 hover:border-[#0000BF]/25"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-block truncate rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${meta.chip}`}>
                    {meta.label}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{s.count} รายการ</span>
                </div>
                <div className={`mt-1 text-right text-lg font-black tabular-nums ${meta.amountTone}`}>
                  {fmt(s.amount)} <span className="text-[0.6em] font-bold text-[#66638c]">{unit}</span>
                </div>
              </button>
            );
          })}
        </div>

        <section className={`${panelClass} lg:flex-1`}>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className={panelTitleClass}>
                {activeMeta.label} <span className="font-bold text-slate-500">({list.length} รายการ)</span>
              </h2>
              <p className="text-[11px] text-slate-500">{activeMeta.hint}</p>
            </div>
            <Link to={`${base}?tab=availability`} className={moreLinkClass}>
              ดูงบคงเหลือทั้งหมด →
            </Link>
          </div>
          {list.length ? (
            <div className="mt-2 min-h-0 flex-1 overflow-auto rounded-xl border border-[#ecebff]">
              <div className={`${watchGridClass} sticky top-0 z-[1] border-b border-[#ecebff] bg-[#faf9ff] py-1.5 text-[10px] font-bold text-slate-500`}>
                <span>รายการ</span>
                <span className="text-right">งบสุทธิ</span>
                <span className="text-right">เบิกแล้ว</span>
                <span className="text-right">คงเหลือ</span>
                <span className="text-right">
                  {watchStatus === "OVER" ? "เกินงบ" : watchStatus === "NEEDED" ? "ต้องใช้ต่อ" : "ถัวได้"}
                </span>
                <span />
              </div>
              <ul className="divide-y divide-[#ecebff]">
                {list.map((w) => (
                  <li key={w.row.id}>
                    <button
                      type="button"
                      onClick={() => setDetail(w)}
                      title="คลิกดูรายละเอียด"
                      className={`${watchGridClass} w-full items-center py-1.5 text-left transition hover:bg-[#0000BF]/[0.04]`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-semibold text-[#1e1b4b]" title={w.row.name}>
                          {w.row.code ? `${w.row.code} ` : ""}
                          {w.row.name}
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          {w.row.kind ? kindLabel(w.row.kind as BudgetKind) : ""}
                        </div>
                      </div>
                      <span className="text-right text-[12px] tabular-nums text-[#2e2a58]">{fmt(w.row.netBudget)}</span>
                      <span className="text-right text-[12px] tabular-nums text-[#0000BF]">{fmt(w.row.spent)}</span>
                      <span
                        className={`text-right text-[12px] tabular-nums ${w.row.remaining < 0 ? "text-rose-700" : "text-emerald-700"}`}
                      >
                        {fmt(w.row.remaining)}
                      </span>
                      <span className={`text-right text-sm font-black tabular-nums ${activeMeta.amountTone}`}>
                        {fmt(Math.abs(w.status === "NEEDED" ? w.need : w.free))}
                      </span>
                      <span className="text-right text-[10px] font-bold text-[#4d47b6]">→</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-slate-500">ไม่มีรายการในกลุ่มนี้</p>
          )}
        </section>
        {detail ? (
          <WatchDetailModal item={detail} yearBe={yearBe} fmt={fmt} unit={unit} elapsed={elapsed} onClose={() => setDetail(null)} />
        ) : null}
      </div>
    );
  }

  const chartData = (["ไตรมาส 1", "ไตรมาส 2", "ไตรมาส 3", "ไตรมาส 4"] as const).map((name, i) => ({
    name,
    EXPENSE: byKind.EXPENSE.q[i],
    CAPEX: byKind.CAPEX.q[i],
  }));
  let cum = 0;
  const cumulative = chartData.map((d) => {
    cum += d.EXPENSE + d.CAPEX;
    return ratio(cum, all.net);
  });
  const currentQ = Math.min(3, Math.floor(new Date(asOfIso).getMonth() / 3));

  return (
    <div className="flex flex-col gap-3 lg:h-full">
      <section className="shrink-0 rounded-[1.25rem] border border-[#e8e6fc] bg-gradient-to-br from-white via-[#faf9ff] to-[#fdf2f8]/60 p-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-black text-[#1e1b4b]">ภาพรวมการใช้งบประมาณปี {yearBe}</h2>
            <p className="text-[11px] text-slate-500">ข้อมูลระบบหลัก ณ {formatThaiDate(asOfIso)} · ค่าใช้จ่าย + สินทรัพย์ถาวร</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${pace.chip}`} title={pace.hint}>
            {pace.label}
          </span>
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="งบสุทธิทั้งสิ้น" value={fmt(all.net)} unit={unit} sub="อนุมัติ + ยกมา + ระหว่างปี" />
          <Kpi
            label="เบิกจ่ายแล้ว"
            value={fmt(all.spent)}
            unit={unit}
            sub={`${formatPct(spentPct)} ของงบ · เวลาผ่านไป ${formatPct(elapsed)}`}
            tone="text-[#0000BF]"
          />
          <Kpi
            label="ผูกพันแล้ว (PO/PR/กันเงิน)"
            value={fmt(all.po + all.pending)}
            unit={unit}
            sub={`เบิก + PO รวม ${formatPct(boundPct)}`}
            tone="text-violet-700"
          />
          <Kpi
            label="คงเหลือจริง"
            value={fmt(all.remaining)}
            unit={unit}
            sub={`ถัวได้ประมาณ ${fmt(reallocatable)} ${unit}`}
            tone={all.remaining < 0 ? "text-rose-700" : "text-emerald-700"}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
          <div className="min-w-[16rem] flex-1">
            <ProgressBar t={all} elapsed={elapsed} tall />
          </div>
          <Legend4 />
        </div>
      </section>

      <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-12">
        <section className={`${panelClass} h-72 lg:col-span-5 lg:h-auto`}>
          <div className="flex shrink-0 items-center justify-between gap-2">
            <h2 className={panelTitleClass}>เบิกจ่ายรายไตรมาส</h2>
            <Link to={`${base}?tab=quarter`} className={moreLinkClass}>
              ดูรายละเอียด →
            </Link>
          </div>
          <div className="mt-1 min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: chartAxisFill, fontSize: 11 }} />
                <YAxis tick={{ fill: chartAxisFill, fontSize: 11 }} tickFormatter={(v: number) => fmt(v)} width={56} />
                <Tooltip formatter={(v) => `${fmt(Number(v))} ${unit}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="EXPENSE" name={kindLabel("EXPENSE")} stackId="q" fill="#8b5cf6" />
                <Bar dataKey="CAPEX" name={kindLabel("CAPEX")} stackId="q" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 grid shrink-0 grid-cols-4 gap-1 text-center text-[11px]">
            {cumulative.map((c, i) => (
              <div key={i} className={`rounded-lg px-1 py-0.5 ${i === currentQ ? "bg-[#0000BF]/[0.06] font-bold" : "bg-slate-50"}`}>
                <div className="text-slate-500">สะสม Q{i + 1}</div>
                <div className="tabular-nums text-[#1e1b4b]">{i > currentQ ? "—" : formatPct(c)}</div>
              </div>
            ))}
          </div>
        </section>

        <BudgetExecutiveKindCards
          data={data}
          yearBe={yearBe}
          fmt={fmt}
          unit={unit}
          onSelectKind={onSelectKind}
          hint="ดูหัวข้อใหญ่ →"
          className="grid gap-3 lg:col-span-4 lg:min-h-0 lg:grid-rows-2"
        />

        <div className="flex min-w-0 flex-col gap-3 lg:col-span-3 lg:min-h-0">
          <section className={`${panelClass} shrink-0`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className={panelTitleClass}>ปรับงบระหว่างปี</h2>
              <Link to={`${base}?tab=movement`} className={moreLinkClass}>
                รายละเอียด →
              </Link>
            </div>
            {moves.count ? (
              <dl className="mt-1.5 grid grid-cols-3 gap-2 text-[11px]">
                <div className="min-w-0">
                  <dt className="text-slate-500">ได้รับเพิ่ม</dt>
                  <dd className="truncate font-bold tabular-nums text-emerald-700">+{fmt(moves.inc)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-slate-500">โอนออก</dt>
                  <dd className="truncate font-bold tabular-nums text-rose-700">{fmt(moves.out)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-slate-500">สุทธิ</dt>
                  <dd className={`truncate font-bold tabular-nums ${moves.net < 0 ? "text-rose-700" : "text-[#1e1b4b]"}`}>
                    {moves.net > 0 ? "+" : ""}
                    {fmt(moves.net)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-1.5 text-[11px] text-slate-500">ไม่มีการปรับงบระหว่างปี</p>
            )}
            {moves.count ? <p className="mt-0.5 text-[10px] text-slate-400">{moves.count} รายการ · หน่วย {unit}</p> : null}
          </section>

          <section className={`${panelClass} h-60 lg:h-auto lg:flex-1`}>
            <div className="flex shrink-0 items-center justify-between gap-2">
              <h2 className={panelTitleClass}>งบผูกพันปีถัดไป</h2>
              <Link to={`${base}?funding=commitment`} className={moreLinkClass}>
                รายละเอียด →
              </Link>
            </div>
            {commitment.total > 0 ? (
              <>
                <div className="flex shrink-0 items-baseline justify-between gap-2">
                  <FitSingleLine className="mt-0.5 font-black tabular-nums text-[#1e1b4b]" maxPx={18} minPx={11}>
                    {fmt(commitment.total)} <span className="text-[0.6em] font-bold text-[#66638c]">{unit}</span>
                  </FitSingleLine>
                  <span className="shrink-0 text-[10px] text-slate-400">{commitment.count} รายการ</span>
                </div>
                <div className="mt-1 flex shrink-0 flex-wrap gap-1">
                  {commitment.years.map(([y, v]) => (
                    <span key={y} className="rounded-lg bg-[#f3f1ff] px-1.5 py-0.5 text-[10.5px]">
                      <b className="text-[#1e1b4b]">ปี {y + 543}</b> <span className="tabular-nums text-slate-600">{fmt(v)}</span>
                    </span>
                  ))}
                </div>
                <ul className="mt-1.5 min-h-0 flex-1 space-y-1 overflow-y-auto border-t border-[#ecebff] pt-1.5">
                  {commitment.list.map((r) => (
                    <li key={r.id} className="flex items-baseline justify-between gap-2 text-[11px]">
                      <span className="min-w-0 truncate text-[#1e1b4b]" title={r.name}>
                        {r.name}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-violet-700">{fmt(r.commitmentTotal)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-1.5 text-[11px] text-slate-500">ไม่มีงบผูกพันปีถัดไป</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
