import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFormJson, apiJson } from "../api/client";
import { CommaNumberInput } from "../components/CommaNumberInput";
import { CrudNameMasterModal } from "../components/CrudNameMasterModal";
import { DateTimeField } from "../components/DateTimeField";
import { MissionSummaryModal } from "../components/MissionSummaryModal";
import { Modal, ModalFormActions, ModalFormBody } from "../components/Modal";
import { ModuleDocumentsModal } from "../components/ModuleDocumentsModal";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { MissionsSubNav } from "../components/MissionsSubNav";
import { PrintA4Table } from "../components/PrintA4Table";
import { SearchableSelect, personnelSelectLabel } from "../components/SearchableSelect";
import { parseLooseNumber } from "../lib/formatNumber";
import { MODULE_DOCUMENT_CATEGORIES } from "../lib/moduleDocumentCategories";
import { listCardAccentClass, listCardClass, brandGradientFillClass, toolbarLinkBtnClass, toolbarMasterBtnClass, toolbarMasterGroupClass, toolbarPrimaryBtnClass } from "../lib/uiTokens";
import { rowMatchesFilter } from "../lib/searchNormalize";
import type {
  MissionDetail,
  MissionListItem,
  MissionStatus,
  MissionSummary,
  NameMasterRow,
  Personnel,
  RouteMaster,
  Vehicle,
} from "../types";
import { vehicleDisplayLabel } from "../types";

type PRow = { personnelId: string; personnelRoleId: string; compensationRate: string };
type MissionVehicleFuelTypeUi = "" | "GASOLINE" | "DIESEL";

type VRow = {
  vehicleId: string;
  vehicleRoleId: string;
  fuelLiters: string;
  fuelType: MissionVehicleFuelTypeUi;
};
type DRow = { address: string; cargoValue: string; containerCount: number };
type ERow = { expenseTypeId: string; amount: string };

/** รวมแถวค่าตอบแทนเป็นหนึ่งแถว อัปเดตยอดจาก sum */
function mergeCompensationExpenseRows(rows: ERow[], compensationTypeId: string, sum: number): ERow[] {
  const amt = String(sum);
  const next: ERow[] = [];
  let compensationKept = false;
  for (const r of rows) {
    if (r.expenseTypeId === compensationTypeId) {
      if (!compensationKept) {
        next.push({ ...r, amount: amt });
        compensationKept = true;
      }
    } else {
      next.push(r);
    }
  }
  if (!compensationKept) next.push({ expenseTypeId: compensationTypeId, amount: amt });
  return next;
}

function isoToLocalDatetimeValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatMissionListDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

/** ปี พ.ศ. ของภารกิจ — จากวันที่วางแผน หรือรหัส TRIP-2566-xx */
function missionYearBe(m: MissionListItem): number | null {
  const fromCode = m.code?.match(/TRIP-(\d{4})(?:-|$)/i);
  if (fromCode) {
    const y = Number(fromCode[1]);
    if (Number.isFinite(y) && y >= 2400) return y;
  }
  for (const iso of [m.plannedStart, m.plannedEnd]) {
    if (!iso) continue;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d.getFullYear() + 543;
  }
  return null;
}

const missionStatusLabel: Record<MissionStatus, string> = {
  DRAFT: "แบบร่าง",
  PLANNED: "วางแผน",
  IN_PROGRESS: "กำลังทำ",
  COMPLETED: "เสร็จแล้ว",
  CANCELLED: "ยกเลิก",
};

const missionStatusChip: Record<MissionStatus, string> = {
  DRAFT: "bg-slate-500/15 text-slate-700",
  PLANNED: "bg-[#0000BF]/12 text-[#4d47b6]",
  IN_PROGRESS: "bg-amber-500/15 text-amber-800",
  COMPLETED: "bg-emerald-500/15 text-emerald-700",
  CANCELLED: "bg-rose-500/15 text-rose-700",
};

