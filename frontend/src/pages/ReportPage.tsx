import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiJson } from "../api/client";
import { Modal, ModalFormActions, ModalFormBody } from "../components/Modal";
import { PageFilterPrintBar } from "../components/PageFilterPrintBar";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { PickableDateInput } from "../components/PickableDateInput";
import { ReportsSubNav } from "../components/ReportsSubNav";
import { useAuth } from "../context/AuthContext";
import { currentUserLabel } from "../lib/currentUserLabel";
import { mondayOfWeekContaining } from "../lib/inspectionWeek";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { ARMOR_MONTHLY_TOPICS } from "../lib/armorMonthlyTopics";
import { VEHICLE_WEEKLY_TOPICS, type VehicleWeeklyTopicKey } from "../lib/vehicleWeeklyTopics";
import { toolbarLinkBtnClass } from "../lib/uiTokens";
import { REPORT_TYPES } from "./reportsConfig";
import {
  vehicleDisplayLabel,
  type ArmorMonthlyInspection,
  type ArmorMonthlyReportResponse,
  type VehicleWeeklyCheckResult,
  type VehicleWeeklyInspection,
  type VehicleWeeklyInspectionReportResponse,
} from "../types";

type ReportRow = VehicleWeeklyInspectionReportResponse["rows"][number];

function checkFields(i: VehicleWeeklyInspection) {
  return [
    i.airConditioning,
    i.engineOperation,
    i.tireCondition,
    i.cctvAnalog,
    i.cctvThinkware,
    i.engineStart5Min,
  ];
}

function inspectionSummaryTh(i: VehicleWeeklyInspection): string {
  const f = checkFields(i);
  const set = f.filter((x): x is NonNullable<typeof x> => x != null);
  if (set.length === 0) return "บันทึกแล้ว (ยังไม่กรอกหัวข้อ)";
  if (f.some((x) => x === "ABNORMAL")) return "มีผิดปกติ";
  if (set.length === 6 && set.every((x) => x === "NORMAL")) return "ครบทุกหัวข้อ — ปกติ";
  if (set.every((x) => x === "NORMAL")) return "ที่กรอก — ปกติ";
  return "กรอกบางหัวข้อ";
}

function rowMatchesWeeklyReportFilter(row: ReportRow, filter: string) {
  return rowMatchesFilter(filter, [
    row.vehicle.licensePlate,
    vehicleDisplayLabel(row.vehicle),
    row.inspectorName,
    row.remarks,
    inspectionSummaryTh(row),
  ]);
}

type EditDraft = {
  airConditioning: VehicleWeeklyCheckResult | null;
  engineOperation: VehicleWeeklyCheckResult | null;
  tireCondition: VehicleWeeklyCheckResult | null;
  cctvAnalog: VehicleWeeklyCheckResult | null;
  cctvThinkware: VehicleWeeklyCheckResult | null;
  engineStart5Min: VehicleWeeklyCheckResult | null;
  inspectorName: string;
  remarks: string;
};

function draftFromRow(row: ReportRow): EditDraft {
  return {
    airConditioning: row.airConditioning,
    engineOperation: row.engineOperation,
    tireCondition: row.tireCondition,
    cctvAnalog: row.cctvAnalog,
    cctvThinkware: row.cctvThinkware,
    engineStart5Min: row.engineStart5Min,
    inspectorName: row.inspectorName?.trim() ?? "",
    remarks: row.remarks ?? "",
  };
}

function ModalTopicRow({
  title,
  subtitle,
  value,
  onPick,
}: {
  title: string;
  subtitle?: string;
  value: VehicleWeeklyCheckResult | null;
  onPick: (v: VehicleWeeklyCheckResult | null) => void;
}) {
  const btn =
    "rounded-lg border px-3 py-2 text-xs font-medium transition-colors sm:text-sm";
  return (
    <div className="flex flex-col gap-2 border-b border-slate-200 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-slate-800">{title}</p>
        {subtitle ? <p className="text-[11px] text-slate-600">{subtitle}</p> : null}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className={`${btn} border-slate-200 ${
            value === "NORMAL" ? "border-emerald-500 bg-emerald-900/40 text-emerald-200" : "text-slate-700 hover:bg-slate-100"
          }`}
          onClick={() => onPick(value === "NORMAL" ? null : "NORMAL")}
        >
          ปกติ{value === "NORMAL" ? " ✓" : ""}
        </button>
        <button
          type="button"
          className={`${btn} border-slate-200 ${
            value === "ABNORMAL" ? "border-rose-500 bg-rose-900/35 text-rose-200" : "text-slate-700 hover:bg-slate-100"
          }`}
          onClick={() => onPick(value === "ABNORMAL" ? null : "ABNORMAL")}
        >
          ผิดปกติ{value === "ABNORMAL" ? " ✓" : ""}
        </button>
      </div>
    </div>
  );
}

