import { useCallback, useEffect, useMemo, useState } from "react";
import { PageFilterPrintBar } from "../components/PageFilterPrintBar";
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
import type {
  Asset,
  MissionListItem,
  MissionYearTotals,
  MissionYearStatsResponse,
  Personnel,
  RouteMaster,
  Vehicle,
} from "../types";

function missionDashboardYear(m: MissionListItem): number | null {
  const raw = m.plannedStart ?? m.createdAt;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear();
}

/** แกนกราฟ: ค่าที่ plot เป็นสิบล้าน/แสนแล้ว — แสดงทศนิยมสั้นๆ */
function formatMixedScaleTick(v: number) {
  if (!Number.isFinite(v)) return "";
  if (v === 0) return "0";
  return v.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function formatBahtStr(s: string | undefined) {
  const n = Number(s ?? 0);
  return n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
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
    const color = item.color ?? "#94a3b8";
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
      className="min-w-[9.5rem] max-w-[11rem] rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-[11px] shadow-xl"
      style={{ fontFamily: "Noto Sans Thai, sans-serif" }}
    >
      <p className="font-medium text-slate-200">
        {label} · {missionCount}
      </p>
      <ul className="mt-1 space-y-0.5">
        {seriesRows.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 leading-tight text-slate-300">
            <span className="h-1.5 w-1.5 shrink-0 rounded-[1px]" style={{ backgroundColor: s.color }} aria-hidden />
            <span className="shrink-0 text-slate-500">{s.shortLabel}</span>
            <span className="ml-auto tabular-nums text-slate-100">{s.display}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 border-t border-slate-700/80 pt-1 leading-tight text-slate-400">
        สัดส่วน{" "}
        {pct != null ? (
          <span className="font-semibold text-teal-300 tabular-nums">{pct}%</span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </p>
    </div>
  );
}

export function Dashboard() {
  const [counts, setCounts] = useState<{ p: number; v: number; a: number; r: number } | null>(null);
  const [missions, setMissions] = useState<MissionListItem[]>([]);
  const [err, setErr] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, v, a, r, m] = await Promise.all([
          apiJson<Personnel[]>("/api/personnel"),
          apiJson<Vehicle[]>("/api/vehicles"),
          apiJson<Asset[]>("/api/assets"),
          apiJson<RouteMaster[]>("/api/route-master"),
          apiJson<MissionListItem[]>("/api/missions"),
        ]);
        if (!cancelled) {
          setMissions(m);
          setCounts({ p: p.length, v: v.length, a: a.length, r: r.length });
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
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

  const missionCountForYear = useMemo(
    () => missions.filter((m) => missionDashboardYear(m) === selectedYear).length,
    [missions, selectedYear],
  );

  const cards = useMemo(
    () => [
      { label: "บุคลากร", value: counts?.p ?? "—", tone: "from-teal-500/20 to-teal-600/5" },
      { label: "ยานพาหนะ", value: counts?.v ?? "—", tone: "from-sky-500/20 to-sky-600/5" },
      { label: "ครุภัณฑ์", value: counts?.a ?? "—", tone: "from-violet-500/20 to-violet-600/5" },
      { label: "เส้นทาง", value: counts?.r ?? "—", tone: "from-amber-500/20 to-amber-600/5" },
      {
        label: `ภารกิจ (ปี ${selectedYear})`,
        value: counts ? missionCountForYear : "—",
        tone: "from-rose-500/20 to-rose-600/5",
      },
    ],
    [counts, missionCountForYear, selectedYear],
  );

  const filteredCards = useMemo(
    () => cards.filter((c) => rowMatchesFilter(listFilter, [c.label, String(c.value)])),
    [cards, listFilter],
  );

  const filteredYearStatItems = useMemo(() => {
    if (!yearTotalsResolved) return [];
    const items = [
      { k: "ทรัพย์สิน (บาท)", v: formatBahtStr(yearTotalsResolved.cargoValue), tone: "text-slate-100" },
      { k: "ค่าใช้จ่ายภารกิจ (บาท)", v: formatBahtStr(yearTotalsResolved.expenses), tone: "text-teal-300" },
      { k: "จำนวนตู้ (ใบ)", v: yearTotalsResolved.containers.toLocaleString("th-TH"), tone: "text-amber-200" },
      { k: "จำนวนภารกิจ (ครั้ง)", v: yearTotalsResolved.missionCount.toLocaleString("th-TH"), tone: "text-white" },
      { k: "น้ำมันเบนซิน (ลิตร)", v: formatLitersStr(yearTotalsResolved.fuelGasolineLiters), tone: "text-yellow-200" },
      { k: "น้ำมันดีเซล (ลิตร)", v: formatLitersStr(yearTotalsResolved.fuelDieselLiters), tone: "text-indigo-300" },
      { k: "บำรุงรถ (บาท)", v: formatBahtStr(yearTotalsResolved.maintenanceCost), tone: "text-violet-300" },
    ];
    return items.filter((item) => rowMatchesFilter(listFilter, [item.k, item.v]));
  }, [yearTotalsResolved, listFilter]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">แดชบอร์ด</h1>
      <p className="mt-1 text-slate-400">
        <span className="font-medium text-slate-300">all for one</span>
        {" — "}
        ภาพรวมข้อมูลหลักในระบบ
      </p>
      <p className="mt-2 text-sm text-slate-500">
        ออกแบบและพัฒนาหน้าแดชบอร์ดโดย{" "}
        <span className="font-medium text-slate-400">พ.ต.ต.เร๊าะมัน หะนิแร</span>
      </p>

      <PageFilterPrintBar
        value={listFilter}
        onChange={setListFilter}
        printTitle="แดชบอร์ด"
        placeholder="กรองการ์ดสรุป / ชื่อช่องยอดรวม / ชื่อเดือนในสถิติ…"
      />

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-800/80 bg-slate-900/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          <span className="font-medium text-slate-400">กรองตามปี</span> — รายการปีมาจากฐานข้อมูล (วันเริ่มภารกิจตามแผนหรือวันที่สร้าง และปีของบันทึกบำรุงรักษารถ) ใช้กับสถิติรายเดือนและจำนวนภารกิจในการ์ด
        </p>
        <label className="flex shrink-0 flex-col gap-1 sm:items-end">
          <span className="text-xs font-medium text-slate-400">ปี ค.ศ.</span>
          <select
            className="min-w-[10rem] rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                พ.ศ. {y + 543} ({y})
              </option>
            ))}
          </select>
        </label>
      </div>

      {yearsErr && (
        <div className="mt-4 rounded-xl border border-amber-800/50 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
          โหลดรายการปีไม่สำเร็จ: {yearsErr} — ยังใช้ปีปัจจุบันเป็นค่าเริ่มต้น
        </div>
      )}

      {err && (
        <div className="mt-6 rounded-xl border border-amber-800/50 bg-amber-950/40 px-4 py-3 text-amber-200">
          API ไม่พร้อม: {err} — ตรวจสอบว่า backend รันที่พอร์ต 4000 และตั้งค่า DATABASE_URL แล้ว
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {filteredCards.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-center text-slate-500">
            ไม่มีการ์ดสรุปที่ตรงกับการกรอง
          </div>
        ) : (
          filteredCards.map((c) => (
            <div
              key={c.label}
              className={`rounded-2xl border border-slate-800 bg-gradient-to-br ${c.tone} p-5 shadow-lg shadow-black/20`}
            >
              <p className="text-sm text-slate-400">{c.label}</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-white">{c.value}</p>
            </div>
          ))
        )}
      </div>

      <section className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-lg shadow-black/20">
        <div>
          <h2 className="text-lg font-semibold text-white">
            สถิติภารกิจรายเดือน — ปี พ.ศ. {selectedYear + 543}{" "}
            <span className="text-slate-500">({selectedYear})</span>
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            จัดกลุ่มตามเดือนของวันเริ่มภารกิจตามแผน (หรือวันที่สร้างถ้าไม่ระบุ) — เปลี่ยนปีจาก{" "}
            <span className="text-slate-400">ตัวเลือกด้านบน</span> ด้านล่างมี{" "}
            <span className="text-slate-400">ยอดรวมทั้งปี</span> กราฟหลัก (ทรัพย์สินเป็นสิบล้านบาท ค่าใช้จ่ายภารกิจเป็นแสนบาท) กราฟน้ำมันจากภารกิจ (ลิตร) และกราฟค่าบำรุงรถ (แสนบาท)
          </p>
        </div>

        {statsErr && (
          <div className="mt-4 rounded-lg border border-rose-900/40 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
            {statsErr}
          </div>
        )}

        {!statsLoading && yearTotalsResolved && (
          <div className="mt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">รวมทั้งปี {yearStats?.year}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {filteredYearStatItems.length === 0 ? (
                <div className="col-span-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-4 text-center text-sm text-slate-500">
                  ไม่มีช่องยอดรวมที่ตรงกับการกรอง
                </div>
              ) : (
                filteredYearStatItems.map((item) => (
                  <div
                    key={item.k}
                    className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3 shadow-inner shadow-black/20"
                  >
                    <p className="text-[11px] leading-snug text-slate-500">{item.k}</p>
                    <p className={`mt-1 text-lg font-bold tabular-nums ${item.tone}`}>{item.v}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="mt-6 h-[400px] w-full min-w-0">
          {statsLoading ? (
            <div className="flex h-full items-center justify-center text-slate-500">กำลังโหลดสถิติภารกิจ…</div>
          ) : displayChartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-slate-500">
              {chartData.length === 0 ? "ไม่มีข้อมูล" : "ไม่มีเดือนที่ตรงกับการกรอง"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={displayChartData} margin={{ top: 12, right: 16, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "Noto Sans Thai, sans-serif" }}
                  tickLine={false}
                  axisLine={{ stroke: "#475569" }}
                />
                <YAxis
                  yAxisId="money"
                  tickFormatter={formatMixedScaleTick}
                  tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "Noto Sans Thai, sans-serif" }}
                  tickLine={false}
                  axisLine={{ stroke: "#475569" }}
                  width={52}
                  label={{
                    value: "สิบล้าน ฿ (ทรัพย์) / แสน ฿ (จ่าย)",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#64748b",
                    fontSize: 10,
                  }}
                />
                <YAxis
                  yAxisId="containers"
                  orientation="right"
                  allowDecimals={false}
                  tick={{ fill: "#fbbf24", fontSize: 11, fontFamily: "Noto Sans Thai, sans-serif" }}
                  tickLine={false}
                  axisLine={{ stroke: "#78350f" }}
                  width={40}
                  label={{
                    value: "จำนวนตู้ (ขวา)",
                    angle: 90,
                    position: "insideRight",
                    fill: "#d97706",
                    fontSize: 10,
                  }}
                />
                <Tooltip content={MissionMonthlyTooltip} />
                <Legend
                  wrapperStyle={{ fontFamily: "Noto Sans Thai, sans-serif", fontSize: 12 }}
                  formatter={(value) => <span className="text-slate-300">{value}</span>}
                />
                <Bar
                  yAxisId="money"
                  dataKey="cargoTenMillions"
                  name="มูลค่าทรัพย์สิน (สิบล้านบาท)"
                  fill="#64748b"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  yAxisId="money"
                  dataKey="expenseHundredThousands"
                  name="ค่าใช้จ่าย (แสนบาท)"
                  fill="#14b8a6"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  yAxisId="containers"
                  dataKey="containers"
                  name="จำนวนตู้"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {!statsLoading && displayChartData.length > 0 && (
          <>
            <div className="mt-10">
              <h3 className="text-base font-semibold text-white">การใช้น้ำมันจากภารกิจ (ลิตร/เดือน)</h3>
              <p className="mt-1 text-sm text-slate-500">
                สรุปจากฟอร์มยานพาหนะในภารกิจ — แยกเบนซิน / ดีเซล (ซ้อนแท่ง)
              </p>
              <div className="mt-4 h-[300px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={displayChartData} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "Noto Sans Thai, sans-serif" }}
                      tickLine={false}
                      axisLine={{ stroke: "#475569" }}
                    />
                    <YAxis
                      tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "Noto Sans Thai, sans-serif" }}
                      tickLine={false}
                      axisLine={{ stroke: "#475569" }}
                      width={44}
                      label={{
                        value: "ลิตร",
                        angle: -90,
                        position: "insideLeft",
                        fill: "#64748b",
                        fontSize: 10,
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1e293b",
                        border: "1px solid #334155",
                        borderRadius: "10px",
                        fontFamily: "Noto Sans Thai, sans-serif",
                        fontSize: 12,
                      }}
                      formatter={(value, name) => [
                        `${Number(value ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 3 })} ลิตร`,
                        String(name ?? ""),
                      ]}
                    />
                    <Legend
                      wrapperStyle={{ fontFamily: "Noto Sans Thai, sans-serif", fontSize: 12 }}
                      formatter={(value) => <span className="text-slate-300">{value}</span>}
                    />
                    <Bar
                      dataKey="fuelGasoline"
                      name="เบนซิน (ลิตร)"
                      stackId="fuel"
                      fill="#fbbf24"
                      radius={[0, 0, 0, 0]}
                      maxBarSize={36}
                    />
                    <Bar
                      dataKey="fuelDiesel"
                      name="ดีเซล (ลิตร)"
                      stackId="fuel"
                      fill="#6366f1"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={36}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mt-10">
              <h3 className="text-base font-semibold text-white">ค่าใช้จ่ายบำรุงรักษารถ (แสนบาท/เดือน)</h3>
              <p className="mt-1 text-sm text-slate-500">
                จากบันทึกบำรุงรักษายานพาหนะ — แกนแนวตั้งเป็นแสนบาท (tooltip แสดงบาทเต็ม)
              </p>
              <div className="mt-4 h-[300px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={displayChartData} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "Noto Sans Thai, sans-serif" }}
                      tickLine={false}
                      axisLine={{ stroke: "#475569" }}
                    />
                    <YAxis
                      tickFormatter={formatMixedScaleTick}
                      tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "Noto Sans Thai, sans-serif" }}
                      tickLine={false}
                      axisLine={{ stroke: "#475569" }}
                      width={48}
                      label={{
                        value: "แสนบาท",
                        angle: -90,
                        position: "insideLeft",
                        fill: "#64748b",
                        fontSize: 10,
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1e293b",
                        border: "1px solid #334155",
                        borderRadius: "10px",
                        fontFamily: "Noto Sans Thai, sans-serif",
                        fontSize: 12,
                      }}
                      formatter={(value, _name, props) => {
                        const baht = (props?.payload as { maintenanceBaht?: number })?.maintenanceBaht ?? 0;
                        return [
                          `${Number(value ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 4 })} แสนบาท (รวม ${baht.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท)`,
                          "บำรุงรักษา",
                        ];
                      }}
                    />
                    <Bar
                      dataKey="maintenanceHundredThousands"
                      name="บำรุงรักษา (แสนบาท)"
                      fill="#a855f7"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </section>

      <aside
        className="mt-12 flex flex-col items-center justify-between gap-4 rounded-2xl border border-teal-900/35 bg-gradient-to-br from-slate-900/80 to-slate-950/90 px-6 py-6 shadow-inner shadow-black/20 sm:flex-row sm:items-center sm:px-8"
        aria-label="เครดิตผู้จัดทำ"
      >
        <div className="text-center sm:text-left">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-500/90">จัดทำโดย</p>
          <p className="mt-2 text-lg font-semibold text-white">พ.ต.ต.เร๊าะมัน หะนิแร</p>
          <p className="mt-1 text-sm text-slate-500">แดชบอร์ดภาพรวม · ระบบปฏิบัติการ all for one</p>
        </div>
        <div className="h-px w-full shrink-0 bg-slate-800 sm:h-12 sm:w-px" aria-hidden />
        <p className="max-w-sm text-center text-xs leading-relaxed text-slate-500 sm:text-right">
          สำหรับใช้ในการบริหารจัดการข้อมูลบุคลากร ยานพาหนะ ครุภัณฑ์ เส้นทาง และภารกิจ
        </p>
      </aside>
    </div>
  );
}
