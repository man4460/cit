import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../api/client";
import { Modal } from "../components/Modal";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { mondayOfWeekContaining, toYyyyMmDd } from "../lib/inspectionWeek";
import {
  OS_PROCUREMENT_LEAD_DAYS,
  VEHICLE_LIFE_YEARS,
  bucketOf,
  buildCycleItems,
  type CycleBucket,
  type CycleItem,
} from "../lib/replacementCycle";
import { toolbarLinkBtnClass } from "../lib/uiTokens";

// ---------------------------------------------------------------------------
// ชนิดข้อมูลจาก API เดิม (เฉพาะฟิลด์ที่ใช้)
// ---------------------------------------------------------------------------

type CheckResult = "NORMAL" | "ABNORMAL" | null;
type VehicleWeekReport = {
  totalVehicles: number;
  inspectedCount: number;
  rows: (Record<string, unknown> & { vehicle: { licensePlate: string } })[];
};
type ArmorMonthReport = {
  totalAssets: number;
  inspectedCount: number;
  abnormalRowsCount: number;
  rows: { asset: { id: string; serialNumber: string; itemName: string }; inspection: Record<string, unknown> | null }[];
};

type Vehicle = { id: string; licensePlate: string; brandModel: string; purchasedAt: string | null; notes: string | null };
type Asset = { id: string; serialNumber: string; itemName: string; armorExpiresAt: string | null };
type Vest = { permitExpiresAt: string | null };
type FireExt = { id: string; code: string; location: string; kind: string; manufacturedAt: string | null; status: string };
type AmmoLot = { id: string; code: string; kind: string; purchasedAt: string | null; remainingQty: number };
type OsGroup = {
  name: string;
  contracts: { id: string; vendorName: string; contractNo: string | null; endDate: string; active: boolean }[];
};
const VEHICLE_CHECK_LABELS: Record<string, string> = {
  airConditioning: "แอร์",
  engineOperation: "เครื่องยนต์",
  tireCondition: "ยาง",
  cctvAnalog: "กล้อง Analog",
  cctvThinkware: "กล้อง Thinkware",
  engineStart5Min: "ติดเครื่อง 5 นาที",
};
const VEHICLE_CHECKS = Object.keys(VEHICLE_CHECK_LABELS);

const ARMOR_CHECK_LABELS: Record<string, string> = {
  outerShell: "เปลือกนอก",
  strapsFasteners: "สายรัด / ตัวล็อก",
  ballisticLayer: "แผ่นกันกระสุน",
  cleanlinessStorage: "ความสะอาด / การจัดเก็บ",
  overallReadiness: "ความพร้อมโดยรวม",
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const MONTH_LONG = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

function ymOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftYm(monthYm: string, delta: number) {
  const [y, m] = monthYm.split("-").map(Number);
  return ymOf(new Date(y, m - 1 + delta, 1));
}

function ymLabel(monthYm: string) {
  const [y, m] = monthYm.split("-").map(Number);
  return `${MONTH_LONG[m - 1]} ${y + 543}`;
}

function pct(n: number | null) {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

function ageYears(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years -= 1;
  return Math.max(0, years);
}

/** กฎเดียวกับหน้าอัคคีภัย: BF2000 / Dry che / Softex / Halotron = 10 ปี อื่น ๆ 15 ปี */
function tankLife(kind: string, manufacturedAt: string | null): "ok" | "expiring" | "expired" | "unknown" {
  const age = ageYears(manufacturedAt);
  if (age == null) return "unknown";
  const n = kind.toLowerCase().replace(/[\s\-_.]/g, "");
  const life = n.includes("bf2000") || n.includes("dryche") || n.includes("softex") || n.includes("halotron") ? 10 : 15;
  if (age >= life) return "expired";
  if (age >= life - 1) return "expiring";
  return "ok";
}

/** กฎเดียวกับหน้าเสื้อเกราะ: หมดอายุ / ภายใน 365 วัน */
function permitLife(iso: string | null): "ok" | "expiring" | "expired" | "unknown" {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d < today) return "expired";
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 365);
  return d <= soon ? "expiring" : "ok";
}

/** กฎเดียวกับหน้าอาวุธ: กระสุนอายุ 5 ปี */
function ammoLife(iso: string | null): "ok" | "expiring" | "expired" | "unknown" {
  const age = ageYears(iso);
  if (age == null) return "unknown";
  if (age >= 5) return "expired";
  if (age >= 4) return "expiring";
  return "ok";
}

