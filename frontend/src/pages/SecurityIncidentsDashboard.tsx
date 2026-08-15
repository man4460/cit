import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { FitSingleLine } from "../components/FitSingleLine";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { apiJson } from "../api/client";
import {
  brandGradientFillClass,
  chartAxisFill,
  chartGridStroke,
  chartSeries,
  toolbarLinkBtnClass,
  toolbarMasterBtnClass,
  toolbarMasterGroupClass,
} from "../lib/uiTokens";

type PeriodFilter = "" | "today" | "month" | "quarter" | "year";

type MonthRow = {
  month: number;
  label: string;
  count: number;
  open: number;
  resolved: number;
};

type NamedCount = { name: string; count: number };

type YearStats = {
  year: number;
  period: PeriodFilter | null;
  location: string | null;
  availableYears: number[];
  yearTotals: {
    total: number;
    open: number;
    resolved: number;
    typeCount: number;
    locationCount: number;
  };
  months: MonthRow[];
  byType: NamedCount[];
  byLocation: NamedCount[];
};

const TYPE_COLORS = ["#4d47b6", "#ec4899", "#f59e0b", "#8b5cf6", "#0000BF", "#06b6d4", "#7c3aed", "#db2777"];

const PERIOD_LABELS: Record<Exclude<PeriodFilter, "">, string> = {
  today: "วันนี้",
  month: "เดือนนี้",
  quarter: "ไตรมาสนี้",
  year: "ปีนี้",
};

