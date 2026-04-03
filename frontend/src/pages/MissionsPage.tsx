import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiJson } from "../api/client";
import { CrudNameMasterModal } from "../components/CrudNameMasterModal";
import { DateTimeField } from "../components/DateTimeField";
import { Modal, ModalFormActions, ModalFormBody } from "../components/Modal";
import { PageFilterPrintBar } from "../components/PageFilterPrintBar";
import { SearchableSelect, personnelSelectLabel } from "../components/SearchableSelect";
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

export function MissionsPage() {
  const [missions, setMissions] = useState<MissionListItem[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<RouteMaster[]>([]);
  const [personnelRoleMasters, setPersonnelRoleMasters] = useState<NameMasterRow[]>([]);
  const [vehicleRoleMasters, setVehicleRoleMasters] = useState<NameMasterRow[]>([]);
  const [expenseTypeMasters, setExpenseTypeMasters] = useState<NameMasterRow[]>([]);

  const [step, setStep] = useState(0);
  const [createModalOpen, setCreateModalOpen] = useState(false);
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
        .reduce((s, r) => s + (Number.parseFloat(r.compensationRate) || 0), 0),
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
    setSummaryId(id);
    const s = await apiJson<MissionSummary>(`/api/missions/${id}/summary`);
    setSummary(s);
  }

  const resetForm = useCallback(() => {
    setStep(0);
    setTitle("");
    setRouteId("");
    setPlannedStart("");
    setPlannedEnd("");
    setMissionStatus("PLANNED");
    setEditingMissionId(null);
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
      const sortedDest = [...mission.destinations].sort((a, b) => a.sortOrder - b.sortOrder);
      setPRows(
        mission.personnel.length
          ? mission.personnel.map((p) => ({
              personnelId: p.personnelId,
              personnelRoleId: p.personnelRoleId,
              compensationRate: String(p.compensationRate ?? "0"),
            }))
          : [{ personnelId: "", personnelRoleId: personnelRoleMasters[0]?.id ?? "", compensationRate: "0" }],
      );
      setVRows(
        mission.vehicles.length
          ? mission.vehicles.map((v) => ({
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
        mission.expenses.length
          ? mission.expenses.map((e) => ({
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
        setSummaryId(null);
        setSummary(null);
      }
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  async function submitMission() {
    const personnelPayload = pRows.filter((r) => r.personnelId && r.personnelRoleId);
    const vehiclesPayload = vRows.filter((r) => r.vehicleId && r.vehicleRoleId);
    const destPayload = dRows.filter((r) => r.address.trim());
    const expPayload = eRows.filter((r) => r.expenseTypeId && r.amount !== "" && Number(r.amount) >= 0);

    if (!personnelRoleMasters.length || !vehicleRoleMasters.length || !expenseTypeMasters.length) {
      alert("กำลังโหลดรายการบทบาท/ประเภทค่าใช้จ่าย — รอสักครู่แล้วลองอีกครั้ง");
      return;
    }
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

    const body = {
      title: title.trim() || null,
      status: missionStatus,
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

    try {
      if (editingMissionId) {
        await apiJson(`/api/missions/${editingMissionId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      } else {
        await apiJson("/api/missions", {
          method: "POST",
          body: JSON.stringify({ ...body, status: "PLANNED" }),
        });
      }
      resetForm();
      setCreateModalOpen(false);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }

  const steps = ["ข้อมูลทั่วไป", "บุคลากร", "ยานพาหนะ", "จุดส่ง & สินค้า", "ค่าใช้จ่าย"];

  const filteredMissions = useMemo(
    () =>
      missions.filter((m) =>
        rowMatchesFilter(listFilter, [
          m.title,
          m.code,
          m.status,
          formatMissionListDateTime(m.plannedStart),
          formatMissionListDateTime(m.plannedEnd),
          m.route?.startLocation,
          m.route?.endLocation,
          m.route?.name,
        ]),
      ),
    [missions, listFilter],
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">ภารกิจ</h1>
          <p className="mt-1 text-slate-400">สร้างภารกิจแบบหลายขั้นตอน — สรุปค่าใช้จ่ายตามประเภทที่ตั้งค่าไว้</p>
        </div>
        <button
          type="button"
          onClick={() => void openCreateNew()}
          className="shrink-0 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/25 hover:bg-teal-500"
        >
          สร้างภารกิจ
        </button>
      </div>

      <PageFilterPrintBar
        value={listFilter}
        onChange={setListFilter}
        printTitle="ภารกิจ — รายการ"
        placeholder="กรองชื่อ / รหัส / สถานะ / เวลา / เส้นทาง…"
      />

      <Modal
        open={createModalOpen}
        onClose={closeCreateModal}
        title={editingMissionId ? "แก้ไขภารกิจ" : "สร้างภารกิจ"}
        size="wide"
      >
        <ModalFormBody>
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 sm:p-5">
            <div className="mb-6 flex flex-wrap gap-2">
              {steps.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setStep(i)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    step === i ? "bg-teal-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  {i + 1}. {label}
                </button>
              ))}
            </div>

            {step === 0 && (
              <div className="grid w-full gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="text-xs font-medium text-slate-300">ชื่อภารกิจ</span>
                  <p className="mt-0.5 text-[11px] text-slate-500">ชื่อเรียกภายในเพื่อจดจำ (ไม่บังคับ)</p>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="เช่น ขนส่งเงิน สาขา A"
                  />
                </label>

                <div className="sm:col-span-2 rounded-lg border border-teal-900/40 bg-teal-950/20 px-3 py-2.5">
                  <p className="text-xs font-medium text-teal-300">รหัสภารกิจ</p>
                  <p className="mt-1 text-sm text-slate-400">
                    ระบบสร้างให้อัตโนมัติเมื่อบันทึก (รูปแบบ{" "}
                    <span className="font-mono text-slate-300">M-YYYYMMDD-####</span>) ไม่ต้องกรอก
                  </p>
                </div>

                <label className="sm:col-span-2">
                  <span className="text-xs font-medium text-slate-300">เส้นทางจาก Master</span>
                  <p className="mt-0.5 text-[11px] text-slate-500">พิมพ์ค้นหาแล้วเลือกเส้นทางที่บันทึกไว้ (ถ้ามี)</p>
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
                    hint="กดที่ช่องเพื่อเลือกวันและเวลา (มีไอคอนปฏิทินด้านซ้าย)"
                    value={plannedStart}
                    onChange={setPlannedStart}
                  />
                  <DateTimeField
                    id="mission-planned-end"
                    label="วันเวลาสิ้นสุดตามแผน"
                    hint="ควรต่อจากเวลาเริ่ม หรือวันที่หลังเวลาเริ่ม"
                    value={plannedEnd}
                    onChange={setPlannedEnd}
                  />
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-slate-500">ระบุบุคลากรที่ปฏิบัติภารกิจและบทบาทในแต่ละแถว</p>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-teal-300 hover:bg-slate-800"
                    onClick={() => setCrudPersonnelRoleOpen(true)}
                  >
                    จัดการบทบาท…
                  </button>
                </div>
                {pRows.map((row, idx) => (
                  <div key={idx} className="flex flex-col gap-2 rounded-lg border border-slate-800/80 p-3 sm:flex-row sm:flex-wrap">
                    <label className="min-w-[200px] flex-1">
                      <span className="text-xs font-medium text-slate-300">บุคลากร</span>
                      <SearchableSelect
                        value={row.personnelId}
                        onChange={(v) => {
                          const next = [...pRows];
                          next[idx] = { ...row, personnelId: v };
                          setPRows(next);
                        }}
                        options={personnelSearchOptions}
                        emptyLabel="— เลือกบุคลากร —"
                        allowEmpty
                      />
                    </label>
                    <label className="sm:w-52">
                      <span className="text-xs font-medium text-slate-300">บทบาทในภารกิจ</span>
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                        value={row.personnelRoleId}
                        onChange={(e) => {
                          const next = [...pRows];
                          next[idx] = { ...row, personnelRoleId: e.target.value };
                          setPRows(next);
                        }}
                      >
                        <option value="">— เลือก —</option>
                        {personnelRoleMasters.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="sm:w-36">
                      <span className="text-xs font-medium text-slate-300">อัตราค่าตอบแทน (บาท)</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                        value={row.compensationRate}
                        onChange={(e) => {
                          const next = [...pRows];
                          next[idx] = { ...row, compensationRate: e.target.value };
                          setPRows(next);
                        }}
                        placeholder="0"
                      />
                    </label>
                    <div className="flex items-end">
                      <button
                        type="button"
                        className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                        onClick={() => setPRows(pRows.filter((_, i) => i !== idx))}
                      >
                        ลบแถว
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-sm font-medium text-teal-400 hover:text-teal-300 hover:underline"
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
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-slate-500">ระบุยานพาหนะและบทบาทรถ</p>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-teal-300 hover:bg-slate-800"
                    onClick={() => setCrudVehicleRoleOpen(true)}
                  >
                    จัดการบทบาทรถ…
                  </button>
                </div>
                {vRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="grid gap-3 rounded-lg border border-slate-800/80 p-3 sm:grid-cols-12 sm:items-end"
                  >
                    <label className="sm:col-span-4">
                      <span className="text-xs font-medium text-slate-300">ยานพาหนะ</span>
                      <SearchableSelect
                        value={row.vehicleId}
                        onChange={(v) => {
                          const next = [...vRows];
                          next[idx] = { ...row, vehicleId: v };
                          setVRows(next);
                        }}
                        options={vehicleSearchOptions}
                        emptyLabel="— เลือกทะเบียนรถ —"
                        allowEmpty
                      />
                    </label>
                    <label className="sm:col-span-3">
                      <span className="text-xs font-medium text-slate-300">บทบาทรถ</span>
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                        value={row.vehicleRoleId}
                        onChange={(e) => {
                          const next = [...vRows];
                          next[idx] = { ...row, vehicleRoleId: e.target.value };
                          setVRows(next);
                        }}
                      >
                        <option value="">— เลือก —</option>
                        {vehicleRoleMasters.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="sm:col-span-2">
                      <span className="text-xs font-medium text-slate-300">การใช้น้ำมัน (ลิตร)</span>
                      <input
                        type="number"
                        min={0}
                        step="0.001"
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 tabular-nums text-white"
                        value={row.fuelLiters}
                        placeholder="—"
                        onChange={(e) => {
                          const next = [...vRows];
                          next[idx] = { ...row, fuelLiters: e.target.value };
                          setVRows(next);
                        }}
                      />
                    </label>
                    <label className="sm:col-span-2">
                      <span className="text-xs font-medium text-slate-300">ชนิดน้ำมัน</span>
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
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
                    </label>
                    <div className="flex sm:col-span-1 sm:justify-end">
                      <button
                        type="button"
                        className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                        onClick={() => setVRows(vRows.filter((_, i) => i !== idx))}
                      >
                        ลบแถว
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-sm font-medium text-teal-400 hover:text-teal-300 hover:underline"
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
              <div className="space-y-4">
                <p className="text-sm text-slate-500">จุดส่งปลายทาง มูลค่าสินค้า และจำนวนตู้ต่อจุด</p>
                {dRows.map((row, idx) => (
                  <div key={idx} className="grid gap-3 rounded-lg border border-slate-800 p-3 sm:grid-cols-12">
                    <label className="sm:col-span-5">
                      <span className="text-xs font-medium text-slate-300">ที่อยู่ / จุดส่ง</span>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                        value={row.address}
                        onChange={(e) => {
                          const next = [...dRows];
                          next[idx] = { ...row, address: e.target.value };
                          setDRows(next);
                        }}
                        placeholder="บ้านเลขที่ ถนน อำเภอ…"
                      />
                    </label>
                    <label className="sm:col-span-3">
                      <span className="text-xs font-medium text-slate-300">มูลค่าสินค้า (บาท)</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                        value={row.cargoValue}
                        onChange={(e) => {
                          const next = [...dRows];
                          next[idx] = { ...row, cargoValue: e.target.value };
                          setDRows(next);
                        }}
                      />
                    </label>
                    <label className="sm:col-span-2">
                      <span className="text-xs font-medium text-slate-300">จำนวนตู้</span>
                      <input
                        type="number"
                        min={0}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                        value={row.containerCount}
                        onChange={(e) => {
                          const next = [...dRows];
                          next[idx] = { ...row, containerCount: Number(e.target.value) || 0 };
                          setDRows(next);
                        }}
                      />
                    </label>
                    <div className="flex items-end sm:col-span-2">
                      <button
                        type="button"
                        className="w-full rounded-lg bg-slate-800 py-2 text-sm text-slate-300 hover:bg-slate-700 sm:w-auto"
                        onClick={() => setDRows(dRows.filter((_, i) => i !== idx))}
                      >
                        ลบแถว
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-sm font-medium text-teal-400 hover:text-teal-300 hover:underline"
                  onClick={() => setDRows([...dRows, { address: "", cargoValue: "0", containerCount: 1 }])}
                >
                  + เพิ่มจุดส่ง
                </button>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                {compensationExpenseTypeId ? (
                  <p className="rounded-lg border border-teal-900/40 bg-teal-950/20 px-3 py-2 text-xs text-teal-200/90">
                    หมวดที่ชื่อมี &quot;ค่าตอบแทน&quot; จะคำนวณยอดรวมจากอัตราค่าตอบแทนของบุคลากร (ขั้นบุคลากร) โดยอัตโนมัติ
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-slate-500">ค่าใช้จ่ายโดยประมาณแยกประเภท (บาท)</p>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-teal-300 hover:bg-slate-800"
                    onClick={() => setCrudExpenseTypeOpen(true)}
                  >
                    จัดการประเภท…
                  </button>
                </div>
                {eRows.map((row, idx) => (
                  <div key={idx} className="flex flex-col gap-2 rounded-lg border border-slate-800/80 p-3 sm:flex-row sm:flex-wrap sm:items-end">
                    <label className="sm:min-w-[220px]">
                      <span className="text-xs font-medium text-slate-300">ประเภทค่าใช้จ่าย</span>
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                        value={row.expenseTypeId}
                        onChange={(e) => {
                          const next = [...eRows];
                          next[idx] = { ...row, expenseTypeId: e.target.value };
                          setERows(next);
                        }}
                      >
                        <option value="">— เลือก —</option>
                        {expenseTypeMasters.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex-1 sm:max-w-xs">
                      <span className="text-xs font-medium text-slate-300">
                        จำนวนเงิน (บาท)
                        {compensationExpenseTypeId && row.expenseTypeId === compensationExpenseTypeId ? (
                          <span className="ml-1 font-normal text-teal-400/90">(รวมอัตโนมัติ)</span>
                        ) : null}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        readOnly={
                          Boolean(compensationExpenseTypeId) && row.expenseTypeId === compensationExpenseTypeId
                        }
                        className={`mt-1 w-full rounded-lg border px-3 py-2 text-white ${
                          compensationExpenseTypeId && row.expenseTypeId === compensationExpenseTypeId
                            ? "cursor-not-allowed border-slate-600 bg-slate-900/80 text-slate-300"
                            : "border-slate-700 bg-slate-950"
                        }`}
                        value={row.amount}
                        onChange={
                          compensationExpenseTypeId && row.expenseTypeId === compensationExpenseTypeId
                            ? undefined
                            : (e) => {
                                const next = [...eRows];
                                next[idx] = { ...row, amount: e.target.value };
                                setERows(next);
                              }
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                      onClick={() => setERows(eRows.filter((_, i) => i !== idx))}
                    >
                      ลบแถว
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-sm font-medium text-teal-400 hover:text-teal-300 hover:underline"
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
          <ModalFormActions>
            {step > 0 && (
              <button
                type="button"
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                onClick={() => setStep(step - 1)}
              >
                ย้อนกลับ
              </button>
            )}
            {step < steps.length - 1 ? (
              <button
                type="button"
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500"
                onClick={() => setStep(step + 1)}
              >
                ถัดไป
              </button>
            ) : (
              <button
                type="button"
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500"
                onClick={() => void submitMission()}
              >
                {editingMissionId ? "บันทึกการแก้ไข" : "บันทึกภารกิจ"}
              </button>
            )}
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

      <h2 className="mt-10 text-lg font-semibold text-white">รายการภารกิจ</h2>
      <ul className="mt-4 space-y-2">
        {missions.length === 0 ? (
          <li className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-6 text-center text-slate-500">
            ยังไม่มีภารกิจ — กด «สร้างภารกิจ»
          </li>
        ) : filteredMissions.length === 0 ? (
          <li className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-6 text-center text-slate-500">
            ไม่มีรายการที่ตรงกับการกรอง
          </li>
        ) : (
          filteredMissions.map((m) => {
          const label = m.title ?? m.code ?? m.id.slice(0, 8);
          return (
            <li
              key={m.id}
              className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="font-medium text-white">{label}</span>
                    {m.code ? <span className="font-mono text-xs text-slate-500">{m.code}</span> : null}
                    <span className="text-xs text-slate-500">{m.status}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">
                    <span className="text-slate-500">เวลาไป:</span> {formatMissionListDateTime(m.plannedStart)}
                    <span className="mx-2 text-slate-600">|</span>
                    <span className="text-slate-500">เวลากลับ:</span> {formatMissionListDateTime(m.plannedEnd)}
                  </p>
                  {m.route ? (
                    <p className="mt-0.5 text-sm text-slate-400">
                      {m.route.startLocation} → {m.route.endLocation}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5 sm:shrink-0 sm:justify-end">
                  <button
                    type="button"
                    title="นำข้อมูลไปสร้างภารกิจใหม่ (ปรับแก้ได้ รหัสใหม่ตอนบันทึก)"
                    className="rounded-lg border border-slate-600 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
                    onClick={() => void openDuplicateMissionForm(m)}
                  >
                    คัดลอก
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-600 px-2.5 py-1.5 text-xs font-medium text-amber-300 hover:bg-slate-800"
                    onClick={() => void openEditMission(m.id)}
                  >
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-rose-900/50 px-2.5 py-1.5 text-xs font-medium text-rose-400 hover:bg-slate-800"
                    onClick={() => void deleteMission(m.id, label)}
                  >
                    ลบ
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-teal-300 hover:bg-slate-700"
                    onClick={() => void openSummary(m.id)}
                  >
                    สรุปภารกิจ
                  </button>
                </div>
              </div>
            </li>
          );
        })
        )}
      </ul>

      {summaryId && summary ? (
        <Modal
          open
          onClose={() => {
            setSummaryId(null);
            setSummary(null);
          }}
          title="สรุปภารกิจ"
          size="form"
          overlayZClass="z-[90]"
        >
          <ModalFormBody className="!space-y-4">
            {summary.code ? <p className="font-mono text-sm text-slate-400">รหัส {summary.code}</p> : null}
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">มูลค่าทรัพย์สิน (รวมจุดส่ง)</dt>
                <dd className="text-right font-medium text-white tabular-nums">
                  {summary.totalCargoValue ?? "0"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">รวมรายจ่าย</dt>
                <dd className="text-right font-semibold text-teal-300 tabular-nums">{summary.totalExpenses}</dd>
              </div>
              <div className="flex justify-between gap-2 border-t border-slate-800 pt-2">
                <dt className="text-slate-300">รายจ่ายต่อมูลค่าทรัพย์สิน</dt>
                <dd className="text-right font-semibold text-amber-300 tabular-nums">
                  {summary.expenseToCargoPercent != null
                    ? `${summary.expenseToCargoPercent.toLocaleString("th-TH", { maximumFractionDigits: 2 })} %`
                    : "— (ไม่มีมูลค่าสินค้าในจุดส่ง)"}
                </dd>
              </div>
              {summary.budgetAmount != null && summary.budgetAmount !== "" ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">งบประมาณ</dt>
                  <dd className="text-right text-white tabular-nums">{summary.budgetAmount}</dd>
                </div>
              ) : null}
              {summary.variance !== null ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">คงเหลือ / เกิน (งบ − จ่าย)</dt>
                  <dd className={summary.overBudget ? "text-rose-400" : "text-emerald-400"}>{summary.variance}</dd>
                </div>
              ) : null}
            </dl>

            {(() => {
              const cargo = Number(summary.totalCargoValue ?? 0);
              const exp = Number(summary.totalExpenses ?? 0);
              const barData = [
                { name: "มูลค่าทรัพย์สิน", value: cargo },
                { name: "รวมรายจ่าย", value: exp },
              ];
              const pieData =
                cargo > 0
                  ? exp <= cargo
                    ? [
                        { name: "รายจ่าย", value: exp },
                        { name: "คงเหลือในมูลค่าสินค้า", value: cargo - exp },
                      ]
                    : [
                        { name: "มูลค่าสินค้า (ฐาน)", value: cargo },
                        { name: "รายจ่ายเกินฐาน", value: exp - cargo },
                      ]
                  : exp > 0
                    ? [{ name: "รายจ่าย (ไม่มีมูลค่าสินค้าในจุดส่ง)", value: exp }]
                    : [];
              const pieColors = ["#14b8a6", "#475569", "#64748b"];
              return (
                <div className="space-y-4 border-t border-slate-800 pt-4">
                  <p className="text-xs font-medium uppercase text-slate-500">กราฟเปรียบเทียบ</p>
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} interval={0} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => String(v)} />
                        <Tooltip
                          contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}
                          formatter={(value) => [
                            typeof value === "number" ? value.toLocaleString("th-TH") : String(value ?? ""),
                            "บาท",
                          ]}
                        />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {barData.map((_, i) => (
                            <Cell key={i} fill={i === 0 ? "#64748b" : "#14b8a6"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {pieData.length > 0 ? (
                    <div className="h-52 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={48}
                            outerRadius={72}
                            paddingAngle={2}
                          >
                            {pieData.map((_, i) => (
                              <Cell key={i} fill={pieColors[i % pieColors.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}
                            formatter={(value) =>
                              typeof value === "number" ? value.toLocaleString("th-TH") : String(value ?? "")
                            }
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : null}
                  <p className="text-center text-[11px] text-slate-500">
                    แผนวงกลม: สัดส่วนรายจ่ายต่อมูลค่าสินค้า (เมื่อมีมูลค่าจุดส่ง)
                  </p>
                </div>
              );
            })()}

            <p className="text-xs font-medium uppercase text-slate-500">แยกตามประเภทค่าใช้จ่าย</p>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-slate-300">
              {Object.entries(summary.expensesByType).map(([k, v]) => (
                <li key={k} className="flex justify-between gap-2">
                  <span>{k}</span>
                  <span className="tabular-nums">{v}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="w-full rounded-lg bg-slate-800 py-2.5 text-white hover:bg-slate-700"
              onClick={() => {
                setSummaryId(null);
                setSummary(null);
              }}
            >
              ปิด
            </button>
          </ModalFormBody>
        </Modal>
      ) : null}
    </div>
  );
}
