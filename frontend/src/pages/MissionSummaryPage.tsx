import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFormJson, apiJson, apiUrl } from "../api/client";
import { MissionBotAllowancePrintSheet } from "../components/MissionBotAllowancePrintSheet";
import { MissionIncidentsPanel } from "../components/MissionIncidentsPanel";
import { MissionInsuranceExportModal } from "../components/MissionInsuranceExportModal";
import { MissionPoliceAllowancePrintSheet } from "../components/MissionPoliceAllowancePrintSheet";
import { MissionReportModal } from "../components/MissionReportModal";
import { filterBotAllowancePersonnel } from "../lib/botAllowancePrint";
import { formatBaht, formatInt, formatLiters } from "../lib/formatNumber";
import { filterPoliceAllowancePersonnel } from "../lib/policeAllowancePrint";
import { printIsolatedElement } from "../lib/printIsolated";
import { mediaUrl } from "../lib/uiTokens";
import type { MissionStatus, MissionSummary } from "../types";

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
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate("/missions");
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
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
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

  const personnel = summary.personnel ?? [];
  const vehicles = summary.vehicles ?? [];
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
  const otherExpenseTotal = expenseEntries.reduce((s, [, v]) => s + v, 0);
  const maxExpense = Math.max(1, ...expenseEntries.map(([, v]) => v));
  const status = summary.status ?? "PLANNED";
  const days = travelDays(summary.plannedStart, summary.plannedEnd);
  const totalContainers = destinations.reduce((s, d) => s + (d.containerCount || 0), 0);
  const compensationTotal = personnel.reduce((s, p) => s + Number(p.compensationRate || 0), 0);
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
  const routeLabel = summary.route
    ? [summary.route.startLocation, summary.route.endLocation].filter(Boolean).join(" - ") || summary.route.name
    : null;

  function printBot() {
    if (!botCount) {
      alert("ไม่มีรายชื่อที่เข้าเงื่อนไข (ไม่ใช่ตำรวจ และไม่ใช่คนขับ) ในภารกิจนี้");
      return;
    }
    if (!printIsolatedElement({ rootSelector: ".bot-allowance-print-root", htmlClass: "print-bot-allowance", pageSize: "A4 landscape" }))
      alert("ไม่พบแบบฟอร์มสำหรับพิมพ์");
  }

  function printPolice() {
    if (!policeCount && !policeStations.some((s) => Number(s.amount) > 0)) {
      alert("ไม่มีรายชื่อบุคคลภายนอก (ไม่รวมประเภท ธปท.) ในภารกิจนี้");
      return;
    }
    if (!printIsolatedElement({ rootSelector: ".police-allowance-print-root", htmlClass: "print-police-allowance", pageSize: "A4 portrait" }))
      alert("ไม่พบแบบฟอร์มสำหรับพิมพ์");
  }

  return (
    <div className="space-y-5 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {backButton}
        <Link
          to={`/missions/${summary.missionId}/edit`}
          className="rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-sm font-semibold text-amber-800 hover:bg-amber-100"
        >
          แก้ไขภารกิจ
        </Link>
      </div>

      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {summary.code ? (
            <span className="font-mono text-xs font-bold tracking-wide text-indigo-600">{summary.code}</span>
          ) : null}
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${statusChip[status]}`}>
            {statusLabel[status]}
          </span>
          {incidentCount ? (
            <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">
              เหตุการณ์ไม่ปกติ {incidentCount}
            </span>
          ) : null}
        </div>
        <h1 className="mt-1.5 text-xl font-black leading-snug text-slate-900 sm:text-2xl">
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
                  className={`rounded-lg px-2.5 py-1 font-semibold ${
                    i === 0 || i === routeStops.length - 1
                      ? "bg-indigo-50 text-indigo-800"
                      : "bg-slate-50 text-slate-700 ring-1 ring-slate-200"
                  }`}
                >
                  {s}
                </span>
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <ActionButton tone="indigo" onClick={printBot}>
            พิมพ์รายการเบี้ยเลี้ยง ธปท.{botCount ? ` (${botCount})` : ""}
          </ActionButton>
          <ActionButton tone="amber" onClick={printPolice}>
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
          <ActionButton tone="slate" onClick={() => navigate(`/missions/${summary.missionId}/central-memo`)}>
            ระบบกลาง: อนุมัติภารกิจ
          </ActionButton>
          <ActionButton tone="slate" onClick={() => navigate(`/missions/${summary.missionId}/travel-plan-memo`)}>
            ระบบกลาง: อนุมัติแผนเดินทาง
          </ActionButton>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="มูลค่าสินค้า" value={`${formatBaht(summary.totalCargoValue)} ฿`} accent="border-l-indigo-400" />
        <Kpi
          label="รวมรายจ่าย"
          value={`${formatBaht(summary.totalExpenses)} ฿`}
          accent="border-l-pink-400"
          sub={
            summary.expenseToCargoPercent != null
              ? `${summary.expenseToCargoPercent.toLocaleString("th-TH", { maximumFractionDigits: 2 })}% ของมูลค่าสินค้า`
              : undefined
          }
        />
        <Kpi
          label="ค่าตอบแทนบุคลากร"
          value={`${formatBaht(summary.personnelCompensationTotal ?? compensationTotal)} ฿`}
          accent="border-l-violet-400"
          sub={`${formatInt(personnel.length)} คน`}
        />
        <Kpi
          label="ยานพาหนะ / ตู้สินค้า"
          value={`${formatInt(vehicles.length)} คัน · ${formatInt(totalContainers)} ตู้`}
          accent="border-l-teal-400"
          sub={`${formatInt(destinations.length)} จุดส่ง`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <MissionIncidentsPanel
            missionId={summary.missionId}
            plannedStart={summary.plannedStart}
            plannedEnd={summary.plannedEnd}
            onCountChange={setIncidentCount}
          />
          <Panel title="บุคลากร" count={personnel.length}>
            {personnel.length ? (
              <Table head={["#", "ชื่อ - สกุล", "ประเภท", "หน้าที่", "ค่าตอบแทน (฿)"]} alignRight={[4]}>
                {personnel.map((p, i) => (
                  <tr key={p.personnelId} className="hover:bg-slate-50/70">
                    <Td className="w-10 text-slate-400">{i + 1}</Td>
                    <Td>
                      <Link
                        to={`/personnel?highlight=${p.personnelId}`}
                        className="flex items-center gap-2.5 font-semibold text-slate-800 hover:text-indigo-700"
                      >
                        <Thumb src={p.photoUrl} alt={p.fullName} round fallback={p.fullName.trim().charAt(0)} />
                        <span className="min-w-0">
                          <span className="block truncate hover:underline">
                            {[p.rank, p.fullName].filter(Boolean).join(" ")}
                          </span>
                          {p.position ? (
                            <span className="block truncate text-xs font-normal text-slate-400">{p.position}</span>
                          ) : null}
                        </span>
                      </Link>
                    </Td>
                    <Td className="text-slate-600">{p.personnelCategoryName || "—"}</Td>
                    <Td className="text-slate-600">{p.roleName}</Td>
                    <Td className="text-right font-semibold tabular-nums text-slate-800">
                      {formatBaht(p.compensationRate)}
                    </Td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold">
                  <Td className="text-slate-500" colSpan={4}>
                    รวม {formatInt(personnel.length)} คน
                  </Td>
                  <Td className="text-right tabular-nums text-violet-700">{formatBaht(compensationTotal)}</Td>
                </tr>
              </Table>
            ) : (
              <Empty>ยังไม่มีบุคลากร</Empty>
            )}
          </Panel>

          <Panel title="ยานพาหนะ" count={vehicles.length}>
            {vehicles.length ? (
              <ul className="divide-y divide-slate-100">
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
                      [fuel, v.fuelLiters ? `${formatLiters(v.fuelLiters)} ล.` : null, v.fuelAmount && Number(v.fuelAmount) > 0 ? `${formatBaht(v.fuelAmount)} ฿` : null]
                        .filter(Boolean)
                        .join(" · ") || null,
                    ],
                  ];
                  return (
                    <li key={v.vehicleId} className="flex items-start gap-3 px-4 py-3">
                      <Thumb src={v.photoUrl} alt={v.licensePlate} size="h-14 w-20" fallback="รถ" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-bold text-slate-900">{v.licensePlate}</span>
                          <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-700 ring-1 ring-teal-200">
                            {v.roleName}
                          </span>
                          {v.brandModel ? <span className="text-sm text-slate-500">{v.brandModel}</span> : null}
                        </div>
                        <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                          {details
                            .filter(([, val]) => val)
                            .map(([k, val]) => (
                              <div key={k} className="flex gap-1">
                                <dt className="text-slate-400">{k}</dt>
                                <dd className="font-medium text-slate-700">{val}</dd>
                              </div>
                            ))}
                        </dl>
                        {v.crew?.length ? (
                          <p className="mt-1 text-xs text-slate-500">
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
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="จุดส่งสินค้า" count={destinations.length}>
            {destinations.length ? (
              <Table head={["ปลายทาง", "ตู้", "มูลค่า (฿)"]} alignRight={[1, 2]}>
                {destinations.map((d, i) => (
                  <tr key={`${d.address}-${i}`}>
                    <Td className="font-semibold text-slate-800">{d.address}</Td>
                    <Td className="text-right tabular-nums">{formatInt(d.containerCount)}</Td>
                    <Td className="text-right tabular-nums text-indigo-700">
                      {Number(d.cargoValue) > 0 ? formatBaht(d.cargoValue) : "—"}
                    </Td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold">
                  <Td className="text-slate-500">รวม</Td>
                  <Td className="text-right tabular-nums">{formatInt(totalContainers)}</Td>
                  <Td className="text-right tabular-nums text-indigo-700">{formatBaht(summary.totalCargoValue)}</Td>
                </tr>
              </Table>
            ) : (
              <Empty>ไม่มีจุดส่งสินค้า</Empty>
            )}
          </Panel>

          {budget != null ? (
            <Panel title="งบประมาณ">
              <div className="space-y-2 px-4 py-3 text-sm">
                <Row label="งบประมาณ" value={`${formatBaht(budget)} ฿`} />
                <Row label="ใช้ไป" value={`${formatBaht(spent)} ฿`} />
                {budgetPct != null ? (
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${summary.overBudget ? "bg-rose-400" : "bg-emerald-400"}`}
                      style={{ width: `${budgetPct}%` }}
                    />
                  </div>
                ) : null}
                {summary.variance != null ? (
                  <Row
                    label={summary.overBudget ? "เกินงบ" : "คงเหลือ"}
                    value={`${formatBaht(Math.abs(Number(summary.variance)))} ฿`}
                    valueClass={summary.overBudget ? "text-rose-600" : "text-emerald-700"}
                  />
                ) : null}
              </div>
            </Panel>
          ) : null}

          <Panel title="ค่าจ้างรถบรรทุก">
            {truckHire > 0 ? (
              <div className="space-y-1.5 px-4 py-3 text-sm">
                <p className="text-2xl font-black tabular-nums text-orange-700">{formatBaht(truckHire)} ฿</p>
                {spent > 0 ? (
                  <Row label="สัดส่วนของรายจ่ายทั้งหมด" value={`${((truckHire / spent) * 100).toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`} />
                ) : null}
                {totalContainers > 0 ? (
                  <Row label="เฉลี่ยต่อตู้" value={`${formatBaht(truckHire / totalContainers)} ฿`} />
                ) : null}
              </div>
            ) : (
              <Empty>ยังไม่มีค่าจ้างรถบรรทุก</Empty>
            )}
          </Panel>

          <Panel title="ค่าใช้จ่ายอื่น" count={expenseEntries.length}>
            {expenseEntries.length ? (
              <ul className="space-y-2.5 px-4 py-3">
                {expenseEntries.map(([k, v]) => (
                  <li key={k}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-slate-700" title={k}>
                        {k}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-slate-800">{formatBaht(v)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-pink-300" style={{ width: `${(v / maxExpense) * 100}%` }} />
                    </div>
                  </li>
                ))}
                <li className="flex justify-between border-t border-slate-100 pt-2 text-sm font-bold">
                  <span className="text-slate-500">รวมค่าใช้จ่ายอื่น</span>
                  <span className="tabular-nums text-pink-700">{formatBaht(otherExpenseTotal)} ฿</span>
                </li>
                {truckHire > 0 ? (
                  <li className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <Row label="+ ค่าจ้างรถบรรทุก" value={`${formatBaht(truckHire)} ฿`} valueClass="text-orange-700" />
                    <Row label="รวมรายจ่ายทั้งหมด" value={`${formatBaht(summary.totalExpenses)} ฿`} valueClass="font-black text-slate-900" />
                  </li>
                ) : null}
              </ul>
            ) : (
              <Empty>ยังไม่มีค่าใช้จ่าย</Empty>
            )}
          </Panel>

          {policeStations.length ? (
            <Panel title="สถานีตำรวจ" count={policeStations.length}>
              <ul className="divide-y divide-slate-100">
                {policeStations.map((s) => (
                  <li key={s.policeStationId} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-800">{s.name}</span>
                      {s.vendorCode ? <span className="text-xs text-slate-400">Vendor {s.vendorCode}</span> : null}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-sky-700">
                      {Number(s.amount) > 0 ? `${formatBaht(s.amount)} ฿` : "—"}
                    </span>
                  </li>
                ))}
                {policeTotal > 0 ? (
                  <li className="flex justify-between bg-slate-50 px-4 py-2 text-sm font-bold">
                    <span className="text-slate-500">รวม</span>
                    <span className="tabular-nums text-sky-700">{formatBaht(policeTotal)} ฿</span>
                  </li>
                ) : null}
              </ul>
            </Panel>
          ) : null}

          <Panel title="ไฟล์แนบ" count={attachments.length}>
            <div className="space-y-2 px-4 py-3">
              <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-indigo-200 bg-indigo-50/40 px-3 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
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
                        className="min-w-0 truncate text-indigo-600 hover:underline"
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
          </Panel>
        </div>
      </div>

      <MissionInsuranceExportModal
        missionId={insuranceOpen ? summary.missionId : null}
        onClose={() => setInsuranceOpen(false)}
      />
      {reportOpen ? <MissionReportModal open onClose={() => setReportOpen(false)} summary={summary} /> : null}
      {createPortal(
        <>
          <MissionBotAllowancePrintSheet
            title={summary.title}
            code={summary.code}
            plannedStart={summary.plannedStart}
            plannedEnd={summary.plannedEnd}
            routeLabel={routeLabel}
            personnel={personnel}
          />
          <MissionPoliceAllowancePrintSheet
            title={summary.title}
            code={summary.code}
            plannedStart={summary.plannedStart}
            plannedEnd={summary.plannedEnd}
            routeLabel={routeLabel}
            personnel={personnel}
            policeStations={policeStations}
          />
        </>,
        document.body,
      )}
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
      className={`rounded-full border bg-white px-3.5 py-1.5 text-xs font-bold shadow-sm sm:text-sm ${actionTones[tone]}`}
    >
      {children}
    </button>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 border-l-4 ${accent} bg-white px-4 py-3 shadow-sm`}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-black tabular-nums text-slate-900">{value}</p>
      {sub ? <p className="text-xs text-slate-400">{sub}</p> : null}
    </div>
  );
}

function Panel({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm font-bold text-slate-800">
        {title}
        {count != null ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{count}</span>
        ) : null}
      </h2>
      {children}
    </section>
  );
}

function Table({ head, alignRight = [], children }: { head: string[]; alignRight?: number[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50/80 text-xs text-slate-500">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`px-4 py-2 font-semibold ${alignRight.includes(i) ? "text-right" : "text-left"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, className = "", colSpan }: { children: ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={`px-4 py-2 ${className}`}>
      {children}
    </td>
  );
}

function Row({ label, value, valueClass = "text-slate-800" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold tabular-nums ${valueClass}`}>{value}</span>
    </div>
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
  return <p className="px-4 py-6 text-center text-sm text-slate-400">{children}</p>;
}
