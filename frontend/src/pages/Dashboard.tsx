import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardStatDetailModal, type DashboardStatKind } from "../components/DashboardStatDetailModal";
import { FitSingleLine } from "../components/FitSingleLine";
import { MissionIncidentStatsCard } from "../components/MissionIncidentStatsSection";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { rowMatchesFilter } from "../lib/searchNormalize";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiJson } from "../api/client";
import { chartAxisFill, chartGridStroke, chartSeries, toolbarLinkBtnClass } from "../lib/uiTokens";
import type { MissionYearAreaStat, MissionYearTotals, MissionYearStatsResponse } from "../types";

function formatBahtStr(s: string | undefined) {
  const n = Number(s ?? 0);
  if (!Number.isFinite(n)) return "—";
  // แสดงเป็นบาทเต็มๆ ให้เทียบกับคอลัมน์ «รวมค่าใช้จ่าย» ใน Excel ได้ตรง
  return n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

const chartCardClass =
  "flex min-h-0 min-w-0 flex-col rounded-xl border border-slate-200 bg-white/70 px-2 pb-1 pt-2 print:border-0 print:bg-transparent print:p-0";
const chartTitleClass = "px-1 text-xs font-black text-[#1e1b4b] print:text-[9pt]";

function formatLitersStr(s: string | undefined) {
  const n = Number(s ?? 0);
  return n.toLocaleString("th-TH", { maximumFractionDigits: 3 });
}

/**
 * มาตราส่วนแกน Y ตามยอดสูงสุด — ยอดหลักร้อยล้านขึ้นไปแสดงเป็น «ล้าน» (บอกหน่วยที่หัวกราฟ)
 * ความกว้างแกนคำนวณจากความยาวตัวเลข ไม่ให้ตัวเลขชนขอบ
 */
function axisScale(max: number) {
  const div = max >= 100_000_000 ? 1_000_000 : 1;
  const fmt = (v: number) =>
    Number.isFinite(v) ? (v / div).toLocaleString("th-TH", { maximumFractionDigits: div > 1 ? 1 : 0 }) : "";
  const width = Math.max(32, fmt(max * 1.1).length * 6.4 + 10);
  return { div, unitLabel: div > 1 ? "ล้าน" : "", tickFormatter: fmt, width };
}

function AreaSummaryPanel({ areas, className = "" }: { areas: MissionYearAreaStat[]; className?: string }) {
  const rows = useMemo(
    () =>
      areas
        .map((a) => ({ code: a.code, cargo: Number(a.cargoValue) || 0, containers: a.containers }))
        .sort((x, y) => y.cargo - x.cargo),
    [areas],
  );
  const total = rows.reduce((s, r) => s + r.cargo, 0);
  const totalContainers = rows.reduce((s, r) => s + r.containers, 0);
  const max = rows[0]?.cargo ?? 0;
  const pct = (n: number) =>
    total > 0 ? `${((n / total) * 100).toLocaleString("th-TH", { maximumFractionDigits: 1 })}%` : "—";

  return (
    <div className={`${chartCardClass} min-h-[220px] print:break-inside-avoid ${className}`}>
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h3 className={chartTitleClass}>ส่งทรัพย์สินรายพื้นที่ (บาท)</h3>
        <span className="truncate text-[10.5px] font-bold tabular-nums text-[#4d47b6]">
          รวม {total.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
          <span className="text-amber-600"> · {totalContainers.toLocaleString("th-TH")} ตู้</span>
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-xs text-slate-500">ไม่มีข้อมูลพื้นที่</p>
      ) : (
        <ul className="mt-1 flex min-h-0 flex-1 flex-col justify-around px-1 pb-1">
          {rows.map((r, i) => (
            <li key={r.code} className="flex items-center gap-2 text-[11px] leading-tight">
              <span className="w-3.5 shrink-0 text-right font-bold tabular-nums text-slate-400">{i + 1}</span>
              <span className={`w-9 shrink-0 font-black ${i === 0 ? "text-[#4d47b6]" : "text-[#1e1b4b]"}`}>{r.code}</span>
              <div className="h-2 min-w-[2rem] flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${i === 0 ? "bg-[#4d47b6]" : "bg-[#4d47b6]/50"}`}
                  style={{ width: `${max > 0 ? (r.cargo / max) * 100 : 0}%` }}
                />
              </div>
              <span
                className={`shrink-0 text-right font-bold tabular-nums ${i === 0 ? "text-[#4d47b6]" : "text-[#2e2a58]"}`}
                title={`${pct(r.cargo)} ของยอดรวม`}
              >
                {r.cargo.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
              </span>
              <span className="w-10 shrink-0 text-right tabular-nums text-slate-500 lg:hidden 2xl:inline print:inline">
                {pct(r.cargo)}
              </span>
              <span className="w-11 shrink-0 text-right font-semibold tabular-nums text-amber-600">
                {r.containers.toLocaleString("th-TH")} ตู้
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type MetricRow = {
  label: string;
  missionCount: number;
  cargoBaht: number;
  expenseBaht: number;
};

function MetricBarChart<T extends MetricRow>({
  title,
  data,
  dataKey,
  color,
  unit,
  integer,
  extra,
  compact,
  className = "",
}: {
  title: string;
  data: T[];
  dataKey: keyof T & string;
  color: string;
  unit: string;
  integer?: boolean;
  extra?: (row: T) => string | null;
  /** การ์ดแคบ — ให้ recharts ข้ามป้ายเดือนที่ชนกัน */
  compact?: boolean;
  className?: string;
}) {
  const total = data.reduce((s, row) => s + (Number(row[dataKey]) || 0), 0);
  const scale = axisScale(data.reduce((m, row) => Math.max(m, Number(row[dataKey]) || 0), 0));
  return (
    <div className={`${chartCardClass} h-[220px] lg:h-auto print:h-auto ${className}`}>
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h3 className={chartTitleClass}>
          {title}
          {scale.unitLabel ? (
            <span className="ml-1 text-[10px] font-semibold text-slate-500">· แกนเป็น{scale.unitLabel}{unit}</span>
          ) : null}
        </h3>
        <span className="truncate text-[10.5px] font-bold tabular-nums" style={{ color }}>
          รวม {total.toLocaleString("th-TH", { maximumFractionDigits: integer ? 0 : 2 })}
        </span>
      </div>
      <div className="min-h-0 w-full min-w-0 flex-1 print:h-[4.6cm] print:flex-none">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
            <XAxis
              dataKey="label"
              interval={compact ? "preserveStartEnd" : 0}
              tick={{ fill: chartAxisFill, fontSize: 9.5, fontFamily: "Noto Sans Thai, sans-serif" }}
              tickLine={false}
              axisLine={{ stroke: chartGridStroke }}
            />
            <YAxis
              allowDecimals={!integer}
              tickFormatter={scale.tickFormatter}
              tick={{ fill: chartAxisFill, fontSize: 10, fontFamily: "Noto Sans Thai, sans-serif" }}
              tickLine={false}
              axisLine={{ stroke: chartGridStroke }}
              width={scale.width}
            />
            <Tooltip
              cursor={{ fill: "rgba(77,71,182,0.06)" }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as T | undefined;
                if (!active || !row) return null;
                const v = Number(row[dataKey]) || 0;
                const note = extra?.(row);
                return (
                  <div
                    className="rounded-md border border-slate-200 bg-white/95 px-2 py-1.5 text-[11px] shadow-xl"
                    style={{ fontFamily: "Noto Sans Thai, sans-serif" }}
                  >
                    <p className="font-medium text-slate-700">
                      {row.label} · {row.missionCount.toLocaleString("th-TH")} ภารกิจ
                    </p>
                    <p className="font-bold tabular-nums" style={{ color }}>
                      {v.toLocaleString("th-TH", { maximumFractionDigits: integer ? 0 : 2 })} {unit}
                    </p>
                    {note ? <p className="text-slate-500">{note}</p> : null}
                  </div>
                );
              }}
            />
            <Bar dataKey={dataKey as string} fill={color} radius={[5, 5, 0, 0]} maxBarSize={34} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function Dashboard() {
  const [dashboardYears, setDashboardYears] = useState<number[]>([]);
  const [yearsErr, setYearsErr] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [yearStats, setYearStats] = useState<MissionYearStatsResponse | null>(null);
  const [statsErr, setStatsErr] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [listFilter, setListFilter] = useState("");
  const [detailKind, setDetailKind] = useState<DashboardStatKind | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiJson<{ years: number[] }>("/api/missions/stats/years");
        if (cancelled) return;
        setDashboardYears(r.years);
        setYearsErr(null);
        setSelectedYear((prev) => {
          if (!r.years.length) return prev;
          return r.years.includes(prev) ? prev : r.years[0];
        });
      } catch (e) {
        if (!cancelled) setYearsErr(e instanceof Error ? e.message : "โหลดรายการปีไม่สำเร็จ");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadYearStats = useCallback(async (year: number) => {
    setStatsLoading(true);
    setStatsErr(null);
    try {
      const data = await apiJson<MissionYearStatsResponse>(`/api/missions/stats/year?year=${year}`);
      setYearStats(data);
    } catch (e) {
      setYearStats(null);
      setStatsErr(e instanceof Error ? e.message : "โหลดสถิติไม่สำเร็จ");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadYearStats(selectedYear);
  }, [selectedYear, loadYearStats]);

  /** ให้ Recharts วัดขนาดใหม่ตอนพิมพ์ (ความสูง print:*) */
  useEffect(() => {
    const bump = () => window.dispatchEvent(new Event("resize"));
    window.addEventListener("beforeprint", bump);
    window.addEventListener("afterprint", bump);
    return () => {
      window.removeEventListener("beforeprint", bump);
      window.removeEventListener("afterprint", bump);
    };
  }, []);

  const chartData = useMemo(() => {
    if (!yearStats?.months.length) return [];
    return yearStats.months.map((row) => {
      const cargoBaht = Number(row.cargoValue) || 0;
      const totalExpenseBaht = Number(row.expenses) || 0;
      const truckBaht = Number(row.truckHire ?? 0) || 0;
      const maintenanceBaht = Number(row.maintenanceCost ?? 0) || 0;
      const fuelGasoline = Number(row.fuelGasolineLiters ?? 0) || 0;
      const fuelDiesel = Number(row.fuelDieselLiters ?? 0) || 0;
      return {
        ...row,
        cargoBaht,
        /** ค่าใช้จ่ายภารกิจ ไม่รวมค่าจ้างรถบรรทุก */
        expenseBaht: Math.max(0, totalExpenseBaht - truckBaht),
        truckBaht,
        fuelGasoline,
        fuelDiesel,
        maintenanceBaht,
      };
    });
  }, [yearStats]);

  const displayChartData = useMemo(() => {
    if (!listFilter.trim()) return chartData;
    return chartData.filter((row) =>
      rowMatchesFilter(listFilter, [
        row.label,
        String(row.month),
        String(row.missionCount),
        String(row.containers),
        row.cargoValue,
        row.expenses,
        String(row.fuelGasolineLiters ?? ""),
        String(row.fuelDieselLiters ?? ""),
        String(row.maintenanceCost ?? ""),
      ]),
    );
  }, [chartData, listFilter]);

  const fuelScale = useMemo(
    () => axisScale(displayChartData.reduce((m, r) => Math.max(m, r.fuelGasoline + r.fuelDiesel), 0)),
    [displayChartData],
  );

  const filteredAreas = useMemo(() => {
    const areas = yearStats?.areas ?? [];
    if (!listFilter.trim()) return areas;
    const byCode = areas.filter((a) => rowMatchesFilter(listFilter, [a.code]));
    // คำกรองที่เป็นชื่อเดือนไม่ควรทำให้รายการพื้นที่หายหมด
    return byCode.length ? byCode : areas;
  }, [yearStats, listFilter]);

  /** รวมทั้งปี — จาก API หรือรวมจากรายเดือน */
  const yearTotalsResolved = useMemo((): MissionYearTotals | null => {
    if (!yearStats?.months.length) return null;
    const yt = yearStats.yearTotals;
    if (yt) return yt;
    const m = yearStats.months;
    const sumStr = (get: (row: (typeof m)[0]) => number) =>
      String(m.reduce((s, row) => s + get(row), 0));
    return {
      cargoValue: sumStr((row) => Number(row.cargoValue) || 0),
      expenses: sumStr((row) => Number(row.expenses) || 0),
      truckHire: sumStr((row) => Number(row.truckHire ?? 0) || 0),
      containers: m.reduce((s, row) => s + (row.containers || 0), 0),
      missionCount: m.reduce((s, row) => s + (row.missionCount || 0), 0),
      fuelGasolineLiters: sumStr((row) => Number(row.fuelGasolineLiters ?? 0) || 0),
      fuelDieselLiters: sumStr((row) => Number(row.fuelDieselLiters ?? 0) || 0),
      maintenanceCost: sumStr((row) => Number(row.maintenanceCost ?? 0) || 0),
    };
  }, [yearStats]);

  const yearOptions = useMemo(() => {
    if (dashboardYears.length > 0) return [...dashboardYears];
    return [selectedYear];
  }, [dashboardYears, selectedYear]);

  const filteredYearStatItems = useMemo(() => {
    if (!yearTotalsResolved) return [];
    const items = [
      {
        k: "ทรัพย์สิน (บาท)",
        v: formatBahtStr(yearTotalsResolved.cargoValue),
        tone: "text-[#4d47b6]",
        size: "xl",
        kind: "cargo",
      },
      {
        kind: "operating",
        k: "ค่าใช้จ่ายภารกิจ (บาท)",
        v: formatBahtStr(
          String(
            Math.max(0, (Number(yearTotalsResolved.expenses) || 0) - (Number(yearTotalsResolved.truckHire ?? 0) || 0)),
          ),
        ),
        tone: "text-[#ec4899]",
      },
      {
        k: "ค่าจ้างรถบรรทุกสินค้า (บาท)",
        v: formatBahtStr(yearTotalsResolved.truckHire ?? "0"),
        tone: "text-emerald-600",
        kind: "truck",
      },
      {
        k: "ตู้ (ใบ)",
        v: yearTotalsResolved.containers.toLocaleString("th-TH"),
        tone: "text-amber-600",
        size: "sm",
        kind: "containers",
      },
      {
        k: "ภารกิจ (ครั้ง)",
        v: yearTotalsResolved.missionCount.toLocaleString("th-TH"),
        tone: "text-[#1e1b4b]",
        size: "sm",
        kind: "missions",
      },
      {
        k: "น้ำมันเบนซิน (ลิตร)",
        v: formatLitersStr(yearTotalsResolved.fuelGasolineLiters),
        tone: "text-[#8b5cf6]",
        kind: "gasoline",
      },
      {
        k: "น้ำมันดีเซล (ลิตร)",
        v: formatLitersStr(yearTotalsResolved.fuelDieselLiters),
        tone: "text-[#0000BF]",
        kind: "diesel",
      },
      {
        k: "บำรุงรถ (บาท)",
        v: formatBahtStr(yearTotalsResolved.maintenanceCost),
        tone: "text-[#7c3aed]",
        kind: "maintenance",
      },
    ] as Array<{ k: string; v: string; tone: string; size?: "xl" | "sm"; kind: DashboardStatKind }>;
    return items.filter((item) => rowMatchesFilter(listFilter, [item.k, item.v]));
  }, [yearTotalsResolved, listFilter]);

  return (
    <div className="overview-a4-print">
      <PageHeaderBar
        title={`สถิติภารกิจ — พ.ศ. ${selectedYear + 543}`}
        count={filteredYearStatItems.length}
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: `ขนส่งธนบัตร — พ.ศ. ${selectedYear + 543}`,
          placeholder: "กรอง…",
        }}
        extras={
          <label className={`${toolbarLinkBtnClass} gap-1.5`}>
            <span className="text-[10px] font-semibold text-[#66638c]">ปี</span>
            <select
              className="min-w-[7.5rem] border-0 bg-transparent text-[11px] font-bold text-[#1e1b3a] outline-none sm:text-xs"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              aria-label="เลือกปี"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  พ.ศ. {y + 543}
                </option>
              ))}
            </select>
          </label>
        }
      />

      {yearsErr && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 print:hidden">
          โหลดรายการปีไม่สำเร็จ: {yearsErr} — ยังใช้ปีปัจจุบันเป็นค่าเริ่มต้น
        </div>
      )}

      <section className="mt-2 print:mt-0">
        {statsErr && (
          <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 print:hidden">
            {statsErr}
          </div>
        )}

        {!statsLoading && yearTotalsResolved && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex print:mt-1 print:flex print:gap-1">
            {filteredYearStatItems.length === 0 ? (
              <div className="col-span-full rounded-xl border border-slate-200 bg-white/60 px-3 py-2 text-center text-sm text-slate-600">
                ไม่มีช่องยอดรวมที่ตรงกับการกรอง
              </div>
            ) : (
              filteredYearStatItems.map((item) => (
                <button
                  type="button"
                  key={item.k}
                  onClick={() => setDetailKind(item.kind)}
                  title="คลิกดูรายละเอียด"
                  className={`min-w-0 cursor-pointer rounded-xl border border-slate-200 bg-white/70 px-2.5 py-1.5 text-left transition hover:border-[#4d47b6]/40 hover:bg-white hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d47b6]/40 print:rounded-md print:px-1.5 print:py-1 ${
                    item.size === "xl"
                      ? "col-span-2 xl:flex-[2.4] print:flex-[2.4]"
                      : item.size === "sm"
                        ? "xl:flex-[0.55] print:flex-[0.55]"
                        : "xl:flex-[1.3] print:flex-[1.3]"
                  }`}
                >
                  <FitSingleLine className="font-medium text-slate-600" maxPx={10.5} minPx={8} title={item.k}>
                    {item.k}
                  </FitSingleLine>
                  <FitSingleLine className={`font-bold tabular-nums ${item.tone}`} maxPx={17} minPx={11} title={item.v}>
                    {item.v}
                  </FitSingleLine>
                </button>
              ))
            )}
          </div>
        )}

        {statsLoading ? (
          <div className="mt-2 flex h-40 items-center justify-center text-slate-700">กำลังโหลดสถิติภารกิจ…</div>
        ) : displayChartData.length === 0 ? (
          <div className="mt-2 flex h-40 items-center justify-center text-slate-700">
            {chartData.length === 0 ? "ไม่มีข้อมูล" : "ไม่มีเดือนที่ตรงกับการกรอง"}
          </div>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:h-[calc(100dvh-14.5rem)] lg:min-h-[28rem] lg:grid-cols-12 lg:grid-rows-2 print:mt-1 print:grid print:h-auto print:min-h-0 print:grid-cols-2 print:gap-1">
            <MetricBarChart
              className="lg:col-span-4"
              title="มูลค่าทรัพย์สิน (บาท)"
              data={displayChartData}
              dataKey="cargoBaht"
              color={chartSeries.cargo}
              unit="บาท"
              extra={(row) => `จำนวนตู้ ${row.containers.toLocaleString("th-TH")} ใบ`}
            />
            <MetricBarChart
              className="lg:col-span-4"
              title="ค่าใช้จ่ายภารกิจ (บาท)"
              data={displayChartData}
              dataKey="expenseBaht"
              color={chartSeries.expense}
              unit="บาท"
              extra={(row) =>
                row.cargoBaht > 0
                  ? `คิดเป็น ${((row.expenseBaht / row.cargoBaht) * 100).toLocaleString("th-TH", {
                      maximumFractionDigits: 3,
                    })}% ของมูลค่าทรัพย์สิน`
                  : null
              }
            />
            <MetricBarChart
              className="lg:col-span-4"
              title="ค่าจ้างรถบรรทุกสินค้า (บาท)"
              data={displayChartData}
              dataKey="truckBaht"
              color="#059669"
              unit="บาท"
              extra={(row) =>
                row.cargoBaht > 0
                  ? `คิดเป็น ${((row.truckBaht / row.cargoBaht) * 100).toLocaleString("th-TH", {
                      maximumFractionDigits: 3,
                    })}% ของมูลค่าทรัพย์สิน`
                  : null
              }
            />
            <div className={`${chartCardClass} h-[220px] lg:col-span-3 lg:h-auto print:h-auto`}>
              <h3 className={chartTitleClass}>น้ำมันภารกิจ (ลิตร)</h3>
              <div className="min-h-0 w-full min-w-0 flex-1 print:h-[4.6cm] print:flex-none">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={displayChartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                    <XAxis
                      dataKey="label"
                      interval="preserveStartEnd"
                      tick={{ fill: chartAxisFill, fontSize: 9.5, fontFamily: "Noto Sans Thai, sans-serif" }}
                      tickLine={false}
                      axisLine={{ stroke: chartGridStroke }}
                    />
                    <YAxis
                      tickFormatter={fuelScale.tickFormatter}
                      tick={{ fill: chartAxisFill, fontSize: 10, fontFamily: "Noto Sans Thai, sans-serif" }}
                      tickLine={false}
                      axisLine={{ stroke: chartGridStroke }}
                      width={fuelScale.width}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        border: "1px solid #d8d6ec",
                        borderRadius: "12px",
                        fontFamily: "Noto Sans Thai, sans-serif",
                        fontSize: 12,
                        color: "#2e2a58",
                      }}
                      formatter={(value, name) => [
                        `${Number(value ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 3 })} ลิตร`,
                        String(name ?? ""),
                      ]}
                    />
                    <Legend
                      wrapperStyle={{ fontFamily: "Noto Sans Thai, sans-serif", fontSize: 11, lineHeight: "14px" }}
                      formatter={(value) => <span className="text-[#2e2a58]">{value}</span>}
                    />
                    <Bar
                      dataKey="fuelGasoline"
                      name="เบนซิน"
                      stackId="fuel"
                      fill={chartSeries.gasoline}
                      maxBarSize={36}
                    />
                    <Bar
                      dataKey="fuelDiesel"
                      name="ดีเซล"
                      stackId="fuel"
                      fill={chartSeries.diesel}
                      radius={[6, 6, 0, 0]}
                      maxBarSize={36}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <MetricBarChart
              className="lg:col-span-3"
              title="บำรุงรถ (บาท)"
              data={displayChartData}
              dataKey="maintenanceBaht"
              color={chartSeries.maintenance}
              unit="บาท"
              compact
            />
            <MissionIncidentStatsCard year={selectedYear} className="lg:col-span-3" />
            <AreaSummaryPanel
              areas={filteredAreas}
              className="lg:col-span-3 lg:min-h-0 print:col-span-2"
            />
          </div>
        )}
      </section>

      <DashboardStatDetailModal kind={detailKind} year={selectedYear} onClose={() => setDetailKind(null)} />
    </div>
  );
}