function mondaysInMonth(monthYm: string): string[] {
  const [y, m] = monthYm.split("-").map(Number);
  const out: string[] = [];
  const today = toYyyyMmDd(new Date());
  const d = new Date(y, m - 1, 1);
  while (d.getMonth() === m - 1) {
    const mon = mondayOfWeekContaining(d);
    if (mon.startsWith(monthYm) && mon <= today && !out.includes(mon)) out.push(mon);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function settled<T>(r: PromiseSettledResult<T>): T | null {
  return r.status === "fulfilled" ? r.value : null;
}

// ---------------------------------------------------------------------------
// โหลดและสรุปข้อมูล
// ---------------------------------------------------------------------------

type Report = Awaited<ReturnType<typeof loadReport>>;

async function loadReport(monthYm: string) {
  const weeks = mondaysInMonth(monthYm);

  const [armorR, vehiclesR, assetsR, vestsR, fireR, ammoR, osR, ...weekRs] = await Promise.allSettled([
    apiJson<ArmorMonthReport>(`/api/armor-inspections/monthly/report?month=${monthYm}`),
    apiJson<Vehicle[]>("/api/vehicles"),
    apiJson<Asset[]>("/api/assets"),
    apiJson<Vest[]>("/api/bulletproof-vests"),
    apiJson<FireExt[]>("/api/fire-extinguishers"),
    apiJson<AmmoLot[]>("/api/ammunition"),
    apiJson<OsGroup[]>("/api/os-outsourcing/groups"),
    ...weeks.map((w) => apiJson<VehicleWeekReport>(`/api/vehicles/weekly-inspection-report?weekStart=${w}`)),
  ]);

  // ยานพาหนะ (ผลตรวจรายสัปดาห์)
  const fleet = settled(vehiclesR) ?? [];
  const weekReports = weeks
    .map((weekStart, i) => ({ weekStart, report: settled(weekRs[i] as PromiseSettledResult<VehicleWeekReport>) }))
    .filter((w): w is { weekStart: string; report: VehicleWeekReport } => Boolean(w.report));
  const abnormalPlates = new Set<string>();
  const weekDetails = weekReports.map(({ weekStart, report: wr }) => {
    const abnormal: { plate: string; checks: string[] }[] = [];
    for (const row of wr.rows) {
      const bad = VEHICLE_CHECKS.filter((k) => (row[k] as CheckResult) === "ABNORMAL");
      if (bad.length) {
        abnormalPlates.add(row.vehicle.licensePlate);
        abnormal.push({ plate: row.vehicle.licensePlate, checks: bad.map((k) => VEHICLE_CHECK_LABELS[k]) });
      }
    }
    const done = new Set(wr.rows.map((row) => row.vehicle.licensePlate));
    return {
      weekStart,
      inspected: wr.inspectedCount,
      total: wr.totalVehicles,
      abnormal,
      missing: fleet.map((v) => v.licensePlate).filter((p) => !done.has(p)),
    };
  });
  const vehicles = weekReports.length
    ? {
        weeks: weekReports.length,
        inspected: weekReports.reduce((s, w) => s + w.report.inspectedCount, 0),
        expected: weekReports.reduce((s, w) => s + w.report.totalVehicles, 0),
        abnormal: [...abnormalPlates],
        weekDetails,
      }
    : null;

  const armorReport = settled(armorR);
  const armor = armorReport
    ? {
        totalAssets: armorReport.totalAssets,
        inspectedCount: armorReport.inspectedCount,
        abnormalRowsCount: armorReport.abnormalRowsCount,
        rows: armorReport.rows.map(({ asset, inspection }) => {
          const bad = inspection ? Object.keys(ARMOR_CHECK_LABELS).filter((k) => inspection[k] === "ABNORMAL") : [];
          return {
            id: asset.id,
            serial: asset.serialNumber,
            name: asset.itemName,
            status: !inspection ? ("missing" as const) : bad.length ? ("abnormal" as const) : ("ok" as const),
            checks: bad.map((k) => ARMOR_CHECK_LABELS[k]),
          };
        }),
      }
    : null;

  const count = <T,>(rows: T[] | null, fn: (r: T) => string) =>
    rows
      ? rows.reduce(
          (acc, r) => {
            const s = fn(r);
            if (s === "expired") acc.expired += 1;
            if (s === "expiring") acc.expiring += 1;
            return acc;
          },
          { expired: 0, expiring: 0 },
        )
      : null;
  const fireRows = settled(fireR);
  const ammoRows = settled(ammoR);
  const vests = count(settled(vestsR), (r) => permitLife(r.permitExpiresAt));
  const fire = count(fireRows?.filter((r) => !r.status.includes("จำหน่าย")) ?? null, (r) => tankLife(r.kind, r.manufacturedAt));
  const ammo = count(ammoRows?.filter((r) => r.remainingQty > 0) ?? null, (r) => ammoLife(r.purchasedAt));

  // วงรอบตั้งงบจัดซื้อทดแทน
  const cycleItems = buildCycleItems({
    vehicles: settled(vehiclesR),
    armorAssets: settled(assetsR)?.filter((a) => a.armorExpiresAt) ?? null,
    fire: fireRows,
    ammo: ammoRows,
    osGroups: settled(osR),
  });

  return { monthYm, vehicles, armor, vests, fire, ammo, cycleItems };
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

const cardClass = "rounded-xl border border-slate-200 bg-white/80 p-3 print:break-inside-avoid print:rounded-md print:p-2";
const titleClass = "flex items-baseline justify-between gap-2 text-[13px] font-black text-[#1e1b4b] print:text-[10pt]";

const BUCKETS: { id: CycleBucket; label: (y: number) => string; hint: (y: number) => string; tone: string }[] = [
  {
    id: "overdue",
    label: () => "เลยกำหนด / ต้องใช้ปีนี้",
    hint: (y) => `หางบปี ${y + 543} หรือเร่งใส่คำของบรอบนี้`,
    tone: "text-rose-600",
  },
  {
    id: "thisRound",
    label: (y) => `ตั้งงบปี ${y + 1 + 543}`,
    hint: (y) => `ต้องอยู่ในคำของบที่จัดทำปี ${y + 543}`,
    tone: "text-amber-700",
  },
  {
    id: "nextRound",
    label: (y) => `เตรียมงบปี ${y + 2 + 543}`,
    hint: () => "เตรียมข้อมูล / ราคากลางล่วงหน้า",
    tone: "text-sky-700",
  },
];

const CYCLE_ROWS: { kind: string; group: string; unit: string; rule: string; to: string }[] = [
  { kind: "ยานพาหนะ", group: "ครุภัณฑ์", unit: "คัน", rule: `อายุครบ ${VEHICLE_LIFE_YEARS} ปีนับจากวันซื้อ`, to: "/vehicles" },
  { kind: "เสื้อเกราะ", group: "ครุภัณฑ์", unit: "ตัว", rule: "วันหมดอายุตามทะเบียนครุภัณฑ์", to: "/assets/armor-monthly" },
  { kind: "ถังดับเพลิง", group: "วัสดุ", unit: "ถัง", rule: "อายุ 10 / 15 ปีตามชนิดถัง", to: "/fire-safety" },
  { kind: "กระสุน", group: "วัสดุ", unit: "ล็อต", rule: "อายุ 5 ปี (เฉพาะล็อตที่มีคงเหลือ)", to: "/weapons" },
  { kind: "งานจ้าง OS", group: "งานจ้าง", unit: "สัญญา", rule: `สัญญาใหม่ต้องเริ่มวันถัดจากสัญญาเดิม · จัดจ้างล่วงหน้า ${OS_PROCUREMENT_LEAD_DAYS} วัน`, to: "/os-outsourcing" },
];

function Kpi({
  label,
  value,
  sub,
  tone = "text-[#1e1b4b]",
  onClick,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={onClick ? "คลิกดูรายละเอียด" : undefined}
      className="group min-w-0 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40 disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:bg-white/80 print:rounded-md print:px-2 print:py-1"
    >
      <p className="flex items-center justify-between gap-1 truncate text-[11px] font-semibold text-slate-500">
        {label}
        {onClick ? <span className="text-[10px] text-slate-300 group-hover:text-indigo-500 print:hidden">ดู ›</span> : null}
      </p>
      <p className={`truncate text-lg font-black tabular-nums leading-tight ${tone} print:text-[12pt]`}>{value}</p>
      {sub ? <p className="truncate text-[10.5px] text-slate-500">{sub}</p> : null}
    </button>
  );
}

function Row({ label, value, extra, tone }: { label: string; value: React.ReactNode; extra?: React.ReactNode; tone?: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto_5.5rem] items-baseline gap-2 border-b border-slate-100 py-1 text-[12px] last:border-0 print:text-[9pt]">
      <span className="text-slate-600">{label}</span>
      <span className={`text-right font-bold tabular-nums ${tone ?? "text-[#1e1b4b]"}`}>{value}</span>
      <span className="text-right text-[11px] tabular-nums">{extra}</span>
    </div>
  );
}

type FollowUp = { tone: "rose" | "amber"; text: string; to: string };

function buildFollowUps(r: Report, byBucket: Map<string, CycleItem[]>, year: number): FollowUp[] {
  const out: FollowUp[] = [];
  const summarize = (bucket: CycleBucket) =>
    CYCLE_ROWS.map((row) => {
      const n = byBucket.get(`${bucket}|${row.kind}`)?.length ?? 0;
      return n ? `${row.kind} ${n} ${row.unit}` : null;
    }).filter(Boolean);
  const overdue = summarize("overdue");
  if (overdue.length) out.push({ tone: "rose", text: `เลยกำหนดทดแทนแล้ว: ${overdue.join(", ")}`, to: "#cycle" });
  const thisRound = summarize("thisRound");
  if (thisRound.length) out.push({ tone: "amber", text: `ต้องใส่คำของบปี ${year + 1 + 543}: ${thisRound.join(", ")}`, to: "#cycle" });
  for (const it of r.cycleItems)
    if (it.group === "งานจ้าง") {
      const b = bucketOf(it);
      if (b === "overdue" || b === "thisRound") out.push({ tone: b === "overdue" ? "rose" : "amber", text: `${it.name} — ${it.note}`, to: it.to });
    }
  if (r.vehicles?.abnormal.length)
    out.push({
      tone: "rose",
      text: `รถผลตรวจผิดปกติ ${r.vehicles.abnormal.length} คัน (${r.vehicles.abnormal.slice(0, 4).join(", ")}${r.vehicles.abnormal.length > 4 ? " …" : ""})`,
      to: "/vehicles/weekly-inspection",
    });
  if (r.vehicles && r.vehicles.inspected < r.vehicles.expected)
    out.push({ tone: "amber", text: `ตรวจรถไม่ครบ ${r.vehicles.expected - r.vehicles.inspected} ครั้ง จาก ${r.vehicles.expected}`, to: "/vehicles/weekly-inspection" });
  if (r.armor?.abnormalRowsCount) out.push({ tone: "rose", text: `เสื้อเกราะผลตรวจผิดปกติ ${r.armor.abnormalRowsCount} ตัว`, to: "/assets/armor-monthly" });
  if (r.armor && r.armor.inspectedCount < r.armor.totalAssets)
    out.push({ tone: "amber", text: `เสื้อเกราะยังไม่ตรวจ ${r.armor.totalAssets - r.armor.inspectedCount} ตัว`, to: "/assets/armor-monthly" });
  if (r.vests?.expired) out.push({ tone: "rose", text: `ใบอนุญาตเสื้อเกราะหมดอายุ ${r.vests.expired} ตัว`, to: "/vests" });
  return out.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "rose" ? -1 : 1));
}