export function SecurityIncidentsDashboard() {
  const [dashboardYears, setDashboardYears] = useState<number[]>([]);
  const [yearsErr, setYearsErr] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [yearStats, setYearStats] = useState<YearStats | null>(null);
  const [statsErr, setStatsErr] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [listFilter, setListFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("");
  const [locations, setLocations] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [yearsRes, meta] = await Promise.all([
          apiJson<{ years: number[] }>("/api/security-incidents/stats/years"),
          apiJson<{ incidentTypes: string[]; locations: string[] }>("/api/security-incidents/meta/filters"),
        ]);
        if (cancelled) return;
        setDashboardYears(yearsRes.years);
        setLocations(meta.locations);
        setYearsErr(null);
        setSelectedYear((prev) => {
          if (!yearsRes.years.length) return prev;
          return yearsRes.years.includes(prev) ? prev : yearsRes.years[0];
        });
      } catch (e) {
        if (!cancelled) setYearsErr(e instanceof Error ? e.message : "โหลดรายการปีไม่สำเร็จ");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadYearStats = useCallback(async (year: number, location: string, period: PeriodFilter) => {
    setStatsLoading(true);
    setStatsErr(null);
    try {
      const qs = new URLSearchParams();
      qs.set("year", String(year));
      if (location) qs.set("location", location);
      if (period) qs.set("period", period);
      const data = await apiJson<YearStats>(`/api/security-incidents/stats/year?${qs.toString()}`);
      setYearStats(data);
    } catch (e) {
      setYearStats(null);
      setStatsErr(e instanceof Error ? e.message : "โหลดสถิติไม่สำเร็จ");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadYearStats(selectedYear, locationFilter, periodFilter);
  }, [selectedYear, locationFilter, periodFilter, loadYearStats]);

  useEffect(() => {
    const bump = () => window.dispatchEvent(new Event("resize"));
    window.addEventListener("beforeprint", bump);
    window.addEventListener("afterprint", bump);
    return () => {
      window.removeEventListener("beforeprint", bump);
      window.removeEventListener("afterprint", bump);
    };
  }, []);

  const yearOptions = useMemo(() => {
    if (dashboardYears.length > 0) return [...dashboardYears];
    return [selectedYear];
  }, [dashboardYears, selectedYear]);

  const monthChart = useMemo(() => {
    if (!yearStats?.months.length) return [];
    const rows = yearStats.months;
    if (!listFilter.trim()) return rows;
    return rows.filter((row) =>
      rowMatchesFilter(listFilter, [row.label, String(row.count), String(row.open), String(row.resolved)]),
    );
  }, [yearStats, listFilter]);

  const typeChart = useMemo(() => {
    const rows = (yearStats?.byType ?? []).slice(0, 12);
    if (!listFilter.trim()) return rows;
    return rows.filter((r) => rowMatchesFilter(listFilter, [r.name, String(r.count)]));
  }, [yearStats, listFilter]);

  const locationChart = useMemo(() => {
    const rows = (yearStats?.byLocation ?? []).slice(0, 12);
    if (!listFilter.trim()) return rows;
    return rows.filter((r) => rowMatchesFilter(listFilter, [r.name, String(r.count)]));
  }, [yearStats, listFilter]);

  const summaryItems = useMemo(() => {
    const yt = yearStats?.yearTotals;
    if (!yt) return [];
    const items = [
      { k: "เหตุการณ์ทั้งหมด", v: yt.total.toLocaleString("th-TH"), tone: "text-[#1e1b4b]" },
      { k: "เปิดอยู่", v: yt.open.toLocaleString("th-TH"), tone: "text-amber-700" },
      { k: "ปิดแล้ว", v: yt.resolved.toLocaleString("th-TH"), tone: "text-emerald-700" },
      { k: "ประเภท", v: yt.typeCount.toLocaleString("th-TH"), tone: "text-[#4d47b6]" },
      { k: "สถานที่", v: yt.locationCount.toLocaleString("th-TH"), tone: "text-[#ec4899]" },
    ];
    return items.filter((item) => rowMatchesFilter(listFilter, [item.k, item.v]));
  }, [yearStats, listFilter]);

  const scopeLabel = useMemo(() => {
    const parts: string[] = [];
    if (periodFilter) parts.push(PERIOD_LABELS[periodFilter]);
    else parts.push(`พ.ศ. ${selectedYear + 543}`);
    if (locationFilter) parts.push(locationFilter);
    return parts.join(" · ");
  }, [periodFilter, selectedYear, locationFilter]);

  const periodButtons: { id: Exclude<PeriodFilter, "">; label: string }[] = [
    { id: "today", label: "วันนี้" },
    { id: "month", label: "เดือนนี้" },
    { id: "quarter", label: "ไตรมาสนี้" },
    { id: "year", label: "ปีนี้" },
  ];

  function togglePeriod(id: Exclude<PeriodFilter, "">) {
    setPeriodFilter((cur) => {
      if (cur === id) return "";
      setSelectedYear(new Date().getFullYear());
      return id;
    });
  }

  return (
    <div className="overview-a4-print">
      <PageHeaderBar
        title={`สถิติเหตุการณ์ไม่ปกติ — ${scopeLabel}`}
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: `เหตุการณ์ไม่ปกติ — ${scopeLabel}`,
          placeholder: "กรอง…",
        }}
        extras={
          <div className="flex flex-wrap items-center gap-1.5">
            <Link to="/security-incidents" className={`${toolbarLinkBtnClass} print:hidden`}>
              รายการเหตุการณ์
            </Link>
            <div className={`${toolbarMasterGroupClass} !gap-0.5 print:hidden`}>
              {periodButtons.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => togglePeriod(b.id)}
                  className={`${toolbarMasterBtnClass} ${
                    periodFilter === b.id ? `${brandGradientFillClass} !text-white` : ""
                  }`}
                  aria-pressed={periodFilter === b.id}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <div className={`${toolbarMasterGroupClass} print:hidden`}>
              <select
                className={`${toolbarLinkBtnClass} max-w-[10rem] truncate border-0 bg-transparent`}
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                aria-label="กรองสถานที่"
              >
                <option value="">สถานที่ทั้งหมด</option>
                {locations.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <label className={`${toolbarLinkBtnClass} gap-1.5 ${periodFilter ? "opacity-60" : ""}`}>
              <span className="text-[10px] font-semibold text-[#66638c]">ปี</span>
              <select
                className="min-w-[7.5rem] border-0 bg-transparent text-[11px] font-bold text-[#1e1b3a] outline-none sm:text-xs"
                value={selectedYear}
                disabled={Boolean(periodFilter)}
                onChange={(e) => {
                  setPeriodFilter("");
                  setSelectedYear(Number(e.target.value));
                }}
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

      {yearsErr && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 print:hidden">
          โหลดรายการปีไม่สำเร็จ: {yearsErr}
        </div>
      )}

      <section className="mt-2 print:mt-0">
        {statsErr && (
          <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 print:hidden">
            {statsErr}
          </div>
        )}

        {!statsLoading && yearStats && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-700 print:text-[8pt]">
              รวม{periodFilter ? PERIOD_LABELS[periodFilter] : `ทั้งปี พ.ศ. ${selectedYear + 543}`}
              {locationFilter ? ` · ${locationFilter}` : ""}
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 print:mt-1 print:grid-cols-5 print:gap-1">
              {summaryItems.length === 0 ? (
                <div className="col-span-full rounded-xl border border-slate-200 bg-white/60 px-3 py-4 text-center text-sm text-slate-600">
                  ไม่มีช่องยอดรวมที่ตรงกับการกรอง
                </div>
              ) : (
                summaryItems.map((item) => (
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

        <div className="mt-4 h-[360px] w-full min-w-0 print:mt-1 print:h-[7.5cm]">
          {statsLoading ? (
            <div className="flex h-full items-center justify-center text-slate-700">กำลังโหลดสถิติ…</div>
          ) : monthChart.length === 0 ? (
            <div className="flex h-full items-center justify-center text-slate-700">ไม่มีข้อมูลรายเดือน</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthChart} margin={{ top: 12, right: 12, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: chartAxisFill, fontSize: 11, fontFamily: "Noto Sans Thai, sans-serif" }}
                  tickLine={false}
                  axisLine={{ stroke: chartGridStroke }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: chartAxisFill, fontSize: 11, fontFamily: "Noto Sans Thai, sans-serif" }}
                  tickLine={false}
                  axisLine={{ stroke: chartGridStroke }}
                  width={36}
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
                />
                <Legend
                  wrapperStyle={{ fontFamily: "Noto Sans Thai, sans-serif", fontSize: 12 }}
                  formatter={(value) => <span className="text-[#2e2a58]">{value}</span>}
                />
                <Bar dataKey="open" name="เปิด" stackId="s" fill={chartSeries.expense} maxBarSize={36} />
                <Bar
                  dataKey="resolved"
                  name="ปิดแล้ว"
                  stackId="s"
                  fill={chartSeries.cargo}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={36}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className="mt-1 text-center text-xs font-medium text-slate-600 print:mt-0.5 print:text-[8pt]">
          จำนวนเหตุการณ์รายเดือน
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-2 print:mt-1.5 print:gap-2 print:grid-cols-2">
          <div>
            <h3 className="text-sm font-black text-[#1e1b4b] print:text-[9pt]">แยกตามประเภท</h3>
            <div className="mt-2 h-[320px] w-full min-w-0 print:mt-0.5 print:h-[8cm]">
              {statsLoading ? (
                <div className="flex h-full items-center justify-center text-slate-600">กำลังโหลด…</div>
              ) : typeChart.length === 0 ? (
                <div className="flex h-full items-center justify-center text-slate-600">ไม่มีข้อมูล</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={typeChart}
                    layout="vertical"
                    margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: chartAxisFill, fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fill: chartAxisFill, fontSize: 10, fontFamily: "Noto Sans Thai, sans-serif" }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        border: "1px solid #d8d6ec",
                        borderRadius: "12px",
                        fontFamily: "Noto Sans Thai, sans-serif",
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="count" name="ครั้ง" fill={TYPE_COLORS[0]} radius={[0, 6, 6, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-black text-[#1e1b4b] print:text-[9pt]">แยกตามสถานที่</h3>
            <div className="mt-2 h-[320px] w-full min-w-0 print:mt-0.5 print:h-[8cm]">
              {statsLoading ? (
                <div className="flex h-full items-center justify-center text-slate-600">กำลังโหลด…</div>
              ) : locationChart.length === 0 ? (
                <div className="flex h-full items-center justify-center text-slate-600">ไม่มีข้อมูล</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={locationChart}
                    layout="vertical"
                    margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: chartAxisFill, fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={72}
                      tick={{ fill: chartAxisFill, fontSize: 10, fontFamily: "Noto Sans Thai, sans-serif" }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        border: "1px solid #d8d6ec",
                        borderRadius: "12px",
                        fontFamily: "Noto Sans Thai, sans-serif",
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="count" name="ครั้ง" fill={TYPE_COLORS[1]} radius={[0, 6, 6, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
