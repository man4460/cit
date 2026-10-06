import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import { apiJson } from "../../api/client";
import { FitSingleLine } from "../../components/FitSingleLine";
import { Modal } from "../../components/Modal";
import { PageHeaderBar } from "../../components/PageHeaderBar";
import { installmentFor, isLastInstallment, lastInstallmentYm } from "../../lib/osInstallments";
import { chartAxisFill, chartGridStroke, mediaUrl, toolbarLinkBtnClass } from "../../lib/uiTokens";

type DocLink = { id: string; title: string; fileUrl: string | null; originalName: string | null };

type SummaryAcceptance = {
  id: string;
  monthYm: string;
  acceptedAmount: number;
  acceptedAt: string;
  remarks: string | null;
  documents: DocLink[];
};

type SummaryContract = {
  id: string;
  vendorName: string;
  contractNo: string | null;
  title: string | null;
  notes: string | null;
  startDate: string;
  endDate: string;
  monthlyAmount: number | null;
  totalAmount: number | null;
  acceptedToDate: number;
  active: boolean;
  documents: DocLink[];
  acceptances: SummaryAcceptance[];
};

type SummaryGroup = { id: string; code: string; name: string; contracts: SummaryContract[] };

type Summary = {
  year: number;
  minYear: number;
  maxYear: number;
  groups: SummaryGroup[];
  expiring: { id: string; vendorName: string; contractNo: string | null; endDate: string; areaGroup: { id: string; code: string; name: string } }[];
};

type CellState = "done" | "overdue" | "current" | "upcoming" | "none";

type Cell = {
  monthYm: string;
  state: CellState;
  amount: number | null;
  contract: SummaryContract | null;
  acceptance: SummaryAcceptance | null;
};

type Detail =
  | { kind: "group"; groupId: string; focusYm?: string }
  | { kind: "month"; monthIdx: number }
  | { kind: "overdue" }
  | { kind: "expiring" }
  | { kind: "contracts" }
  | { kind: "progress" };

const STATE_LABEL: Record<CellState, string> = {
  done: "ตรวจรับแล้ว",
  overdue: "ค้างตรวจรับ",
  current: "รอตรวจรับ (เดือนนี้)",
  upcoming: "ยังไม่ถึงกำหนด",
  none: "ไม่มีสัญญา",
};

const STATE_TEXT: Record<CellState, string> = {
  done: "text-emerald-700",
  overdue: "text-rose-600",
  current: "text-amber-700",
  upcoming: "text-slate-400",
  none: "text-slate-300",
};

const MONTH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const DONE_COLOR = "#059669";
const cardClass = "flex min-h-0 min-w-0 flex-col rounded-xl border border-slate-200 bg-white/70 p-2 print:border-0 print:bg-transparent print:p-0";
const cardTitleClass = "px-1 text-xs font-black text-[#1e1b4b] print:text-[9pt]";

function ym(year: number, monthIdx: number) {
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
}

function monthCovered(monthYm: string, c: SummaryContract) {
  const y = Number(monthYm.slice(0, 4));
  const m = Number(monthYm.slice(5, 7));
  const ms = new Date(y, m - 1, 1).getTime();
  const me = new Date(y, m, 0, 23, 59, 59, 999).getTime();
  return me >= new Date(c.startDate).getTime() && ms <= new Date(c.endDate).getTime();
}

function shortMoney(n: number) {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000) return `${sign}${Math.round(a / 1_000)}K`;
  return `${sign}${Math.round(a)}`;
}

function money(n: number) {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function MonthTooltip({ active, payload }: TooltipContentProps) {
  const row = payload?.[0]?.payload as { label: string; total: number; count: number } | undefined;
  if (!active || !row) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white/95 px-2 py-1.5 text-[11px] shadow-xl">
      <p className="font-bold text-[#1e1b4b]">{row.label}</p>
      <p style={{ color: DONE_COLOR }}>ยอดตรวจรับ {money(row.total)} บาท</p>
      <p className="text-slate-500">{row.count} กลุ่ม</p>
    </div>
  );
}

const CELL_CLASS: Record<CellState, string> = {
  done: "bg-emerald-50 text-emerald-800 border-emerald-200",
  overdue: "bg-rose-50 text-rose-600 border-rose-300 border-dashed",
  current: "bg-amber-50 text-amber-700 border-amber-300",
  upcoming: "bg-slate-50 text-slate-300 border-slate-100",
  none: "bg-transparent text-slate-200 border-transparent",
};

