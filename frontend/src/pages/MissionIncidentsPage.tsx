import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { apiDownload, apiJson } from "../api/client";
import {
  CHART_FONT,
  RankList,
  SeverityChart,
  SeverityLegend,
  type SeverityBucket,
} from "../components/MissionIncidentStatsSection";
import { PageHeaderBar } from "../components/PageHeaderBar";
import {
  INCIDENT_GROUPS,
  INCIDENT_GROUP_COLOR,
  OTHER_GROUP,
  SEVERITY_OPTIONS,
  formatDelay,
  formatIncidentTime,
  incidentGroupOf,
  severityMeta,
  type IncidentGroupKey,
  type MissionIncidentSeverity,
} from "../lib/missionIncidents";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { brandGradientFillClass, toolbarLinkBtnClass } from "../lib/uiTokens";

type LogRow = {
  id: string;
  missionId: string;
  missionCode: string | null;
  missionTitle: string | null;
  routeLabel: string;
  occurredAt: string;
  category: string;
  severity: MissionIncidentSeverity;
  location: string | null;
  description: string;
  actionTaken: string | null;
  delayMinutes: number | null;
  cargoAffected: boolean;
  resolved: boolean;
  photoCount: number;
};

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const cardClass = "min-w-0 rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 shadow-sm";
const titleClass = "text-xs font-black text-[#1e1b4b]";
const filterLabelClass = "w-[4.5rem] shrink-0 whitespace-nowrap text-[11px] font-bold text-slate-500";

const segBtn = (active: boolean) =>
  `inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-black transition ${
    active ? `${brandGradientFillClass} text-white shadow-md` : "bg-white text-[#4d47b6] ring-1 ring-slate-200 hover:bg-[#0000BF]/8"
  }`;

const yearBe = (iso: string) => new Date(iso).getFullYear() + 543;
const num = (n: number) => n.toLocaleString("th-TH");

function emptyBucket(label: string): SeverityBucket {
  return { label, LOW: 0, MEDIUM: 0, HIGH: 0 };
}