export function MissionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [missions, setMissions] = useState<MissionListItem[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<RouteMaster[]>([]);
  const [personnelRoleMasters, setPersonnelRoleMasters] = useState<NameMasterRow[]>([]);
  const [vehicleRoleMasters, setVehicleRoleMasters] = useState<NameMasterRow[]>([]);
  const [expenseTypeMasters, setExpenseTypeMasters] = useState<NameMasterRow[]>([]);

  const [step, setStep] = useState(0);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [crudPersonnelRoleOpen, setCrudPersonnelRoleOpen] = useState(false);
  const [crudVehicleRoleOpen, setCrudVehicleRoleOpen] = useState(false);
  const [crudExpenseTypeOpen, setCrudExpenseTypeOpen] = useState(false);
  const [summaryId, setSummaryId] = useState<string | null>(null);
  const [summary, setSummary] = useState<MissionSummary | null>(null);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [missionStatus, setMissionStatus] = useState<MissionStatus>("PLANNED");

  const [title, setTitle] = useState("");
  const [routeId, setRouteId] = useState("");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");

  const [pRows, setPRows] = useState<PRow[]>([{ personnelId: "", personnelRoleId: "", compensationRate: "0" }]);
  const [vRows, setVRows] = useState<VRow[]>([
    { vehicleId: "", vehicleRoleId: "", fuelLiters: "", fuelType: "" },
  ]);
  const [dRows, setDRows] = useState<DRow[]>([{ address: "", cargoValue: "0", containerCount: 1 }]);
  const [eRows, setERows] = useState<ERow[]>([{ expenseTypeId: "", amount: "0" }]);
  const [listFilter, setListFilter] = useState("");
  /** ค่าเริ่มต้น = ปี พ.ศ. ปัจจุบัน (ไม่ใช่ทุกปี) */
  const [yearFilter, setYearFilter] = useState<number | null>(() => new Date().getFullYear() + 543);
  const [summaryAttachUploading, setSummaryAttachUploading] = useState(false);
  const [savingMission, setSavingMission] = useState(false);
  const [saveFlash, setSaveFlash] = useState<string | null>(null);
  /** ใช้ ref กันช่วงที่ state summaryId ยังไม่ตรงกับโมดัล (อัปโหลดเงียบๆ ไม่ยิง API) */
  const summaryMissionIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const [m, p, v, r, pr, vr, et] = await Promise.all([
      apiJson<MissionListItem[]>("/api/missions"),
      apiJson<Personnel[]>("/api/personnel"),
      apiJson<Vehicle[]>("/api/vehicles"),
      apiJson<RouteMaster[]>("/api/route-master"),
      apiJson<NameMasterRow[]>("/api/mission-personnel-roles"),
      apiJson<NameMasterRow[]>("/api/mission-vehicle-roles"),
      apiJson<NameMasterRow[]>("/api/mission-expense-types"),
    ]);
    setMissions(m);
    setPersonnel(p);
    setVehicles(v);
    setRoutes(r);
    setPersonnelRoleMasters(pr);
    setVehicleRoleMasters(vr);
    setExpenseTypeMasters(et);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** ประเภทค่าใช้จ่ายที่ชื่อมี "ค่าตอบแทน" — ยอดรวมจากอัตราบุคลากร */
  const compensationExpenseTypeId = useMemo(
    () => expenseTypeMasters.find((m) => m.name.includes("ค่าตอบแทน"))?.id,
    [expenseTypeMasters],
  );

  const compensationSumFromPersonnel = useMemo(
    () =>
      pRows
        .filter((r) => r.personnelId)
        .reduce((s, r) => s + (parseLooseNumber(r.compensationRate) || 0), 0),
    [pRows],
  );

  const routeSearchOptions = useMemo(
    () =>
      routes.map((r) => ({
        value: r.id,
        label: `${r.name ?? `${r.startLocation} → ${r.endLocation}`} (${String(r.distanceKm)} km)`,
        keywords: `${r.startLocation ?? ""} ${r.endLocation ?? ""} ${r.name ?? ""}`,
      })),
    [routes],
  );

  const personnelSearchOptions = useMemo(
    () =>
      personnel.map((p) => ({
        value: p.id,
        label: personnelSelectLabel(p),
        keywords: `${p.position ?? ""} ${p.phone ?? ""} ${p.idNumber ?? ""}`,
      })),
    [personnel],
  );

  const vehicleSearchOptions = useMemo(
    () =>
      vehicles.map((v) => ({
        value: v.id,
        label: `${v.licensePlate} — ${vehicleDisplayLabel(v)}`,
        keywords: `${v.brand ?? ""} ${v.model ?? ""} ${v.licensePlate} ${v.brandModel ?? ""}`,
      })),
    [vehicles],
  );

  useEffect(() => {
    if (!createModalOpen || !compensationExpenseTypeId) return;
    setERows((prev) => mergeCompensationExpenseRows(prev, compensationExpenseTypeId, compensationSumFromPersonnel));
  }, [createModalOpen, compensationExpenseTypeId, compensationSumFromPersonnel]);

  async function openSummary(id: string) {
    summaryMissionIdRef.current = id;
    setSummaryId(id);
    try {
      const s = await apiJson<MissionSummary>(`/api/missions/${id}/summary`);
      setSummary(s);
    } catch (e) {
      summaryMissionIdRef.current = null;
      setSummaryId(null);
      setSummary(null);
      alert(e instanceof Error ? e.message : "โหลดสรุปภารกิจไม่สำเร็จ");
    }
  }

  useEffect(() => {
    const sid = searchParams.get("summary");
    if (!sid) return;
    void openSummary(sid).then(() => {
      const next = new URLSearchParams(searchParams);
      next.delete("summary");
      setSearchParams(next, { replace: true });
    });
    // เปิดจากลิงก์บุคลากรครั้งเดียวเมื่อมี ?summary=
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reloadMissionSummary() {
    const mid = summaryMissionIdRef.current;
    if (!mid) return;
    const s = await apiJson<MissionSummary>(`/api/missions/${mid}/summary`);
    setSummary(s);
  }

  async function uploadMissionSummaryFiles(files: File[]) {
    const mid = summaryMissionIdRef.current;
    if (!files.length) return;
    if (!mid) {
      alert("ไม่พบรหัสภารกิจ — ปิดหน้าต่างแล้วเปิด «สรุปภารกิจ» อีกครั้ง");
      return;
    }
    setSummaryAttachUploading(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      await apiFormJson(`/api/missions/${mid}/attachments`, fd);
      await reloadMissionSummary();
    } catch (e) {
      alert(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setSummaryAttachUploading(false);
    }
  }

  async function deleteMissionSummaryAttachment(attachmentId: string) {
    const mid = summaryMissionIdRef.current;
    if (!mid || !confirm("ลบไฟล์นี้?")) return;
    try {
      await apiJson(`/api/missions/${mid}/attachments/${attachmentId}`, { method: "DELETE" });
      await reloadMissionSummary();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  const resetForm = useCallback(() => {
    setStep(0);
    setTitle("");
    setRouteId("");
    setPlannedStart("");
    setPlannedEnd("");
    setMissionStatus("PLANNED");
    setEditingMissionId(null);
    setSaveFlash(null);
    setPRows([{ personnelId: "", personnelRoleId: personnelRoleMasters[0]?.id ?? "", compensationRate: "0" }]);
    setVRows([
      { vehicleId: "", vehicleRoleId: vehicleRoleMasters[0]?.id ?? "", fuelLiters: "", fuelType: "" },
    ]);
    setDRows([{ address: "", cargoValue: "0", containerCount: 1 }]);
    setERows([{ expenseTypeId: expenseTypeMasters[0]?.id ?? "", amount: "0" }]);
  }, [personnelRoleMasters, vehicleRoleMasters, expenseTypeMasters]);

  const closeCreateModal = useCallback(() => {
    setCreateModalOpen(false);
    setEditingMissionId(null);
    setMissionStatus("PLANNED");
    setSaveFlash(null);
  }, []);

  const openCreateNew = useCallback(() => {
    resetForm();
    setCreateModalOpen(true);
  }, [resetForm]);

  /** โหมด duplicate = สร้างภารกิจใหม่จากข้อมูลเดิม (ไม่ตั้ง editingMissionId — รหัสใหม่ตอนบันทึก) */
  const applyMissionDetailToForm = useCallback(
    (mission: MissionDetail, mode: "edit" | "duplicate") => {
      if (mode === "edit") {
        setEditingMissionId(mission.id);
        setMissionStatus(mission.status);
        setTitle(mission.title ?? "");
      } else {
        setEditingMissionId(null);
        setMissionStatus("PLANNED");
        const base = (mission.title ?? "").trim();
        if (base) setTitle(`${base} (สำเนา)`);
        else if (mission.code) setTitle(`สำเนา ${mission.code}`);
        else setTitle("สำเนาภารกิจ");
      }
      setStep(0);
      setRouteId(mission.routeId ?? "");
      setPlannedStart(isoToLocalDatetimeValue(mission.plannedStart));
      setPlannedEnd(isoToLocalDatetimeValue(mission.plannedEnd));
      const sortedDest = [...mission.destinations]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .filter((d) => d.address.trim());
      const personRows = mission.personnel.filter((p) => p.personnelId && p.personnelRoleId);
      const vehicleRows = mission.vehicles.filter((v) => v.vehicleId && v.vehicleRoleId);
      const expenseRows = mission.expenses.filter((e) => {
        if (!e.expenseTypeId) return false;
        const n = parseLooseNumber(e.amount);
        return Number.isFinite(n) && n > 0;
      });
      setPRows(
        personRows.length
          ? personRows.map((p) => ({
              personnelId: p.personnelId,
              personnelRoleId: p.personnelRoleId,
              compensationRate: String(p.compensationRate ?? "0"),
            }))
          : [{ personnelId: "", personnelRoleId: personnelRoleMasters[0]?.id ?? "", compensationRate: "0" }],
      );
      setVRows(
        vehicleRows.length
          ? vehicleRows.map((v) => ({
              vehicleId: v.vehicleId,
              vehicleRoleId: v.vehicleRoleId,
              fuelLiters: v.fuelLiters != null && v.fuelLiters !== "" ? String(v.fuelLiters) : "",
              fuelType: (v.fuelType === "GASOLINE" || v.fuelType === "DIESEL" ? v.fuelType : "") as MissionVehicleFuelTypeUi,
            }))
          : [
              {
                vehicleId: "",
                vehicleRoleId: vehicleRoleMasters[0]?.id ?? "",
                fuelLiters: "",
                fuelType: "",
              },
            ],
      );
      setDRows(
        sortedDest.length
          ? sortedDest.map((d) => ({
              address: d.address,
              cargoValue: String(d.cargoValue ?? "0"),
              containerCount: d.containerCount ?? 0,
            }))
          : [{ address: "", cargoValue: "0", containerCount: 1 }],
      );
      setERows(
        expenseRows.length
          ? expenseRows.map((e) => ({
              expenseTypeId: e.expenseTypeId,
              amount: String(e.amount ?? "0"),
            }))
          : [{ expenseTypeId: expenseTypeMasters[0]?.id ?? "", amount: "0" }],
      );
    },
    [expenseTypeMasters, personnelRoleMasters, vehicleRoleMasters],
  );

  const openEditMission = useCallback(
    async (id: string) => {
      try {
        const mission = await apiJson<MissionDetail>(`/api/missions/${id}`);
        applyMissionDetailToForm(mission, "edit");
        setCreateModalOpen(true);
      } catch (e) {
        alert(e instanceof Error ? e.message : "โหลดภารกิจไม่สำเร็จ");
      }
    },
    [applyMissionDetailToForm],
  );

  const openDuplicateMissionForm = useCallback(
    async (m: MissionListItem) => {
      try {
        const mission = await apiJson<MissionDetail>(`/api/missions/${m.id}`);
        applyMissionDetailToForm(mission, "duplicate");
        setCreateModalOpen(true);
      } catch (e) {
        alert(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
      }
    },
    [applyMissionDetailToForm],
  );

  async function deleteMission(id: string, label: string) {
    if (!confirm(`ลบภารกิจ "${label}" ?`)) return;
    try {
      await apiJson(`/api/missions/${id}`, { method: "DELETE" });
      if (summaryId === id) {
        summaryMissionIdRef.current = null;
        setSummaryId(null);
        setSummary(null);
      }
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  async function submitMission(opts?: { close?: boolean; requireComplete?: boolean }) {
    const close = opts?.close ?? true;
    const requireComplete = opts?.requireComplete ?? true;

    const personnelPayload = pRows.filter((r) => r.personnelId && r.personnelRoleId);
    const vehiclesPayload = vRows.filter((r) => r.vehicleId && r.vehicleRoleId);
    const destPayload = dRows.filter((r) => r.address.trim());
    const expPayload = eRows.filter((r) => r.expenseTypeId && r.amount !== "" && Number(r.amount) >= 0);

    if (!personnelRoleMasters.length || !vehicleRoleMasters.length || !expenseTypeMasters.length) {
      alert("กำลังโหลดรายการบทบาท/ประเภทค่าใช้จ่าย — รอสักครู่แล้วลองอีกครั้ง");
      return;
    }
    if (requireComplete) {
      if (!personnelPayload.length) {
        alert("เพิ่มบุคลากรอย่างน้อย 1 คน และเลือกบทบาท");
        return;
      }
      if (!vehiclesPayload.length) {
        alert("เพิ่มยานพาหนะอย่างน้อย 1 คัน และเลือกบทบาทรถ");
        return;
      }
      if (!destPayload.length) {
        alert("เพิ่มจุดส่งอย่างน้อย 1 แห่ง");
        return;
      }
    }

    const nextStatus: MissionStatus = requireComplete
      ? !editingMissionId || missionStatus === "DRAFT"
        ? "PLANNED"
        : missionStatus
      : editingMissionId
        ? missionStatus
        : "DRAFT";

    const body = {
      title: title.trim() || null,
      status: nextStatus,
      routeId: routeId || null,
      plannedStart: plannedStart || null,
      plannedEnd: plannedEnd || null,
      personnel: personnelPayload.map((r) => ({
        personnelId: r.personnelId,
        personnelRoleId: r.personnelRoleId,
        compensationRate: r.compensationRate === "" ? 0 : Number(r.compensationRate) || 0,
      })),
      vehicles: vehiclesPayload.map((r) => ({
        vehicleId: r.vehicleId,
        vehicleRoleId: r.vehicleRoleId,
        fuelLiters: r.fuelLiters.trim() === "" ? null : r.fuelLiters,
        fuelType: r.fuelType === "" ? null : r.fuelType,
      })),
      destinations: destPayload.map((d, i) => ({
        address: d.address,
        cargoValue: d.cargoValue,
        containerCount: d.containerCount,
        sortOrder: i,
      })),
      expenses: expPayload,
    };

    setSavingMission(true);
    setSaveFlash(null);
    try {
      if (editingMissionId) {
        await apiJson(`/api/missions/${editingMissionId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        setMissionStatus(nextStatus);
      } else {
        const created = await apiJson<MissionDetail>("/api/missions", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setEditingMissionId(created.id);
        setMissionStatus(created.status ?? nextStatus);
      }
      await load();
      if (close) {
        resetForm();
        setCreateModalOpen(false);
      } else {
        setSaveFlash("บันทึกแล้ว");
        window.setTimeout(() => setSaveFlash(null), 2500);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSavingMission(false);
    }
  }

  const steps = ["ข้อมูลทั่วไป", "บุคลากร", "ยานพาหนะ", "จุดส่ง & สินค้า", "ค่าใช้จ่าย"];

  const missionYears = useMemo(() => {
    const set = new Set<number>();
    set.add(new Date().getFullYear() + 543);
    for (const m of missions) {
      const y = missionYearBe(m);
      if (y != null) set.add(y);
    }
    return [...set].sort((a, b) => b - a);
  }, [missions]);

  const filteredMissions = useMemo(
    () =>
      missions.filter((m) => {
        if (yearFilter != null && missionYearBe(m) !== yearFilter) return false;
        return rowMatchesFilter(listFilter, [
          m.title,
          m.code,
          m.status,
          formatMissionListDateTime(m.plannedStart),
          formatMissionListDateTime(m.plannedEnd),
          m.route?.startLocation,
          m.route?.endLocation,
          m.route?.name,
          missionYearBe(m)?.toString(),
        ]);
      }),
    [missions, listFilter, yearFilter],
  );

  return (
    <div>
      <PageHeaderBar
        title="ภารกิจ"
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "ภารกิจ",
          placeholder: "กรองชื่อ / รหัส / สถานะ / เวลา / เส้นทาง…",
        }}
        segments={
          missionYears.length > 0 ? (
            <div className={toolbarMasterGroupClass}>
              <button
                type="button"
                onClick={() => setYearFilter(null)}
                className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[11px] font-black transition sm:h-9 sm:px-3 sm:text-xs ${
                  yearFilter == null
                    ? `${brandGradientFillClass} text-white shadow-md`
                    : toolbarMasterBtnClass
                }`}
              >
                ทุกปี
              </button>
              {missionYears.map((y) => {
                const active = yearFilter === y;
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setYearFilter(y)}
                    className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[11px] font-black transition sm:h-9 sm:px-3 sm:text-xs ${
                      active ? `${brandGradientFillClass} text-white shadow-md` : toolbarMasterBtnClass
                    }`}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
          ) : undefined
        }
        extras={
          <>
            <button type="button" className={toolbarLinkBtnClass} onClick={() => setDocsOpen(true)}>
              เอกสาร
            </button>
            <button type="button" onClick={() => void openCreateNew()} className={toolbarPrimaryBtnClass}>
              สร้างภารกิจ
            </button>
          </>
        }
        primary={<MissionsSubNav />}
      />

      <Modal
        open={createModalOpen}
        onClose={closeCreateModal}
        title={editingMissionId ? "แก้ไขภารกิจ" : "สร้างภารกิจ"}
        size="wide"
      >
        <ModalFormBody>
          <div className="rounded-xl border border-slate-200 bg-white/80 p-4 sm:p-5">
            <div className="mb-6 flex flex-wrap gap-2">
              {steps.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setStep(i)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    step === i ? "bg-[#0000BF] text-white" : "bg-slate-100 text-slate-700 hover:text-[#2e2a58]"
                  }`}
                >
                  {i + 1}. {label}
                </button>
              ))}
            </div>

            {step === 0 && (
              <div className="grid w-full gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">ชื่อภารกิจ</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="เช่น ขนส่งเงิน สาขา A"
                  />
                </label>

                <div className="sm:col-span-2 rounded-lg border border-[#0000BF]/25 bg-[#0000BF]/8 px-3 py-2.5">
                  <p className="text-xs font-medium text-[#4d47b6]">รหัสภารกิจ</p>
                  <p className="mt-1 text-sm text-slate-600">
                    สร้างอัตโนมัติเมื่อบันทึก · <span className="font-mono text-slate-700">M-YYYYMMDD-####</span>
                  </p>
                </div>

                <label className="sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">เส้นทางจาก Master</span>
                  <SearchableSelect
                    value={routeId}
                    onChange={setRouteId}
                    options={routeSearchOptions}
                    emptyLabel="— ไม่ระบุเส้นทาง —"
                    allowEmpty
                  />
                </label>

                <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
                  <DateTimeField
                    id="mission-planned-start"
                    label="วันเวลาเริ่มต้นตามแผน"
                    value={plannedStart}
                    onChange={setPlannedStart}
                  />
                  <DateTimeField
                    id="mission-planned-end"
                    label="วันเวลาสิ้นสุดตามแผน"
                    value={plannedEnd}
                    onChange={setPlannedEnd}
                  />
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-[#4d47b6] hover:bg-slate-100"
                    onClick={() => setCrudPersonnelRoleOpen(true)}
                  >
                    จัดการบทบาท…
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <div className="hidden min-w-[36rem] grid-cols-[minmax(0,1.4fr)_minmax(7rem,0.9fr)_5.5rem_2.5rem] gap-1.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 sm:grid">
                    <span>บุคลากร</span>
                    <span>บทบาท</span>
                    <span>ค่าตอบแทน</span>
                    <span className="sr-only">ลบ</span>
                  </div>
                  <ul className="min-w-[36rem] divide-y divide-slate-100">
                    {pRows.map((row, idx) => (
                      <li
                        key={idx}
                        className="grid grid-cols-[minmax(0,1.4fr)_minmax(7rem,0.9fr)_5.5rem_2.5rem] items-center gap-1.5 px-2 py-1"
                      >
                        <SearchableSelect
                          value={row.personnelId}
                          onChange={(v) => {
                            const next = [...pRows];
                            next[idx] = { ...row, personnelId: v };
                            setPRows(next);
                          }}
                          options={personnelSearchOptions}
                          emptyLabel="— เลือก —"
                          allowEmpty
                          aria-label={`บุคลากรแถว ${idx + 1}`}
                          inputClassName="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
                        />
                        <select
                          aria-label={`บทบาทแถว ${idx + 1}`}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
                          value={row.personnelRoleId}
                          onChange={(e) => {
                            const next = [...pRows];
                            next[idx] = { ...row, personnelRoleId: e.target.value };
                            setPRows(next);
                          }}
                        >
                          <option value="">—</option>
                          {personnelRoleMasters.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <CommaNumberInput
                          aria-label={`ค่าตอบแทนแถว ${idx + 1}`}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm tabular-nums text-slate-900"
                          value={row.compensationRate}
                          onChange={(raw) => {
                            const next = [...pRows];
                            next[idx] = { ...row, compensationRate: raw };
                            setPRows(next);
                          }}
                          placeholder="0"
                          maxFractionDigits={2}
                        />
                        <button
                          type="button"
                          className="rounded-md px-1 py-1 text-xs text-rose-600 hover:bg-rose-50"
                          aria-label={`ลบแถว ${idx + 1}`}
                          onClick={() => setPRows(pRows.filter((_, i) => i !== idx))}
                        >
                          ลบ
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  type="button"
                  className="text-xs font-medium text-[#5b61ff] hover:text-[#4d47b6] hover:underline"
                  onClick={() =>
                    setPRows([
                      ...pRows,
                      {
                        personnelId: "",
                        personnelRoleId: personnelRoleMasters[0]?.id ?? "",
                        compensationRate: "0",
                      },
                    ])
                  }
                >
                  + เพิ่มบุคลากร
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-[#4d47b6] hover:bg-slate-100"
                    onClick={() => setCrudVehicleRoleOpen(true)}
                  >
                    จัดการบทบาทรถ…
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <div className="hidden min-w-[42rem] grid-cols-[minmax(0,1.3fr)_minmax(6.5rem,0.8fr)_4.5rem_4.5rem_2.5rem] gap-1.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 sm:grid">
                    <span>ยานพาหนะ</span>
                    <span>บทบาท</span>
                    <span>ลิตร</span>
                    <span>ชนิด</span>
                    <span className="sr-only">ลบ</span>
                  </div>
                  <ul className="min-w-[42rem] divide-y divide-slate-100">
                    {vRows.map((row, idx) => (
                      <li
                        key={idx}
                        className="grid grid-cols-[minmax(0,1.3fr)_minmax(6.5rem,0.8fr)_4.5rem_4.5rem_2.5rem] items-center gap-1.5 px-2 py-1"
                      >
                        <SearchableSelect
                          value={row.vehicleId}
                          onChange={(v) => {
                            const next = [...vRows];
                            next[idx] = { ...row, vehicleId: v };
                            setVRows(next);
                          }}
                          options={vehicleSearchOptions}
                          emptyLabel="— เลือก —"
                          allowEmpty
                          aria-label={`ยานพาหนะแถว ${idx + 1}`}
                          inputClassName="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
                        />
                        <select
                          aria-label={`บทบาทรถแถว ${idx + 1}`}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
                          value={row.vehicleRoleId}
                          onChange={(e) => {
                            const next = [...vRows];
                            next[idx] = { ...row, vehicleRoleId: e.target.value };
                            setVRows(next);
                          }}
                        >
                          <option value="">—</option>
                          {vehicleRoleMasters.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <CommaNumberInput
                          aria-label={`ลิตรแถว ${idx + 1}`}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm tabular-nums text-slate-900"
                          value={row.fuelLiters}
                          placeholder="—"
                          maxFractionDigits={3}
                          onChange={(raw) => {
                            const next = [...vRows];
                            next[idx] = { ...row, fuelLiters: raw };
                            setVRows(next);
                          }}
                        />
                        <select
                          aria-label={`ชนิดน้ำมันแถว ${idx + 1}`}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
                          value={row.fuelType}
                          onChange={(e) => {
                            const next = [...vRows];
                            next[idx] = {
                              ...row,
                              fuelType: e.target.value as MissionVehicleFuelTypeUi,
                            };
                            setVRows(next);
                          }}
                        >
                          <option value="">—</option>
                          <option value="GASOLINE">เบนซิน</option>
                          <option value="DIESEL">ดีเซล</option>
                        </select>
                        <button
                          type="button"
                          className="rounded-md px-1 py-1 text-xs text-rose-600 hover:bg-rose-50"
                          aria-label={`ลบแถว ${idx + 1}`}
                          onClick={() => setVRows(vRows.filter((_, i) => i !== idx))}
                        >
                          ลบ
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  type="button"
                  className="text-xs font-medium text-[#5b61ff] hover:text-[#4d47b6] hover:underline"
                  onClick={() =>
                    setVRows([
                      ...vRows,
                      {
                        vehicleId: "",
                        vehicleRoleId: vehicleRoleMasters[0]?.id ?? "",
                        fuelLiters: "",
                        fuelType: "",
                      },
                    ])
                  }
                >
                  + เพิ่มยานพาหนะ
                </button>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-2">
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <div className="hidden min-w-[36rem] grid-cols-[minmax(0,1.2fr)_minmax(8rem,0.9fr)_4.5rem_2.5rem] gap-1.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 sm:grid">
                    <span>จุดส่ง</span>
                    <span>มูลค่า (บาท)</span>
                    <span>ตู้</span>
                    <span className="sr-only">ลบ</span>
                  </div>
                  <ul className="min-w-[36rem] divide-y divide-slate-100">
                    {dRows.map((row, idx) => (
                      <li
                        key={idx}
                        className="grid grid-cols-[minmax(0,1.2fr)_minmax(8rem,0.9fr)_4.5rem_2.5rem] items-center gap-1.5 px-2 py-1"
                      >
                        <input
                          aria-label={`จุดส่งแถว ${idx + 1}`}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
                          value={row.address}
                          onChange={(e) => {
                            const next = [...dRows];
                            next[idx] = { ...row, address: e.target.value };
                            setDRows(next);
                          }}
                          placeholder="เช่น ศนร."
                        />
                        <CommaNumberInput
                          aria-label={`มูลค่าแถว ${idx + 1}`}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm tabular-nums text-slate-900"
                          value={row.cargoValue}
                          maxFractionDigits={2}
                          onChange={(raw) => {
                            const next = [...dRows];
                            next[idx] = { ...row, cargoValue: raw };
                            setDRows(next);
                          }}
                        />
                        <CommaNumberInput
                          aria-label={`จำนวนตู้แถว ${idx + 1}`}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm tabular-nums text-slate-900"
                          value={String(row.containerCount || 0)}
                          maxFractionDigits={0}
                          onChange={(raw) => {
                            const next = [...dRows];
                            next[idx] = { ...row, containerCount: Number.parseInt(raw || "0", 10) || 0 };
                            setDRows(next);
                          }}
                        />
                        <button
                          type="button"
                          className="rounded-md px-1 py-1 text-xs text-rose-600 hover:bg-rose-50"
                          aria-label={`ลบแถว ${idx + 1}`}
                          onClick={() => setDRows(dRows.filter((_, i) => i !== idx))}
                        >
                          ลบ
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  type="button"
                  className="text-xs font-medium text-[#5b61ff] hover:text-[#4d47b6] hover:underline"
                  onClick={() => setDRows([...dRows, { address: "", cargoValue: "0", containerCount: 0 }])}
                >
                  + เพิ่มจุดส่ง
                </button>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-2">
                {compensationExpenseTypeId ? (
                  <p className="rounded-md border border-[#0000BF]/25 bg-[#0000BF]/8 px-2.5 py-1.5 text-[11px] text-[#2e2a58]">
                    หมวดที่ชื่อมี &quot;ค่าตอบแทน&quot; จะคำนวณยอดรวมจากอัตราค่าตอบแทนของบุคลากรโดยอัตโนมัติ
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-[#4d47b6] hover:bg-slate-100"
                    onClick={() => setCrudExpenseTypeOpen(true)}
                  >
                    จัดการประเภท…
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <div className="hidden min-w-[28rem] grid-cols-[minmax(0,1.4fr)_minmax(7rem,0.7fr)_2.5rem] gap-1.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 sm:grid">
                    <span>ประเภทค่าใช้จ่าย</span>
                    <span>จำนวนเงิน (บาท)</span>
                    <span className="sr-only">ลบ</span>
                  </div>
                  <ul className="min-w-[28rem] divide-y divide-slate-100">
                    {eRows.map((row, idx) => {
                      const isAutoComp =
                        Boolean(compensationExpenseTypeId) &&
                        row.expenseTypeId === compensationExpenseTypeId;
                      return (
                        <li
                          key={idx}
                          className="grid grid-cols-[minmax(0,1.4fr)_minmax(7rem,0.7fr)_2.5rem] items-center gap-1.5 px-2 py-1"
                        >
                          <select
                            aria-label={`ประเภทค่าใช้จ่ายแถว ${idx + 1}`}
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
                            value={row.expenseTypeId}
                            onChange={(e) => {
                              const next = [...eRows];
                              next[idx] = { ...row, expenseTypeId: e.target.value };
                              setERows(next);
                            }}
                          >
                            <option value="">—</option>
                            {expenseTypeMasters.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                                {compensationExpenseTypeId && t.id === compensationExpenseTypeId
                                  ? " (อัตโนมัติ)"
                                  : ""}
                              </option>
                            ))}
                          </select>
                          <CommaNumberInput
                            aria-label={`จำนวนเงินแถว ${idx + 1}`}
                            readOnly={isAutoComp}
                            title={isAutoComp ? "รวมจากอัตราค่าตอบแทนบุคลากร" : undefined}
                            className={`w-full rounded-md border px-2 py-1 text-sm tabular-nums text-slate-900 ${
                              isAutoComp
                                ? "cursor-not-allowed border-slate-200 bg-white/90 text-slate-700"
                                : "border-slate-200 bg-white"
                            }`}
                            value={row.amount}
                            maxFractionDigits={2}
                            onChange={
                              isAutoComp
                                ? () => undefined
                                : (raw) => {
                                    const next = [...eRows];
                                    next[idx] = { ...row, amount: raw };
                                    setERows(next);
                                  }
                            }
                          />
                          <button
                            type="button"
                            className="rounded-md px-1 py-1 text-xs text-rose-600 hover:bg-rose-50"
                            aria-label={`ลบแถว ${idx + 1}`}
                            onClick={() => setERows(eRows.filter((_, i) => i !== idx))}
                          >
                            ลบ
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <button
                  type="button"
                  className="text-xs font-medium text-[#5b61ff] hover:text-[#4d47b6] hover:underline"
                  onClick={() =>
                    setERows([
                      ...eRows,
                      { expenseTypeId: expenseTypeMasters[0]?.id ?? "", amount: "0" },
                    ])
                  }
                >
                  + เพิ่มรายการค่าใช้จ่าย
                </button>
              </div>
            )}
          </div>
          <ModalFormActions className="items-center justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {step > 0 && (
                <button
                  type="button"
                  disabled={savingMission}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  onClick={() => setStep(step - 1)}
                >
                  ย้อนกลับ
                </button>
              )}
              {saveFlash ? <span className="text-sm font-medium text-emerald-700">{saveFlash}</span> : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={savingMission}
                className="rounded-lg border border-[#0000BF]/30 bg-white px-4 py-2 text-sm font-semibold text-[#2e2a58] hover:bg-[#0000BF]/5 disabled:opacity-50"
                onClick={() => void submitMission({ close: false, requireComplete: false })}
              >
                {savingMission ? "กำลังบันทึก…" : "บันทึกข้อมูล"}
              </button>
              {step < steps.length - 1 ? (
                <button
                  type="button"
                  disabled={savingMission}
                  className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] px-4 py-2 disabled:opacity-50"
                  onClick={() => setStep(step + 1)}
                >
                  ถัดไป
                </button>
              ) : (
                <button
                  type="button"
                  disabled={savingMission}
                  className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] px-4 py-2 disabled:opacity-50"
                  onClick={() => void submitMission({ close: true, requireComplete: true })}
                >
                  {savingMission ? "กำลังบันทึก…" : editingMissionId ? "บันทึกและปิด" : "บันทึกภารกิจ"}
                </button>
              )}
            </div>
          </ModalFormActions>
        </ModalFormBody>
      </Modal>

      <CrudNameMasterModal
        title="บทบาทในภารกิจ (บุคลากร)"
        apiPath="/api/mission-personnel-roles"
        open={crudPersonnelRoleOpen}
        onClose={() => setCrudPersonnelRoleOpen(false)}
        onChanged={load}
      />
      <CrudNameMasterModal
        title="บทบาทรถ"
        apiPath="/api/mission-vehicle-roles"
        open={crudVehicleRoleOpen}
        onClose={() => setCrudVehicleRoleOpen(false)}
        onChanged={load}
      />
      <CrudNameMasterModal
        title="ประเภทค่าใช้จ่าย"
        apiPath="/api/mission-expense-types"
        open={crudExpenseTypeOpen}
        onClose={() => setCrudExpenseTypeOpen(false)}
        onChanged={load}
      />

      <div className="mt-6 print:hidden">
        {missions.length === 0 ? (
          <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">
            ยังไม่มีรายการ — กด «สร้างภารกิจ»
          </div>
        ) : filteredMissions.length === 0 ? (
          <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">
            ไม่มีรายการที่ตรงกับการกรอง
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredMissions.map((m, idx) => {
              const label = m.title ?? m.code ?? m.id.slice(0, 8);
              return (
                <li key={m.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => void openSummary(m.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void openSummary(m.id);
                      }
                    }}
                    className={`${listCardClass} cursor-pointer transition hover:border-[#0000BF]/35`}
                  >
                    <span className={`absolute inset-y-0 left-0 w-1 ${listCardAccentClass(idx)}`} aria-hidden />
                    <div className="min-w-0 flex-1 pl-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="line-clamp-2 text-sm font-bold text-[#1e1b4b]">{label}</p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${missionStatusChip[m.status]}`}
                        >
                          {missionStatusLabel[m.status]}
                        </span>
                      </div>
                      {m.code ? (
                        <p className="mt-1 font-mono text-[11px] text-[#66638c]">{m.code}</p>
                      ) : null}
                      <p className="mt-2 text-[11px] text-slate-600">
                        <span className="font-medium text-[#4d47b6]">ไป</span>{" "}
                        {formatMissionListDateTime(m.plannedStart)}
                        <span className="mx-1.5 text-slate-400">·</span>
                        <span className="font-medium text-[#ec4899]">กลับ</span>{" "}
                        {formatMissionListDateTime(m.plannedEnd)}
                      </p>
                      {m.route ? (
                        <p className="mt-1.5 truncate text-xs font-medium text-[#2e2a58]">
                          {m.route.startLocation}
                          <span className="mx-1 text-[#8b5cf6]">→</span>
                          {m.route.endLocation}
                        </p>
                      ) : null}
                      {typeof m._count.attachments === "number" && m._count.attachments > 0 ? (
                        <p className="mt-1 text-[10px] font-medium text-violet-600">
                          แนบไฟล์ {m._count.attachments} รายการ
                        </p>
                      ) : null}
                    </div>
                    <div
                      className="mt-3 flex flex-wrap gap-1.5 border-t border-[#ecebff] pt-2.5 pl-2"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        title="นำข้อมูลไปสร้างภารกิจใหม่"
                        className="rounded-lg border border-[#dcd8f0] bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-[#0000BF]/5"
                        onClick={() => void openDuplicateMissionForm(m)}
                      >
                        คัดลอก
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                        onClick={() => void openEditMission(m.id)}
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100"
                        onClick={() => void deleteMission(m.id, label)}
                      >
                        ลบ
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-[#0000BF]/20 bg-[#0000BF]/8 px-2.5 py-1 text-xs font-medium text-[#4d47b6] hover:bg-[#0000BF]/12"
                        onClick={() => void openSummary(m.id)}
                      >
                        สรุป
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <PrintA4Table
        columns={[
          { label: "ภารกิจ" },
          { label: "รหัส" },
          { label: "สถานะ" },
          { label: "ไป" },
          { label: "กลับ" },
          { label: "เส้นทาง" },
        ]}
        rows={filteredMissions.map((m) => [
          m.title ?? m.code ?? m.id.slice(0, 8),
          m.code || "—",
          missionStatusLabel[m.status],
          formatMissionListDateTime(m.plannedStart),
          formatMissionListDateTime(m.plannedEnd),
          m.route ? `${m.route.startLocation} → ${m.route.endLocation}` : "—",
        ])}
      />

      {summaryId && summary ? (
        <MissionSummaryModal
          summary={summary}
          attachUploading={summaryAttachUploading}
          onClose={() => {
            summaryMissionIdRef.current = null;
            setSummaryId(null);
            setSummary(null);
          }}
          onUploadFiles={(files) => void uploadMissionSummaryFiles(files)}
          onDeleteAttachment={(id) => void deleteMissionSummaryAttachment(id)}
        />
      ) : null}

      <ModuleDocumentsModal
        open={docsOpen}
        categoryName={MODULE_DOCUMENT_CATEGORIES.missions}
        onClose={() => setDocsOpen(false)}
      />
    </div>
  );
}
