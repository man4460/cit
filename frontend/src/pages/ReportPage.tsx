import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiJson } from "../api/client";
import { Modal, ModalFormActions, ModalFormBody } from "../components/Modal";
import { PageFilterPrintBar } from "../components/PageFilterPrintBar";
import { useAuth } from "../context/AuthContext";
import { currentUserLabel } from "../lib/currentUserLabel";
import { mondayOfWeekContaining } from "../lib/inspectionWeek";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { VEHICLE_WEEKLY_TOPICS, type VehicleWeeklyTopicKey } from "../lib/vehicleWeeklyTopics";
import { REPORT_TYPES } from "./reportsConfig";
import {
  vehicleDisplayLabel,
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
    <div className="flex flex-col gap-2 border-b border-slate-800 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-slate-200">{title}</p>
        {subtitle ? <p className="text-[11px] text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className={`${btn} border-slate-600 ${
            value === "NORMAL" ? "border-emerald-500 bg-emerald-900/40 text-emerald-200" : "text-slate-500 hover:bg-slate-800"
          }`}
          onClick={() => onPick(value === "NORMAL" ? null : "NORMAL")}
        >
          ปกติ{value === "NORMAL" ? " ✓" : ""}
        </button>
        <button
          type="button"
          className={`${btn} border-slate-600 ${
            value === "ABNORMAL" ? "border-rose-500 bg-rose-900/35 text-rose-200" : "text-slate-500 hover:bg-slate-800"
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
      />

      <div className="no-print flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="text-xs font-medium text-slate-500">สัปดาห์อ้างอิง</span>
          <input
            type="date"
            className="mt-1 block rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            value={weekStart}
            onChange={(e) => setWeek(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          onClick={() => setWeek(mondayOfWeekContaining(new Date()))}
        >
          สัปดาห์นี้
        </button>
        <Link
          to={`/vehicles/weekly-inspection?week=${encodeURIComponent(weekStart)}`}
          className="rounded-lg border border-emerald-800/60 px-3 py-2 text-sm text-emerald-300 hover:bg-slate-800"
        >
          ไปตารางตรวจ
        </Link>
      </div>

      {err ? <p className="text-sm text-rose-400 print:hidden">{err}</p> : null}

      {loading ? (
        <p className="text-slate-500 print:hidden">กำลังโหลด…</p>
      ) : data ? (
        <>
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm text-slate-300 print:border-gray-400 print:bg-white print:text-black">
            <p>
              <span className="font-medium text-white print:text-black">สัปดาห์นี้:</span> บันทึกแล้ว{" "}
              <span className="tabular-nums text-teal-300 print:text-black">{data.inspectedCount}</span> คัน จากทั้งหมด{" "}
              <span className="tabular-nums">{data.totalVehicles}</span> คัน
              {data.totalVehicles > data.inspectedCount ? (
                <span className="text-slate-500 print:text-gray-600">
                  {" "}
                  (ยังไม่บันทึก {data.totalVehicles - data.inspectedCount} คัน)
                </span>
              ) : null}
            </p>
            {listFilter.trim() ? (
              <p className="mt-1 text-slate-400 print:text-gray-800">
                หลังกรองแสดง <span className="font-medium text-teal-300 print:text-black">{filteredRows.length}</span>{" "}
                รายการ (พิมพ์จะเห็นเฉพาะรายการที่กรอง)
              </p>
            ) : null}
          </div>

          {data.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 px-4 py-8 text-center text-sm text-slate-500 print:hidden">
              ยังไม่มีรายการบันทึกการตรวจในสัปดาห์นี้ — ใช้เมนู «ตารางตรวจ» เพื่อบันทึก
            </p>
          ) : filteredRows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-amber-900/40 bg-amber-950/10 px-4 py-8 text-center text-sm text-amber-200/90 print:hidden">
              ไม่มีรายการตรงกับการกรอง
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-800 print:border-gray-400">
              <table className="w-full min-w-[56rem] border-collapse text-left text-sm print:text-black">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800/80 print:border-gray-400 print:bg-gray-100">
                    <th className="px-3 py-2 font-medium text-slate-200 print:text-black">#</th>
                    <th className="px-3 py-2 font-medium text-slate-200 print:text-black">ทะเบียน</th>
                    <th className="px-3 py-2 font-medium text-slate-200 print:text-black">ยี่ห้อ / รุ่น</th>
                    <th className="px-3 py-2 font-medium text-slate-200 print:text-black">ผู้ตรวจ</th>
                    <th className="px-3 py-2 font-medium text-slate-200 print:text-black">สรุปผลตรวจ</th>
                    <th className="min-w-[8rem] px-3 py-2 font-medium text-slate-200 print:text-black">หมายเหตุ</th>
                    <th className="no-print px-3 py-2 font-medium text-slate-200">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, idx) => (
                    <tr
                      key={row.id}
                      className={`border-b border-slate-800 print:border-gray-300 ${
                        idx % 2 === 0 ? "bg-slate-900/20 print:bg-white" : "bg-emerald-950/10 print:bg-gray-50"
                      }`}
                    >
                        <td className="px-3 py-2 tabular-nums text-slate-500 print:text-gray-700">{idx + 1}</td>
                        <td className="px-3 py-2 font-mono text-teal-300 print:text-black">{row.vehicle.licensePlate}</td>
                        <td className="px-3 py-2 text-slate-300 print:text-black">{vehicleDisplayLabel(row.vehicle)}</td>
                        <td className="px-3 py-2 text-slate-300 print:text-black">{row.inspectorName?.trim() || "—"}</td>
                        <td className="px-3 py-2 text-slate-200 print:text-black">{inspectionSummaryTh(row)}</td>
                        <td className="px-3 py-2 whitespace-pre-wrap text-slate-400 print:text-gray-800">
                          {row.remarks?.trim() || "—"}
                        </td>
                        <td className="no-print px-2 py-2">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              className="rounded border border-slate-600 px-2 py-1 text-[11px] text-teal-400 hover:bg-slate-800"
                              onClick={() => openEdit(row)}
                            >
                              แก้ไข
                            </button>
                            <button
                              type="button"
                              disabled={deletingId === row.id}
                              className="rounded border border-slate-600 px-2 py-1 text-[11px] text-rose-400 hover:bg-slate-800 disabled:opacity-50"
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
              <p className="text-sm text-slate-400">
                ทะเบียน{" "}
                <span className="font-mono text-teal-300">{editing.vehicle.licensePlate}</span>
                {" · "}
                {vehicleDisplayLabel(editing.vehicle)}
              </p>
              <p className="text-xs text-slate-600">สัปดาห์อ้างอิง {weekStart}</p>

              <label className="mt-4 block">
                <span className="text-xs font-medium text-slate-500">ผู้ตรวจ</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  value={editDraft.inspectorName}
                  onChange={(e) => setEditField("inspectorName", e.target.value)}
                  placeholder={defaultInspector || "ชื่อ-นามสกุล"}
                />
                {defaultInspector ? (
                  <button
                    type="button"
                    className="mt-1 text-xs text-teal-500 hover:underline"
                    onClick={() => setEditField("inspectorName", defaultInspector)}
                  >
                    ใช้ชื่อผู้ใช้ปัจจุบัน ({defaultInspector})
                  </button>
                ) : null}
              </label>

              <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950/50 px-3">
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
                <span className="text-xs font-medium text-slate-500">หมายเหตุ</span>
                <textarea
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  value={editDraft.remarks}
                  onChange={(e) => setEditField("remarks", e.target.value)}
                />
              </label>
            </ModalFormBody>
            <ModalFormActions>
              <button
                type="button"
                disabled={saving}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
                onClick={() => void saveEdit()}
              >
                {saving ? "กำลังบันทึก…" : "บันทึก"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
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

  return (
    <div>
      <p className="text-sm text-slate-500">
        <Link to="/reports" className="text-teal-500/90 hover:text-teal-400">
          ← รายงาน
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-white print:text-black">{title}</h1>
      {isWeeklyVehicleInspection ? (
        <p className="mt-1 text-sm text-slate-400 print:text-gray-700">
          กรองรายการได้จากช่องค้นหา — ปุ่มพิมพ์จะพิมพ์เฉพาะแถวที่ผ่านการกรอง แก้ไข/ลบบันทึกได้จากคอลัมน์จัดการ
        </p>
      ) : null}

      {isWeeklyVehicleInspection ? (
        <div className="mt-4">
          <WeeklyInspectionReportView reportTitle={title} />
        </div>
      ) : (
        <>
          <PageFilterPrintBar
            value={listFilter}
            onChange={setListFilter}
            printTitle={title}
            placeholder="กรองตามชื่อหรือรหัสรายงาน…"
          />
          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-lg shadow-black/20">
            {contentVisible ? (
              <p className="text-slate-400">หน้านี้พร้อมสำหรับเชื่อมข้อมูลหรือไฟล์รายงานในลำดับถัดไป</p>
            ) : (
              <p className="text-slate-500">ไม่มีเนื้อหาที่ตรงกับการกรองในหน้านี้</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