export function ExecutiveReportPage() {
  const thisYm = ymOf(new Date());
  const year = new Date().getFullYear();
  const [monthYm, setMonthYm] = useState(thisYm);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [cycleDetail, setCycleDetail] = useState<{ kind: string | null; bucket: CycleBucket } | null>(null);
  const [readinessDetail, setReadinessDetail] = useState<"vehicles" | "armor" | null>(null);

  const load = useCallback(async (ym: string) => {
    setLoading(true);
    try {
      setReport(await loadReport(ym));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(monthYm);
  }, [load, monthYm]);

  const byBucket = useMemo(() => {
    const m = new Map<string, CycleItem[]>();
    for (const it of report?.cycleItems ?? []) {
      const b = bucketOf(it);
      if (!b) continue;
      const k = `${b}|${it.kind}`;
      m.set(k, [...(m.get(k) ?? []), it]);
    }
    return m;
  }, [report]);

  const bucketTotal = (b: CycleBucket) => CYCLE_ROWS.reduce((s, row) => s + (byBucket.get(`${b}|${row.kind}`)?.length ?? 0), 0);
  const followUps = useMemo(() => (report ? buildFollowUps(report, byBucket, year) : []), [report, byBucket, year]);
  const r = report;
  const detailItems = cycleDetail
    ? cycleDetail.kind
      ? byBucket.get(`${cycleDetail.bucket}|${cycleDetail.kind}`) ?? []
      : CYCLE_ROWS.flatMap((row) => byBucket.get(`${cycleDetail.bucket}|${row.kind}`) ?? [])
    : [];
  const detailBucket = cycleDetail ? BUCKETS.find((b) => b.id === cycleDetail.bucket) : null;

  return (
    <div className="overview-a4-print">
      <PageHeaderBar
        title={`รายงานผู้บริหารประจำเดือน ${ymLabel(monthYm)}`}
        count={null}
        filter={{ value: "", onChange: () => {}, showSearch: false, printTitle: `รายงานผู้บริหารประจำเดือน ${ymLabel(monthYm)}` }}
        extras={
          <div className="flex items-center gap-1.5 print:hidden">
            <button type="button" className={toolbarLinkBtnClass} onClick={() => setMonthYm((v) => shiftYm(v, -1))}>
              ‹ เดือนก่อน
            </button>
            <input
              type="month"
              className={`${toolbarLinkBtnClass} w-[9.5rem]`}
              value={monthYm}
              max={thisYm}
              onChange={(e) => e.target.value && setMonthYm(e.target.value)}
              aria-label="เลือกเดือน"
            />
            <button
              type="button"
              className={`${toolbarLinkBtnClass} disabled:opacity-40`}
              disabled={monthYm >= thisYm}
              onClick={() => setMonthYm((v) => shiftYm(v, 1))}
            >
              เดือนถัดไป ›
            </button>
          </div>
        }
      />

      {loading || !r ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white/70 py-10 text-center text-sm text-slate-500">กำลังรวบรวมข้อมูลรายงาน…</div>
      ) : (
        <div className="mt-2 space-y-2 print:space-y-1.5">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 print:grid-cols-4 print:gap-1">
            <Kpi
              label="เลยกำหนดทดแทน"
              value={`${bucketTotal("overdue")} รายการ`}
              tone={bucketTotal("overdue") ? "text-rose-600" : "text-emerald-700"}
              sub="ครุภัณฑ์ / วัสดุ / งานจ้าง"
              onClick={bucketTotal("overdue") ? () => setCycleDetail({ kind: null, bucket: "overdue" }) : undefined}
            />
            <Kpi
              label={`ต้องตั้งงบปี ${year + 1 + 543}`}
              value={`${bucketTotal("thisRound")} รายการ`}
              tone={bucketTotal("thisRound") ? "text-amber-700" : "text-emerald-700"}
              sub={`จัดทำคำของบในปี ${year + 543}`}
              onClick={bucketTotal("thisRound") ? () => setCycleDetail({ kind: null, bucket: "thisRound" }) : undefined}
            />
            <Kpi
              label="ความพร้อมยานพาหนะ"
              value={r.vehicles ? pct(r.vehicles.expected ? r.vehicles.inspected / r.vehicles.expected : null) : "—"}
              tone={r.vehicles?.abnormal.length ? "text-rose-600" : "text-emerald-700"}
              sub={r.vehicles ? `ตรวจ ${r.vehicles.weeks} สัปดาห์ · ผิดปกติ ${r.vehicles.abnormal.length} คัน` : "ยังไม่มีสัปดาห์ตรวจ"}
              onClick={r.vehicles ? () => setReadinessDetail("vehicles") : undefined}
            />
            <Kpi
              label="ความพร้อมเสื้อเกราะ"
              value={r.armor ? pct(r.armor.totalAssets ? r.armor.inspectedCount / r.armor.totalAssets : null) : "—"}
              tone={r.armor?.abnormalRowsCount ? "text-rose-600" : "text-emerald-700"}
              sub={r.armor ? `ตรวจ ${r.armor.inspectedCount}/${r.armor.totalAssets} · ผิดปกติ ${r.armor.abnormalRowsCount}` : undefined}
              onClick={r.armor ? () => setReadinessDetail("armor") : undefined}
            />
          </div>

          <div className="grid gap-2 lg:grid-cols-3 print:grid-cols-3 print:gap-1.5">
            <div className="space-y-2 lg:col-span-2 print:col-span-2 print:space-y-1.5">
            <section id="cycle" className={cardClass}>
              <h3 className={titleClass}>
                วงรอบตั้งงบจัดซื้อทดแทน — ครุภัณฑ์ วัสดุ และงานจ้าง OS
                <span className="text-[11px] font-semibold text-slate-400">ปีงบตามปีปฏิทิน · ณ วันนี้</span>
              </h3>
              <div className="mt-1.5 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-[12px] print:text-[9pt]">
                  <thead>
                    <tr className="text-[10.5px] text-slate-500">
                      <th className="py-1 pr-2 text-left font-bold">รายการ</th>
                      {BUCKETS.map((b) => (
                        <th key={b.id} className="px-1 py-1 text-center font-bold">
                          <span className={b.tone}>{b.label(year)}</span>
                          <span className="block text-[9.5px] font-normal text-slate-400">{b.hint(year)}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {CYCLE_ROWS.map((row) => (
                      <tr key={row.kind}>
                        <td className="py-1.5 pr-2">
                          <span className="mr-1.5 rounded bg-slate-100 px-1 py-px text-[10px] font-bold text-slate-500">{row.group}</span>
                          <Link to={row.to} className="font-bold text-[#1e1b4b] hover:underline">
                            {row.kind}
                          </Link>
                          <span className="block text-[10px] text-slate-400">{row.rule}</span>
                        </td>
                        {BUCKETS.map((b) => {
                          const n = byBucket.get(`${b.id}|${row.kind}`)?.length ?? 0;
                          return (
                            <td key={b.id} className="px-1 py-1.5 text-center">
                              {n ? (
                                <button
                                  type="button"
                                  onClick={() => setCycleDetail({ kind: row.kind, bucket: b.id })}
                                  className={`rounded-md px-2 py-0.5 font-black tabular-nums hover:bg-slate-100 hover:underline ${b.tone}`}
                                  title="คลิกดูรายการ"
                                >
                                  {n.toLocaleString("th-TH")} {row.unit}
                                </button>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className={cardClass}>
              <h3 className={titleClass}>ความพร้อมครุภัณฑ์ — {ymLabel(r.monthYm)}</h3>
              <div className="grid gap-x-6 sm:grid-cols-2 print:grid-cols-2">
                <div>
                  <div className="mt-1 grid grid-cols-[1fr_auto_5.5rem] gap-2 text-[10.5px] font-bold text-slate-400">
                    <span>ผลตรวจเดือนนี้</span>
                    <span className="text-right">ตรวจแล้ว</span>
                    <span className="text-right">ผิดปกติ</span>
                  </div>
                  <Row
                    label="ยานพาหนะ (รายสัปดาห์)"
                    value={r.vehicles ? `${r.vehicles.inspected}/${r.vehicles.expected}` : "—"}
                    extra={r.vehicles ? <span className={r.vehicles.abnormal.length ? "font-bold text-rose-600" : "text-slate-400"}>{r.vehicles.abnormal.length} คัน</span> : null}
                  />
                  <Row
                    label="เสื้อเกราะ (รายเดือน)"
                    value={r.armor ? `${r.armor.inspectedCount}/${r.armor.totalAssets}` : "—"}
                    extra={r.armor ? <span className={r.armor.abnormalRowsCount ? "font-bold text-rose-600" : "text-slate-400"}>{r.armor.abnormalRowsCount} ตัว</span> : null}
                  />
                </div>
                <div>
                  <div className="mt-1 grid grid-cols-[1fr_auto_5.5rem] gap-2 text-[10.5px] font-bold text-slate-400">
                    <span>อายุ / ใบอนุญาต (ณ วันนี้)</span>
                    <span className="text-right">หมดอายุ</span>
                    <span className="text-right">ภายใน 1 ปี</span>
                  </div>
                  {[
                    { label: "ใบอนุญาตเสื้อเกราะ", v: r.vests, unit: "ตัว" },
                    { label: "ถังดับเพลิง", v: r.fire, unit: "ถัง" },
                    { label: "กระสุน (ล็อตที่มีคงเหลือ)", v: r.ammo, unit: "ล็อต" },
                  ].map((x) => (
                    <Row
                      key={x.label}
                      label={x.label}
                      value={x.v ? `${x.v.expired} ${x.unit}` : "—"}
                      tone={x.v?.expired ? "text-rose-600" : "text-slate-400"}
                      extra={x.v ? <span className={x.v.expiring ? "font-bold text-amber-600" : "text-slate-400"}>{x.v.expiring} {x.unit}</span> : null}
                    />
                  ))}
                </div>
              </div>
            </section>
            </div>

            <section className={`${cardClass} border-amber-200 bg-amber-50/40`}>
              <h3 className={titleClass}>
                เรื่องที่ต้องติดตาม / ตัดสินใจ
                <span className="text-[11px] font-semibold text-slate-400">{followUps.length} เรื่อง</span>
              </h3>
              {followUps.length === 0 ? (
                <p className="py-3 text-[12px] font-semibold text-emerald-700">ไม่มีเรื่องผิดปกติที่ต้องติดตาม</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {followUps.slice(0, 10).map((f, i) => (
                    <li key={i}>
                      {f.to.startsWith("#") ? (
                        <a href={f.to} className="flex items-start gap-2 text-[12px] leading-snug text-[#1e1b4b] hover:underline print:text-[8.5pt]">
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${f.tone === "rose" ? "bg-rose-500" : "bg-amber-400"}`} />
                          {f.text}
                        </a>
                      ) : (
                        <Link to={f.to} className="flex items-start gap-2 text-[12px] leading-snug text-[#1e1b4b] hover:underline print:text-[8.5pt]">
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${f.tone === "rose" ? "bg-rose-500" : "bg-amber-400"}`} />
                          {f.text}
                        </Link>
                      )}
                    </li>
                  ))}
                  {followUps.length > 10 ? <li className="text-[11px] text-slate-400">และอีก {followUps.length - 10} เรื่อง</li> : null}
                </ul>
              )}
            </section>
          </div>

          <p className="text-right text-[10.5px] text-slate-400">
            ข้อมูลรวบรวมจากระบบ ณ {new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })} · ภารกิจ เหตุการณ์ งานจ้าง OS และงบประมาณ ดูที่เมนูสรุปภาพรวม
          </p>
        </div>
      )}

      <Modal
        open={Boolean(cycleDetail)}
        onClose={() => setCycleDetail(null)}
        size="wide"
        title={cycleDetail && detailBucket ? `${cycleDetail.kind ?? "ทุกประเภท"} — ${detailBucket.label(year)} (${detailItems.length})` : ""}
      >
        {cycleDetail && !cycleDetail.kind ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {CYCLE_ROWS.map((row) => {
              const n = byBucket.get(`${cycleDetail.bucket}|${row.kind}`)?.length ?? 0;
              return n ? (
                <button
                  key={row.kind}
                  type="button"
                  onClick={() => setCycleDetail({ kind: row.kind, bucket: cycleDetail.bucket })}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11.5px] font-bold text-[#1e1b4b] hover:border-indigo-300 hover:bg-indigo-50"
                >
                  {row.kind} {n.toLocaleString("th-TH")} {row.unit}
                </button>
              ) : null;
            })}
          </div>
        ) : null}
        <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[34rem] text-[12px]">
            <thead className="sticky top-0 bg-slate-50 text-[11px] text-slate-500">
              <tr>
                <th className="px-2 py-1.5 text-left font-bold">#</th>
                {cycleDetail && !cycleDetail.kind ? <th className="px-2 py-1.5 text-left font-bold">ประเภท</th> : null}
                <th className="px-2 py-1.5 text-left font-bold">รายการ</th>
                <th className="px-2 py-1.5 text-left font-bold">ครบกำหนด</th>
                <th className="px-2 py-1.5 text-left font-bold">รายละเอียด</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detailItems.map((it, i) => (
                <tr key={it.key}>
                  <td className="px-2 py-1.5 tabular-nums text-slate-400">{i + 1}</td>
                  {cycleDetail && !cycleDetail.kind ? <td className="whitespace-nowrap px-2 py-1.5 text-slate-500">{it.kind}</td> : null}
                  <td className="px-2 py-1.5 font-semibold text-[#1e1b4b]">{it.name}</td>
                  <td className={`whitespace-nowrap px-2 py-1.5 tabular-nums ${it.dueDate < new Date() ? "font-bold text-rose-600" : ""}`}>{fmtDate(it.dueDate)}</td>
                  <td className="px-2 py-1.5 text-slate-500">{it.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cycleDetail?.kind && detailItems[0] ? (
          <div className="mt-2 flex justify-between">
            <button type="button" onClick={() => setCycleDetail({ kind: null, bucket: cycleDetail.bucket })} className="text-[12px] font-bold text-slate-500 hover:underline">
              ‹ ดูทุกประเภท
            </button>
            <Link to={detailItems[0].to} className="text-[12px] font-bold text-[#0000BF] hover:underline">
              ไปหน้าจัดการ{cycleDetail.kind} →
            </Link>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={readinessDetail === "vehicles" && Boolean(r?.vehicles)}
        onClose={() => setReadinessDetail(null)}
        size="wide"
        title={`ความพร้อมยานพาหนะ — ${ymLabel(monthYm)}`}
      >
        <div className="max-h-[65vh] space-y-2 overflow-auto">
          {r?.vehicles?.weekDetails.map((w) => (
            <div key={w.weekStart} className="rounded-lg border border-slate-200 p-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[12.5px] font-black text-[#1e1b4b]">สัปดาห์ {fmtDate(new Date(`${w.weekStart}T12:00:00`))}</p>
                <p className="text-[12px] tabular-nums text-slate-500">
                  ตรวจแล้ว <span className="font-bold text-[#1e1b4b]">{w.inspected}/{w.total}</span> คัน · ผิดปกติ{" "}
                  <span className={w.abnormal.length ? "font-bold text-rose-600" : "font-bold text-emerald-700"}>{w.abnormal.length}</span> คัน
                </p>
              </div>
              {w.abnormal.length ? (
                <ul className="mt-1.5 space-y-0.5 text-[12px]">
                  {w.abnormal.map((a) => (
                    <li key={a.plate} className="flex gap-2">
                      <span className="w-32 shrink-0 font-semibold text-rose-700">{a.plate}</span>
                      <span className="text-slate-600">{a.checks.join(", ")}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {w.missing.length ? (
                <p className="mt-1.5 text-[11.5px] text-amber-700">
                  ยังไม่ตรวจ {w.missing.length} คัน: <span className="text-slate-600">{w.missing.join(", ")}</span>
                </p>
              ) : null}
            </div>
          ))}
        </div>
        <div className="mt-2 text-right">
          <Link to="/vehicles/weekly-inspection" className="text-[12px] font-bold text-[#0000BF] hover:underline">
            ไปหน้าตรวจสภาพรถรายสัปดาห์ →
          </Link>
        </div>
      </Modal>

      <Modal
        open={readinessDetail === "armor" && Boolean(r?.armor)}
        onClose={() => setReadinessDetail(null)}
        size="wide"
        title={`ความพร้อมเสื้อเกราะ — ${ymLabel(monthYm)}`}
      >
        {r?.armor ? (
          <>
            <p className="mb-2 text-[12px] text-slate-600">
              ตรวจแล้ว <b className="text-[#1e1b4b]">{r.armor.inspectedCount}/{r.armor.totalAssets}</b> ตัว · ผิดปกติ{" "}
              <b className={r.armor.abnormalRowsCount ? "text-rose-600" : "text-emerald-700"}>{r.armor.abnormalRowsCount}</b> ตัว · ยังไม่ตรวจ{" "}
              <b className="text-amber-700">{r.armor.totalAssets - r.armor.inspectedCount}</b> ตัว
            </p>
            <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[34rem] text-[12px]">
                <thead className="sticky top-0 bg-slate-50 text-[11px] text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-bold">#</th>
                    <th className="px-2 py-1.5 text-left font-bold">หมายเลข</th>
                    <th className="px-2 py-1.5 text-left font-bold">รายการ</th>
                    <th className="px-2 py-1.5 text-left font-bold">ผลตรวจ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...r.armor.rows]
                    .sort((a, b) => ({ abnormal: 0, missing: 1, ok: 2 })[a.status] - ({ abnormal: 0, missing: 1, ok: 2 })[b.status])
                    .map((a, i) => (
                      <tr key={a.id}>
                        <td className="px-2 py-1.5 tabular-nums text-slate-400">{i + 1}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 font-semibold text-[#1e1b4b]">{a.serial}</td>
                        <td className="px-2 py-1.5 text-slate-600">{a.name}</td>
                        <td className="px-2 py-1.5">
                          {a.status === "abnormal" ? (
                            <span className="font-bold text-rose-600">ผิดปกติ: {a.checks.join(", ")}</span>
                          ) : a.status === "missing" ? (
                            <span className="font-semibold text-amber-700">ยังไม่ตรวจ</span>
                          ) : (
                            <span className="text-emerald-700">ปกติ</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
        <div className="mt-2 text-right">
          <Link to="/assets/armor-monthly" className="text-[12px] font-bold text-[#0000BF] hover:underline">
            ไปหน้าตรวจเสื้อเกราะรายเดือน →
          </Link>
        </div>
      </Modal>
    </div>
  );
}