export function MissionIncidentsPage() {
  const [params, setParams] = useSearchParams();
  const yearParam = Number(params.get("year"));
  const year = Number.isFinite(yearParam) && yearParam > 2400 ? yearParam : null;

  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [group, setGroup] = useState<IncidentGroupKey | null>(null);
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState<MissionIncidentSeverity | null>(null);
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiJson<LogRow[]>("/api/missions/incident-log", { skipCache: true })
      .then((d) => !cancelled && setRows(d))
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"));
    return () => {
      cancelled = true;
    };
  }, []);

  const all = useMemo(() => rows ?? [], [rows]);
  const years = useMemo(() => [...new Set(all.map((r) => yearBe(r.occurredAt)))].sort((a, b) => b - a), [all]);
  const byYear = useMemo(() => (year == null ? all : all.filter((r) => yearBe(r.occurredAt) === year)), [all, year]);

  const groupCounts = useMemo(() => {
    const m = new Map<IncidentGroupKey, number>();
    for (const r of byYear) {
      const k = incidentGroupOf(r.category).key;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [byYear]);

  const groupOptions = useMemo(
    () => [...INCIDENT_GROUPS, ...(groupCounts.get("OTHER") ? [OTHER_GROUP] : [])],
    [groupCounts],
  );

  const categoryOptions = useMemo(() => {
    const present = new Map<string, number>();
    for (const r of byYear) {
      if (group && incidentGroupOf(r.category).key !== group) continue;
      present.set(r.category, (present.get(r.category) ?? 0) + 1);
    }
    return [...present.entries()].sort((a, b) => b[1] - a[1]);
  }, [byYear, group]);

  const filtered = useMemo(
    () =>
      byYear.filter((r) => {
        if (group && incidentGroupOf(r.category).key !== group) return false;
        if (category && r.category !== category) return false;
        if (severity && r.severity !== severity) return false;
        return rowMatchesFilter(q, [r.category, r.description, r.location, r.actionTaken, r.missionCode, r.missionTitle, r.routeLabel]);
      }),
    [byYear, group, category, severity, q],
  );

  const stats = useMemo(() => {
    const trend: SeverityBucket[] =
      year != null
        ? MONTHS.map((m) => emptyBucket(m))
        : [...years].reverse().map((y) => emptyBucket(String(y)));
    const trendIdx = (r: LogRow) =>
      year != null ? new Date(r.occurredAt).getMonth() : trend.findIndex((b) => b.label === String(yearBe(r.occurredAt)));
    const groupMap = new Map<IncidentGroupKey, number>();
    const catMap = new Map<string, { count: number; high: number }>();
    const routeMap = new Map<string, number>();
    for (const r of filtered) {
      const b = trend[trendIdx(r)];
      if (b) b[r.severity] += 1;
      const g = incidentGroupOf(r.category).key;
      groupMap.set(g, (groupMap.get(g) ?? 0) + 1);
      const c = catMap.get(r.category) ?? { count: 0, high: 0 };
      c.count += 1;
      if (r.severity === "HIGH") c.high += 1;
      catMap.set(r.category, c);
      routeMap.set(r.routeLabel, (routeMap.get(r.routeLabel) ?? 0) + 1);
    }
    const groups = [...INCIDENT_GROUPS, OTHER_GROUP]
      .map((g) => ({ key: g.key, label: g.label, value: groupMap.get(g.key) ?? 0 }))
      .filter((g) => g.value > 0);
    return {
      trend,
      groups,
      categories: [...catMap.entries()].sort((a, b) => b[1].count - a[1].count),
      routes: [...routeMap.entries()].sort((a, b) => b[1] - a[1]),
      trips: new Set(filtered.map((r) => r.missionId)).size,
      high: filtered.filter((r) => r.severity === "HIGH").length,
      unresolved: filtered.filter((r) => !r.resolved).length,
      cargo: filtered.filter((r) => r.cargoAffected).length,
      delay: filtered.reduce((s, r) => s + (r.delayMinutes ?? 0), 0),
    };
  }, [filtered, year, years]);

  function setYear(y: number | null) {
    const next = new URLSearchParams(params);
    if (y == null) next.delete("year");
    else next.set("year", String(y));
    setParams(next, { replace: true });
    setCategory("");
  }

  function pickGroup(k: IncidentGroupKey | null) {
    setGroup(k);
    setCategory("");
  }

  function resetFilters() {
    setYear(null);
    pickGroup(null);
    setSeverity(null);
    setQ("");
  }

  async function exportYear() {
    if (year == null) return;
    setExporting(true);
    try {
      await apiDownload(`/api/missions/stats/incidents/export.xlsx?year=${year - 543}`, undefined, `เหตุการณ์ไม่ปกติระหว่างทริป_${year}.xlsx`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "ส่งออกไม่สำเร็จ");
    } finally {
      setExporting(false);
    }
  }

  const hasFilter = year != null || group != null || severity != null || category !== "" || q.trim() !== "";

  const kpis = [
    { k: "เหตุการณ์", v: num(filtered.length), tone: "text-[#1e1b4b]", bar: "bg-[#4d47b6]" },
    { k: "ทริปที่มีเหตุ", v: num(stats.trips), tone: "text-[#4d47b6]", bar: "bg-indigo-400" },
    { k: "รุนแรง", v: num(stats.high), tone: "text-rose-600", bar: "bg-rose-500" },
    { k: "ยังไม่ยุติ", v: num(stats.unresolved), tone: "text-amber-600", bar: "bg-amber-400" },
    { k: "ทรัพย์สินได้รับผลกระทบ", v: num(stats.cargo), tone: "text-rose-700", bar: "bg-rose-300" },
    { k: "ล่าช้ารวม", v: formatDelay(stats.delay) ?? "—", tone: "text-slate-700", bar: "bg-slate-300" },
  ];

  return (
    <div className="space-y-3">
      <PageHeaderBar
        title="เหตุการณ์ไม่ปกติระหว่างทริป"
        count={rows ? filtered.length : null}
        subtitle={<span className="text-xs">ภารกิจขนส่งธนบัตร · {year != null ? `พ.ศ. ${year}` : "ทุกปี"}</span>}
        backTo="/missions"
        extras={
          year != null ? (
            <button type="button" className={toolbarLinkBtnClass} disabled={exporting} onClick={() => void exportYear()}>
              {exporting ? "กำลังส่งออก…" : `ส่งออก Excel ปี ${year}`}
            </button>
          ) : null
        }
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
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={filterLabelClass}>ความรุนแรง</span>
          <button type="button" className={segBtn(severity == null)} onClick={() => setSeverity(null)}>
            ทั้งหมด
          </button>
          {SEVERITY_OPTIONS.map((o) => (
            <button key={o.key} type="button" className={segBtn(severity === o.key)} onClick={() => setSeverity(o.key)}>
              <span className={`h-2 w-2 rounded-full ${o.dot}`} />
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 xl:col-span-2">
          <span className={filterLabelClass}>กลุ่ม</span>
          <button type="button" className={segBtn(group == null)} onClick={() => pickGroup(null)}>
            ทั้งหมด <span className="opacity-70">{byYear.length}</span>
          </button>
          {groupOptions.map((g) => (
            <button key={g.key} type="button" className={segBtn(group === g.key)} onClick={() => pickGroup(g.key)}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: INCIDENT_GROUP_COLOR[g.key] }} />
              {g.label} <span className="opacity-70">{groupCounts.get(g.key) ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:col-span-2">
          <span className={filterLabelClass}>ประเภท</span>
          <select
            className="h-8 min-w-[13rem] rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-800"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">ทุกประเภท{group ? "ในกลุ่มนี้" : ""}</option>
            {categoryOptions.map(([c, n]) => (
              <option key={c} value={c}>
                {c} ({n})
              </option>
            ))}
          </select>
          <input
            type="search"
            className="h-8 min-w-[10rem] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800"
            placeholder="ค้นหา รายละเอียด / สถานที่ / ทริป…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {hasFilter ? (
            <button type="button" className="text-[11px] font-semibold text-slate-500 hover:text-rose-600" onClick={resetFilters}>
              ล้างตัวกรอง
            </button>
          ) : null}
        </div>
      </div>

      {err ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p> : null}
      {rows == null && !err ? <p className="py-10 text-center text-sm text-slate-500">กำลังโหลด…</p> : null}

      {rows != null ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {kpis.map((k) => (
              <div key={k.k} className={`${cardClass} relative overflow-hidden`}>
                <span className={`absolute inset-y-0 left-0 w-1 ${k.bar}`} />
                <p className="truncate text-[11px] font-medium text-slate-600">{k.k}</p>
                <p className={`text-xl font-bold leading-tight tabular-nums ${k.tone}`}>{k.v}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-2 lg:grid-cols-12">
            <div className={`${cardClass} flex h-[300px] flex-col lg:col-span-6`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className={titleClass}>{year != null ? `จำนวนเหตุการณ์รายเดือน — พ.ศ. ${year}` : "จำนวนเหตุการณ์รายปี"}</h3>
                <SeverityLegend />
              </div>
              <div className="mt-1 min-h-0 w-full min-w-0 flex-1">
                <SeverityChart data={stats.trend} />
              </div>
            </div>

            <div className={`${cardClass} flex h-[300px] flex-col lg:col-span-3`}>
              <h3 className={titleClass}>สัดส่วนตามกลุ่ม</h3>
              {stats.groups.length ? (
                <>
                  <div className="relative min-h-0 flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stats.groups}
                          dataKey="value"
                          nameKey="label"
                          innerRadius="58%"
                          outerRadius="88%"
                          paddingAngle={2}
                          stroke="none"
                        >
                          {stats.groups.map((g) => (
                            <Cell key={g.key} fill={INCIDENT_GROUP_COLOR[g.key]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ borderRadius: 12, fontFamily: CHART_FONT, fontSize: 12 }}
                          formatter={(v, name) => [`${Number(v ?? 0)} ครั้ง`, String(name ?? "")]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-black tabular-nums text-[#1e1b4b]">{num(filtered.length)}</span>
                      <span className="text-[10px] text-slate-500">เหตุการณ์</span>
                    </div>
                  </div>
                  <ul className="mt-1 space-y-1 text-[11px]">
                    {stats.groups.map((g) => (
                      <li key={g.key} className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: INCIDENT_GROUP_COLOR[g.key] }} />
                        <span className="min-w-0 flex-1 truncate text-slate-700">{g.label}</span>
                        <span className="font-bold tabular-nums text-[#2e2a58]">{g.value}</span>
                        <span className="w-10 text-right tabular-nums text-slate-500">
                          {filtered.length ? Math.round((g.value / filtered.length) * 100) : 0}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="flex flex-1 items-center justify-center text-xs text-slate-500">ไม่มีข้อมูล</p>
              )}
            </div>

            <div className={`${cardClass} h-[300px] overflow-y-auto lg:col-span-3`}>
              <h3 className={titleClass}>แยกตามประเภท</h3>
              <RankList
                empty="ไม่มีข้อมูล"
                items={stats.categories.map(([c, v]) => ({
                  key: c,
                  count: v.count,
                  note: v.high ? `รุนแรง ${v.high}` : undefined,
                  color: INCIDENT_GROUP_COLOR[incidentGroupOf(c).key],
                }))}
              />
            </div>
          </div>

          <div className="grid gap-2 lg:grid-cols-12">
            <div className={`${cardClass} max-h-[520px] overflow-y-auto lg:col-span-4`}>
              <h3 className={titleClass}>เส้นทางที่เกิดเหตุ</h3>
              <RankList
                empty="ไม่มีข้อมูล"
                barClass="bg-[#8b5cf6]/70"
                items={stats.routes.slice(0, 12).map(([label, count]) => ({ key: label, count }))}
              />
            </div>

            <div className={`${cardClass} flex max-h-[520px] flex-col overflow-hidden !px-0 !py-0 lg:col-span-8`}>
              <h3 className={`${titleClass} border-b border-slate-100 bg-slate-50/70 px-3 py-2`}>
                รายการเหตุการณ์ ({num(filtered.length)}) — ล่าสุดก่อน
              </h3>
              {filtered.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">
                  {all.length === 0 ? "ยังไม่มีการบันทึกเหตุการณ์ไม่ปกติ" : "ไม่มีเหตุการณ์ที่ตรงกับตัวกรอง"}
                </p>
              ) : (
                <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
                  {filtered.map((r) => {
                    const sev = severityMeta(r.severity);
                    const grp = incidentGroupOf(r.category);
                    const delay = formatDelay(r.delayMinutes);
                    return (
                      <li key={r.id}>
                        <Link
                          to={`/missions/${r.missionId}/summary`}
                          className="flex items-start gap-3 px-3 py-2.5 text-xs transition hover:bg-[#4d47b6]/5"
                        >
                          <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${sev.dot}`} />
                          <span className="w-28 shrink-0 tabular-nums text-slate-500">{formatIncidentTime(r.occurredAt)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-[#1e1b4b]">{r.category}</span>
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${grp.chip}`}>{grp.label}</span>
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ${sev.chip}`}>{sev.label}</span>
                              {!r.resolved ? (
                                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">ยังไม่ยุติ</span>
                              ) : null}
                              {r.cargoAffected ? (
                                <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                                  ทรัพย์สินได้รับผลกระทบ
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 block text-slate-700">{r.description}</span>
                            {r.actionTaken ? <span className="mt-0.5 block text-slate-500">การแก้ไข: {r.actionTaken}</span> : null}
                            <span className="mt-0.5 block text-[10.5px] text-slate-500">
                              {r.missionCode || r.missionTitle || "ภารกิจ"} · {r.routeLabel}
                              {r.location ? ` · ${r.location}` : ""}
                              {delay ? ` · ล่าช้า ${delay}` : ""}
                              {r.photoCount ? ` · รูป ${r.photoCount}` : ""}
                            </span>
                          </span>
                          <span className="shrink-0 self-center text-[11px] font-semibold text-[#4d47b6]">ดูทริป →</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
