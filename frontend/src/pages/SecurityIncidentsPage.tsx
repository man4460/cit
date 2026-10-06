import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiJson } from "../api/client";
import { ListPagination } from "../components/ListPagination";
import { Modal, ModalFormBody } from "../components/Modal";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { rowMatchesFilter } from "../lib/searchNormalize";
import type { SecurityIncident } from "../types";
import type { LoadOptions } from "../lib/loadOptions";
import { setLoadBusy } from "../lib/loadOptions";

const PAGE_SIZE = 30;

type PeriodFilter = "" | "today" | "month" | "quarter" | "year";

function startOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function periodRange(period: PeriodFilter): { start: Date; end: Date } | null {
  if (!period) return null;
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (period === "today") {
    return { start: startOfLocalDay(now), end };
  }
  if (period === "month") {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0), end };
  }
  if (period === "quarter") {
    const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
    return { start: new Date(now.getFullYear(), qStartMonth, 1, 0, 0, 0, 0), end };
  }
  // year (ค.ศ. ปีปฏิทินปัจจุบัน)
  return { start: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0), end };
}

function inPeriod(iso: string | null | undefined, period: PeriodFilter): boolean {
  if (!period) return true;
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const range = periodRange(period);
  if (!range) return true;
  return d >= range.start && d <= range.end;
}

