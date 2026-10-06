import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FitSingleLine } from "../../components/FitSingleLine";
import { chartAxisFill, chartGridStroke } from "../../lib/uiTokens";
import { formatBaht, formatPct, kindLabel, type BudgetKind } from "./budgetFormat";
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
    <div className="min-w-0 rounded-2xl border border-[#e8e6fc] bg-white/90 px-3 py-2.5">
      <div className="text-[11px] font-bold text-slate-500">{label}</div>
      <FitSingleLine className={`font-black tabular-nums ${tone}`} maxPx={24} minPx={11} title={`${value} ${unit}`}>
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

/** การ์ดค่าใช้จ่าย / สินทรัพย์ถาวร — คลิกเพื่อกรองหัวข้อใหญ่ที่อยู่ใต้การ์ด */
export function BudgetExecutiveKindCards({
  data,
  yearBe,
  fmt,
  unit,
  activeKind,
  onSelectKind,
}: {
  data: BudgetImportData;
  yearBe: number;
  fmt: Fmt;
  unit: string;
  activeKind: BudgetKind;
  onSelectKind: (k: BudgetKind) => void;
}) {
  const byKind = useMemo(() => totalsByKind(data), [data]);
  if (!data.batch) return null;
  const elapsed = elapsedOfYear(yearBe, data.batch.asOfDate);
  return (
    <div className="grid gap-3 md:grid-cols-2">
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
            className={`min-w-0 rounded-[1.25rem] border p-4 text-left transition ${
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
          </button>
        );
      })}
    </div>
  );
}

export function BudgetExecutiveSummary({
  data,
  yearBe,
  fmt,
  unit,
}: {
  data: BudgetImportData;
  yearBe: number;
  fmt: Fmt;
  unit: string;
}) {
  const asOfIso = data.batch?.asOfDate ?? "";
  const elapsed = elapsedOfYear(yearBe, asOfIso);

  const byKind = useMemo(() => totalsByKind(data), [data]);
  const all = useMemo(() => totalsOf(data.rows.filter((r) => r.rowType === "SECTION" && r.kind !== "OTHER")), [data.rows]);

  const items = useMemo(() => {
    const asOf = asOfIso ? new Date(asOfIso) : new Date();
    return data.rows
      .filter(
        (r) =>
          r.rowType === "ITEM" &&
          (r.kind === "EXPENSE" || r.kind === "CAPEX") &&
          (r.netBudget !== 0 || r.spent !== 0 || r.remaining !== 0),
      )
      .map((r) => availabilityOf(r, asOf));
  }, [data.rows, asOfIso]);

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

  const statusTotals = (["OVER", "IDLE", "SAVINGS", "NEEDED"] as AvailabilityStatus[]).map((s) => {
    const list = items.filter((i) => i.status === s);
    const amount = s === "NEEDED" ? list.reduce((a, i) => a + i.row.remaining, 0) : list.reduce((a, i) => a + i.free, 0);
    return { status: s, count: list.length, amount };
  });
  const reallocatable = statusTotals
    .filter((s) => s.status === "IDLE" || s.status === "SAVINGS")
    .reduce((a, s) => a + s.amount, 0);

  const watch: AvailabilityItem[] = [
    ...items.filter((i) => i.status === "OVER").sort((a, b) => a.free - b.free),
    ...items.filter((i) => i.status === "IDLE").sort((a, b) => b.free - a.free),
    ...items.filter((i) => i.status === "SAVINGS").sort((a, b) => b.free - a.free),
  ].slice(0, 6);

  return (
    <div className="space-y-4">
      {/* ภาพรวมทั้งปี */}
      <section className="rounded-[1.25rem] border border-[#e8e6fc] bg-gradient-to-br from-white via-[#faf9ff] to-[#fdf2f8]/60 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-black text-[#1e1b4b]">ภาพรวมการใช้งบประมาณปี {yearBe}</h2>
            <p className="text-[11px] text-slate-500">
              ข้อมูลระบบหลัก ณ {formatThaiDate(asOfIso)} · ค่าใช้จ่าย + สินทรัพย์ถาวร
            </p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${pace.chip}`} title={pace.hint}>
            {pace.label}
          </span>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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

        <div className="mt-4">
          <ProgressBar t={all} elapsed={elapsed} tall />
          <div className="mt-2">
            <Legend4 />
          </div>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-5">
        {/* เบิกจ่ายรายไตรมาส */}
        <section className="min-w-0 rounded-[1.25rem] border border-[#e8e6fc] bg-white/90 p-4 lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-black text-[#1e1b4b]">เบิกจ่ายรายไตรมาส</h2>
            <Link to={`${base}?tab=quarter`} className="text-[11px] font-bold text-[#0000BF] hover:underline">
              ดูรายละเอียด →
            </Link>
          </div>
          <div className="mt-2 h-56">
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
          <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[11px]">
            {cumulative.map((c, i) => (
              <div
                key={i}
                className={`rounded-lg px-1 py-1 ${i === currentQ ? "bg-[#0000BF]/[0.06] font-bold" : "bg-slate-50"}`}
              >
                <div className="text-slate-500">สะสม Q{i + 1}</div>
                <div className="tabular-nums text-[#1e1b4b]">{i > currentQ ? "—" : formatPct(c)}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ความเคลื่อนไหว + งบผูกพัน */}
        <div className="flex min-w-0 flex-col gap-3 lg:col-span-2">
          <section className="rounded-[1.25rem] border border-[#e8e6fc] bg-white/90 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-black text-[#1e1b4b]">ปรับงบระหว่างปี</h2>
              <Link to={`${base}?tab=movement`} className="text-[11px] font-bold text-[#0000BF] hover:underline">
                ดูรายละเอียด →
              </Link>
            </div>
            {moves.count ? (
              <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <dt className="text-slate-500">ได้รับเพิ่ม</dt>
                  <dd className="font-bold tabular-nums text-emerald-700">+{fmt(moves.inc)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">โอนออก</dt>
                  <dd className="font-bold tabular-nums text-rose-700">{fmt(moves.out)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">สุทธิ</dt>
                  <dd className={`font-bold tabular-nums ${moves.net < 0 ? "text-rose-700" : "text-[#1e1b4b]"}`}>
                    {moves.net > 0 ? "+" : ""}
                    {fmt(moves.net)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-[11px] text-slate-500">ไม่มีการปรับงบระหว่างปี</p>
            )}
            {moves.count ? <p className="mt-1 text-[10px] text-slate-400">{moves.count} รายการ · หน่วย {unit}</p> : null}
          </section>

          <section className="flex-1 rounded-[1.25rem] border border-[#e8e6fc] bg-white/90 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-black text-[#1e1b4b]">งบผูกพันปีถัดไป</h2>
              <Link to={`${base}?funding=commitment`} className="text-[11px] font-bold text-[#0000BF] hover:underline">
                ดูรายละเอียด →
              </Link>
            </div>
            {commitment.total > 0 ? (
              <>
                <FitSingleLine className="mt-1 font-black tabular-nums text-[#1e1b4b]" maxPx={20} minPx={11}>
                  {fmt(commitment.total)} <span className="text-[0.6em] font-bold text-[#66638c]">{unit}</span>
                </FitSingleLine>
                <p className="text-[10px] text-slate-400">{commitment.count} รายการ</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {commitment.years.map(([y, v]) => (
                    <span key={y} className="rounded-lg bg-[#f3f1ff] px-2 py-1 text-[11px]">
                      <b className="text-[#1e1b4b]">ปี {y + 543}</b>{" "}
                      <span className="tabular-nums text-slate-600">{fmt(v)}</span>
                    </span>
                  ))}
                </div>
                <ul className="mt-2 space-y-1 border-t border-[#ecebff] pt-2">
                  {commitment.list.map((r) => (
                    <li key={r.id} className="flex items-baseline justify-between gap-2 text-[11px]">
                      <span className="min-w-0 truncate text-[#1e1b4b]" title={r.name}>
                        {r.name}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-violet-700">
                        {fmt(r.commitmentTotal)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-[11px] text-slate-500">ไม่มีงบผูกพันปีถัดไป</p>
            )}
          </section>
        </div>
      </div>

      {/* ประเด็นที่ต้องติดตาม */}
      <section className="rounded-[1.25rem] border border-[#e8e6fc] bg-white/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-black text-[#1e1b4b]">ประเด็นที่ผู้บริหารควรติดตาม</h2>
          <Link to={`${base}?tab=availability`} className="text-[11px] font-bold text-[#0000BF] hover:underline">
            ดูงบคงเหลือทั้งหมด →
          </Link>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {statusTotals.map((s) => {
            const meta = AVAILABILITY_META[s.status];
            return (
              <div key={s.status} className="rounded-xl border border-[#ecebff] px-3 py-2" title={meta.hint}>
                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${meta.chip}`}>
                  {meta.label}
                </span>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <span className={`text-base font-black tabular-nums ${meta.amountTone}`}>{fmt(s.amount)}</span>
                  <span className="text-[11px] text-slate-500">{s.count} รายการ</span>
                </div>
              </div>
            );
          })}
        </div>
        {watch.length ? (
          <ul className="mt-3 divide-y divide-[#ecebff] overflow-hidden rounded-xl border border-[#ecebff]">
            {watch.map((w) => {
              const meta = AVAILABILITY_META[w.status];
              return (
                <li key={w.row.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-semibold text-[#1e1b4b]">
                      {w.row.code ? `${w.row.code} ` : ""}
                      {w.row.name}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                      <span className={`rounded-full px-1.5 py-0.5 font-bold ring-1 ${meta.chip}`}>{meta.label}</span>
                      <span>{w.row.kind ? kindLabel(w.row.kind as BudgetKind) : ""}</span>
                      <span>· งบสุทธิ {formatBaht(w.row.netBudget)}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] text-slate-500">{w.status === "OVER" ? "เกินงบ" : "ถัวได้"}</div>
                    <div className={`text-sm font-black tabular-nums ${meta.amountTone}`}>{fmt(Math.abs(w.free))}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-[11px] text-slate-500">ไม่มีรายการที่ต้องติดตามเป็นพิเศษ</p>
        )}
      </section>
    </div>
  );
}
