import { useCallback, useEffect, useMemo, useState } from "react";
import { FitSingleLine } from "../components/FitSingleLine";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { rowMatchesFilter } from "../lib/searchNormalize";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { apiJson } from "../api/client";
import { chartAxisFill, chartGridStroke, chartSeries, toolbarLinkBtnClass } from "../lib/uiTokens";
import type { MissionYearTotals, MissionYearStatsResponse } from "../types";

/** แกนกราฟ: ค่าที่ plot เป็นสิบล้าน/แสนแล้ว — แสดงทศนิยมสั้นๆ */
function formatMixedScaleTick(v: number) {
  if (!Number.isFinite(v)) return "";
  if (v === 0) return "0";
  return v.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function formatBahtStr(s: string | undefined) {
  const n = Number(s ?? 0);
  if (!Number.isFinite(n)) return "—";
  // แสดงเป็นบาทเต็มๆ ให้เทียบกับคอลัมน์ «รวมค่าใช้จ่าย» ใน Excel ได้ตรง
  return n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

/** มูลค่าทรัพย์สินจากชีตเป็นล้านบาท — แสดงหน่วยให้ตรงไฟล์ */
function formatCargoMillionBahtStr(s: string | undefined) {
  const n = Number(s ?? 0);
  if (!Number.isFinite(n)) return "—";
  const million = n / 1_000_000;
  return million.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function formatLitersStr(s: string | undefined) {
  const n = Number(s ?? 0);
  return n.toLocaleString("th-TH", { maximumFractionDigits: 3 });
}

type MissionTooltipPayload = {
  label: string;
  missionCount: number;
  cargoBaht: number;
  expenseBaht: number;
  containers: number;
};

/** Tooltip กราฟภารกิจ — กระชับ: ค่ารายประเภท + สัดส่วนจ่าย/ทรัพย์ */
function MissionMonthlyTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as MissionTooltipPayload | undefined;
  if (!row) return null;

  const { label, missionCount, cargoBaht, expenseBaht } = row;
  const pct =
    cargoBaht > 0
      ? ((expenseBaht / cargoBaht) * 100).toLocaleString("th-TH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      : null;

  const seriesRows = payload.map((item) => {
    const fullName = String(item.name ?? "");
    const n = typeof item.value === "number" ? item.value : Number(item.value);
    const color = item.color ?? "#475569";
    let shortLabel: string;
    let display: string;
    if (fullName.includes("จำนวนตู้")) {
      shortLabel = "ตู้";
      display = Number.isFinite(n) ? n.toLocaleString("th-TH") : String(item.value ?? "—");
    } else if (fullName.includes("มูลค่าทรัพย์สิน")) {
      shortLabel = "ทรัพย์สิน";
      display = `${(cargoBaht / 10_000_000).toLocaleString("th-TH", {
        maximumFractionDigits: 4,
      })} สิบล้าน`;
    } else if (fullName.includes("ค่าใช้จ่าย")) {
      shortLabel = "จ่าย";
      display = `${(expenseBaht / 100_000).toLocaleString("th-TH", {
        maximumFractionDigits: 4,
      })} แสนบาท`;
    } else {
      shortLabel = fullName.slice(0, 12);
      display = String(item.value ?? "—");
    }
    return { key: fullName, shortLabel, display, color };
  });

  return (
    <div
      className="min-w-[9.5rem] max-w-[11rem] rounded-md border border-slate-200 bg-white/90 px-2 py-1.5 text-[11px] shadow-xl"
      style={{ fontFamily: "Noto Sans Thai, sans-serif" }}
    >
      <p className="font-medium text-slate-800">
        {label} · {missionCount}
      </p>
      <ul className="mt-1 space-y-0.5">
        {seriesRows.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 leading-tight text-slate-700">
            <span className="h-1.5 w-1.5 shrink-0 rounded-[1px]" style={{ backgroundColor: s.color }} aria-hidden />
            <span className="shrink-0 text-slate-700">{s.shortLabel}</span>
            <span className="ml-auto tabular-nums text-slate-800">{s.display}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 border-t border-slate-200 pt-1 leading-tight text-slate-700">
        สัดส่วน{" "}
        {pct != null ? (
          <span className="font-semibold text-[#4d47b6] tabular-nums">{pct}%</span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </p>
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
      const expenseBaht = Number(row.expenses) || 0;
      const maintenanceBaht = Number(row.maintenanceCost ?? 0) || 0;
      const fuelGasoline = Number(row.fuelGasolineLiters ?? 0) || 0;
      const fuelDiesel = Number(row.fuelDieselLiters ?? 0) || 0;
      return {
        ...row,
        cargoBaht,
        expenseBaht,
        fuelGasoline,
        fuelDiesel,
        maintenanceBaht,
        /** มูลค่าทรัพย์สิน ÷ 10,000,000 (สิบล้านบาท) สำหรับแท่งกราฟ */
        cargoTenMillions: cargoBaht / 10_000_000,
        /** ค่าใช้จ่าย ÷ 100,000 (แสนบาท) สำหรับแท่งกราฟ */
        expenseHundredThousands: expenseBaht / 100_000,
        /** บำรุงรักษา ÷ 100,000 (แสนบาท) */
        maintenanceHundredThousands: maintenanceBaht / 100_000,
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
        k: "ทรัพย์สิน (ล้านบาท)",
        v: formatCargoMillionBahtStr(yearTotalsResolved.cargoValue),
        tone: "text-[#4d47b6]",
      },
      {
        k: "ค่าใช้จ่ายภารกิจ (บาท)",
        v: formatBahtStr(yearTotalsResolved.expenses),
        tone: "text-[#ec4899]",
      },
      { k: "จำนวนตู้ (ใบ)", v: yearTotalsResolved.containers.toLocaleString("th-TH"), tone: "text-amber-600" },
      { k: "จำนวนภารกิจ (ครั้ง)", v: yearTotalsResolved.missionCount.toLocaleString("th-TH"), tone: "text-[#1e1b4b]" },
      { k: "น้ำมันเบนซิน (ลิตร)", v: formatLitersStr(yearTotalsResolved.fuelGasolineLiters), tone: "text-[#8b5cf6]" },
      { k: "น้ำมันดีเซล (ลิตร)", v: formatLitersStr(yearTotalsResolved.fuelDieselLiters), tone: "text-[#0000BF]" },
      { k: "บำรุงรถ (บาท)", v: formatBahtStr(yearTotalsResolved.maintenanceCost), tone: "text-[#7c3aed]" },
    ];
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
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-700 print:text-[8pt]">
              รวมทั้งปี พ.ศ. {selectedYear + 543}
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 print:mt-1 print:grid-cols-7 print:gap-1">
              {filteredYearStatItems.length === 0 ? (
                <div className="col-span-full rounded-xl border border-slate-200 bg-white/60 px-3 py-4 text-center text-sm text-slate-600">
                  ไม่มีช่องยอดรวมที่ตรงกับการกรอง
                </div>
              ) : (
                filteredYearStatItems.map((item) => (
                  <div
                    key={item.k}
                    className="min-w-0 rounded-xl border border-slate-200 bg-white/60 px-3 py-3 shadow-inner shadow-black/20 print:rounded-md print:px-1.5 print:py-1 print:shadow-none"
                  >
                    <FitSingleLine className="font-medium text-slate-700" maxPx={11} minPx={8} title={item.k}>
                      {item.k}
                    </FitSingleLine>
                    <FitSingleLine className={`mt-1 font-bold tabular-nums ${item.tone}`} maxPx={18} minPx={11} title={item.v}>
                      {item.v}
                    </FitSingleLine>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="mt-3 h-[400px] w-full min-w-0 print:mt-1 print:h-[7.2cm]">
          {statsLoading ? (
            <div className="flex h-full items-center justify-center text-slate-700">กำลังโหลดสถิติภารกิจ…</div>
          ) : displayChartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-slate-700">
              {chartData.length === 0 ? "ไม่มีข้อมูล" : "ไม่มีเดือนที่ตรงกับการกรอง"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={displayChartData} margin={{ top: 12, right: 16, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: chartAxisFill, fontSize: 11, fontFamily: "Noto Sans Thai, sans-serif" }}
                  tickLine={false}
                  axisLine={{ stroke: chartGridStroke }}
                />
                <YAxis
                  yAxisId="money"
                  tickFormatter={formatMixedScaleTick}
                  tick={{ fill: chartAxisFill, fontSize: 11, fontFamily: "Noto Sans Thai, sans-serif" }}
                  tickLine={false}
                  axisLine={{ stroke: chartGridStroke }}
                  width={52}
                />
                <YAxis
                  yAxisId="containers"
                  orientation="right"
                  allowDecimals={false}
                  tick={{ fill: chartSeries.containers, fontSize: 11, fontFamily: "Noto Sans Thai, sans-serif" }}
                  tickLine={false}
                  axisLine={{ stroke: chartGridStroke }}
                  width={36}
                />
                <Tooltip content={MissionMonthlyTooltip} />
                <Legend
                  wrapperStyle={{ fontFamily: "Noto Sans Thai, sans-serif", fontSize: 12 }}
                  formatter={(value) => <span className="text-[#2e2a58]">{value}</span>}
                />
                <Bar
                  yAxisId="money"
                  dataKey="cargoTenMillions"
                  name="มูลค่าทรัพย์สิน (สิบล้านบาท)"
                  fill={chartSeries.cargo}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  yAxisId="money"
                  dataKey="expenseHundredThousands"
                  name="ค่าใช้จ่าย (แสนบาท)"
                  fill={chartSeries.expense}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  yAxisId="containers"
                  dataKey="containers"
                  name="จำนวนตู้"
                  fill={chartSeries.containers}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={22}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {!statsLoading && displayChartData.length > 0 && (
          <>
            <div className="mt-8 print:mt-1.5">
              <h3 className="text-base font-black text-[#1e1b4b] print:text-[9pt]">น้ำมันภารกิจ (ลิตร)</h3>
              <div className="mt-3 h-[280px] w-full min-w-0 print:mt-0.5 print:h-[5.4cm]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={displayChartData} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: chartAxisFill, fontSize: 11, fontFamily: "Noto Sans Thai, sans-serif" }}
                      tickLine={false}
                      axisLine={{ stroke: chartGridStroke }}
                    />
                    <YAxis
                      tick={{ fill: chartAxisFill, fontSize: 11, fontFamily: "Noto Sans Thai, sans-serif" }}
                      tickLine={false}
                      axisLine={{ stroke: chartGridStroke }}
                      width={44}
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
                      wrapperStyle={{ fontFamily: "Noto Sans Thai, sans-serif", fontSize: 12 }}
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

            <div className="mt-8 print:mt-1.5">
              <h3 className="text-base font-black text-[#1e1b4b] print:text-[9pt]">บำรุงรถ (แสนบาท)</h3>
              <div className="mt-3 h-[280px] w-full min-w-0 print:mt-0.5 print:h-[5.4cm]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={displayChartData} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: chartAxisFill, fontSize: 11, fontFamily: "Noto Sans Thai, sans-serif" }}
                      tickLine={false}
                      axisLine={{ stroke: chartGridStroke }}
                    />
                    <YAxis
                      tickFormatter={formatMixedScaleTick}
                      tick={{ fill: chartAxisFill, fontSize: 11, fontFamily: "Noto Sans Thai, sans-serif" }}
                      tickLine={false}
                      axisLine={{ stroke: chartGridStroke }}
                      width={48}
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
                      formatter={(_value, _name, props) => {
                        const baht = (props?.payload as { maintenanceBaht?: number })?.maintenanceBaht ?? 0;
                        return [
                          `${baht.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`,
                          "บำรุงรักษา",
                        ];
                      }}
                    />
                    <Bar
                      dataKey="maintenanceHundredThousands"
                      name="บำรุงรักษา"
                      fill={chartSeries.maintenance}
                      radius={[6, 6, 0, 0]}
                      maxBarSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
