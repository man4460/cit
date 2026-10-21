import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFormJson, apiJson, apiUrl } from "../api/client";
import { MissionIncidentsPanel } from "../components/MissionIncidentsPanel";
import { MissionInsuranceExportModal } from "../components/MissionInsuranceExportModal";
import { MissionReportModal } from "../components/MissionReportModal";
import { gradeSortValue, policeRankIndex } from "../lib/allowanceDocs";
import { filterBotAllowancePersonnel } from "../lib/botAllowancePrint";
import { formatBaht, formatInt, formatLiters } from "../lib/formatNumber";
import {
  cargoAssignValue,
  cargoTruckDriverNames,
  cargoTruckFilled,
  cargoTruckSeatOptions,
  toCargoTruckForm,
} from "../lib/missionCargoTrucks";
import { compareConvoyOrder } from "../lib/missionConvoyOrder";
import {
  MISSION_PERSONNEL_TABS,
  isCargoDriverPersonnel,
  missionPersonnelTabByCategory,
  type MissionPersonnelTabKey,
} from "../lib/missionPersonnelTabs";
import { filterPoliceAllowancePersonnel } from "../lib/policeAllowancePrint";
import { mediaUrl } from "../lib/uiTokens";
import type { MissionStatus, MissionSummary } from "../types";

type SummaryPerson = NonNullable<MissionSummary["personnel"]>[number];
type SummaryVehicle = NonNullable<MissionSummary["vehicles"]>[number];

const PERSONNEL_TAB_ORDER: MissionPersonnelTabKey[] = ["bot", "crime", "highway", "special", "driver"];

function summaryPersonTab(p: SummaryPerson): MissionPersonnelTabKey {
  const byCat = missionPersonnelTabByCategory(p.personnelCategoryName);
  if (byCat) return byCat;
  const role = p.roleName ?? "";
  if (/คนขับ|พนักงานขับรถสินค้า|ขับรถสินค้า/.test(role)) return "driver";
  if (/กองปราบ/.test(role)) return "crime";
  if (/ทางหลวง/.test(role)) return "highway";
  if (/อรินทราช|หนุมาน|ปฏิบัติการพิเศษ/.test(role)) return "special";
  return "bot";
}

function tabLabel(key: MissionPersonnelTabKey): string {
  return MISSION_PERSONNEL_TABS.find((t) => t.key === key)?.label ?? key;
}

const TAB_CHIP: Record<MissionPersonnelTabKey, string> = {
  bot: "bg-[#0000BF]/8 text-[#0000BF] ring-[#0000BF]/20",
  crime: "bg-amber-50 text-amber-800 ring-amber-200",
  highway: "bg-sky-50 text-sky-800 ring-sky-200",
  special: "bg-violet-50 text-violet-800 ring-violet-200",
  driver: "bg-orange-50 text-orange-800 ring-orange-200",
};

const TAB_SECTION: Record<MissionPersonnelTabKey, string> = {
  bot: "border-[#0000BF]/25 bg-[#0000BF]/[0.04] text-[#0000BF]",
  crime: "border-amber-200 bg-amber-50/80 text-amber-900",
  highway: "border-sky-200 bg-sky-50/80 text-sky-900",
  special: "border-violet-200 bg-violet-50/80 text-violet-900",
  driver: "border-orange-200 bg-orange-50/80 text-orange-900",
};

function personDisplayName(p: SummaryPerson): string {
  return [p.rank, p.fullName].filter(Boolean).join(" ");
}

