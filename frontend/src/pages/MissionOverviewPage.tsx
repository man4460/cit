import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiJson } from "../api/client";
import { MissionReviewTabs } from "../components/MissionReviewTabs";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { brandGradientFillClass, chartAxisFill, chartGridStroke } from "../lib/uiTokens";
import type { MissionStatus } from "../types";

type OverviewMission = {
  id: string;
  code: string | null;
  title: string | null;
  status: MissionStatus;
  plannedStart: string | null;
  year: number | null;
  routeLabel: string | null;
  budgetAmount: string | null;
  operatingExpense: string;
  truckHire: string;
  incidentCount: number;
  destinations: { address: string; cargoValue: string; containers: number }[];
};

type AreaPart = { area: string; cargo: number; containers: number };

type Row = OverviewMission & {
  yearBe: number | null;
  month: number | null;
  parts: AreaPart[];
  /** ค่าใช้จ่ายปฏิบัติงาน (ไม่รวมค่าจ้างรถบรรทุก) — นับทั้งทริป */
  op: number;
  truck: number;
};

type Money = { op: number; truck: number };
const sumMoney = (rs: Money[]) => ({
  op: rs.reduce((s, r) => s + r.op, 0),
  truck: rs.reduce((s, r) => s + r.truck, 0),
});

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const FONT = "Noto Sans Thai, sans-serif";
const CARGO_COLOR = "#4d47b6";
const CONTAINER_COLOR = "#14b8a6";
const OP_COLOR = "#8b5cf6";
const TRUCK_COLOR = "#f97316";
const AREA_COLORS = ["#4d47b6", "#8b5cf6", "#ec4899", "#f59e0b", "#14b8a6", "#0ea5e9", "#94a3b8"];
const LIST_LIMIT = 12;

const cardClass = "min-w-0 rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 shadow-sm";
const titleClass = "text-xs font-black text-[#1e1b4b]";
const filterLabelClass = "w-14 shrink-0 whitespace-nowrap text-[11px] font-bold text-slate-500";
const selectClass = "h-8 min-w-[10rem] rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-800";

const segBtn = (active: boolean) =>
  `inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-black transition ${
    active ? `${brandGradientFillClass} text-white shadow-md` : "bg-white text-[#4d47b6] ring-1 ring-slate-200 hover:bg-[#0000BF]/8"
  }`;

const num = (n: number, digits = 0) => n.toLocaleString("th-TH", { maximumFractionDigits: digits });
/** มูลค่าทรัพย์สินเป็นล้านบาท */
const mb = (n: number) => num(n / 1_000_000, 2);

function splitAreas(address: string): string[] {
  return [...new Set(address.split(/[\s.,/]+|และ/).map((s) => s.trim()).filter(Boolean))];
}

function toRow(m: OverviewMission): Row {
  const d = m.plannedStart ? new Date(m.plannedStart) : null;
  const parts: AreaPart[] = [];
  for (const dest of m.destinations) {
    const codes = splitAreas(dest.address);
    if (!codes.length) continue;
    const cargo = Number(dest.cargoValue) || 0;
    for (const area of codes) parts.push({ area, cargo: cargo / codes.length, containers: dest.containers / codes.length });
  }
  return {
    ...m,
    yearBe: m.year != null ? m.year + 543 : null,
    month: d && !Number.isNaN(d.getTime()) ? d.getMonth() : null,
    parts,
    op: Number(m.operatingExpense) || 0,
    truck: Number(m.truckHire) || 0,
  };
}

/** ตัวเลขแกนแบบย่อ (บาท) */
const compactBaht = (v: number) =>
  v >= 1_000_000 ? `${num(v / 1_000_000, 1)} ล.` : v >= 1_000 ? `${num(v / 1_000, 0)} พ.` : num(v);

function pctChange(cur: number, prev: number | undefined): string | null {
  if (prev == null || prev === 0) return null;
  const p = ((cur - prev) / prev) * 100;
  return `${p > 0 ? "+" : ""}${num(p, 1)}%`;
}

