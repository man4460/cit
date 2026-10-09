import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiJson } from "../api/client";
import { SEVERITY_COLOR, SEVERITY_OPTIONS } from "../lib/missionIncidents";
import { chartAxisFill, chartGridStroke } from "../lib/uiTokens";

type IncidentStats = {
  year: number;
  totals: {
    incidents: number;
    high: number;
    medium: number;
    low: number;
    unresolved: number;
    cargoAffected: number;
    delayMinutes: number;
    tripsWithIncidents: number;
    tripCount: number;
  };
  months: Array<{ month: number; label: string; LOW: number; MEDIUM: number; HIGH: number; total: number }>;
  byCategory: Array<{ category: string; count: number; high: number }>;
};

export type SeverityBucket = { label: string; LOW: number; MEDIUM: number; HIGH: number };

export const CHART_FONT = "Noto Sans Thai, sans-serif";

const chartCardClass =
  "flex min-h-0 min-w-0 flex-col rounded-xl border border-slate-200 bg-white/70 px-2 pb-1 pt-2 print:border-0 print:bg-transparent print:p-0";

export function SeverityChart({ data, compact }: { data: SeverityBucket[]; compact?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
        <XAxis
          dataKey="label"
          interval={compact ? "preserveStartEnd" : 0}
          tick={{ fill: chartAxisFill, fontSize: compact ? 9.5 : 11, fontFamily: CHART_FONT }}
          tickLine={false}
          axisLine={{ stroke: chartGridStroke }}
        />
        <YAxis
          allowDecimals={false}
          width={24}
          tick={{ fill: chartAxisFill, fontSize: 10, fontFamily: CHART_FONT }}
          tickLine={false}
          axisLine={{ stroke: chartGridStroke }}
        />
        <Tooltip
          cursor={{ fill: "rgba(225,29,72,0.05)" }}
          contentStyle={{ borderRadius: 12, fontFamily: CHART_FONT, fontSize: 12 }}
          formatter={(v, name) => [`${Number(v ?? 0)} ครั้ง`, String(name ?? "")]}
        />
        {SEVERITY_OPTIONS.map((o, i) => (
          <Bar
            key={o.key}
            dataKey={o.key}
            name={o.label}
            stackId="sev"
            fill={SEVERITY_COLOR[o.key]}
            radius={i === SEVERITY_OPTIONS.length - 1 ? [4, 4, 0, 0] : undefined}
            maxBarSize={compact ? 18 : 36}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SeverityLegend() {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-slate-600">
      {SEVERITY_OPTIONS.map((o) => (
        <span key={o.key} className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SEVERITY_COLOR[o.key] }} />
          {o.label}
        </span>
      ))}
    </span>
  );
}

export function RankList({
  items,
  empty,
  barClass = "bg-rose-400",
}: {
  items: Array<{ key: string; count: number; note?: string; color?: string }>;
  empty: string;
  barClass?: string;
}) {
  const max = items[0]?.count ?? 0;
  if (!items.length) return <p className="py-4 text-center text-xs text-slate-500">{empty}</p>;
  return (
    <ol className="mt-2 space-y-2">
      {items.map((it, i) => (
        <li key={it.key} className="text-[11px]">
          <div className="flex items-baseline gap-2">
            <span className="w-3.5 shrink-0 text-right font-bold tabular-nums text-slate-400">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-semibold text-[#1e1b4b]" title={it.key}>
              {it.key}
            </span>
            {it.note ? (
              <span className="shrink-0 rounded-full bg-rose-50 px-1.5 text-[10px] font-bold text-rose-600">{it.note}</span>
            ) : null}
            <span className="shrink-0 font-bold tabular-nums text-[#2e2a58]">{it.count} ครั้ง</span>
          </div>
          <div className="ml-5 mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${it.color ? "" : barClass}`}
              style={{ width: `${max ? (it.count / max) * 100 : 0}%`, backgroundColor: it.color }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** การ์ดสรุปเหตุการณ์ไม่ปกติขนาดเล็กในกริดหน้าสรุปภาพรวม — คลิกไปหน้ารายละเอียด */
export function MissionIncidentStatsCard({ year, className = "" }: { year: number; className?: string }) {
  const [data, setData] = useState<IncidentStats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setErr(null);
    apiJson<IncidentStats>(`/api/missions/stats/incidents?year=${year}`, { skipCache: true })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"));
    return () => {
      cancelled = true;
    };
  }, [year]);

  const topCategory = data?.byCategory[0];
  const minis = useMemo(() => {
    if (!data) return [];
    const t = data.totals;
    return [
      { k: "ทริปที่มีเหตุ", v: `${t.tripsWithIncidents}/${t.tripCount}`, tone: "text-[#4d47b6]" },
      { k: "รุนแรง", v: String(t.high), tone: "text-rose-600" },
      { k: "ยังไม่ยุติ", v: String(t.unresolved), tone: "text-amber-600" },
    ];
  }, [data]);

  return (
    <Link
      to={`/missions/incidents?year=${year + 543}`}
      title="คลิกดูรายละเอียด"
      className={`${chartCardClass} h-[220px] text-left transition hover:border-rose-300 hover:shadow-sm lg:h-auto print:h-auto ${className}`}
    >
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h3 className="text-xs font-black text-[#1e1b4b] print:text-[9pt]">เหตุการณ์ไม่ปกติ</h3>
        <span className="truncate text-[10.5px] font-bold tabular-nums text-rose-600">
          {data ? `รวม ${data.totals.incidents.toLocaleString("th-TH")} ครั้ง` : ""}
        </span>
      </div>

      {err ? <p className="flex flex-1 items-center justify-center px-2 text-center text-xs text-rose-600">{err}</p> : null}
      {!data && !err ? <p className="flex flex-1 items-center justify-center text-xs text-slate-500">กำลังโหลด…</p> : null}

      {data && data.totals.incidents === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-lg text-emerald-700">✓</span>
          <p className="text-xs font-bold text-emerald-700">ไม่มีเหตุการณ์ไม่ปกติ</p>
          <p className="text-[10.5px] text-slate-500">{data.totals.tripCount.toLocaleString("th-TH")} ทริปในปีนี้</p>
        </div>
      ) : null}

      {data && data.totals.incidents > 0 ? (
        <>
          <div className="mt-1 grid grid-cols-3 gap-1 px-1">
            {minis.map((m) => (
              <div key={m.k} className="min-w-0 rounded-lg bg-slate-50 px-1.5 py-1 text-center">
                <p className="truncate text-[9.5px] text-slate-500">{m.k}</p>
                <p className={`text-sm font-bold tabular-nums leading-tight ${m.tone}`}>{m.v}</p>
              </div>
            ))}
          </div>
          <div className="min-h-0 w-full min-w-0 flex-1 print:h-[4cm] print:flex-none">
            <SeverityChart data={data.months} compact />
          </div>
          <div className="flex items-center gap-2 px-1 pb-0.5 text-[10px] text-slate-500">
            {SEVERITY_OPTIONS.map((o) => (
              <span key={o.key} className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SEVERITY_COLOR[o.key] }} />
                {o.label}
              </span>
            ))}
            {topCategory ? (
              <span className="ml-auto truncate font-semibold text-slate-600" title={topCategory.category}>
                พบบ่อย: {topCategory.category} ({topCategory.count})
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </Link>
  );
}