/** เรียง: ธปท. → กองปราบ → ทางหลวง → ปฏิบัติการพิเศษ → ขับรถสินค้า · ในกลุ่มตำรวจเรียงยศ · ธปท.เรียงชั้น */
function sortSummaryPersonnel(list: SummaryPerson[]): SummaryPerson[] {
  return list.slice().sort((a, b) => {
    const ta = PERSONNEL_TAB_ORDER.indexOf(summaryPersonTab(a));
    const tb = PERSONNEL_TAB_ORDER.indexOf(summaryPersonTab(b));
    const ia = ta < 0 ? 99 : ta;
    const ib = tb < 0 ? 99 : tb;
    if (ia !== ib) return ia - ib;
    const tab = summaryPersonTab(a);
    if (tab === "crime" || tab === "highway" || tab === "special") {
      return (
        policeRankIndex(a.rank ?? "") - policeRankIndex(b.rank ?? "") ||
        personDisplayName(a).localeCompare(personDisplayName(b), "th")
      );
    }
    if (tab === "bot") {
      return (
        gradeSortValue(b.gradeLevel) - gradeSortValue(a.gradeLevel) ||
        (a.roleName ?? "").localeCompare(b.roleName ?? "", "th") ||
        personDisplayName(a).localeCompare(personDisplayName(b), "th")
      );
    }
    return (
      (a.roleName ?? "").localeCompare(b.roleName ?? "", "th") ||
      personDisplayName(a).localeCompare(personDisplayName(b), "th")
    );
  });
}

function sortSummaryVehicles(list: SummaryVehicle[]): SummaryVehicle[] {
  return list.slice().sort((a, b) =>
    compareConvoyOrder(
      { roleName: a.roleName, callSign: a.callSign },
      { roleName: b.roleName, callSign: b.callSign },
      "go",
    ),
  );
}

function groupPersonnelByTab(list: SummaryPerson[]): { tab: MissionPersonnelTabKey; people: SummaryPerson[] }[] {
  const groups: { tab: MissionPersonnelTabKey; people: SummaryPerson[] }[] = [];
  for (const p of list) {
    const tab = summaryPersonTab(p);
    if (tab === "driver") continue;
    const last = groups[groups.length - 1];
    if (last && last.tab === tab) last.people.push(p);
    else groups.push({ tab, people: [p] });
  }
  return groups;
}

const statusLabel: Record<MissionStatus, string> = {
  DRAFT: "แบบร่าง",
  PLANNED: "วางแผน",
  IN_PROGRESS: "กำลังทำ",
  COMPLETED: "เสร็จแล้ว",
  CANCELLED: "ยกเลิก",
};

const statusChip: Record<MissionStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700 ring-slate-200",
  PLANNED: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  IN_PROGRESS: "bg-amber-50 text-amber-800 ring-amber-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CANCELLED: "bg-rose-50 text-rose-700 ring-rose-200",
};

const TRUCK_HIRE_KEYWORD = "ค่าจ้างรถบรรทุก";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("th-TH", { dateStyle: "medium" });
}

function travelDays(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(1, Math.round((day(b) - day(a)) / 86_400_000) + 1);
}