/** invert = ค่าใช้จ่าย: เพิ่มขึ้นเป็นสีแดง */
function DeltaChip({ value, invert }: { value: string | null; invert?: boolean }) {
  if (!value) return <span className="text-slate-300">—</span>;
  const good = value.startsWith("+") !== Boolean(invert);
  return <span className={`text-[10.5px] font-bold ${good ? "text-emerald-600" : "text-rose-600"}`}>{value}</span>;
}

export function MissionOverviewPage() {
  const [params, setParams] = useSearchParams();
  const yearParam = Number(params.get("year"));
  const year = Number.isFinite(yearParam) && yearParam > 2400 ? yearParam : null;

  const [data, setData] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [area, setArea] = useState(() => params.get("area") ?? "");
  const [route, setRoute] = useState("");
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const focus = params.get("focus");

  useEffect(() => {
    if (!data || !focus) return;
    const t = window.setTimeout(
      () => document.getElementById(`ov-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
      150,
    );
    return () => window.clearTimeout(t);
  }, [data, focus]);

  useEffect(() => {
    let cancelled = false;
    apiJson<{ missions: OverviewMission[] }>("/api/missions/stats/overview", { skipCache: true })
      .then((d) => !cancelled && setData(d.missions.filter((m) => m.status !== "CANCELLED").map(toRow)))
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"));
    return () => {
      cancelled = true;
    };
  }, []);

  const all = useMemo(() => data ?? [], [data]);
  const years = useMemo(
    () => [...new Set(all.map((r) => r.yearBe).filter((y): y is number => y != null))].sort((a, b) => b - a),
    [all],
  );
  const routes = useMemo(
    () => [...new Set(all.map((r) => r.routeLabel).filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, "th")),
    [all],
  );

  /** กรองพื้นที่/เส้นทาง/ค้นหา (ยังไม่กรองปี) — ใช้ทำตารางเทียบรายปี */
  const scoped = useMemo(
    () =>
      all
        .filter((r) => !route || r.routeLabel === route)
        .filter((r) => !area || r.parts.some((p) => p.area === area))
        .filter((r) => rowMatchesFilter(q, [r.code, r.title, r.routeLabel, ...r.destinations.map((d) => d.address)]))
        .map((r) => {
          const parts = area ? r.parts.filter((p) => p.area === area) : r.parts;
          return {
            ...r,
            parts,
            cargo: parts.reduce((s, p) => s + p.cargo, 0),
            containers: parts.reduce((s, p) => s + p.containers, 0),
          };
        }),
    [all, route, area, q],
  );

  const filtered = useMemo(() => (year == null ? scoped : scoped.filter((r) => r.yearBe === year)), [scoped, year]);

  const areaOptions = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of year == null ? all : all.filter((x) => x.yearBe === year))
      for (const p of r.parts) m.set(p.area, (m.get(p.area) ?? 0) + p.cargo);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [all, year]);

  const stats = useMemo(() => {
    const cargo = filtered.reduce((s, r) => s + r.cargo, 0);
    const containers = filtered.reduce((s, r) => s + r.containers, 0);
    const areaMap = new Map<string, { cargo: number; containers: number; trips: Set<string> }>();
    for (const r of filtered)
      for (const p of r.parts) {
        const a = areaMap.get(p.area) ?? { cargo: 0, containers: 0, trips: new Set<string>() };
        a.cargo += p.cargo;
        a.containers += p.containers;
        a.trips.add(r.id);
        areaMap.set(p.area, a);
      }
    const areas = [...areaMap.entries()]
      .map(([code, a]) => ({ code, cargo: a.cargo, containers: a.containers, trips: a.trips.size }))
      .sort((x, y) => y.cargo - x.cargo || y.containers - x.containers);

    const bucket = (label: string, rs: typeof filtered) => ({
      label,
      cargo: rs.reduce((s, r) => s + r.cargo, 0) / 1_000_000,
      containers: rs.reduce((s, r) => s + r.containers, 0),
      trips: rs.length,
      ...sumMoney(rs),
    });
    const trend =
      year != null
        ? MONTHS.map((label, i) => bucket(label, filtered.filter((r) => r.month === i)))
        : [...years].reverse().map((y) => bucket(String(y), filtered.filter((r) => r.yearBe === y)));

    const top = areas.slice(0, AREA_COLORS.length - 1);
    const rest = areas.slice(AREA_COLORS.length - 1).reduce((s, a) => s + a.cargo, 0);
    const pie = [...top.map((a) => ({ name: a.code, value: a.cargo })), ...(rest > 0 ? [{ name: "อื่นๆ", value: rest }] : [])];

    return {
      trips: filtered.length,
      cargo,
      containers,
      areas,
      trend,
      pie,
      incidents: filtered.reduce((s, r) => s + r.incidentCount, 0),
      tripsWithIncidents: filtered.filter((r) => r.incidentCount > 0).length,
      ...sumMoney(filtered),
    };
  }, [filtered, year, years]);

  const yearTable = useMemo(
    () =>
      [...years].reverse().map((y) => {
        const rs = scoped.filter((r) => r.yearBe === y);
        return {
          year: y,
          trips: rs.length,
          cargo: rs.reduce((s, r) => s + r.cargo, 0),
          containers: rs.reduce((s, r) => s + r.containers, 0),
          incidents: rs.reduce((s, r) => s + r.incidentCount, 0),
          ...sumMoney(rs),
        };
      }),
    [scoped, years],
  );

  function setYear(y: number | null) {
    const next = new URLSearchParams(params);
    if (y == null) next.delete("year");
    else next.set("year", String(y));
    setParams(next, { replace: true });
  }

  const hasFilter = year != null || area !== "" || route !== "" || q.trim() !== "";
  const maxAreaCargo = stats.areas[0]?.cargo ?? 0;
  const maxAreaContainers = Math.max(0, ...stats.areas.map((a) => a.containers));
  const list = showAll ? filtered : filtered.slice(0, LIST_LIMIT);

  const kpis = [
    { k: "จำนวนทริป", v: num(stats.trips), unit: "ทริป", tone: "text-[#1e1b4b]", bar: "bg-[#1e1b4b]" },
    { k: "มูลค่าทรัพย์สินรวม", v: mb(stats.cargo), unit: "ล้านบาท", tone: "text-[#4d47b6]", bar: "bg-[#4d47b6]" },
    { k: "จำนวนตู้รวม", v: num(stats.containers, 1), unit: "ตู้", tone: "text-teal-600", bar: "bg-teal-500" },
    {
      k: "เฉลี่ยต่อทริป",
      v: stats.trips ? mb(stats.cargo / stats.trips) : "—",
      unit: stats.trips ? `ล้านบาท · ${num(stats.containers / stats.trips, 1)} ตู้` : "",
      tone: "text-violet-600",
      bar: "bg-violet-400",
    },
    { k: "พื้นที่ปลายทาง", v: num(stats.areas.length), unit: "พื้นที่", tone: "text-amber-600", bar: "bg-amber-400" },
    {
      k: "เหตุการณ์ไม่ปกติ",
      v: num(stats.incidents),
      unit: `ครั้ง · ${stats.tripsWithIncidents} ทริป`,
      tone: "text-rose-600",
      bar: "bg-rose-500",
    },
  ];

  return (
    <div className="space-y-3">
      <PageHeaderBar
        title="สรุปเหตุการณ์"
        subtitle={<span className="text-xs">ภารกิจขนส่งธนบัตร · {year != null ? `พ.ศ. ${year}` : "ทุกปี"}</span>}
        backTo="/missions"
        segments={<MissionReviewTabs />}
      />

      <div className={`${cardClass} grid gap-2 xl:grid-cols-2`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={filterLabelClass}>ปี</span>
          <button type="button" className={segBtn(year == null)} onClick={() => setYear(null)}>
            ทุกปี
          </button>
          {years.map((y) => (
            <button key={y} type="button" className={segBtn(year === y)} onClick={() => setYear(y)}>
              {y}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={filterLabelClass}>กรอง</span>
          <select className={selectClass} value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">ทุกพื้นที่</option>
            {areaOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select className={selectClass} value={route} onChange={(e) => setRoute(e.target.value)}>
            <option value="">ทุกเส้นทาง</option>
            {routes.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <input
            type="search"
            className="h-8 min-w-[9rem] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800"
            placeholder="ค้นหาทริป…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {hasFilter ? (
            <button
              type="button"
              className="text-[11px] font-semibold text-slate-500 hover:text-rose-600"
              onClick={() => {
                setYear(null);
                setArea("");
                setRoute("");
                setQ("");
              }}
            >
              ล้างตัวกรอง
            </button>
          ) : null}
        </div>
      </div>

      {err ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p> : null}
      {data == null && !err ? <p className="py-10 text-center text-sm text-slate-500">กำลังโหลด…</p> : null}

      {data != null ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {kpis.map((k) => (
              <div key={k.k} className={`${cardClass} relative overflow-hidden`}>
                <span className={`absolute inset-y-0 left-0 w-1 ${k.bar}`} />
                <p className="truncate text-[11px] font-medium text-slate-600">{k.k}</p>
                <p className={`text-xl font-bold leading-tight tabular-nums ${k.tone}`}>{k.v}</p>
                <p className="truncate text-[10.5px] text-slate-500">{k.unit || "\u00a0"}</p>
              </div>
            ))}
          </div>

          <div id="ov-cargo" className="grid scroll-mt-4 gap-2 lg:grid-cols-12">
            <div className={`${cardClass} flex h-[320px] flex-col lg:col-span-8`}>
              <h3 className={titleClass}>
                {year != null ? `มูลค่าทรัพย์สินและจำนวนตู้รายเดือน — พ.ศ. ${year}` : "มูลค่าทรัพย์สินและจำนวนตู้รายปี"}
              </h3>
              <div className="mt-1 min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={stats.trend} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: chartAxisFill, fontSize: 11, fontFamily: FONT }}
                      tickLine={false}
                      axisLine={{ stroke: chartGridStroke }}
                    />
                    <YAxis
                      yAxisId="cargo"
                      width={56}
                      tick={{ fill: chartAxisFill, fontSize: 10, fontFamily: FONT }}
                      tickFormatter={(v: number) => num(v)}
                      tickLine={false}
                      axisLine={false}
                      label={{ value: "ล้านบาท", angle: -90, position: "insideLeft", fill: chartAxisFill, fontSize: 10 }}
                    />
                    <YAxis
                      yAxisId="containers"
                      orientation="right"
                      width={36}
                      allowDecimals={false}
                      tick={{ fill: chartAxisFill, fontSize: 10, fontFamily: FONT }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, fontFamily: FONT, fontSize: 12 }}
                      formatter={(v, name) =>
                        name === "มูลค่าทรัพย์สิน"
                          ? [`${num(Number(v), 2)} ล้านบาท`, name]
                          : [`${num(Number(v), 1)} ตู้`, String(name)]
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: FONT }} />
                    <Bar yAxisId="cargo" dataKey="cargo" name="มูลค่าทรัพย์สิน" fill={CARGO_COLOR} radius={[4, 4, 0, 0]} maxBarSize={38} />
                    <Line
                      yAxisId="containers"
                      dataKey="containers"
                      name="จำนวนตู้"
                      stroke={CONTAINER_COLOR}
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: CONTAINER_COLOR }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={`${cardClass} flex h-[320px] flex-col lg:col-span-4`}>
              <h3 className={titleClass}>สัดส่วนมูลค่าทรัพย์สินตามพื้นที่</h3>
              {stats.pie.length ? (
                <>
                  <div className="relative min-h-0 flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={stats.pie} dataKey="value" nameKey="name" innerRadius="56%" outerRadius="88%" paddingAngle={2} stroke="none">
                          {stats.pie.map((p, i) => (
                            <Cell key={p.name} fill={AREA_COLORS[i % AREA_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ borderRadius: 12, fontFamily: FONT, fontSize: 12 }}
                          formatter={(v, name) => [`${mb(Number(v))} ล้านบาท`, String(name)]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-lg font-black tabular-nums text-[#1e1b4b]">{mb(stats.cargo)}</span>
                      <span className="text-[10px] text-slate-500">ล้านบาท</span>
                    </div>
                  </div>
                  <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    {stats.pie.map((p, i) => (
                      <li key={p.name} className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: AREA_COLORS[i % AREA_COLORS.length] }} />
                        <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{p.name}</span>
                        <span className="tabular-nums text-slate-500">{stats.cargo ? num((p.value / stats.cargo) * 100, 1) : 0}%</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="flex flex-1 items-center justify-center text-xs text-slate-500">ไม่มีข้อมูล</p>
              )}
            </div>
          </div>

          <div id="ov-expense" className="grid scroll-mt-4 gap-2 lg:grid-cols-12">
            <div className={`${cardClass} flex h-[300px] flex-col lg:col-span-8`}>
              <h3 className={titleClass}>
                {year != null ? `ค่าใช้จ่ายรายเดือน — พ.ศ. ${year}` : "ค่าใช้จ่ายรายปี"} (ค่าปฏิบัติงาน / ค่าจ้างรถบรรทุก)
              </h3>
              <div className="mt-1 min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={stats.trend} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: chartAxisFill, fontSize: 11, fontFamily: FONT }}
                      tickLine={false}
                      axisLine={{ stroke: chartGridStroke }}
                    />
                    <YAxis
                      width={56}
                      tick={{ fill: chartAxisFill, fontSize: 10, fontFamily: FONT }}
                      tickFormatter={(v: number) => compactBaht(v)}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, fontFamily: FONT, fontSize: 12 }}
                      formatter={(v, name) => [`${num(Number(v))} บาท`, String(name)]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: FONT }} />
                    <Bar dataKey="op" name="ค่าปฏิบัติงาน" stackId="exp" fill={OP_COLOR} maxBarSize={38} />
                    <Bar dataKey="truck" name="ค่าจ้างรถบรรทุก" stackId="exp" fill={TRUCK_COLOR} radius={[4, 4, 0, 0]} maxBarSize={38} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={`${cardClass} flex flex-col gap-2 lg:col-span-4`}>
              <h3 className={titleClass}>สรุปค่าใช้จ่าย</h3>
              <div>
                <p className="text-[11px] text-slate-500">ค่าใช้จ่ายรวม</p>
                <p className="text-2xl font-black tabular-nums text-[#1e1b4b]">
                  {num(stats.op + stats.truck)} <span className="text-xs font-semibold text-slate-500">บาท</span>
                </p>
              </div>
              {[
                { label: "ค่าปฏิบัติงาน (ไม่รวมค่าจ้างรถ)", value: stats.op, color: OP_COLOR },
                { label: "ค่าจ้างรถบรรทุก", value: stats.truck, color: TRUCK_COLOR },
              ].map((x) => {
                const total = stats.op + stats.truck;
                return (
                  <div key={x.label} className="text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: x.color }} />
                        {x.label}
                      </span>
                      <span className="font-bold tabular-nums text-[#2e2a58]">
                        {num(x.value)} <span className="font-normal text-slate-400">({total ? num((x.value / total) * 100, 1) : 0}%)</span>
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${total ? (x.value / total) * 100 : 0}%`, backgroundColor: x.color }} />
                    </div>
                  </div>
                );
              })}
              <dl className="mt-auto grid grid-cols-2 gap-1.5 text-[11px]">
                {[
                  ["เฉลี่ยต่อทริป", stats.trips ? `${num((stats.op + stats.truck) / stats.trips)} บาท` : "—"],
                  ["ค่าจ้างรถเฉลี่ยต่อตู้", stats.containers ? `${num(stats.truck / stats.containers)} บาท` : "—"],
                  ["ค่าปฏิบัติงานเฉลี่ยต่อทริป", stats.trips ? `${num(stats.op / stats.trips)} บาท` : "—"],
                  ["ต่อทรัพย์สิน 1 ล้านบาท", stats.cargo ? `${num(((stats.op + stats.truck) / stats.cargo) * 1_000_000, 2)} บาท` : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-slate-50 px-2 py-1.5">
                    <dt className="truncate text-slate-500">{k}</dt>
                    <dd className="font-bold tabular-nums text-[#1e1b4b]">{v}</dd>
                  </div>
                ))}
              </dl>
              {area ? <p className="text-[10.5px] text-amber-700">ค่าใช้จ่ายนับทั้งทริปที่มีพื้นที่ {area}</p> : null}
            </div>
          </div>

          <div id="ov-area" className="grid scroll-mt-4 gap-2 lg:grid-cols-12">
            <div className={`${cardClass} overflow-hidden !px-0 !py-0 lg:order-2 lg:col-span-12`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
                <h3 className={titleClass}>เปรียบเทียบรายพื้นที่</h3>
                <span className="inline-flex items-center gap-3 text-[10.5px] text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CARGO_COLOR }} /> ทรัพย์สิน
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CONTAINER_COLOR }} /> ตู้
                  </span>
                </span>
              </div>
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white text-[10.5px] text-slate-500">
                    <tr className="border-b border-slate-100">
                      <th className="px-3 py-1.5 text-left font-semibold">พื้นที่</th>
                      <th className="px-2 py-1.5 text-right font-semibold">ทริป</th>
                      <th className="w-[34%] px-2 py-1.5 text-left font-semibold">มูลค่าทรัพย์สิน (ล้านบาท)</th>
                      <th className="w-[26%] px-2 py-1.5 text-left font-semibold">จำนวนตู้</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.areas.map((a) => (
                      <tr key={a.code} className={area === a.code ? "bg-indigo-50/60" : "hover:bg-slate-50/60"}>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="font-bold text-[#1e1b4b] hover:text-[#4d47b6] hover:underline"
                            title="กรองเฉพาะพื้นที่นี้"
                            onClick={() => setArea(area === a.code ? "" : a.code)}
                          >
                            {a.code}
                          </button>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-600">{a.trips}</td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${maxAreaCargo ? (a.cargo / maxAreaCargo) * 100 : 0}%`, backgroundColor: CARGO_COLOR }}
                              />
                            </div>
                            <span className="w-16 text-right font-semibold tabular-nums text-[#2e2a58]">{mb(a.cargo)}</span>
                            <span className="w-11 text-right text-[10px] tabular-nums text-slate-400">
                              {stats.cargo ? num((a.cargo / stats.cargo) * 100, 1) : 0}%
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${maxAreaContainers ? (a.containers / maxAreaContainers) * 100 : 0}%`,
                                  backgroundColor: CONTAINER_COLOR,
                                }}
                              />
                            </div>
                            <span className="w-10 text-right font-semibold tabular-nums text-teal-700">{num(a.containers, 1)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {stats.areas.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-500">
                          ไม่มีข้อมูล
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={`${cardClass} overflow-hidden !px-0 !py-0 lg:order-1 lg:col-span-12`}>
              <h3 className={`${titleClass} border-b border-slate-100 bg-slate-50/70 px-3 py-2`}>
                เปรียบเทียบรายปี{area || route ? ` (${[area, route].filter(Boolean).join(" · ")})` : ""}
              </h3>
              <table className="w-full text-xs">
                <thead className="text-[10.5px] text-slate-500">
                  <tr className="border-b border-slate-100">
                    <th className="px-3 py-1.5 text-left font-semibold">ปี</th>
                    <th className="px-2 py-1.5 text-right font-semibold">ทริป</th>
                    <th className="px-2 py-1.5 text-right font-semibold">ทรัพย์สิน (ล้านบาท)</th>
                    <th className="px-2 py-1.5 text-right font-semibold">ตู้</th>
                    <th className="px-2 py-1.5 text-right font-semibold">ค่าปฏิบัติงาน (บาท)</th>
                    <th className="px-2 py-1.5 text-right font-semibold">ค่าจ้างรถบรรทุก (บาท)</th>
                    <th className="px-2 py-1.5 text-right font-semibold">รวมค่าใช้จ่าย (บาท)</th>
                    <th className="px-2 py-1.5 text-right font-semibold">เฉลี่ย/ทริป</th>
                    <th className="px-3 py-1.5 text-right font-semibold">เหตุไม่ปกติ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {yearTable.map((y, i) => {
                    const prev = yearTable[i - 1];
                    return (
                      <tr
                        key={y.year}
                        className={`cursor-pointer ${year === y.year ? "bg-indigo-50/70" : "hover:bg-slate-50/60"}`}
                        onClick={() => setYear(year === y.year ? null : y.year)}
                        title="คลิกเพื่อกรองปีนี้"
                      >
                        <td className="px-3 py-2 font-bold text-[#1e1b4b]">{y.year}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{y.trips}</td>
                        <td className="px-2 py-2 text-right">
                          <span className="font-semibold tabular-nums text-[#4d47b6]">{mb(y.cargo)}</span>
                          <span className="ml-1.5">
                            <DeltaChip value={pctChange(y.cargo, prev?.cargo)} />
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <span className="font-semibold tabular-nums text-teal-700">{num(y.containers, 1)}</span>
                          <span className="ml-1.5">
                            <DeltaChip value={pctChange(y.containers, prev?.containers)} />
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <span className="font-semibold tabular-nums" style={{ color: OP_COLOR }}>{num(y.op)}</span>
                          <span className="ml-1.5">
                            <DeltaChip value={pctChange(y.op, prev?.op)} invert />
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <span className="font-semibold tabular-nums" style={{ color: TRUCK_COLOR }}>{num(y.truck)}</span>
                          <span className="ml-1.5">
                            <DeltaChip value={pctChange(y.truck, prev?.truck)} invert />
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <span className="font-bold tabular-nums text-[#1e1b4b]">{num(y.op + y.truck)}</span>
                          <span className="ml-1.5">
                            <DeltaChip value={pctChange(y.op + y.truck, prev ? prev.op + prev.truck : undefined)} invert />
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-600">
                          {y.trips ? num((y.op + y.truck) / y.trips) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-rose-600">{y.incidents || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="border-t border-slate-100 px-3 py-1.5 text-[10.5px] text-slate-500">
                % เทียบกับปีก่อนหน้า · ปลายทางหลายพื้นที่แบ่งยอดเท่ากัน
              </p>
            </div>
          </div>

          <div className={`${cardClass} overflow-hidden !px-0 !py-0`}>
            <h3 className={`${titleClass} border-b border-slate-100 bg-slate-50/70 px-3 py-2`}>
              รายการทริป ({num(filtered.length)}) — ล่าสุดก่อน
            </h3>
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">ไม่มีทริปที่ตรงกับตัวกรอง</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[60rem] text-xs">
                  <thead className="text-[10.5px] text-slate-500">
                    <tr className="border-b border-slate-100">
                      <th className="px-3 py-1.5 text-left font-semibold">ทริป</th>
                      <th className="px-2 py-1.5 text-left font-semibold">วันที่</th>
                      <th className="px-2 py-1.5 text-left font-semibold">เส้นทาง</th>
                      <th className="px-2 py-1.5 text-left font-semibold">พื้นที่</th>
                      <th className="px-2 py-1.5 text-right font-semibold">ทรัพย์สิน (ล้านบาท)</th>
                      <th className="px-2 py-1.5 text-right font-semibold">ตู้</th>
                      <th className="px-2 py-1.5 text-right font-semibold">ค่าปฏิบัติงาน</th>
                      <th className="px-2 py-1.5 text-right font-semibold">ค่าจ้างรถ</th>
                      <th className="px-3 py-1.5 text-right font-semibold" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {list.map((r) => (
                      <tr key={r.id} className="hover:bg-[#4d47b6]/5">
                        <td className="px-3 py-2">
                          <span className="font-mono text-[11px] font-bold text-indigo-600">{r.code ?? "—"}</span>
                          {r.incidentCount ? (
                            <span className="ml-1.5 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-200">
                              เหตุ {r.incidentCount}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 tabular-nums text-slate-600">
                          {r.plannedStart ? new Date(r.plannedStart).toLocaleDateString("th-TH", { dateStyle: "medium" }) : "—"}
                        </td>
                        <td className="max-w-[14rem] truncate px-2 py-2 text-slate-700" title={r.routeLabel ?? ""}>
                          {r.routeLabel ?? "—"}
                        </td>
                        <td className="px-2 py-2 text-slate-600">{[...new Set(r.parts.map((p) => p.area))].join(", ") || "—"}</td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums text-[#4d47b6]">{mb(r.cargo)}</td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums text-teal-700">{num(r.containers, 1)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-700">{r.op ? num(r.op) : "—"}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-orange-600">{r.truck ? num(r.truck) : "—"}</td>
                        <td className="px-3 py-2 text-right">
                          <Link to={`/missions/${r.id}/summary`} className="text-[11px] font-semibold text-[#4d47b6] hover:underline">
                            ดูทริป →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {filtered.length > LIST_LIMIT ? (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="w-full border-t border-slate-100 py-2 text-xs font-semibold text-[#4d47b6] hover:bg-slate-50"
              >
                {showAll ? "แสดงน้อยลง" : `แสดงทั้งหมด ${filtered.length} ทริป`}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