function LegendSwatch({ state, label }: { state: CellState; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2.5 w-3.5 rounded-sm border ${CELL_CLASS[state]}`} aria-hidden />
      {label}
    </span>
  );
}

export function OsOutsourcingDashboard() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    apiJson<Summary>(`/api/os-outsourcing/summary?year=${year}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [year]);

  const now = new Date();
  const currentYm = ym(now.getFullYear(), now.getMonth());

  const rows = useMemo(() => {
    if (!data) return [];
    return data.groups.map((g) => {
      const accByMonth = new Map<string, { acc: SummaryAcceptance; contract: SummaryContract }>();
      for (const c of g.contracts) for (const a of c.acceptances) accByMonth.set(a.monthYm, { acc: a, contract: c });

      const cells: Cell[] = MONTH_SHORT.map((_, i) => {
        const m = ym(data.year, i);
        const hit = accByMonth.get(m);
        if (hit) return { monthYm: m, state: "done", amount: hit.acc.acceptedAmount, contract: hit.contract, acceptance: hit.acc };
        const contract = g.contracts.find((c) => monthCovered(m, c)) ?? null;
        if (!contract) return { monthYm: m, state: "none", amount: null, contract: null, acceptance: null };
        const state: CellState = m < currentYm ? "overdue" : m === currentYm ? "current" : "upcoming";
        return { monthYm: m, state, amount: null, contract, acceptance: null };
      });

      const total = cells.reduce((s, c) => s + (c.state === "done" ? c.amount ?? 0 : 0), 0);
      const done = cells.filter((c) => c.state === "done").length;
      const due = cells.filter((c) => c.state === "done" || c.state === "overdue").length;
      const latest = [...g.contracts].reverse().find((c) => c.active) ?? g.contracts[g.contracts.length - 1] ?? null;
      return { group: g, cells, total, done, due, latest };
    });
  }, [data, currentYm]);

  const kpi = useMemo(() => {
    const activeContracts = rows.map((r) => r.latest).filter((c): c is SummaryContract => Boolean(c?.active));
    const yearContracts = rows.flatMap((r) => r.group.contracts);
    const contractValue = yearContracts.reduce((s, c) => s + (c.totalAmount ?? 0), 0);
    const missingValue = yearContracts.filter((c) => c.totalAmount == null).length;
    const total = rows.reduce((s, r) => s + r.total, 0);
    const done = rows.reduce((s, r) => s + r.done, 0);
    const due = rows.reduce((s, r) => s + r.due, 0);
    const overdue = due - done;
    return { activeContracts: activeContracts.length, contractValue, missingValue, total, done, due, overdue };
  }, [rows]);

  const monthChart = useMemo(
    () =>
      MONTH_SHORT.map((label, i) => {
        let total = 0;
        let count = 0;
        for (const r of rows) {
          const c = r.cells[i];
          if (c?.state === "done") {
            total += c.amount ?? 0;
            count += 1;
          }
        }
        return { label, total, count };
      }),
    [rows],
  );

  const monthTotals = monthChart.map((m) => m.total);

  const followUps = useMemo(() => {
    const list: { key: string; tone: "rose" | "amber"; title: string; sub: string; groupId: string }[] = [];
    for (const r of rows) {
      const overdue = r.cells.filter((c) => c.state === "overdue");
      if (overdue.length) {
        list.push({
          key: `od-${r.group.id}`,
          groupId: r.group.id,
          tone: "rose",
          title: `${r.group.name} — ค้างตรวจรับ ${overdue.length} เดือน`,
          sub: overdue.map((c) => MONTH_SHORT[Number(c.monthYm.slice(5, 7)) - 1]).join(", "),
        });
      }
    }
    for (const c of data?.expiring ?? []) {
      list.push({
        key: `ex-${c.id}`,
        groupId: c.areaGroup.id,
        tone: "amber",
        title: `${c.areaGroup.name} — สัญญาจะหมดใน ${daysUntil(c.endDate)} วัน`,
        sub: `${c.vendorName} · สิ้นสุด ${fmtDate(c.endDate)}`,
      });
    }
    return list;
  }, [rows, data]);

  const yearOptions = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const min = Math.min(data?.minYear ?? thisYear, thisYear);
    const max = Math.max(data?.maxYear ?? thisYear, thisYear);
    const out: number[] = [];
    for (let y = max; y >= min; y--) out.push(y);
    return out;
  }, [data]);

  const pct = kpi.due ? Math.round((kpi.done / kpi.due) * 100) : 0;

  const [detail, setDetail] = useState<Detail | null>(null);

  const summaryItems: { k: string; v: string; tone: string; open: Detail }[] = [
    { k: "สัญญาที่ใช้งาน", v: `${kpi.activeContracts} / ${rows.length} กลุ่ม`, tone: "text-[#1e1b4b]", open: { kind: "contracts" } },
    {
      k: kpi.missingValue ? `มูลค่าสัญญารวม (ยังไม่กรอก ${kpi.missingValue})` : "มูลค่าสัญญารวม",
      v: `${money(kpi.contractValue)} บาท`,
      tone: kpi.missingValue ? "text-slate-400" : "text-[#4d47b6]",
      open: { kind: "contracts" },
    },
    { k: `ยอดตรวจรับรวม ปี ${year + 543}`, v: `${money(kpi.total)} บาท`, tone: "text-emerald-700", open: { kind: "progress" } },
    { k: "ตรวจรับแล้ว (ถึงเดือนปัจจุบัน)", v: `${kpi.done} / ${kpi.due} เดือน · ${pct}%`, tone: "text-emerald-700", open: { kind: "progress" } },
    { k: "ค้างตรวจรับ", v: `${kpi.overdue} เดือน`, tone: kpi.overdue ? "text-rose-600" : "text-slate-500", open: { kind: "overdue" } },
    {
      k: "สัญญาใกล้หมด (≤ 90 วัน)",
      v: `${data?.expiring.length ?? 0} สัญญา`,
      tone: data?.expiring.length ? "text-amber-600" : "text-slate-500",
      open: { kind: "expiring" },
    },
  ];

  return (
    <div className="overview-a4-print">
      <PageHeaderBar
        title={`งานจ้าง OS — สรุปปี ${year + 543}`}
        count={rows.length}
        filter={{ value: "", onChange: () => {}, showSearch: false, printTitle: `งานจ้าง OS — สรุปปี ${year + 543}` }}
        extras={
          <div className="flex flex-wrap items-center gap-1.5">
            <Link to="/os-outsourcing" className={`${toolbarLinkBtnClass} print:hidden`}>
              บันทึกตรวจรับ
            </Link>
            <label className={`${toolbarLinkBtnClass} gap-1.5 print:hidden`}>
              <span className="text-[10px] font-semibold text-[#66638c]">ปี</span>
              <select
                className="min-w-[6.5rem] border-0 bg-transparent text-[11px] font-bold text-[#1e1b3a] outline-none sm:text-xs"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                aria-label="เลือกปี"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    พ.ศ. {y + 543}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
      />

      {err ? <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</div> : null}

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 print:grid-cols-6 print:gap-1">
        {summaryItems.map((item) => (
          <button
            type="button"
            key={item.k}
            title="คลิกดูรายละเอียด"
            onClick={() => setDetail(item.open)}
            className="min-w-0 cursor-pointer rounded-xl border border-slate-200 bg-white/70 px-2.5 py-1.5 text-left transition hover:border-[#4d47b6]/40 hover:bg-white hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d47b6]/40"
          >
            <FitSingleLine className="font-medium text-slate-600" maxPx={10.5} minPx={8} title={item.k}>
              {item.k}
            </FitSingleLine>
            <FitSingleLine className={`font-bold tabular-nums ${item.tone}`} maxPx={17} minPx={11} title={item.v}>
              {loading ? "…" : item.v}
            </FitSingleLine>
          </button>
        ))}
      </div>

      <div className="mt-2 grid gap-2 lg:h-[calc(100dvh-12.5rem)] lg:min-h-[24rem] lg:grid-cols-12 print:block print:h-auto">
        <div className={`${cardClass} lg:col-span-8`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
            <h3 className={cardTitleClass}>สถานะตรวจรับรายเดือน แยกกลุ่มพื้นที่</h3>
            <div className="flex flex-wrap items-center gap-2.5 text-[10px] font-semibold text-slate-600">
              <LegendSwatch state="done" label="ตรวจรับแล้ว" />
              <LegendSwatch state="current" label="เดือนนี้" />
              <LegendSwatch state="overdue" label="ค้างตรวจรับ" />
              <LegendSwatch state="upcoming" label="ยังไม่ถึง" />
            </div>
          </div>

          {loading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-600">กำลังโหลด…</div>
          ) : (
            <div className="mt-1.5 flex min-h-0 flex-1 flex-col overflow-x-auto">
              <div className="grid min-w-[44rem] grid-cols-[11rem_repeat(12,minmax(0,1fr))_6.5rem] gap-1 px-1 text-[10px] font-bold text-slate-500">
                <span>กลุ่ม / ผู้รับจ้าง</span>
                {MONTH_SHORT.map((m, i) => (
                  <span key={m} className={`text-center ${ym(year, i) === currentYm ? "text-amber-700" : ""}`}>
                    {m}
                  </span>
                ))}
                <span className="text-right">รวมทั้งปี</span>
              </div>

              <div className="mt-1 flex min-h-0 min-w-[44rem] flex-1 flex-col gap-1">
                {rows.map((r) => (
                  <div
                    key={r.group.id}
                    className="grid min-h-[2.5rem] flex-1 grid-cols-[11rem_repeat(12,minmax(0,1fr))_6.5rem] items-stretch gap-1 rounded-lg px-1 hover:bg-slate-50/80"
                  >
                    <button
                      type="button"
                      onClick={() => setDetail({ kind: "group", groupId: r.group.id })}
                      title="คลิกดูรายละเอียดกลุ่ม"
                      className="flex min-w-0 flex-col justify-center text-left hover:[&>p:first-child]:text-[#0000BF] hover:[&>p:first-child]:underline"
                    >
                      <p className="truncate text-[12px] font-black text-[#1e1b4b]">
                        <span className="mr-1 font-mono text-[10px] text-[#4d47b6]">{r.group.code}</span>
                        {r.group.name}
                      </p>
                      <p className="truncate text-[10px] text-slate-500" title={r.latest?.vendorName ?? ""}>
                        {r.latest ? r.latest.vendorName.replace(/^บริษัท\s*/, "").replace(/\s*จำกัด$/, "") : "ไม่มีสัญญา"}
                      </p>
                    </button>
                    {r.cells.map((c) => (
                      <button
                        type="button"
                        key={c.monthYm}
                        onClick={() => setDetail({ kind: "group", groupId: r.group.id, focusYm: c.monthYm })}
                        title={
                          c.state === "done"
                            ? `${MONTH_SHORT[Number(c.monthYm.slice(5, 7)) - 1]} · ${money(c.amount ?? 0)} บาท — คลิกดูรายละเอียด`
                            : `${STATE_LABEL[c.state]} — คลิกดูรายละเอียด`
                        }
                        className={`flex cursor-pointer items-center justify-center rounded-md border text-[10.5px] font-bold tabular-nums transition hover:brightness-95 hover:ring-2 hover:ring-[#4d47b6]/30 ${CELL_CLASS[c.state]} ${
                          c.monthYm === currentYm ? "ring-1 ring-amber-300" : ""
                        }`}
                      >
                        {c.state === "done" ? (
                          <span className={(c.amount ?? 0) < 0 ? "text-rose-600" : ""}>{shortMoney(c.amount ?? 0)}</span>
                        ) : c.state === "overdue" ? (
                          "ค้าง"
                        ) : c.state === "current" ? (
                          "รอ"
                        ) : c.state === "none" ? (
                          "—"
                        ) : (
                          "·"
                        )}
                      </button>
                    ))}
                    <div className="flex flex-col items-end justify-center">
                      <p className="text-[12px] font-black tabular-nums text-[#1e1b4b]">{shortMoney(r.total)}</p>
                      <p className={`text-[10px] tabular-nums ${r.done < r.due ? "text-rose-600" : "text-emerald-700"}`}>
                        {r.done}/{r.due} เดือน
                      </p>
                    </div>
                  </div>
                ))}

                <div className="grid grid-cols-[11rem_repeat(12,minmax(0,1fr))_6.5rem] gap-1 border-t border-slate-200 px-1 pt-1 text-[10.5px] font-black tabular-nums text-[#1e1b4b]">
                  <span className="text-slate-500">รวมรายเดือน</span>
                  {monthTotals.map((t, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => setDetail({ kind: "month", monthIdx: i })}
                      title={`ดูรายละเอียด ${MONTH_SHORT[i]}`}
                      className={`rounded text-center hover:bg-slate-100 hover:text-[#0000BF] ${t ? "" : "text-slate-300"}`}
                    >
                      {t ? shortMoney(t) : "—"}
                    </button>
                  ))}
                  <span className="text-right text-emerald-700">{shortMoney(kpi.total)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-col gap-2 lg:col-span-4">
          <div className={`${cardClass} h-[260px] lg:h-auto lg:flex-[3]`}>
            <h3 className={cardTitleClass}>ยอดตรวจรับรายเดือน (บาท)</h3>
            <div className="min-h-0 w-full flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthChart} margin={{ top: 16, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                  <XAxis
                    dataKey="label"
                    interval={0}
                    tick={{ fill: chartAxisFill, fontSize: 9, fontFamily: "Noto Sans Thai, sans-serif" }}
                    tickLine={false}
                    axisLine={{ stroke: chartGridStroke }}
                  />
                  <YAxis
                    tickFormatter={(v: number) => shortMoney(v)}
                    tick={{ fill: chartAxisFill, fontSize: 9.5 }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip cursor={{ fill: "rgba(5,150,105,0.06)" }} content={MonthTooltip} />
                  <Bar
                    dataKey="total"
                    fill={DONE_COLOR}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={26}
                    cursor="pointer"
                    onClick={(_d, index) => setDetail({ kind: "month", monthIdx: index })}
                  >
                    <LabelList
                      dataKey="total"
                      position="top"
                      fontSize={9}
                      fill="#1e1b4b"
                      formatter={(v) => (Number(v) ? shortMoney(Number(v)) : "")}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={`${cardClass} lg:flex-[2]`}>
            <div className="flex items-baseline justify-between px-1">
              <h3 className={cardTitleClass}>ต้องติดตาม</h3>
              <span className="text-[10px] font-semibold text-slate-400">{followUps.length} รายการ</span>
            </div>
            <ul className="mt-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-1">
              {loading ? null : followUps.length === 0 ? (
                <li className="py-4 text-center text-[12px] font-semibold text-emerald-700">ตรวจรับครบทุกกลุ่ม ไม่มีรายการค้าง</li>
              ) : (
                followUps.map((f) => (
                  <li key={f.key}>
                    <button
                      type="button"
                      onClick={() => setDetail({ kind: "group", groupId: f.groupId })}
                      className="flex w-full items-start gap-2 rounded-md px-1 py-0.5 text-left text-[11.5px] hover:bg-slate-50"
                    >
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${f.tone === "rose" ? "bg-rose-500" : "bg-amber-400"}`} />
                      <div className="min-w-0">
                        <p className="truncate font-bold text-[#1e1b4b]">{f.title}</p>
                        <p className="truncate text-[10.5px] text-slate-500">{f.sub}</p>
                      </div>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>

      <DetailModal detail={detail} onClose={() => setDetail(null)} onOpen={setDetail} rows={rows} data={data} year={year} />
    </div>
  );
}

type Row = {
  group: SummaryGroup;
  cells: Cell[];
  total: number;
  done: number;
  due: number;
  latest: SummaryContract | null;
};

function monthName(monthYm: string) {
  return `${MONTH_SHORT[Number(monthYm.slice(5, 7)) - 1]} ${Number(monthYm.slice(0, 4)) + 543}`;
}

function DocLinks({ docs }: { docs: DocLink[] }) {
  if (!docs.length) return <span className="text-slate-300">—</span>;
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5">
      {docs.map((d) => {
        const href = mediaUrl(d.fileUrl);
        const label = d.title || d.originalName || "เอกสาร";
        return href ? (
          <a key={d.id} href={href} target="_blank" rel="noreferrer" className="max-w-[14rem] truncate text-[#0000BF] hover:underline" title={label}>
            {label}
          </a>
        ) : (
          <span key={d.id} className="max-w-[14rem] truncate text-slate-500">
            {label}
          </span>
        );
      })}
    </span>
  );
}

const thClass = "px-2 py-1.5 text-left text-[11px] font-bold text-slate-500";
const tdClass = "px-2 py-1.5 align-top text-[12px]";

function DetailModal({
  detail,
  onClose,
  onOpen,
  rows,
  data,
  year,
}: {
  detail: Detail | null;
  onClose: () => void;
  onOpen: (d: Detail) => void;
  rows: Row[];
  data: Summary | null;
  year: number;
}) {
  if (!detail) return null;
  const be = year + 543;

  if (detail.kind === "group") {
    const row = rows.find((r) => r.group.id === detail.groupId);
    if (!row) return null;
    return (
      <Modal open onClose={onClose} size="wide" title={`${row.group.code} ${row.group.name} — ปี ${be}`}>
        <div className="space-y-3">
          {row.group.contracts.length === 0 ? (
            <p className="text-sm text-slate-500">ไม่มีสัญญาในปีนี้</p>
          ) : (
            row.group.contracts.map((c) => (
              <div key={c.id} className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-[12px]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-black text-[#1e1b4b]">{c.vendorName}</p>
                  <span className={`text-[11px] font-bold ${c.active ? "text-emerald-700" : "text-slate-400"}`}>
                    {c.active ? "ใช้งาน" : "ปิดสัญญา"}
                  </span>
                </div>
                <div className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-3">
                  <p>
                    <span className="text-slate-500">เลขที่สัญญา </span>
                    {c.contractNo || "—"}
                  </p>
                  <p>
                    <span className="text-slate-500">ระยะสัญญา </span>
                    {fmtDate(c.startDate)} – {fmtDate(c.endDate)}
                  </p>
                  <p>
                    <span className="text-slate-500">มูลค่าสัญญา </span>
                    <b className="tabular-nums">{c.totalAmount == null ? "—" : `${money(c.totalAmount)} บาท`}</b>
                  </p>
                  <p>
                    <span className="text-slate-500">งวดปกติ </span>
                    <b className="tabular-nums">{c.monthlyAmount == null ? "—" : `${money(c.monthlyAmount)} บาท`}</b>
                  </p>
                  <p>
                    <span className="text-slate-500">งวดสุดท้าย </span>
                    <b className="tabular-nums text-amber-700">
                      {c.totalAmount == null || c.monthlyAmount == null
                        ? "—"
                        : `${money(installmentFor(c, lastInstallmentYm(c.endDate) ?? "") ?? 0)} บาท`}
                    </b>
                  </p>
                  <p>
                    <span className="text-slate-500">ตรวจรับสะสม / คงเหลือ </span>
                    <b className="tabular-nums text-emerald-700">{money(c.acceptedToDate)}</b>
                    {c.totalAmount != null ? (
                      <b className="tabular-nums text-slate-600"> / {money(c.totalAmount - c.acceptedToDate)}</b>
                    ) : null}
                  </p>
                </div>
                {c.title ? <p className="mt-0.5 text-slate-600">{c.title}</p> : null}
                {c.notes ? <p className="mt-0.5 whitespace-pre-wrap text-slate-500">{c.notes}</p> : null}
                <div className="mt-1 flex gap-1.5">
                  <span className="shrink-0 text-slate-500">เอกสารสัญญา</span>
                  <DocLinks docs={c.documents} />
                </div>
              </div>
            ))
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[40rem]">
              <thead className="bg-slate-50">
                <tr>
                  <th className={thClass}>เดือน</th>
                  <th className={thClass}>สถานะ</th>
                  <th className={`${thClass} text-right`}>ยอดตรวจรับ (บาท)</th>
                  <th className={thClass}>วันที่บันทึก</th>
                  <th className={thClass}>หมายเหตุ</th>
                  <th className={thClass}>เอกสาร</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {row.cells.map((c) => {
                  const expected = c.contract ? installmentFor(c.contract, c.monthYm) : null;
                  const last = c.contract?.totalAmount != null && isLastInstallment(c.contract, c.monthYm);
                  return (
                  <tr key={c.monthYm} className={c.monthYm === detail.focusYm ? "bg-indigo-50/70" : ""}>
                    <td className={`${tdClass} font-bold text-[#1e1b4b]`}>
                      {monthName(c.monthYm)}
                      {last ? <span className="ml-1 text-[10px] font-bold text-amber-600">งวดสุดท้าย</span> : null}
                    </td>
                    <td className={`${tdClass} font-semibold ${STATE_TEXT[c.state]}`}>{STATE_LABEL[c.state]}</td>
                    <td className={`${tdClass} text-right font-bold tabular-nums ${(c.amount ?? 0) < 0 ? "text-rose-600" : ""}`}>
                      {c.amount == null ? (expected != null && c.state !== "none" ? <span className="font-normal text-slate-400">({money(expected)})</span> : "—") : money(c.amount)}
                    </td>
                    <td className={tdClass}>{c.acceptance ? fmtDate(c.acceptance.acceptedAt) : "—"}</td>
                    <td className={`${tdClass} max-w-[16rem] whitespace-pre-wrap text-slate-600`}>{c.acceptance?.remarks || "—"}</td>
                    <td className={tdClass}>{c.acceptance ? <DocLinks docs={c.acceptance.documents} /> : "—"}</td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50">
                <tr>
                  <td className={`${tdClass} font-black`} colSpan={2}>
                    รวม · ตรวจรับแล้ว {row.done}/{row.due} เดือน
                  </td>
                  <td className={`${tdClass} text-right font-black tabular-nums text-emerald-700`}>{money(row.total)}</td>
                  <td colSpan={3} className={`${tdClass} text-[11px] text-slate-400`}>
                    ตัวเลขในวงเล็บ = ค่าจ้างตามสัญญา (ยังไม่ตรวจรับ)
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex justify-end">
            <Link to="/os-outsourcing" className="text-[12px] font-bold text-[#0000BF] hover:underline">
              ไปหน้าบันทึกตรวจรับ →
            </Link>
          </div>
        </div>
      </Modal>
    );
  }

  if (detail.kind === "month") {
    const i = detail.monthIdx;
    const total = rows.reduce((s, r) => s + (r.cells[i]?.state === "done" ? r.cells[i].amount ?? 0 : 0), 0);
    return (
      <Modal open onClose={onClose} size="wide" title={`ตรวจรับเดือน ${MONTH_SHORT[i]} ${be}`}>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[36rem]">
            <thead className="bg-slate-50">
              <tr>
                <th className={thClass}>กลุ่ม</th>
                <th className={thClass}>ผู้รับจ้าง</th>
                <th className={thClass}>สถานะ</th>
                <th className={`${thClass} text-right`}>ยอด (บาท)</th>
                <th className={thClass}>เอกสาร</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const c = r.cells[i];
                if (!c) return null;
                return (
                  <tr key={r.group.id}>
                    <td className={tdClass}>
                      <button
                        type="button"
                        onClick={() => onOpen({ kind: "group", groupId: r.group.id, focusYm: c.monthYm })}
                        className="font-bold text-[#0000BF] hover:underline"
                      >
                        {r.group.code} {r.group.name}
                      </button>
                    </td>
                    <td className={`${tdClass} text-slate-600`}>{c.contract?.vendorName ?? "—"}</td>
                    <td className={`${tdClass} font-semibold ${STATE_TEXT[c.state]}`}>{STATE_LABEL[c.state]}</td>
                    <td className={`${tdClass} text-right font-bold tabular-nums`}>{c.amount == null ? "—" : money(c.amount)}</td>
                    <td className={tdClass}>{c.acceptance ? <DocLinks docs={c.acceptance.documents} /> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50">
              <tr>
                <td className={`${tdClass} font-black`} colSpan={3}>
                  รวม
                </td>
                <td className={`${tdClass} text-right font-black tabular-nums text-emerald-700`}>{money(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Modal>
    );
  }

  if (detail.kind === "overdue") {
    const items = rows.flatMap((r) => r.cells.filter((c) => c.state === "overdue").map((c) => ({ r, c })));
    return (
      <Modal open onClose={onClose} title={`ค้างตรวจรับ — ปี ${be} (${items.length} เดือน)`}>
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm font-semibold text-emerald-700">ไม่มีรายการค้างตรวจรับ</p>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className={thClass}>กลุ่ม</th>
                <th className={thClass}>เดือน</th>
                <th className={thClass}>ผู้รับจ้าง</th>
                <th className={`${thClass} text-right`}>ค่าจ้างตามสัญญา</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(({ r, c }) => (
                <tr key={`${r.group.id}-${c.monthYm}`}>
                  <td className={tdClass}>
                    <button
                      type="button"
                      onClick={() => onOpen({ kind: "group", groupId: r.group.id, focusYm: c.monthYm })}
                      className="font-bold text-[#0000BF] hover:underline"
                    >
                      {r.group.code} {r.group.name}
                    </button>
                  </td>
                  <td className={`${tdClass} font-semibold text-rose-600`}>{monthName(c.monthYm)}</td>
                  <td className={`${tdClass} text-slate-600`}>{c.contract?.vendorName ?? "—"}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>
                    {(() => {
                      const v = c.contract ? installmentFor(c.contract, c.monthYm) : null;
                      return v == null ? "—" : money(v);
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    );
  }

  if (detail.kind === "expiring") {
    const list = data?.expiring ?? [];
    return (
      <Modal open onClose={onClose} title={`สัญญาใกล้หมดภายใน 90 วัน (${list.length})`}>
        {list.length === 0 ? (
          <p className="py-4 text-center text-sm font-semibold text-emerald-700">ไม่มีสัญญาใกล้หมด</p>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className={thClass}>กลุ่ม</th>
                <th className={thClass}>ผู้รับจ้าง / เลขที่สัญญา</th>
                <th className={thClass}>สิ้นสุด</th>
                <th className={`${thClass} text-right`}>เหลือ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((c) => (
                <tr key={c.id}>
                  <td className={tdClass}>
                    <button
                      type="button"
                      onClick={() => onOpen({ kind: "group", groupId: c.areaGroup.id })}
                      className="font-bold text-[#0000BF] hover:underline"
                    >
                      {c.areaGroup.code} {c.areaGroup.name}
                    </button>
                  </td>
                  <td className={tdClass}>
                    <p>{c.vendorName}</p>
                    <p className="text-[11px] text-slate-500">{c.contractNo || "—"}</p>
                  </td>
                  <td className={tdClass}>{fmtDate(c.endDate)}</td>
                  <td className={`${tdClass} text-right font-bold text-amber-600`}>{daysUntil(c.endDate)} วัน</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    );
  }

  if (detail.kind === "contracts") {
    const list = rows.flatMap((r) => r.group.contracts.map((c) => ({ r, c })));
    const sumTotal = list.reduce((s, { c }) => s + (c.totalAmount ?? 0), 0);
    const sumAccepted = list.reduce((s, { c }) => s + c.acceptedToDate, 0);
    return (
      <Modal open onClose={onClose} size="wide" title={`สัญญาจ้าง OS ที่มีผลในปี ${be}`}>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[52rem]">
            <thead className="bg-slate-50">
              <tr>
                <th className={thClass}>กลุ่ม</th>
                <th className={thClass}>ผู้รับจ้าง</th>
                <th className={thClass}>ระยะสัญญา</th>
                <th className={`${thClass} text-right`}>มูลค่าสัญญา</th>
                <th className={`${thClass} text-right`}>งวดปกติ</th>
                <th className={`${thClass} text-right`}>งวดสุดท้าย</th>
                <th className={`${thClass} text-right`}>ตรวจรับสะสม</th>
                <th className={`${thClass} text-right`}>คงเหลือ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map(({ r, c }) => {
                const last =
                  c.totalAmount != null && c.monthlyAmount != null ? installmentFor(c, lastInstallmentYm(c.endDate) ?? "") : null;
                return (
                  <tr key={c.id} className={c.active ? "" : "text-slate-400"}>
                    <td className={tdClass}>
                      <button
                        type="button"
                        onClick={() => onOpen({ kind: "group", groupId: r.group.id })}
                        className="font-bold text-[#0000BF] hover:underline"
                      >
                        {r.group.code} {r.group.name}
                      </button>
                    </td>
                    <td className={`${tdClass} max-w-[14rem] truncate text-slate-600`} title={c.vendorName}>
                      {c.vendorName}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap`}>
                      {fmtDate(c.startDate)} – {fmtDate(c.endDate)}
                    </td>
                    <td className={`${tdClass} text-right font-bold tabular-nums`}>
                      {c.totalAmount == null ? <span className="font-normal text-slate-300">ยังไม่กรอก</span> : money(c.totalAmount)}
                    </td>
                    <td className={`${tdClass} text-right tabular-nums`}>{c.monthlyAmount == null ? "—" : money(c.monthlyAmount)}</td>
                    <td className={`${tdClass} text-right tabular-nums text-amber-700`}>{last == null ? "—" : money(last)}</td>
                    <td className={`${tdClass} text-right font-bold tabular-nums text-emerald-700`}>{money(c.acceptedToDate)}</td>
                    <td className={`${tdClass} text-right font-bold tabular-nums`}>
                      {c.totalAmount == null ? "—" : money(c.totalAmount - c.acceptedToDate)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50">
              <tr>
                <td className={`${tdClass} font-black`} colSpan={3}>
                  รวม
                </td>
                <td className={`${tdClass} text-right font-black tabular-nums`}>{money(sumTotal)}</td>
                <td colSpan={2} />
                <td className={`${tdClass} text-right font-black tabular-nums text-emerald-700`}>{money(sumAccepted)}</td>
                <td className={`${tdClass} text-right font-black tabular-nums`}>{sumTotal ? money(sumTotal - sumAccepted) : "—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">ตรวจรับสะสม = ยอดตรวจรับทั้งหมดของสัญญา (ทุกปี) · งวดสุดท้าย = มูลค่าสัญญา − งวดปกติ × (จำนวนงวด − 1)</p>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} size="wide" title={`ความคืบหน้าการตรวจรับ — ปี ${be}`}>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[36rem]">
          <thead className="bg-slate-50">
            <tr>
              <th className={thClass}>กลุ่ม</th>
              <th className={thClass}>ผู้รับจ้าง</th>
              <th className={`${thClass} text-right`}>ตรวจรับแล้ว</th>
              <th className={`${thClass} text-right`}>ค้าง</th>
              <th className={`${thClass} text-right`}>ยอดรวม (บาท)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const c = r.latest;
              return (
                <tr key={r.group.id}>
                  <td className={tdClass}>
                    <button
                      type="button"
                      onClick={() => onOpen({ kind: "group", groupId: r.group.id })}
                      className="font-bold text-[#0000BF] hover:underline"
                    >
                      {r.group.code} {r.group.name}
                    </button>
                  </td>
                  <td className={`${tdClass} text-slate-600`}>{c?.vendorName ?? "—"}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>
                    {r.done}/{r.due} เดือน
                  </td>
                  <td className={`${tdClass} text-right font-bold tabular-nums ${r.due - r.done ? "text-rose-600" : "text-slate-300"}`}>
                    {r.due - r.done}
                  </td>
                  <td className={`${tdClass} text-right font-bold tabular-nums text-emerald-700`}>{money(r.total)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50">
            <tr>
              <td className={`${tdClass} font-black`} colSpan={3}>
                รวม
              </td>
              <td className={`${tdClass} text-right font-black tabular-nums text-rose-600`}>
                {rows.reduce((s, r) => s + r.due - r.done, 0)}
              </td>
              <td className={`${tdClass} text-right font-black tabular-nums text-emerald-700`}>
                {money(rows.reduce((s, r) => s + r.total, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Modal>
  );
}