function attachmentHref(fileUrl: string): string {
  if (fileUrl.startsWith("http")) return fileUrl;
  return apiUrl(fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`);
}

export function MissionSummaryPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<MissionSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [insuranceOpen, setInsuranceOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [incidentCount, setIncidentCount] = useState(0);

  const load = useCallback(async () => {
    try {
      setSummary(await apiJson<MissionSummary>(`/api/missions/${id}/summary`));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดสรุปภารกิจไม่สำเร็จ");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function goBack() {
    navigate("/missions");
  }

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      await apiFormJson(`/api/missions/${id}/attachments`, fd);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  async function deleteAttachment(attachmentId: string) {
    if (!confirm("ลบไฟล์นี้?")) return;
    try {
      await apiJson(`/api/missions/${id}/attachments/${attachmentId}`, { method: "DELETE" });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  const backButton = (
    <button
      type="button"
      onClick={goBack}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
    >
      <span aria-hidden>←</span> ย้อนกลับ
    </button>
  );

  if (err) {
    return (
      <div className="space-y-4">
        {backButton}
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</p>
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="space-y-4">
        {backButton}
        <p className="text-sm text-slate-500">กำลังโหลดสรุปภารกิจ…</p>
      </div>
    );
  }

  const personnel = sortSummaryPersonnel(summary.personnel ?? []);
  const personnelGroups = groupPersonnelByTab(personnel);
  const vehicles = sortSummaryVehicles(summary.vehicles ?? []);
  const cargoTrucks = (summary.cargoTrucks ?? []).map(toCargoTruckForm).filter(cargoTruckFilled);
  const cargoRiders = new Map<string, string[]>();
  for (const p of personnel) {
    const truck = cargoTrucks.find(
      (t) =>
        (p.assignedVehicleId && t.tractorVehicleId === p.assignedVehicleId) ||
        (p.assignedCargoTruckId && t.id === p.assignedCargoTruckId),
    );
    if (!truck) continue;
    cargoRiders.set(truck.id, [...(cargoRiders.get(truck.id) ?? []), personDisplayName(p)]);
  }
  const destinations = (summary.destinations ?? []).filter((d) => d.address.trim());
  const policeStations = summary.policeStations ?? [];
  const attachments = summary.attachments ?? [];
  const allExpenseEntries = Object.entries(summary.expensesByType)
    .map(([k, v]) => [k, Number(v)] as const)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const truckHire = allExpenseEntries
    .filter(([k]) => k.includes(TRUCK_HIRE_KEYWORD))
    .reduce((s, [, v]) => s + v, 0);
  const expenseEntries = allExpenseEntries.filter(([k]) => !k.includes(TRUCK_HIRE_KEYWORD));
  const maxExpense = Math.max(1, ...expenseEntries.map(([, v]) => v));
  const status = summary.status ?? "PLANNED";
  const days = travelDays(summary.plannedStart, summary.plannedEnd);
  const totalContainers = destinations.reduce((s, d) => s + (d.containerCount || 0), 0);
  const compensationTotal = personnel.reduce((s, p) => {
    if (isCargoDriverPersonnel(p.personnelCategoryName, p.roleName)) return s;
    return s + Number(p.compensationRate || 0);
  }, 0);
  const policeTotal = policeStations.reduce((s, p) => s + Number(p.amount || 0), 0);
  const budget = summary.budgetAmount != null && summary.budgetAmount !== "" ? Number(summary.budgetAmount) : null;
  const spent = Number(summary.totalExpenses || 0);
  const budgetPct = budget && budget > 0 ? Math.min(100, (spent / budget) * 100) : null;

  const botCount = filterBotAllowancePersonnel(personnel).length;
  const policeCount = filterPoliceAllowancePersonnel(personnel).length;

  const routeStops = [
    summary.route?.startLocation,
    ...destinations.map((d) => d.address),
    summary.route?.endLocation,
  ]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .filter((s, i, arr) => i === 0 || s !== arr[i - 1]);

  return (
    <div className="space-y-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {backButton}
        <Link
          to={`/missions/${summary.missionId}/edit`}
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
        >
          แก้ไขภารกิจ
        </Link>
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-l-4 border-l-[#0000BF] px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            {summary.code ? (
              <span className="font-mono text-xs font-bold tracking-wide text-[#0000BF]">{summary.code}</span>
            ) : null}
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ring-1 ${statusChip[status]}`}>
              {statusLabel[status]}
            </span>
            {incidentCount ? (
              <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">
                เหตุการณ์ไม่ปกติ {incidentCount}
              </span>
            ) : null}
          </div>
          <h1 className="mt-2 text-xl font-black leading-snug text-slate-900 sm:text-2xl">
            {summary.title?.trim() || "ภารกิจ"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {formatDate(summary.plannedStart)} – {formatDate(summary.plannedEnd)}
            {days ? <span className="text-slate-400"> · {days} วัน</span> : null}
          </p>

          {routeStops.length ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
              {routeStops.map((s, i) => (
                <span key={`${s}-${i}`} className="inline-flex items-center gap-1.5">
                  {i > 0 ? <span className="text-slate-300">→</span> : null}
                  <span
                    className={`rounded-md px-2 py-0.5 font-semibold ${
                      i === 0 || i === routeStops.length - 1
                        ? "bg-[#0000BF]/8 text-[#0000BF]"
                        : "bg-slate-50 text-slate-700 ring-1 ring-slate-200"
                    }`}
                  >
                    {s}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5 border-t border-slate-100 bg-slate-50/60 px-5 py-2.5 sm:px-6">
          <ActionRow label="เอกสารพิมพ์">
            <ActionButton tone="indigo" onClick={() => navigate(`/missions/${summary.missionId}/bot-allowance`)}>
              พิมพ์รายการเบี้ยเลี้ยง ธปท.{botCount ? ` (${botCount})` : ""}
            </ActionButton>
            <ActionButton tone="amber" onClick={() => navigate(`/missions/${summary.missionId}/police-allowance`)}>
              พิมพ์ค่าตอบแทนบุคคลภายนอก{policeCount ? ` (${policeCount})` : ""}
            </ActionButton>
            <ActionButton tone="emerald" onClick={() => setInsuranceOpen(true)}>
              ไฟล์ประกัน
            </ActionButton>
            <ActionButton tone="violet" onClick={() => navigate(`/missions/${summary.missionId}/evaluation`)}>
              QR ประเมินภารกิจ
            </ActionButton>
            <ActionButton tone="rose" onClick={() => setReportOpen(true)}>
              รายงานผลการปฏิบัติ
            </ActionButton>
          </ActionRow>
          <ActionRow label="ระบบกลาง">
            <ActionButton tone="slate" onClick={() => navigate(`/missions/${summary.missionId}/central-memo`)}>
              อนุมัติภารกิจ
            </ActionButton>
            <ActionButton tone="slate" onClick={() => navigate(`/missions/${summary.missionId}/travel-plan-memo`)}>
              อนุมัติแผนเดินทาง
            </ActionButton>
          </ActionRow>
        </div>

        <div className="grid grid-cols-2 border-y border-slate-100 sm:grid-cols-4">
          <Kpi label="มูลค่าสินค้า" value={`${formatBaht(summary.totalCargoValue)} ฿`} />
          <Kpi
            label="รวมรายจ่าย"
            value={`${formatBaht(summary.totalExpenses)} ฿`}
            sub={
              summary.expenseToCargoPercent != null
                ? `${summary.expenseToCargoPercent.toLocaleString("th-TH", { maximumFractionDigits: 2 })}% ของมูลค่าสินค้า`
                : undefined
            }
          />
          <Kpi
            label="ค่าตอบแทนบุคลากร"
            value={`${formatBaht(summary.personnelCompensationTotal ?? compensationTotal)} ฿`}
            sub={`${formatInt(personnel.length)} คน`}
          />
          <Kpi
            label="ยานพาหนะ / ตู้สินค้า"
            value={`${formatInt(vehicles.length)} คัน · ${formatInt(totalContainers)} ตู้`}
            sub={`${formatInt(destinations.length)} จุดส่ง`}
          />
        </div>

        <div className="divide-y divide-slate-100">
          <section className="px-5 py-5 sm:px-6">
            <div className="grid gap-6 lg:grid-cols-2 lg:gap-0">
              <div className="lg:pr-6">
                <PaneTitle count={destinations.length}>จุดส่งสินค้า</PaneTitle>
                {destinations.length ? (
                  <div className="overflow-hidden rounded-lg border border-slate-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          <th className="w-8 px-2.5 py-1.5 text-center font-bold">ที่</th>
                          <th className="px-2.5 py-1.5 text-left font-bold">จุดส่ง</th>
                          <th className="w-14 px-2.5 py-1.5 text-right font-bold">ตู้</th>
                          <th className="w-28 px-2.5 py-1.5 text-right font-bold">มูลค่า</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {destinations.map((d, i) => (
                          <tr key={`${d.address}-${i}`} className="align-top">
                            <td className="px-2.5 py-2 text-center text-xs tabular-nums text-slate-400">{i + 1}</td>
                            <td className="px-2.5 py-2 font-semibold leading-snug text-slate-800">{d.address}</td>
                            <td className="px-2.5 py-2 text-right tabular-nums text-slate-600">
                              {formatInt(d.containerCount)}
                            </td>
                            <td className="px-2.5 py-2 text-right font-semibold tabular-nums text-[#0000BF]">
                              {Number(d.cargoValue) > 0 ? `${formatBaht(d.cargoValue)} ฿` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-slate-200 bg-slate-50/80 text-sm font-bold">
                          <td className="px-2.5 py-2 text-slate-500" colSpan={2}>
                            รวม {formatInt(destinations.length)} จุด
                          </td>
                          <td className="px-2.5 py-2 text-right tabular-nums text-slate-700">
                            {formatInt(totalContainers)}
                          </td>
                          <td className="px-2.5 py-2 text-right tabular-nums text-[#0000BF]">
                            {formatBaht(summary.totalCargoValue)} ฿
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <Empty>ไม่มีจุดส่งสินค้า</Empty>
                )}
              </div>

              <div className="lg:border-l lg:border-slate-100 lg:pl-6">
                <PaneTitle>ค่าใช้จ่าย</PaneTitle>
                {budget != null ? (
                  <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2.5">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">งบประมาณ</p>
                        <p className="mt-0.5 text-sm font-black tabular-nums text-slate-900">{formatBaht(budget)} ฿</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">ใช้ไป</p>
                        <p className="mt-0.5 text-sm font-black tabular-nums text-slate-900">{formatBaht(spent)} ฿</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          {summary.overBudget ? "เกินงบ" : "คงเหลือ"}
                        </p>
                        <p
                          className={`mt-0.5 text-sm font-black tabular-nums ${
                            summary.overBudget ? "text-rose-600" : "text-emerald-700"
                          }`}
                        >
                          {summary.variance != null
                            ? `${formatBaht(Math.abs(Number(summary.variance)))} ฿`
                            : "—"}
                        </p>
                      </div>
                    </div>
                    {budgetPct != null ? (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                        <div
                          className={`h-full rounded-full ${summary.overBudget ? "bg-rose-400" : "bg-emerald-400"}`}
                          style={{ width: `${budgetPct}%` }}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {expenseEntries.length || truckHire > 0 ? (
                  <div className="overflow-hidden rounded-lg border border-slate-100">
                    <ul className="divide-y divide-slate-100">
                      {truckHire > 0 ? (
                        <li className="bg-orange-50/60 px-3 py-2">
                          <div className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="font-semibold text-orange-900">ค่าจ้างรถบรรทุก</span>
                            <span className="font-bold tabular-nums text-orange-700">{formatBaht(truckHire)} ฿</span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-orange-800/70">
                            {spent > 0
                              ? `${((truckHire / spent) * 100).toLocaleString("th-TH", { maximumFractionDigits: 1 })}% ของรายจ่าย`
                              : null}
                            {spent > 0 && totalContainers > 0 ? " · " : null}
                            {totalContainers > 0 ? `เฉลี่ย ${formatBaht(truckHire / totalContainers)} ฿/ตู้` : null}
                          </p>
                        </li>
                      ) : null}
                      {expenseEntries.map(([k, v]) => (
                        <li key={k} className="px-3 py-2">
                          <div className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="min-w-0 truncate text-slate-700" title={k}>
                              {k}
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums text-slate-800">{formatBaht(v)} ฿</span>
                          </div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-[#0000BF]/40"
                              style={{ width: `${(v / maxExpense) * 100}%` }}
                            />
                          </div>
                        </li>
                      ))}
                      <li className="flex justify-between bg-slate-50 px-3 py-2 text-sm font-bold">
                        <span className="text-slate-500">รวมรายจ่ายทั้งหมด</span>
                        <span className="tabular-nums text-slate-900">{formatBaht(summary.totalExpenses)} ฿</span>
                      </li>
                    </ul>
                  </div>
                ) : (
                  <Empty>ยังไม่มีค่าใช้จ่าย</Empty>
                )}

                {summary.expenseToCargoPercent != null ? (
                  <p className="mt-2 text-right text-[11px] text-slate-400">
                    {summary.expenseToCargoPercent.toLocaleString("th-TH", { maximumFractionDigits: 2 })}% ของมูลค่าสินค้า
                  </p>
                ) : null}

                {policeStations.length ? (
                  <div className="mt-3">
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      สถานีตำรวจ
                      <span className="ml-1 rounded bg-slate-100 px-1 py-px tabular-nums text-slate-500">
                        {formatInt(policeStations.length)}
                      </span>
                    </p>
                    <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-100">
                      {policeStations.map((s) => (
                        <li
                          key={s.policeStationId}
                          className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-slate-800">{s.name}</span>
                            {s.vendorCode ? (
                              <span className="text-[11px] text-slate-400">Vendor {s.vendorCode}</span>
                            ) : null}
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums text-sky-700">
                            {Number(s.amount) > 0 ? `${formatBaht(s.amount)} ฿` : "—"}
                          </span>
                        </li>
                      ))}
                      {policeTotal > 0 ? (
                        <li className="flex justify-between bg-slate-50 px-3 py-1.5 text-sm font-bold">
                          <span className="text-slate-500">รวม</span>
                          <span className="tabular-nums text-sky-700">{formatBaht(policeTotal)} ฿</span>
                        </li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <Section title="บุคลากร" count={personnel.length}>
            {personnel.length ? (
              <>
                <div className="space-y-4">
                  {personnelGroups.map(({ tab, people }) => (
                    <div key={tab}>
                      <div
                        className={`mb-2 flex items-center justify-between gap-2 rounded-md border px-2.5 py-1 text-xs font-bold ${TAB_SECTION[tab]}`}
                      >
                        <span>{tabLabel(tab)}</span>
                        <span className="tabular-nums opacity-70">{formatInt(people.length)} คน</span>
                      </div>
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {people.map((p) => {
                          const catLabel = p.personnelCategoryName?.trim() || tabLabel(tab);
                          const noPay = isCargoDriverPersonnel(p.personnelCategoryName, p.roleName);
                          return (
                            <li key={p.personnelId}>
                              <Link
                                to={`/personnel?highlight=${p.personnelId}`}
                                className="flex h-full items-start gap-3 rounded-lg bg-slate-50/80 p-2.5 transition hover:bg-slate-100/80"
                              >
                                <Thumb
                                  src={p.photoUrl}
                                  alt={p.fullName}
                                  round
                                  fallback={p.fullName.trim().charAt(0) || "?"}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-sm font-bold text-slate-900">{personDisplayName(p)}</span>
                                    <span
                                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ${TAB_CHIP[tab]}`}
                                    >
                                      {catLabel}
                                    </span>
                                  </div>
                                  <dl className="mt-1 space-y-0.5 text-xs">
                                    {p.roleName ? (
                                      <div className="flex gap-1.5">
                                        <dt className="shrink-0 text-slate-400">หน้าที่</dt>
                                        <dd className="truncate font-medium text-slate-700">{p.roleName}</dd>
                                      </div>
                                    ) : null}
                                    {p.position ? (
                                      <div className="flex gap-1.5">
                                        <dt className="shrink-0 text-slate-400">ตำแหน่ง</dt>
                                        <dd className="truncate font-medium text-slate-700">{p.position}</dd>
                                      </div>
                                    ) : null}
                                    {p.gradeLevel ? (
                                      <div className="flex gap-1.5">
                                        <dt className="shrink-0 text-slate-400">ชั้น</dt>
                                        <dd className="font-medium text-slate-700">{p.gradeLevel}</dd>
                                      </div>
                                    ) : null}
                                  </dl>
                                  <p className="mt-1.5 text-xs font-semibold tabular-nums text-[#0000BF]">
                                    {noPay
                                      ? "ค่าตอบแทนรวมในค่าจ้างรถบรรทุก"
                                      : `ค่าตอบแทน ${formatBaht(p.compensationRate)} ฿`}
                                  </p>
                                </div>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-sm font-bold">
                  <span className="text-slate-500">รวม {formatInt(personnel.length)} คน</span>
                  <span className="tabular-nums text-[#0000BF]">{formatBaht(compensationTotal)} ฿</span>
                </div>
              </>
            ) : (
              <Empty>ยังไม่มีบุคลากร</Empty>
            )}
          </Section>

          <Section title="ยานพาหนะ" count={vehicles.length}>
            {vehicles.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {vehicles.map((v) => {
                  const fuel = v.fuelType === "DIESEL" ? "ดีเซล" : v.fuelType === "GASOLINE" ? "เบนซิน" : null;
                  const details: [string, string | null | undefined][] = [
                    ["ประเภท", v.vehicleTypeName],
                    ["สี", v.color],
                    ["ครุภัณฑ์", v.assetCode],
                    [
                      "เลขไมล์",
                      v.currentMileage && Number(v.currentMileage) > 0
                        ? `${formatInt(v.currentMileage)} กม.`
                        : null,
                    ],
                    [
                      "เชื้อเพลิง",
                      [
                        fuel,
                        v.fuelLiters ? `${formatLiters(v.fuelLiters)} ล.` : null,
                        v.fuelAmount && Number(v.fuelAmount) > 0 ? `${formatBaht(v.fuelAmount)} ฿` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || null,
                    ],
                  ];
                  const plateLabel = v.callSign?.trim()
                    ? `${v.licensePlate}(${v.callSign.trim()})`
                    : v.licensePlate;
                  return (
                    <li
                      key={v.vehicleId}
                      className="flex items-start gap-3 rounded-lg bg-slate-50/80 p-2.5"
                    >
                      <Thumb src={v.photoUrl} alt={v.licensePlate} size="h-14 w-20" fallback="รถ" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-bold text-slate-900">{plateLabel}</span>
                          <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 ring-1 ring-teal-200">
                            {v.roleName}
                          </span>
                        </div>
                        {v.brandModel ? <p className="mt-0.5 text-xs text-slate-500">{v.brandModel}</p> : null}
                        <dl className="mt-1.5 space-y-0.5 text-xs">
                          {details
                            .filter(([, val]) => val)
                            .map(([k, val]) => (
                              <div key={k} className="flex gap-1.5">
                                <dt className="shrink-0 text-slate-400">{k}</dt>
                                <dd className="truncate font-medium text-slate-700">{val}</dd>
                              </div>
                            ))}
                        </dl>
                        {v.crew?.length ? (
                          <p className="mt-1.5 text-xs text-slate-500">
                            <span className="text-slate-400">ประจำรถ </span>
                            {v.crew.map((c) => `${c.name} (${c.roleName})`).join(", ")}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>ไม่มียานพาหนะ</Empty>
            )}
          </Section>

          <Section title="ข้อมูลรถสินค้า" count={cargoTrucks.length}>
            {cargoTrucks.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {cargoTruckSeatOptions(cargoTrucks).map((opt) => {
                  const t = cargoTrucks.find((row) => cargoAssignValue(row.id) === opt.value);
                  if (!t) return null;
                  const drivers = cargoTruckDriverNames(t);
                  const riders = cargoRiders.get(t.id) ?? [];
                  return (
                    <li key={t.id} className="rounded-lg bg-slate-50/80 p-2.5">
                      <p className="text-sm font-bold text-slate-900">{opt.label}</p>
                      <p className="mt-1.5 text-xs text-slate-500">
                        <span className="text-slate-400">คนขับ </span>
                        {drivers.length ? drivers.join(", ") : "—"}
                      </p>
                      {t.note ? <p className="mt-0.5 text-xs text-slate-500">{t.note}</p> : null}
                      {riders.length ? (
                        <p className="mt-1.5 text-xs text-slate-500">
                          <span className="text-slate-400">ปฏิบัติการพิเศษขาไป </span>
                          {riders.join(", ")}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>ยังไม่มีข้อมูลรถสินค้า</Empty>
            )}
          </Section>

          <Section title="ไฟล์แนบ" count={attachments.length}>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-[#0000BF]/30 bg-[#0000BF]/[0.04] px-3 py-2 text-sm font-semibold text-[#0000BF] transition hover:bg-[#0000BF]/[0.08]">
                {uploading ? "กำลังอัปโหลด…" : "+ แนบไฟล์"}
                <input
                  type="file"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const files = e.target.files?.length ? Array.from(e.target.files) : [];
                    e.target.value = "";
                    void uploadFiles(files);
                  }}
                />
              </label>
              {attachments.length ? (
                <ul className="divide-y divide-slate-100 text-sm">
                  {attachments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 py-1.5">
                      <a
                        href={attachmentHref(a.fileUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 truncate text-[#0000BF] hover:underline"
                      >
                        {a.originalName?.trim() || "เปิดไฟล์"}
                      </a>
                      <button
                        type="button"
                        className="shrink-0 text-xs text-rose-600 hover:underline"
                        onClick={() => void deleteAttachment(a.id)}
                      >
                        ลบ
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-center text-xs text-slate-400">ยังไม่มีไฟล์แนบ</p>
              )}
            </div>
          </Section>

          <section className="px-5 py-5 sm:px-6">
            <MissionIncidentsPanel
              embedded
              missionId={summary.missionId}
              plannedStart={summary.plannedStart}
              plannedEnd={summary.plannedEnd}
              onCountChange={setIncidentCount}
            />
          </section>
        </div>
      </article>

      <MissionInsuranceExportModal
        missionId={insuranceOpen ? summary.missionId : null}
        onClose={() => setInsuranceOpen(false)}
      />
      {reportOpen ? <MissionReportModal open onClose={() => setReportOpen(false)} summary={summary} /> : null}
    </div>
  );
}

const actionTones = {
  indigo: "border-indigo-200 text-indigo-700 hover:bg-indigo-50",
  amber: "border-amber-200 text-amber-800 hover:bg-amber-50",
  emerald: "border-emerald-200 text-emerald-700 hover:bg-emerald-50",
  slate: "border-slate-300 text-slate-700 hover:bg-slate-50",
  violet: "border-violet-200 text-violet-700 hover:bg-violet-50",
  rose: "border-rose-200 text-rose-700 hover:bg-rose-50",
} as const;

function ActionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:w-24">
        {label}
      </span>
      <div className="flex min-w-0 flex-wrap gap-1">{children}</div>
    </div>
  );
}

function ActionButton({
  tone,
  onClick,
  children,
}: {
  tone: keyof typeof actionTones;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border bg-white px-2 py-0.5 text-[11px] font-semibold transition ${actionTones[tone]}`}
    >
      {children}
    </button>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-slate-100 px-5 py-3.5 max-sm:odd:border-r max-sm:[&:nth-child(-n+2)]:border-b sm:[&:not(:last-child)]:border-r">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-black tabular-nums leading-tight text-slate-900">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-slate-400">{sub}</p> : null}
    </div>
  );
}

function PaneTitle({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <h2 className="mb-3.5 flex items-center gap-2 text-sm font-bold text-slate-800">
      <span className="h-4 w-0.5 rounded-full bg-[#0000BF]" aria-hidden />
      {children}
      {count != null ? (
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-500">
          {count}
        </span>
      ) : null}
    </h2>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="px-5 py-5 sm:px-6">
      <PaneTitle count={count}>{title}</PaneTitle>
      {children}
    </section>
  );
}

function Thumb({
  src,
  alt,
  fallback,
  round = false,
  size = "h-9 w-9",
}: {
  src?: string | null;
  alt: string;
  fallback: string;
  round?: boolean;
  size?: string;
}) {
  const [broken, setBroken] = useState(false);
  const url = mediaUrl(src);
  const shape = round ? "rounded-full" : "rounded-lg";
  if (url && !broken) {
    return (
      <img
        src={url}
        alt={alt}
        loading="lazy"
        onError={() => setBroken(true)}
        className={`${size} ${shape} shrink-0 border border-slate-200 bg-slate-50 object-cover`}
      />
    );
  }
  return (
    <span
      className={`${size} ${shape} flex shrink-0 items-center justify-center border border-slate-200 bg-slate-50 text-xs font-bold text-slate-400`}
    >
      {fallback}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-2 text-sm text-slate-400">{children}</p>;
}
