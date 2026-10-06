import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { FitSingleLine } from "../components/FitSingleLine";
import { IncidentAnalysisModal } from "../components/IncidentAnalysisModal";
import { Modal } from "../components/Modal";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { apiJson } from "../api/client";
import {
  brandGradientFillClass,
  chartAxisFill,
  chartGridStroke,
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

const cardClass =
  "flex min-h-0 min-w-0 flex-col rounded-xl border border-slate-200 bg-white/70 px-2 pb-1 pt-2 print:border-0 print:bg-transparent print:p-0";
const cardTitleClass = "px-1 text-xs font-black text-[#1e1b4b] print:text-[9pt]";

const OPEN_COLOR = "#f59e0b";
const RESOLVED_COLOR = "#4d47b6";
const RATE_COLOR = "#059669";

function LegendDot({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={line ? "h-0.5 w-3 rounded-full" : "h-2 w-2 rounded-[2px]"}
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}

type MonthChartRow = MonthRow & { rate: number | null };

function MonthTooltip({ active, payload }: TooltipContentProps) {
  const row = payload?.[0]?.payload as MonthChartRow | undefined;
  if (!active || !row) return null;
  return (
    <div
      className="rounded-md border border-slate-200 bg-white/95 px-2 py-1.5 text-[11px] shadow-xl"
      style={{ fontFamily: "Noto Sans Thai, sans-serif" }}
    >
      <p className="font-bold text-[#1e1b4b]">
        {row.label} · {row.count.toLocaleString("th-TH")} เหตุการณ์
      </p>
      <p style={{ color: OPEN_COLOR }}>เปิดอยู่ {row.open.toLocaleString("th-TH")}</p>
      <p style={{ color: RESOLVED_COLOR }}>ปิดแล้ว {row.resolved.toLocaleString("th-TH")}</p>
      {row.rate != null ? <p style={{ color: RATE_COLOR }}>อัตราปิด {row.rate.toFixed(0)}%</p> : null}
    </div>
  );
}

type IncidentDetailRow = {
  id: string;
  externalId: number;
  title: string;
  location: string | null;
  incidentAt: string | null;
  sourceCreatedAt: string | null;
  incidentType: string | null;
  impactLevel: string | null;
  statusResolved: boolean;
  cause: string | null;
  details: string | null;
  actionExecuted: string | null;
  reportingOfficer: string | null;
};

type SummaryAction = "all" | "open" | "resolved" | "types" | "places";

type DetailQuery = { title: string; month?: number; type?: string; place?: string; status?: "open" | "resolved" };

function NamedListModal({
  title,
  rows,
  color,
  onClose,
  onSelect,
}: {
  title: string | null;
  rows: NamedCount[];
  color: string;
  onClose: () => void;
  onSelect: (name: string) => void;
}) {
  if (!title) return null;
  const total = rows.reduce((s, r) => s + r.count, 0);
  const max = rows[0]?.count ?? 0;
  return (
    <Modal open onClose={onClose} title={title} size="form">
      <p className="mb-2 text-sm text-slate-600">
        {rows.length.toLocaleString("th-TH")} รายการ · รวม {total.toLocaleString("th-TH")} ครั้ง — คลิกเพื่อดูเหตุการณ์
      </p>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {rows.map((r, i) => (
          <li key={r.name}>
            <button
              type="button"
              onClick={() => onSelect(r.name)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="w-5 shrink-0 text-right text-xs font-bold tabular-nums text-slate-400">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-[#1e1b4b]">{r.name}</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${max > 0 ? (r.count / max) * 100 : 0}%`, backgroundColor: color }} />
                </div>
              </div>
              <span className="shrink-0 font-black tabular-nums" style={{ color }}>
                {r.count.toLocaleString("th-TH")}
              </span>
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-500">
                {total > 0 ? `${Math.round((r.count / total) * 100)}%` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function formatIncidentDate(r: IncidentDetailRow) {
  const iso = r.incidentAt ?? r.sourceCreatedAt;
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function IncidentDetailModal({
  query,
  baseParams,
  onClose,
}: {
  query: DetailQuery | null;
  baseParams: URLSearchParams;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<IncidentDetailRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const qs = useMemo(() => {
    if (!query) return "";
    const p = new URLSearchParams(baseParams);
    if (query.month) p.set("month", String(query.month));
    if (query.type) p.set("type", query.type);
    if (query.place) p.set("place", query.place);
    if (query.status) p.set("status", query.status);
    return p.toString();
  }, [query, baseParams]);

  useEffect(() => {
    if (!qs) return;
    let cancelled = false;
    setRows(null);
    setErr(null);
    setExpanded(null);
    apiJson<IncidentDetailRow[]>(`/api/security-incidents/stats/year/incidents?${qs}`)
      .then((d) => {
        if (!cancelled) setRows(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "โหลดรายการไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, [qs]);

  if (!query) return null;
  const openCount = rows?.filter((r) => !r.statusResolved).length ?? 0;

  return (
    <Modal open onClose={onClose} title={query.title} size="wide" overlayZClass="z-[70]">
      {err ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>
      ) : !rows ? (
        <p className="py-8 text-center text-sm text-slate-500">กำลังโหลด…</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">ไม่มีเหตุการณ์</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            {rows.length.toLocaleString("th-TH")} เหตุการณ์ ·{" "}
            <span style={{ color: OPEN_COLOR }} className="font-bold">
              เปิดอยู่ {openCount}
            </span>{" "}
            ·{" "}
            <span style={{ color: RESOLVED_COLOR }} className="font-bold">
              ปิดแล้ว {rows.length - openCount}
            </span>
          </p>
          <ul className="space-y-1.5">
            {rows.map((r) => {
              const isOpen = expanded === r.id;
              const sections = [
                { k: "รายละเอียด", v: r.details },
                { k: "สาเหตุ", v: r.cause },
                { k: "การดำเนินการ", v: r.actionExecuted },
              ].filter((s) => s.v?.trim());
              return (
                <li key={r.id} className="rounded-xl border border-slate-200 bg-white">
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-slate-50/70"
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                    aria-expanded={isOpen}
                  >
                    <span
                      className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black text-white"
                      style={{ backgroundColor: r.statusResolved ? RESOLVED_COLOR : OPEN_COLOR }}
                    >
                      {r.statusResolved ? "ปิดแล้ว" : "เปิดอยู่"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[#1e1b4b]">{r.title}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {formatIncidentDate(r)} · {r.incidentType?.trim() || "ไม่ระบุประเภท"} ·{" "}
                        {r.location?.trim() || "ไม่ระบุสถานที่"}
                        {r.impactLevel?.trim() ? ` · ผลกระทบ ${r.impactLevel.trim()}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{isOpen ? "▲" : "▼"}</span>
                  </button>
                  {isOpen ? (
                    <div className="space-y-2 border-t border-slate-100 px-3 py-2 text-[12px] text-slate-700">
                      {sections.length === 0 ? (
                        <p className="text-slate-500">ไม่มีรายละเอียดเพิ่มเติม</p>
                      ) : (
                        sections.map((s) => (
                          <div key={s.k}>
                            <p className="text-[11px] font-bold text-slate-500">{s.k}</p>
                            <p className="whitespace-pre-line">{s.v}</p>
                          </div>
                        ))
                      )}
                      {r.reportingOfficer?.trim() ? (
                        <p className="text-[11px] text-slate-500">ผู้รายงาน: {r.reportingOfficer}</p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Modal>
  );
}

function RankPanel({
  title,
  rows,
  color,
  loading,
  onSelect,
  action,
  className = "",
}: {
  title: string;
  rows: NamedCount[];
  color: string;
  loading: boolean;
  onSelect: (name: string) => void;
  action?: React.ReactNode;
  className?: string;
}) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const max = rows[0]?.count ?? 0;
  return (
    <div className={`${cardClass} h-[300px] lg:h-auto print:mt-1.5 print:h-auto ${className}`}>
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h3 className={`${cardTitleClass} flex items-baseline gap-2`}>
          {title}
          {action}
        </h3>
        <span className="text-[10.5px] font-bold tabular-nums" style={{ color }}>
          รวม {total.toLocaleString("th-TH")} ครั้ง
        </span>
      </div>
      {loading ? (
        <p className="flex flex-1 items-center justify-center text-xs text-slate-500">กำลังโหลด…</p>
      ) : rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-xs text-slate-500">ไม่มีข้อมูล</p>
      ) : (
        <ul className="mt-1.5 min-h-0 flex-1 space-y-1.5 overflow-y-auto px-1 pb-1 print:overflow-visible">
          {rows.map((r, i) => (
            <li key={r.name}>
              <button
                type="button"
                title={`${r.name} — คลิกดูรายการ`}
                onClick={() => onSelect(r.name)}
                className="w-full rounded-md px-1 py-0.5 text-left transition hover:bg-slate-50"
              >
              <div className="flex items-baseline gap-1.5 text-[11px] leading-tight">
                <span className="w-3.5 shrink-0 text-right font-bold tabular-nums text-slate-400">{i + 1}</span>
                <span className={`min-w-0 flex-1 truncate ${i === 0 ? "font-black" : "font-semibold"} text-[#1e1b4b]`}>
                  {r.name}
                </span>
                <span className="shrink-0 font-black tabular-nums" style={{ color }}>
                  {r.count.toLocaleString("th-TH")}
                </span>
                <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-slate-500">
                  {total > 0 ? `${Math.round((r.count / total) * 100)}%` : ""}
                </span>
              </div>
              <div className="ml-5 mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${max > 0 ? (r.count / max) * 100 : 0}%`, backgroundColor: color, opacity: i === 0 ? 1 : 0.6 }}
                />
              </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
  const [searchQ, setSearchQ] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("");
  const [locations, setLocations] = useState<string[]>([]);
  const [detailQuery, setDetailQuery] = useState<DetailQuery | null>(null);
  const [listModal, setListModal] = useState<"types" | "places" | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);

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

  useEffect(() => {
    const t = window.setTimeout(() => setSearchQ(listFilter.trim()), 300);
    return () => window.clearTimeout(t);
  }, [listFilter]);

  const detailBaseParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("year", String(selectedYear));
    if (locationFilter) p.set("location", locationFilter);
    if (periodFilter) p.set("period", periodFilter);
    if (searchQ) p.set("q", searchQ);
    return p;
  }, [selectedYear, locationFilter, periodFilter, searchQ]);

  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    setStatsErr(null);
    apiJson<YearStats>(`/api/security-incidents/stats/year?${detailBaseParams.toString()}`)
      .then((data) => {
        if (!cancelled) setYearStats(data);
      })
      .catch((e) => {
        if (cancelled) return;
        setYearStats(null);
        setStatsErr(e instanceof Error ? e.message : "โหลดสถิติไม่สำเร็จ");
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detailBaseParams]);

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

  const monthChart = useMemo((): MonthChartRow[] => {
    if (!yearStats?.months.length) return [];
    return yearStats.months.map((m) => ({
      ...m,
      rate: m.count > 0 ? (m.resolved / m.count) * 100 : null,
    }));
  }, [yearStats]);

  const typeChart = useMemo(() => (yearStats?.byType ?? []).slice(0, 12), [yearStats]);
  const locationChart = useMemo(() => (yearStats?.byLocation ?? []).slice(0, 12), [yearStats]);

  const summaryItems = useMemo(() => {
    const yt = yearStats?.yearTotals;
    if (!yt) return [];
    const items: Array<{ k: string; v: string; tone: string; action: SummaryAction }> = [
      { k: "เหตุการณ์ทั้งหมด", v: yt.total.toLocaleString("th-TH"), tone: "text-[#1e1b4b]", action: "all" },
      { k: "เปิดอยู่", v: yt.open.toLocaleString("th-TH"), tone: "text-amber-700", action: "open" },
      { k: "ปิดแล้ว", v: yt.resolved.toLocaleString("th-TH"), tone: "text-[#4d47b6]", action: "resolved" },
      {
        k: "อัตราปิดเรื่อง",
        v: yt.total > 0 ? `${Math.round((yt.resolved / yt.total) * 100)}%` : "—",
        tone: "text-emerald-700",
        action: "resolved",
      },
      { k: "ประเภท", v: yt.typeCount.toLocaleString("th-TH"), tone: "text-[#2e2a58]", action: "types" },
      { k: "สถานที่", v: yt.locationCount.toLocaleString("th-TH"), tone: "text-[#ec4899]", action: "places" },
    ];
    return items;
  }, [yearStats]);

  const scopeLabel = useMemo(() => {
    const parts: string[] = [];
    if (periodFilter) parts.push(PERIOD_LABELS[periodFilter]);
    else parts.push(`พ.ศ. ${selectedYear + 543}`);
    if (locationFilter) parts.push(locationFilter);
    if (searchQ) parts.push(`กรอง "${searchQ}"`);
    return parts.join(" · ");
  }, [periodFilter, selectedYear, locationFilter, searchQ]);

  function runSummaryAction(action: SummaryAction) {
    if (action === "types" || action === "places") {
      setListModal(action);
      return;
    }
    const titles: Record<"all" | "open" | "resolved", string> = {
      all: "เหตุการณ์ทั้งหมด",
      open: "เหตุการณ์ที่เปิดอยู่",
      resolved: "เหตุการณ์ที่ปิดแล้ว",
    };
    setDetailQuery({
      title: `${titles[action]} — ${scopeLabel}`,
      ...(action === "all" ? {} : { status: action }),
    });
  }

  function openMonthDetail(index: number) {
    const row = monthChart[index];
    if (!row || row.count === 0) return;
    setDetailQuery({ title: `เหตุการณ์เดือน${row.label} — ${scopeLabel}`, month: row.month });
  }

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
        count={yearStats?.yearTotals.total ?? 0}
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
            <button
              type="button"
              onClick={() => setAnalysisOpen(true)}
              className={`${toolbarLinkBtnClass} ${brandGradientFillClass} !text-white print:hidden`}
            >
              วิเคราะห์สาเหตุ
            </button>
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 print:mt-1 print:grid-cols-6 print:gap-1">
            {summaryItems.length === 0 ? (
              <div className="col-span-full rounded-xl border border-slate-200 bg-white/60 px-3 py-2 text-center text-sm text-slate-600">
                ไม่มีข้อมูล
              </div>
            ) : (
              summaryItems.map((item) => (
                <button
                  type="button"
                  key={item.k}
                  title="คลิกดูรายละเอียด"
                  onClick={() => runSummaryAction(item.action)}
                  className="min-w-0 cursor-pointer rounded-xl border border-slate-200 bg-white/70 px-2.5 py-1.5 text-left transition hover:border-[#4d47b6]/40 hover:bg-white hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d47b6]/40 print:rounded-md print:px-1.5 print:py-1"
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

        <div className="mt-2 grid gap-2 lg:h-[calc(100dvh-12.5rem)] lg:min-h-[22rem] lg:grid-cols-12 print:mt-1 print:block print:h-auto print:min-h-0">
          <div className={`${cardClass} h-[300px] lg:col-span-4 lg:h-auto print:h-auto`}>
            <div className="flex items-baseline justify-between gap-2 px-1">
              <h3 className={cardTitleClass}>เหตุการณ์รายเดือน</h3>
              <div className="flex items-center gap-2.5 text-[10px] font-semibold text-slate-600">
                <LegendDot color={OPEN_COLOR} label="เปิดอยู่" />
                <LegendDot color={RESOLVED_COLOR} label="ปิดแล้ว" />
                <LegendDot color={RATE_COLOR} label="อัตราปิด %" line />
              </div>
            </div>
            <div className="min-h-0 w-full min-w-0 flex-1 print:h-[7cm] print:flex-none">
              {statsLoading ? (
                <div className="flex h-full items-center justify-center text-slate-700">กำลังโหลดสถิติ…</div>
              ) : monthChart.length === 0 ? (
                <div className="flex h-full items-center justify-center text-slate-700">ไม่มีข้อมูลรายเดือน</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthChart} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                    <XAxis
                      dataKey="label"
                      interval={0}
                      tick={{ fill: chartAxisFill, fontSize: 9.5, fontFamily: "Noto Sans Thai, sans-serif" }}
                      tickLine={false}
                      axisLine={{ stroke: chartGridStroke }}
                    />
                    <YAxis
                      yAxisId="count"
                      allowDecimals={false}
                      tick={{ fill: chartAxisFill, fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={28}
                    />
                    <YAxis
                      yAxisId="rate"
                      orientation="right"
                      domain={[0, 100]}
                      ticks={[0, 50, 100]}
                      tickFormatter={(v: number) => `${v}%`}
                      tick={{ fill: RATE_COLOR, fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={36}
                    />
                    <Tooltip cursor={{ fill: "rgba(77,71,182,0.06)" }} content={MonthTooltip} />
                    <Bar
                      yAxisId="count"
                      dataKey="resolved"
                      name="ปิดแล้ว"
                      stackId="s"
                      fill={RESOLVED_COLOR}
                      maxBarSize={34}
                      cursor="pointer"
                      onClick={(_d, index) => openMonthDetail(index)}
                    />
                    <Bar
                      yAxisId="count"
                      dataKey="open"
                      name="เปิดอยู่"
                      stackId="s"
                      fill={OPEN_COLOR}
                      radius={[5, 5, 0, 0]}
                      maxBarSize={34}
                      cursor="pointer"
                      onClick={(_d, index) => openMonthDetail(index)}
                    >
                      <LabelList dataKey="count" position="top" fontSize={10} fill="#1e1b4b" formatter={(v) => (Number(v) > 0 ? v : "")} />
                    </Bar>
                    <Line
                      yAxisId="rate"
                      dataKey="rate"
                      name="อัตราปิด"
                      type="monotone"
                      stroke={RATE_COLOR}
                      strokeWidth={2}
                      dot={{ r: 2.5, fill: RATE_COLOR }}
                      connectNulls
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <RankPanel
            className="lg:col-span-4"
            title="แยกตามประเภท"
            rows={typeChart}
            color="#4d47b6"
            loading={statsLoading}
            action={
              <button
                type="button"
                onClick={() => setAnalysisOpen(true)}
                className="rounded-full bg-[#4d47b6]/10 px-2 py-0.5 text-[10px] font-bold text-[#4d47b6] hover:bg-[#4d47b6]/20 print:hidden"
              >
                วิเคราะห์สาเหตุ
              </button>
            }
            onSelect={(name) => setDetailQuery({ title: `ประเภท: ${name} — ${scopeLabel}`, type: name })}
          />
          <RankPanel
            className="lg:col-span-4"
            title="แยกตามสถานที่"
            rows={locationChart}
            color="#ec4899"
            loading={statsLoading}
            onSelect={(name) => setDetailQuery({ title: `สถานที่: ${name} — ${scopeLabel}`, place: name })}
          />
        </div>

        <NamedListModal
          title={
            listModal === "types"
              ? `ประเภทเหตุการณ์ — ${scopeLabel}`
              : listModal === "places"
                ? `สถานที่เกิดเหตุ — ${scopeLabel}`
                : null
          }
          rows={listModal === "places" ? (yearStats?.byLocation ?? []) : (yearStats?.byType ?? [])}
          color={listModal === "places" ? "#ec4899" : "#4d47b6"}
          onClose={() => setListModal(null)}
          onSelect={(name) =>
            setDetailQuery(
              listModal === "places"
                ? { title: `สถานที่: ${name} — ${scopeLabel}`, place: name }
                : { title: `ประเภท: ${name} — ${scopeLabel}`, type: name },
            )
          }
        />
        <IncidentDetailModal query={detailQuery} baseParams={detailBaseParams} onClose={() => setDetailQuery(null)} />
        <IncidentAnalysisModal
          open={analysisOpen}
          onClose={() => setAnalysisOpen(false)}
          baseParams={detailBaseParams}
          scopeLabel={scopeLabel}
        />
      </section>
    </div>
  );
}