function WeeklyInspectionReportView({ reportTitle }: { reportTitle: string }) {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const weekFromUrl = searchParams.get("week")?.trim();
  const defaultWeek = useMemo(() => mondayOfWeekContaining(new Date()), []);
  const weekStart = weekFromUrl && /^\d{4}-\d{2}-\d{2}$/.test(weekFromUrl) ? weekFromUrl : defaultWeek;

  const [listFilter, setListFilter] = useState("");
  const [data, setData] = useState<VehicleWeeklyInspectionReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<ReportRow | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiJson<VehicleWeeklyInspectionReportResponse>(
        `/api/vehicles/weekly-inspection-report?weekStart=${encodeURIComponent(weekStart)}`,
      );
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    if (!data?.rows.length) return [];
    const f = listFilter.trim();
    if (!f) return data.rows;
    return data.rows.filter((row) => rowMatchesWeeklyReportFilter(row, f));
  }, [data, listFilter]);

  function setWeek(w: string) {
    setSearchParams(w === defaultWeek ? {} : { week: w });
  }

  const defaultInspector = useMemo(() => currentUserLabel(user), [user]);

  function openEdit(row: ReportRow) {
    setEditing(row);
    const d = draftFromRow(row);
    setEditDraft({
      ...d,
      inspectorName: d.inspectorName.trim() || defaultInspector,
    });
  }

  function closeEdit() {
    setEditing(null);
    setEditDraft(null);
  }

  function setEditField<K extends keyof EditDraft>(key: K, value: EditDraft[K]) {
    setEditDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  function setEditCheck(key: VehicleWeeklyTopicKey, value: VehicleWeeklyCheckResult | null) {
    setEditDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function saveEdit() {
    if (!editing || !editDraft) return;
    setSaving(true);
    setErr(null);
    try {
      await apiJson(`/api/vehicles/${editing.vehicleId}/weekly-inspection`, {
        method: "PUT",
        body: JSON.stringify({
          weekStart,
          airConditioning: editDraft.airConditioning,
          engineOperation: editDraft.engineOperation,
          tireCondition: editDraft.tireCondition,
          cctvAnalog: editDraft.cctvAnalog,
          cctvThinkware: editDraft.cctvThinkware,
          engineStart5Min: editDraft.engineStart5Min,
          inspectorName: editDraft.inspectorName.trim() || defaultInspector || null,
          remarks: editDraft.remarks.trim() || null,
        }),
      });
      closeEdit();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(row: ReportRow) {
    if (!confirm(`ลบบันทึกการตรวจ ทะเบียน ${row.vehicle.licensePlate} สัปดาห์นี้?`)) return;
    setDeletingId(row.id);
    setErr(null);
    try {
      await apiJson(`/api/vehicles/${row.vehicleId}/weekly-inspection?weekStart=${encodeURIComponent(weekStart)}`, {
        method: "DELETE",
      });
      if (editing?.id === row.id) closeEdit();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setDeletingId(null);
    }
  }

  const printTitle = useMemo(() => {
    const base = `${reportTitle} — วันอ้างอิง ${weekStart}`;
    const ft = listFilter.trim();
    return ft ? `${base} — กรอง: ${ft}` : base;
  }, [reportTitle, weekStart, listFilter]);

  return (
    <div className="weekly-inspection-report space-y-4">
      <PageFilterPrintBar
        value={listFilter}
        onChange={setListFilter}
        printTitle={printTitle}
        placeholder="กรองทะเบียน ยี่ห้อ/รุ่น ผู้ตรวจ หมายเหตุ สรุปผล…"
        trailing={
          <>
            <div className="inline-flex h-8 items-center gap-1 rounded-xl border border-[#dcd8f0] bg-white px-1.5 shadow-sm sm:h-9">
              <PickableDateInput
                type="date"
                className="h-7 min-w-[8.5rem] border-0 bg-transparent px-1 text-[11px] font-bold text-[#2e2a58] sm:text-xs"
                value={weekStart}
                onChange={setWeek}
              />
            </div>
            <button
              type="button"
              className={toolbarLinkBtnClass}
              onClick={() => setWeek(mondayOfWeekContaining(new Date()))}
            >
              สัปดาห์นี้
            </button>
            <Link
              to={`/vehicles/weekly-inspection?week=${encodeURIComponent(weekStart)}`}
              className={toolbarLinkBtnClass}
            >
              ไปตารางตรวจ
            </Link>
          </>
        }
      />

      {err ? <p className="text-sm text-rose-600 print:hidden">{err}</p> : null}

      {loading ? (
        <p className="text-slate-700 print:hidden">กำลังโหลด…</p>
      ) : data ? (
        <>
          <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-700 print:border-gray-400 print:bg-white print:text-black">
            <p>
              <span className="font-medium text-[#1e1b3a] print:text-black">สัปดาห์นี้:</span> บันทึกแล้ว{" "}
              <span className="tabular-nums text-[#4d47b6] print:text-black">{data.inspectedCount}</span> คัน จากทั้งหมด{" "}
              <span className="tabular-nums">{data.totalVehicles}</span> คัน
              {data.totalVehicles > data.inspectedCount ? (
                <span className="text-slate-700 print:text-gray-600">
                  {" "}
                  (ยังไม่บันทึก {data.totalVehicles - data.inspectedCount} คัน)
                </span>
              ) : null}
            </p>
            {listFilter.trim() ? (
              <p className="mt-1 text-slate-600 print:text-gray-800">
                หลังกรองแสดง <span className="font-medium text-[#4d47b6] print:text-black">{filteredRows.length}</span>{" "}
                รายการ (พิมพ์จะเห็นเฉพาะรายการที่กรอง)
              </p>
            ) : null}
          </div>

          {data.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white/90/30 px-4 py-8 text-center text-sm text-slate-600 print:hidden">
              ยังไม่มีรายการบันทึกการตรวจในสัปดาห์นี้ — ใช้เมนู «ตารางตรวจ» เพื่อบันทึก
            </p>
          ) : filteredRows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-amber-900/40 bg-amber-950/10 px-4 py-8 text-center text-sm text-amber-800 print:hidden">
              ไม่มีรายการตรงกับการกรอง
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 print:border-gray-400">
              <table className="w-full min-w-[56rem] border-collapse text-left text-sm print:text-black">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100/80 print:border-gray-400 print:bg-gray-100">
                    <th className="px-3 py-2 font-medium text-slate-800 print:text-black">#</th>
                    <th className="px-3 py-2 font-medium text-slate-800 print:text-black">ทะเบียน</th>
                    <th className="px-3 py-2 font-medium text-slate-800 print:text-black">ยี่ห้อ / รุ่น</th>
                    <th className="px-3 py-2 font-medium text-slate-800 print:text-black">ผู้ตรวจ</th>
                    <th className="px-3 py-2 font-medium text-slate-800 print:text-black">สรุปผลตรวจ</th>
                    <th className="min-w-[8rem] px-3 py-2 font-medium text-slate-800 print:text-black">หมายเหตุ</th>
                    <th className="no-print px-3 py-2 font-medium text-slate-800">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, idx) => (
                    <tr
                      key={row.id}
                      className={`border-b border-slate-200 print:border-gray-300 ${
                        idx % 2 === 0 ? "bg-white/90/20 print:bg-white" : "bg-emerald-950/10 print:bg-gray-50"
                      }`}
                    >
                        <td className="px-3 py-2 tabular-nums text-slate-700 print:text-gray-700">{idx + 1}</td>
                        <td className="px-3 py-2 font-mono text-[#4d47b6] print:text-black">{row.vehicle.licensePlate}</td>
                        <td className="px-3 py-2 text-slate-700 print:text-black">{vehicleDisplayLabel(row.vehicle)}</td>
                        <td className="px-3 py-2 text-slate-700 print:text-black">{row.inspectorName?.trim() || "—"}</td>
                        <td className="px-3 py-2 text-slate-800 print:text-black">{inspectionSummaryTh(row)}</td>
                        <td className="px-3 py-2 whitespace-pre-wrap text-slate-700 print:text-gray-800">
                          {row.remarks?.trim() || "—"}
                        </td>
                        <td className="no-print px-2 py-2">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              className="rounded border border-slate-200 px-2 py-1 text-[11px] text-[#5b61ff] hover:bg-slate-100"
                              onClick={() => openEdit(row)}
                            >
                              แก้ไข
                            </button>
                            <button
                              type="button"
                              disabled={deletingId === row.id}
                              className="rounded border border-slate-200 px-2 py-1 text-[11px] text-rose-600 hover:bg-slate-100 disabled:opacity-50"
                              onClick={() => void deleteRow(row)}
                            >
                              {deletingId === row.id ? "…" : "ลบ"}
                            </button>
                          </div>
                        </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      <Modal open={Boolean(editing && editDraft)} onClose={closeEdit} title="แก้ไขการตรวจ" size="wide">
        {editing && editDraft ? (
          <>
            <ModalFormBody className="!space-y-1">
              <p className="text-sm text-slate-600">
                ทะเบียน{" "}
                <span className="font-mono text-[#4d47b6]">{editing.vehicle.licensePlate}</span>
                {" · "}
                {vehicleDisplayLabel(editing.vehicle)}
              </p>
              <p className="text-xs text-slate-600">สัปดาห์อ้างอิง {weekStart}</p>

              <label className="mt-4 block">
                <span className="text-xs font-medium text-slate-700">ผู้ตรวจ</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  value={editDraft.inspectorName}
                  onChange={(e) => setEditField("inspectorName", e.target.value)}
                  placeholder={defaultInspector || "ชื่อ-นามสกุล"}
                />
                {defaultInspector ? (
                  <button
                    type="button"
                    className="mt-1 text-xs text-[#0000BF] hover:underline"
                    onClick={() => setEditField("inspectorName", defaultInspector)}
                  >
                    ใช้ชื่อผู้ใช้ปัจจุบัน ({defaultInspector})
                  </button>
                ) : null}
              </label>

              <div className="mt-2 rounded-xl border border-slate-200 bg-white/80 px-3">
                {VEHICLE_WEEKLY_TOPICS.map((t) => (
                  <ModalTopicRow
                    key={t.key}
                    title={t.title}
                    subtitle={t.subtitle}
                    value={editDraft[t.key]}
                    onPick={(v) => setEditCheck(t.key, v)}
                  />
                ))}
              </div>

              <label className="mt-4 block">
                <span className="text-xs font-medium text-slate-700">หมายเหตุ</span>
                <textarea
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  value={editDraft.remarks}
                  onChange={(e) => setEditField("remarks", e.target.value)}
                />
              </label>
            </ModalFormBody>
            <ModalFormActions>
              <button
                type="button"
                disabled={saving}
                className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] px-4 py-2 disabled:opacity-50"
                onClick={() => void saveEdit()}
              >
                {saving ? "กำลังบันทึก…" : "บันทึก"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                onClick={closeEdit}
              >
                ยกเลิก
              </button>
            </ModalFormActions>
          </>
        ) : null}
      </Modal>
    </div>
  );
}

function armorCheckSymbol(v: VehicleWeeklyCheckResult | null): string {
  if (v === "NORMAL") return "ป";
  if (v === "ABNORMAL") return "ผ";
  return "—";
}

function armorInspectionSummaryTh(i: ArmorMonthlyInspection | null): string {
  if (!i) return "ยังไม่ตรวจ";
  const f = [
    i.outerShell,
    i.strapsFasteners,
    i.ballisticLayer,
    i.cleanlinessStorage,
    i.overallReadiness,
  ];
  const set = f.filter((x): x is NonNullable<typeof x> => x != null);
  if (set.length === 0) return "บันทึกแล้ว (ยังไม่กรอกหัวข้อ)";
  if (f.some((x) => x === "ABNORMAL")) return "มีผิดปกติ";
  if (set.length === 5 && set.every((x) => x === "NORMAL")) return "ครบทุกหัวข้อ — ปกติ";
  if (set.every((x) => x === "NORMAL")) return "ที่กรอก — ปกติ";
  return "กรอกบางหัวข้อ";
}

function currentMonthYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function ArmorMonthlyReportView({ reportTitle }: { reportTitle: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const monthFromUrl = searchParams.get("month")?.trim();
  const defaultMonth = useMemo(() => currentMonthYm(), []);
  const monthYm =
    monthFromUrl && /^\d{4}-\d{2}$/.test(monthFromUrl) ? monthFromUrl : defaultMonth;

  const [listFilter, setListFilter] = useState("");
  const [data, setData] = useState<ArmorMonthlyReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiJson<ArmorMonthlyReportResponse>(
        `/api/armor-inspections/monthly/report?month=${encodeURIComponent(monthYm)}`,
      );
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [monthYm]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    if (!data?.rows.length) return [];
    const f = listFilter.trim();
    if (!f) return data.rows;
    return data.rows.filter((row) =>
      rowMatchesFilter(f, [
        row.asset.serialNumber,
        row.asset.itemName,
        row.asset.location,
        row.asset.armorUnitNumber,
        row.inspection?.inspectorName,
        row.inspection?.remarks,
        armorInspectionSummaryTh(row.inspection),
      ]),
    );
  }, [data, listFilter]);

  function setMonth(ym: string) {
    setSearchParams(ym === defaultMonth ? {} : { month: ym });
  }

  const printTitle = useMemo(() => {
    const base = `${reportTitle} — เดือน ${monthYm}`;
    const ft = listFilter.trim();
    return ft ? `${base} — กรอง: ${ft}` : base;
  }, [reportTitle, monthYm, listFilter]);

  return (
    <div className="armor-monthly-report space-y-4">
      <PageFilterPrintBar
        value={listFilter}
        onChange={setListFilter}
        printTitle={printTitle}
        placeholder="กรองเลขครุภัณฑ์ ชื่อ ที่ตั้ง ผู้ตรวจ หมายเหตุ สรุปผล…"
        trailing={
          <>
            <div className="inline-flex h-8 items-center gap-1 rounded-xl border border-[#dcd8f0] bg-white px-1.5 shadow-sm sm:h-9">
              <PickableDateInput
                type="month"
                className="h-7 min-w-[8rem] border-0 bg-transparent px-1 text-[11px] font-bold text-[#2e2a58] sm:text-xs"
                value={monthYm}
                onChange={setMonth}
              />
            </div>
            <button type="button" className={toolbarLinkBtnClass} onClick={() => setMonth(currentMonthYm())}>
              เดือนนี้
            </button>
            <Link
              to={`/assets/armor-monthly?month=${encodeURIComponent(monthYm)}`}
              className={toolbarLinkBtnClass}
            >
              ไปตารางตรวจ
            </Link>
          </>
        }
      />

      {err ? <p className="text-sm text-rose-600 print:hidden">{err}</p> : null}

      {loading ? (
        <p className="text-slate-700 print:hidden">กำลังโหลด…</p>
      ) : data ? (
        <>
          <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-700 print:border-gray-400 print:bg-white print:text-black">
            <p>
              <span className="font-medium text-[#1e1b3a] print:text-black">เดือน {data.monthYm}:</span> ตรวจแล้ว{" "}
              <span className="tabular-nums text-violet-700 print:text-black">{data.inspectedCount}</span> รายการ จากทั้งหมด{" "}
              <span className="tabular-nums">{data.totalAssets}</span> รายการ
              {data.totalAssets > data.inspectedCount ? (
                <span className="text-slate-700 print:text-gray-600">
                  {" "}
                  (ยังไม่บันทึก {data.totalAssets - data.inspectedCount} รายการ)
                </span>
              ) : null}
            </p>
            <p className="mt-1">
              <span className="text-slate-700 print:text-gray-800">แถวที่มีหัวข้อ «ผิดปกติ» อย่างน้อยหนึ่งข้อ:</span>{" "}
              <span className="font-medium text-rose-700 print:text-black">{data.abnormalRowsCount}</span> รายการ
            </p>
            {listFilter.trim() ? (
              <p className="mt-1 text-slate-600 print:text-gray-800">
                หลังกรองแสดง <span className="font-medium text-violet-700 print:text-black">{filteredRows.length}</span> รายการ
              </p>
            ) : null}
          </div>

          {data.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white/90/30 px-4 py-8 text-center text-sm text-slate-600 print:hidden">
              ยังไม่มีรายการเสื้อเกราะในระบบ
            </p>
          ) : filteredRows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-amber-900/40 bg-amber-950/10 px-4 py-8 text-center text-sm text-amber-800 print:hidden">
              ไม่มีรายการตรงกับการกรอง
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 print:border-gray-400">
              <table className="w-full min-w-[48rem] border-collapse text-left text-xs print:text-black sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100/80 print:border-gray-400 print:bg-gray-100">
                    <th className="px-2 py-2 font-medium text-slate-800 print:text-black">#</th>
                    <th className="px-2 py-2 font-medium text-slate-800 print:text-black">เลขครุภัณฑ์</th>
                    <th className="px-2 py-2 font-medium text-slate-800 print:text-black">ชื่อ</th>
                    {ARMOR_MONTHLY_TOPICS.map((t) => (
                      <th key={t.key} className="max-w-[4.5rem] px-1 py-2 text-center text-[10px] font-medium leading-tight text-slate-800 print:text-black sm:text-xs">
                        {t.title}
                      </th>
                    ))}
                    <th className="px-2 py-2 font-medium text-slate-800 print:text-black">ผู้ตรวจ</th>
                    <th className="px-2 py-2 font-medium text-slate-800 print:text-black">สรุป</th>
                    <th className="min-w-[6rem] px-2 py-2 font-medium text-slate-800 print:text-black">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, idx) => {
                    const i = row.inspection;
                    return (
                      <tr
                        key={row.asset.id}
                        className={`border-b border-slate-200 print:border-gray-300 ${
                          idx % 2 === 0 ? "bg-white/90/20 print:bg-white" : "bg-violet-950/10 print:bg-gray-50"
                        }`}
                      >
                        <td className="px-2 py-2 tabular-nums text-slate-700 print:text-gray-700">{idx + 1}</td>
                        <td className="px-2 py-2 font-mono text-[#4d47b6] print:text-black">{row.asset.serialNumber}</td>
                        <td className="px-2 py-2 text-slate-700 print:text-black">{row.asset.itemName}</td>
                        {ARMOR_MONTHLY_TOPICS.map((t) => (
                          <td key={t.key} className="px-1 py-2 text-center tabular-nums text-slate-700 print:text-black">
                            {armorCheckSymbol(i ? i[t.key] : null)}
                          </td>
                        ))}
                        <td className="px-2 py-2 text-slate-700 print:text-black">{i?.inspectorName?.trim() || "—"}</td>
                        <td className="px-2 py-2 text-slate-800 print:text-black">{armorInspectionSummaryTh(i)}</td>
                        <td className="px-2 py-2 whitespace-pre-wrap text-slate-700 print:text-gray-800">
                          {i?.remarks?.trim() || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-slate-600 print:text-gray-700">
            สัญลักษณ์: ป = ปกติ, ผ = ผิดปกติ, — = ยังไม่กรอก
          </p>
        </>
      ) : null}
    </div>
  );
}

export function ReportPage() {
  const { slug } = useParams();
  const meta = REPORT_TYPES.find((r) => r.slug === slug);
  const title = meta?.label ?? "รายงาน";
  const [listFilter, setListFilter] = useState("");

  const contentVisible = useMemo(
    () => rowMatchesFilter(listFilter, [title, slug ?? ""]),
    [listFilter, title, slug],
  );

  const isWeeklyVehicleInspection = slug === "weekly";
  const isArmorMonthlyReport = slug === "monthly";

  return (
    <div>
      <PageHeaderBar
        title={title}
        filter={
          !isWeeklyVehicleInspection && !isArmorMonthlyReport
            ? {
                value: listFilter,
                onChange: setListFilter,
                printTitle: title,
                placeholder: "กรองตามชื่อหรือรหัสรายงาน…",
              }
            : {
                value: "",
                onChange: () => {},
                printTitle: title,
                showSearch: false,
              }
        }
        extras={<ReportsSubNav />}
      />

      {isWeeklyVehicleInspection ? (
        <div className="mt-4">
          <WeeklyInspectionReportView reportTitle={title} />
        </div>
      ) : isArmorMonthlyReport ? (
        <div className="mt-4">
          <ArmorMonthlyReportView reportTitle={title} />
        </div>
      ) : (
        <div className="mt-5 rounded-[1.5rem] border border-[#e8e6fc]/90 bg-gradient-to-br from-white/85 via-[#f5f3ff]/60 to-[#fdf2f8]/50 p-5 shadow-[0_16px_40px_-28px_rgba(30,27,75,0.28)] sm:p-6">
            {contentVisible ? (
              <p className="text-sm text-slate-600">หน้านี้พร้อมเชื่อมข้อมูลรายงานในลำดับถัดไป</p>
            ) : (
              <p className="text-sm text-slate-500">ไม่มีเนื้อหาที่ตรงกับการกรอง</p>
            )}
          </div>
      )}
    </div>
  );
}