/** เวลาเหตุการณ์เก็บเป็นเวลาไทยในฟิลด์ UTC — แสดงด้วย timeZone UTC เพื่อไม่ให้เลื่อน +7 ชม. */
function formatThDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatThTime(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

function parseListField(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const s = raw.trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s.replace(/'/g, '"')) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* plain text */
  }
  return [s];
}

const hasDamage = (v: string | null | undefined) => Boolean(v?.trim()) && !/^(ไม่มี|-|—|0|none)$/i.test(v!.trim());

const ICONS = {
  flame: "M12 3c1 3.5 5 5.5 5 10a5 5 0 01-10 0c0-2.2 1.2-3.8 2.5-5 .3 1.6 1 2.6 2 3-.4-2.8.2-5.6.5-8z",
  bell: "M6 16V11a6 6 0 1112 0v5l1.5 2h-15L6 16zM10 20a2 2 0 004 0",
  bellOff: "M6 16V11a6 6 0 0110.3-4.2M18 11v5l1.5 2H7M10 20a2 2 0 004 0M4 4l16 16",
  bolt: "M13 3L5 14h6l-1 7 8-11h-6l1-7z",
  crash: "M12 4l9 16H3L12 4zM12 10v4M12 17h.01",
  cog: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
  medical: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3z",
  scale: "M12 3v18M5 21h14M6 7h12M6 7l-3 7a3 3 0 006 0L6 7zM18 7l-3 7a3 3 0 006 0l-3-7z",
  leaf: "M5 19c0-8 5-14 15-15-1 10-7 15-15 15zM5 19l7-7",
  megaphone: "M3 10v4h3l7 4V6L6 10H3zM16 9a4 4 0 010 6M19 6.5a8 8 0 010 11",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3zM12 9v4M12 16h.01",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  pin: "M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11zm0-8.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  clock: "M12 7v5l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z",
  user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21a8 8 0 0116 0",
  coins: "M3 7h18v10H3zM12 15a3 3 0 100-6 3 3 0 000 6zM6 10v.01M18 14v.01",
  check: "M5 12l5 5L20 7",
  alert: "M12 8v5M12 16h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  list: "M4 6h16M4 12h16M4 18h10",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4",
  action: "M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
  x: "M6 6l12 12M18 6L6 18",
} as const;

type IconName = keyof typeof ICONS;

function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

type TypeTheme = { icon: IconName; tile: string; chip: string; dot: string; short: string };

const TYPE_THEMES: { test: RegExp; theme: TypeTheme }[] = [
  { test: /false\s*alarm.*เพลิง/i, theme: { icon: "bellOff", tile: "from-amber-400 to-orange-500", chip: "bg-amber-100 text-amber-800", dot: "#f59e0b", short: "False Alarm (เพลิง)" } },
  { test: /false\s*alarm/i, theme: { icon: "bell", tile: "from-yellow-400 to-amber-500", chip: "bg-yellow-100 text-yellow-800", dot: "#eab308", short: "False Alarm อื่นๆ" } },
  { test: /อัคคีภัย|เพลิงไหม้/, theme: { icon: "flame", tile: "from-red-500 to-orange-500", chip: "bg-red-100 text-red-700", dot: "#ef4444", short: "อัคคีภัย" } },
  { test: /สาธารณูปโภค/, theme: { icon: "bolt", tile: "from-sky-500 to-cyan-400", chip: "bg-sky-100 text-sky-700", dot: "#0ea5e9", short: "สาธารณูปโภค" } },
  { test: /อุบัติเหตุ/, theme: { icon: "crash", tile: "from-orange-500 to-amber-500", chip: "bg-orange-100 text-orange-700", dot: "#f97316", short: "อุบัติเหตุ" } },
  { test: /ไม่รุนแรง/, theme: { icon: "cog", tile: "from-teal-500 to-emerald-400", chip: "bg-teal-100 text-teal-700", dot: "#14b8a6", short: "ระบบขัดข้อง (ไม่รุนแรง)" } },
  { test: /รุนแรง/, theme: { icon: "cog", tile: "from-rose-500 to-pink-500", chip: "bg-rose-100 text-rose-700", dot: "#f43f5e", short: "ระบบขัดข้อง (รุนแรง)" } },
  { test: /ขัดข้อง/, theme: { icon: "cog", tile: "from-teal-500 to-emerald-400", chip: "bg-teal-100 text-teal-700", dot: "#14b8a6", short: "ระบบขัดข้อง (ไม่รุนแรง)" } },
  { test: /เจ็บป่วย/, theme: { icon: "medical", tile: "from-pink-500 to-fuchsia-400", chip: "bg-pink-100 text-pink-700", dot: "#ec4899", short: "เจ็บป่วย" } },
  { test: /ละเมิด|กฎหมาย/, theme: { icon: "scale", tile: "from-indigo-500 to-blue-500", chip: "bg-indigo-100 text-indigo-700", dot: "#6366f1", short: "ละเมิดกฎ/ระเบียบ" } },
  { test: /ธรรมชาติ|สัตว์/, theme: { icon: "leaf", tile: "from-emerald-500 to-lime-400", chip: "bg-emerald-100 text-emerald-700", dot: "#10b981", short: "ภัยธรรมชาติ/สัตว์" } },
  { test: /ชุมนุม|ร้องเรียน/, theme: { icon: "megaphone", tile: "from-violet-500 to-purple-400", chip: "bg-violet-100 text-violet-700", dot: "#8b5cf6", short: "ชุมนุม/ร้องเรียน" } },
  { test: /วินาศภัย/, theme: { icon: "shield", tile: "from-red-700 to-rose-500", chip: "bg-red-100 text-red-800", dot: "#b91c1c", short: "วินาศภัย" } },
];

const DEFAULT_THEME: TypeTheme = { icon: "dots", tile: "from-slate-500 to-slate-400", chip: "bg-slate-100 text-slate-700", dot: "#64748b", short: "เหตุอื่นๆ" };

/** ข้อมูลต้นทางสะกดไม่สม่ำเสมอ (เช่น "False Alarm" / "False alarm") — จัดกลุ่มโดยไม่สนตัวพิมพ์/ช่องว่าง */
function typeKey(type: string | null | undefined): string {
  return (type ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function typeTheme(type: string | null | undefined): TypeTheme {
  if (!type) return DEFAULT_THEME;
  return TYPE_THEMES.find((t) => t.test.test(type))?.theme ?? DEFAULT_THEME;
}

function StatusPill({ resolved, className = "" }: { resolved: boolean; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${
        resolved ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"
      } ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${resolved ? "bg-emerald-500" : "animate-pulse bg-amber-500"}`} />
      {resolved ? "ปิดแล้ว" : "เปิดอยู่"}
    </span>
  );
}

const SECTION_ICON_TONES = {
  amber: "text-amber-600 bg-amber-50",
  sky: "text-sky-600 bg-sky-50",
  emerald: "text-emerald-600 bg-emerald-50",
  violet: "text-violet-600 bg-violet-50",
  indigo: "text-indigo-600 bg-indigo-50",
} as const;

function TextSection({
  tone,
  icon,
  title,
  value,
}: {
  tone: keyof typeof SECTION_ICON_TONES;
  icon: IconName;
  title: string;
  value: string | null | undefined;
}) {
  if (!value?.trim()) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3.5">
      <h3 className="mb-1.5 flex items-center gap-2 text-[13px] font-bold text-slate-700">
        <span className={`flex h-6 w-6 items-center justify-center rounded-md ${SECTION_ICON_TONES[tone]}`}>
          <Icon name={icon} className="h-3.5 w-3.5" />
        </span>
        {title}
      </h3>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{value}</p>
    </section>
  );
}

function InfoItem({ icon, label, value }: { icon: IconName; label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <p className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-400">
        <Icon name={icon} className="h-3.5 w-3.5" />
        {label}
      </p>
      <div className="mt-0.5 truncate text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function TypeRow({
  label,
  title,
  icon,
  iconClass,
  count,
  active,
  onClick,
}: {
  label: string;
  title?: string;
  icon: IconName;
  iconClass: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title ?? label}
      className={`flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition lg:w-full ${
        active ? "bg-[#0000BF]/[0.07] font-bold text-[#0000BF]" : "font-medium text-slate-600 hover:bg-slate-50"
      }`}
    >
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${iconClass}`}>
        <Icon name={icon} className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate whitespace-nowrap">{label}</span>
      <span className={`ml-1 tabular-nums text-[11px] ${active ? "text-[#0000BF]" : "text-slate-400"}`}>{count.toLocaleString("th-TH")}</span>
    </button>
  );
}

function monthKey(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthHeading(key: string) {
  if (!key) return "ไม่ระบุวันที่";
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "UTC" });
}

function DateBox({ iso }: { iso: string | null | undefined }) {
  const d = iso ? new Date(iso) : null;
  const ok = d && !Number.isNaN(d.getTime());
  return (
    <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 leading-none">
      <span className="text-lg font-black tabular-nums text-slate-800">{ok ? d.getUTCDate() : "—"}</span>
      <span className="mt-0.5 text-[10px] font-semibold text-slate-500">
        {ok ? d.toLocaleDateString("th-TH", { month: "short", timeZone: "UTC" }) : ""}
      </span>
    </span>
  );
}

export function SecurityIncidentsPage() {
  const [rows, setRows] = useState<SecurityIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("year");
  const [detail, setDetail] = useState<SecurityIncident | null>(null);
  const [locations, setLocations] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  const load = useCallback(async (opts?: LoadOptions) => {
    setLoadBusy(setLoading, opts, true);
    setErr(null);
    try {
      const [data, meta] = await Promise.all([
        apiJson<SecurityIncident[]>("/api/security-incidents?take=5000"),
        apiJson<{ incidentTypes: string[]; locations: string[] }>("/api/security-incidents/meta/filters"),
      ]);
      setRows(data);
      setLocations(meta.locations);
    } catch (e) {
      setRows([]);
      setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** กรองทุกอย่างยกเว้นสถานะ/ประเภท — ใช้นับตัวเลขบนแถบสรุป */
  const baseFiltered = useMemo(() => {
    return rows.filter((r) => {
      if (locationFilter && (r.location ?? "") !== locationFilter) return false;
      if (!inPeriod(r.incidentAt, periodFilter)) return false;
      return rowMatchesFilter(listFilter, [
        String(r.externalId),
        r.title,
        r.location,
        r.incidentType,
        r.damageValue,
        r.cause,
        r.details,
        r.reportingOfficer,
        r.createdBy,
        r.statusResolved ? "ปิดแล้ว" : "เปิด",
        formatThDateTime(r.incidentAt),
      ]);
    });
  }, [rows, listFilter, locationFilter, periodFilter]);

  const filtered = useMemo(
    () =>
      baseFiltered.filter((r) => {
        if (typeFilter && typeKey(r.incidentType) !== typeFilter) return false;
        if (statusFilter === "resolved" && !r.statusResolved) return false;
        if (statusFilter === "open" && r.statusResolved) return false;
        return true;
      }),
    [baseFiltered, typeFilter, statusFilter],
  );

  const statusCounts = useMemo(() => {
    const scoped = typeFilter ? baseFiltered.filter((r) => typeKey(r.incidentType) === typeFilter) : baseFiltered;
    const open = scoped.filter((r) => !r.statusResolved).length;
    return { all: scoped.length, open, resolved: scoped.length - open };
  }, [baseFiltered, typeFilter]);

  const typeCounts = useMemo(() => {
    const scoped = statusFilter
      ? baseFiltered.filter((r) => (statusFilter === "open" ? !r.statusResolved : r.statusResolved))
      : baseFiltered;
    const m = new Map<string, { label: string; n: number }>();
    for (const r of scoped) {
      const k = typeKey(r.incidentType);
      if (!k) continue;
      const cur = m.get(k);
      if (cur) cur.n += 1;
      else m.set(k, { label: r.incidentType!.trim(), n: 1 });
    }
    return [...m.entries()].map(([k, v]) => [k, v.label, v.n] as const).sort((a, b) => b[2] - a[2]);
  }, [baseFiltered, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  useEffect(() => {
    setPage(1);
  }, [listFilter, typeFilter, locationFilter, statusFilter, periodFilter]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const periodButtons: { id: PeriodFilter; label: string }[] = [
    { id: "today", label: "วันนี้" },
    { id: "month", label: "เดือนนี้" },
    { id: "quarter", label: "ไตรมาสนี้" },
    { id: "year", label: "ปีนี้" },
  ];

  function togglePeriod(id: PeriodFilter) {
    setPeriodFilter((cur) => (cur === id ? "" : id));
  }

  const statusOptions = [
    { id: "", label: "ทั้งหมด", value: statusCounts.all, dot: "bg-slate-400" },
    { id: "open", label: "เปิดอยู่", value: statusCounts.open, dot: "bg-amber-500" },
    { id: "resolved", label: "ปิดแล้ว", value: statusCounts.resolved, dot: "bg-emerald-500" },
  ];

  const typeTotal = typeCounts.reduce((s, [, , n]) => s + n, 0);

  const pagedGroups = useMemo(() => {
    const out: { key: string; items: SecurityIncident[] }[] = [];
    for (const r of paged) {
      const k = monthKey(r.incidentAt);
      const last = out[out.length - 1];
      if (last && last.key === k) last.items.push(r);
      else out.push({ key: k, items: [r] });
    }
    return out;
  }, [paged]);

  const monthTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      const k = monthKey(r.incidentAt);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [filtered]);

  const hasActiveFilter = Boolean(typeFilter || statusFilter || locationFilter || periodFilter !== "year" || listFilter);

  function clearFilters() {
    setTypeFilter("");
    setStatusFilter("");
    setLocationFilter("");
    setPeriodFilter("year");
    setListFilter("");
  }

  const detailTheme = detail ? typeTheme(detail.incidentType) : DEFAULT_THEME;

  return (
    <div>
      <PageHeaderBar
        title="เหตุการณ์ไม่ปกติ"
        count={filtered.length}
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "เหตุการณ์ไม่ปกติ",
          placeholder: "ค้นหาชื่อ / สถานที่ / ประเภท…",
        }}
      />

      {err && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</div>}

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="space-y-3 print:hidden lg:sticky lg:top-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="mb-2 px-1 text-[11px] font-bold text-slate-400">สถานะ</p>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              {statusOptions.map((o) => {
                const on = statusFilter === o.id;
                return (
                  <button
                    key={o.id || "all"}
                    type="button"
                    onClick={() => setStatusFilter(o.id)}
                    aria-pressed={on}
                    className={`rounded-lg px-1 py-1.5 text-center transition ${on ? "bg-white shadow-sm" : "hover:bg-white/60"}`}
                  >
                    <span className="block text-base font-black tabular-nums text-slate-800">
                      {loading ? "…" : o.value.toLocaleString("th-TH")}
                    </span>
                    <span className="mt-0.5 flex items-center justify-center gap-1 text-[10.5px] font-semibold text-slate-500">
                      <span className={`h-1.5 w-1.5 rounded-full ${o.dot}`} />
                      {o.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <p className="mb-1 px-2 pt-1 text-[11px] font-bold text-slate-400">ประเภทเหตุ</p>
            <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              <TypeRow
                label="ทุกประเภท"
                icon="list"
                iconClass="bg-slate-100 text-slate-600"
                count={typeTotal}
                active={!typeFilter}
                onClick={() => setTypeFilter("")}
              />
              {typeCounts.map(([t, label, n]) => {
                const th = typeTheme(label);
                return (
                  <TypeRow
                    key={t}
                    label={th.short}
                    title={label}
                    icon={th.icon}
                    iconClass={th.chip}
                    count={n}
                    active={typeFilter === t}
                    onClick={() => setTypeFilter(typeFilter === t ? "" : t)}
                  />
                );
              })}
            </div>
          </div>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 print:hidden">
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
              {[{ id: "" as PeriodFilter, label: "ทั้งหมด" }, ...periodButtons].map((b) => (
                <button
                  key={b.id || "all"}
                  type="button"
                  onClick={() => (b.id ? togglePeriod(b.id) : setPeriodFilter(""))}
                  aria-pressed={periodFilter === b.id}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                    periodFilter === b.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <label className="relative">
              <Icon name="pin" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <select
                className="rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-7 text-xs font-semibold text-slate-700 focus:border-[#8b5cf6] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20"
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                aria-label="กรองสถานที่"
              >
                <option value="">ทุกสถานที่</option>
                {locations.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <span className="ml-auto text-xs text-slate-500">
              พบ <b className="tabular-nums text-slate-800">{filtered.length.toLocaleString("th-TH")}</b> รายการ
            </span>
            {hasActiveFilter ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <Icon name="x" className="h-3.5 w-3.5" />
                ล้างตัวกรอง
              </button>
            ) : null}
          </div>

          {loading ? (
            <p className="px-4 py-12 text-center text-sm text-slate-500">กำลังโหลด…</p>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Icon name="search" className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">ไม่พบรายการตามเงื่อนไข</p>
            </div>
          ) : (
            pagedGroups.map((g) => (
              <div key={g.key || "none"}>
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-1.5">
                  <p className="text-xs font-bold text-slate-600">{monthHeading(g.key)}</p>
                  <p className="text-[11px] tabular-nums text-slate-400">{(monthTotals.get(g.key) ?? 0).toLocaleString("th-TH")} รายการ</p>
                </div>
                <ul className="divide-y divide-slate-100">
                  {g.items.map((r) => {
                    const th = typeTheme(r.incidentType);
                    const time = formatThTime(r.incidentAt);
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => setDetail(r)}
                          className="group relative flex w-full items-center gap-3 py-3 pl-4 pr-10 text-left transition hover:bg-slate-50"
                        >
                          <span
                            className={`absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full ${th.chip}`}
                            title={r.incidentType ?? ""}
                          >
                            <Icon name={th.icon} className="h-3 w-3" />
                          </span>
                          <DateBox iso={r.incidentAt} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-800 group-hover:text-[#0000BF]">{r.title}</span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-slate-500">
                              <span className="font-medium text-slate-600">{th.short}</span>
                              <span className="text-slate-300">•</span>
                              <span className="inline-flex items-center gap-0.5">
                                <Icon name="pin" className="h-3 w-3" />
                                {r.location || "—"}
                              </span>
                              {time ? (
                                <>
                                  <span className="text-slate-300">•</span>
                                  <span className="inline-flex items-center gap-0.5 tabular-nums">
                                    <Icon name="clock" className="h-3 w-3" />
                                    {time} น.
                                  </span>
                                </>
                              ) : null}
                              <span className="text-slate-300">•</span>
                              <span className="font-mono text-slate-400">#{r.externalId}</span>
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            <StatusPill resolved={r.statusResolved} />
                            {hasDamage(r.damageValue) ? (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-rose-600" title={r.damageValue ?? ""}>
                                <Icon name="coins" className="h-3 w-3" />
                                มีความเสียหาย
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </section>
      </div>

      {!loading && filtered.length > 0 ? (
        <ListPagination page={safePage} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} className="print:hidden" />
      ) : null}

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={
          detail ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${detailTheme.chip}`}>
                <Icon name={detailTheme.icon} className="h-[18px] w-[18px]" />
              </span>
              <span className="truncate">{detail.title}</span>
            </span>
          ) : (
            "รายละเอียด"
          )
        }
        size="wide"
      >
        {detail ? (
          <ModalFormBody>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <StatusPill resolved={detail.statusResolved} className="!text-[11px]" />
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-700">
                  <Icon name={detailTheme.icon} className="h-3.5 w-3.5 text-slate-500" />
                  {detail.incidentType || "ไม่ระบุประเภท"}
                </span>
                {[...parseListField(detail.impactLevel), ...parseListField(detail.impactTypes)].map((x, i) => (
                  <span key={`${x}-${i}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                    {x}
                  </span>
                ))}
                <span className="ml-auto font-mono text-slate-400">#{detail.externalId}</span>
              </div>

              <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white lg:grid-cols-4 lg:divide-y-0">
                <InfoItem icon="calendar" label="วันเวลาที่เกิดเหตุ" value={formatThDateTime(detail.incidentAt)} />
                <InfoItem icon="pin" label="สถานที่" value={detail.location || "—"} />
                <InfoItem
                  icon="coins"
                  label="มูลค่าความเสียหาย"
                  value={<span className={hasDamage(detail.damageValue) ? "text-rose-600" : ""}>{detail.damageValue || "—"}</span>}
                />
                <InfoItem icon="user" label="ผู้รายงาน" value={detail.reportingOfficer || detail.createdBy || "—"} />
              </div>

              <TextSection tone="sky" icon="list" title="รายละเอียด" value={detail.details} />
              <TextSection tone="amber" icon="search" title="สาเหตุ" value={detail.cause} />
              <div className="grid gap-3 lg:grid-cols-2">
                <TextSection tone="emerald" icon="action" title="การดำเนินการ" value={detail.actionExecuted} />
                <TextSection tone="violet" icon="shield" title="แนวทางป้องกัน" value={detail.preventiveSolutions} />
              </div>
              <TextSection tone="indigo" icon="megaphone" title="คำสั่งผู้บังคับบัญชา" value={detail.commanderOrder} />

              {detail.linkBotShare ? (
                <a
                  href={detail.linkBotShare}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#0000BF] hover:bg-slate-50"
                >
                  <Icon name="link" className="h-4 w-4 shrink-0" />
                  <span className="truncate">เปิดเอกสารแนบ — {detail.linkBotShare}</span>
                </a>
              ) : null}
            </div>
          </ModalFormBody>
        ) : null}
      </Modal>
    </div>
  );
}
