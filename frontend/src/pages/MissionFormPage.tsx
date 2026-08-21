import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { apiJson } from "../api/client";
import {
  MissionActualExpenseEditor,
  type MissionActualExpenseEditorHandle,
} from "../components/MissionActualExpenseEditor";
import { CommaNumberInput } from "../components/CommaNumberInput";
import { CrudNameMasterModal } from "../components/CrudNameMasterModal";
import { DateTimeField } from "../components/DateTimeField";
import {
  MissionEstimateEditor,
  type MissionEstimateEditorHandle,
} from "../components/MissionEstimateEditor";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { MissionsSubNav } from "../components/MissionsSubNav";
import { SearchableSelect, personnelSelectLabel } from "../components/SearchableSelect";
import {
  isPoliceCommissionedRank,
  EMPTY_ESTIMATE_PERSON_COUNTS,
  EMPTY_BOT_LINE_AMOUNTS,
  type BotLineAmounts,
} from "../lib/estimatePersonCounts";
import { formatBaht, formatInt, parseLooseNumber } from "../lib/formatNumber";
import {
  BOT_SPECIAL_ALLOWANCE_PER_DAY,
  botPerDiemDailyRate,
  calcBotMissionCompensation,
  isBotPersonnelCategory,
  missionInclusiveDays,
} from "../lib/botAllowancePrint";
import {
  MISSION_PERSONNEL_TABS,
  defaultMissionRoleIdForTab,
  missionPersonnelTabByCategory,
  type MissionPersonnelTabKey,
} from "../lib/missionPersonnelTabs";
import {
  detectPoliceDestGroup,
  EMPTY_ESTIMATE_CALC_META,
  inferTripType,
  isSpecialOpsPoliceStationName,
  STATION_ESTIMATE_ITEM_OPTIONS,
  sumPolicePersonnelCompensation,
  sumStationItemTotals,
  normalizeStationEstimateItemCode,
  splitSpecialOpsAdminVehicle,
} from "../lib/policeCompensationRates";
import { PERSONNEL_EXPENSE_LINK_HELP } from "../lib/personnelExpenseLinks";
import { toolbarLinkBtnClass, toolbarPrimaryBtnClass } from "../lib/uiTokens";
import type {
  MissionDetail,
  MissionStatus,
  NameMasterRow,
  Personnel,
  RouteMaster,
  Vehicle,
} from "../types";
import { vehicleDisplayLabel } from "../types";

type PRow = {
  personnelId: string;
  personnelRoleId: string;
  compensationRate: string;
  tabKey: MissionPersonnelTabKey;
};

function botAutoCompensationRate(
  person: Personnel | undefined,
  plannedStart: string,
  plannedEnd: string,
  daysOverride?: number | null,
): string | null {
  if (!person || !isBotPersonnelCategory(person.personnelCategory?.name)) return null;
  const days =
    daysOverride != null && daysOverride > 0
      ? daysOverride
      : missionInclusiveDays(plannedStart || null, plannedEnd || null);
  const perDiem =
    person.perDiemRate != null && person.perDiemRate !== "" && Number(person.perDiemRate) > 0
      ? person.perDiemRate
      : botPerDiemDailyRate(person.gradeLevel);
  return String(calcBotMissionCompensation(perDiem, days, person.vehicleTravelAllowance, person.gradeLevel));
}

function addInclusiveDaysToLocalDatetime(startLocal: string, days: number): string {
  if (!startLocal || days < 1) return startLocal;
  const d = new Date(startLocal);
  if (Number.isNaN(d.getTime())) return startLocal;
  d.setDate(d.getDate() + (days - 1));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
type MissionVehicleFuelTypeUi = "" | "GASOLINE" | "DIESEL";

type VRow = {
  vehicleId: string;
  vehicleRoleId: string;
  fuelLiters: string;
  fuelType: MissionVehicleFuelTypeUi;
  fuelAmount: string;
};
type DRow = { address: string; cargoValue: string; containerCount: number };
type PsRow = { policeStationId: string; amount: string; estimateItemCode: string; note?: string | null };

const SPECIAL_OPS_NOTE_RE = /^split:2\.6=([\d.]+);2\.7=([\d.]+)$/;

function encodeSpecialOpsSplitNote(admin: number, vehicle: number): string {
  return `split:2.6=${admin};2.7=${vehicle}`;
}

function parseSpecialOpsSplitNote(note: string | null | undefined): { admin: number; vehicle: number } | null {
  const m = (note ?? "").trim().match(SPECIAL_OPS_NOTE_RE);
  if (!m) return null;
  const admin = Number(m[1]);
  const vehicle = Number(m[2]);
  if (!Number.isFinite(admin) || !Number.isFinite(vehicle)) return null;
  return { admin, vehicle };
}

/** แยกยอดกองกำกับต่อต้านก่อการร้าย (และสังกัดพิเศษใกล้เคียง) เป็น 2.6 + 2.7 */
function expandSpecialOpsStationRows(
  rows: PsRow[],
  stationNameById: Map<string, string> | Array<{ id: string; name: string }>,
): PsRow[] {
  const nameMap =
    stationNameById instanceof Map
      ? stationNameById
      : new Map(stationNameById.map((s) => [s.id, s.name] as const));
  const out: PsRow[] = [];
  const alreadySplit = new Set<string>();

  for (const row of rows) {
    if (!row.policeStationId) {
      out.push(row);
      continue;
    }
    const name = nameMap.get(row.policeStationId) ?? "";
    const fromNote = parseSpecialOpsSplitNote(row.note);
    const isSpecial =
      isSpecialOpsPoliceStationName(name) ||
      Boolean(fromNote) ||
      row.estimateItemCode === "2.6" ||
      row.estimateItemCode === "2.7";

    if (!isSpecial) {
      out.push({
        ...row,
        estimateItemCode: normalizeStationEstimateItemCode(row.estimateItemCode) || row.estimateItemCode || "2.4",
      });
      continue;
    }

    if (alreadySplit.has(row.policeStationId)) continue;

    const related = rows.filter((r) => r.policeStationId === row.policeStationId);
    const adminRow = related.find((r) => r.estimateItemCode === "2.6");
    const vehicleRow = related.find((r) => r.estimateItemCode === "2.7");
    if (adminRow && vehicleRow) {
      alreadySplit.add(row.policeStationId);
      out.push({ ...adminRow, estimateItemCode: "2.6" });
      out.push({ ...vehicleRow, estimateItemCode: "2.7" });
      continue;
    }

    const combined = related.reduce((sum, r) => {
      const n = parseLooseNumber(r.amount);
      return sum + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0);
    const split = fromNote ?? splitSpecialOpsAdminVehicle(combined);
    alreadySplit.add(row.policeStationId);
    out.push({
      policeStationId: row.policeStationId,
      estimateItemCode: "2.6",
      amount: String(split.admin),
    });
    out.push({
      policeStationId: row.policeStationId,
      estimateItemCode: "2.7",
      amount: String(split.vehicle),
    });
  }
  return out.length ? out : rows;
}

/** บันทึกสถานีละแถว (unique) — รวม 2.6+2.7 ของสังกัดเดียวกันเป็นยอดเดียว + note */
function mergeSpecialOpsStationRowsForSave(rows: PsRow[]): Array<PsRow & { note?: string | null }> {
  const used = new Set<string>();
  const out: Array<PsRow & { note?: string | null }> = [];
  for (const row of rows) {
    if (!row.policeStationId || used.has(row.policeStationId)) continue;
    const related = rows.filter((r) => r.policeStationId === row.policeStationId);
    const adminRow = related.find((r) => r.estimateItemCode === "2.6");
    const vehicleRow = related.find((r) => r.estimateItemCode === "2.7");
    if (adminRow || vehicleRow) {
      const adminN = parseLooseNumber(adminRow?.amount);
      const vehicleN = parseLooseNumber(vehicleRow?.amount);
      const admin = Number.isFinite(adminN) && adminN > 0 ? adminN : 0;
      const vehicle = Number.isFinite(vehicleN) && vehicleN > 0 ? vehicleN : 0;
      used.add(row.policeStationId);
      out.push({
        policeStationId: row.policeStationId,
        estimateItemCode: "2.6",
        amount: String(admin + vehicle),
        note: encodeSpecialOpsSplitNote(admin, vehicle),
      });
      continue;
    }
    used.add(row.policeStationId);
    out.push({ ...row, note: row.note ?? null });
  }
  return out;
}

function isoToLocalDatetimeValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type MissionFormMode = "create" | "edit" | "duplicate";

export function MissionFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: routeMissionId } = useParams<{ id: string }>();
  const mode: MissionFormMode = location.pathname.endsWith("/duplicate")
    ? "duplicate"
    : routeMissionId && location.pathname.includes("/edit")
      ? "edit"
      : "create";

  const estimateRef = useRef<MissionEstimateEditorHandle>(null);
  const actualExpenseRef = useRef<MissionActualExpenseEditorHandle>(null);
  const [loadingPage, setLoadingPage] = useState(mode !== "create");
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<RouteMaster[]>([]);
  const [personnelRoleMasters, setPersonnelRoleMasters] = useState<NameMasterRow[]>([]);
  const [vehicleRoleMasters, setVehicleRoleMasters] = useState<NameMasterRow[]>([]);
  const [expenseTypeMasters, setExpenseTypeMasters] = useState<NameMasterRow[]>([]);
  const [policeStationMasters, setPoliceStationMasters] = useState<NameMasterRow[]>([]);

  const [step, setStep] = useState(0);
  const [personnelTab, setPersonnelTab] = useState<MissionPersonnelTabKey>("bot");
  const [crudPersonnelRoleOpen, setCrudPersonnelRoleOpen] = useState(false);
  const [crudVehicleRoleOpen, setCrudVehicleRoleOpen] = useState(false);
  const [crudPoliceStationOpen, setCrudPoliceStationOpen] = useState(false);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(
    mode === "edit" ? (routeMissionId ?? null) : null,
  );
  const [missionCode, setMissionCode] = useState<string | null>(null);
  const [missionStatus, setMissionStatus] = useState<MissionStatus>("PLANNED");
  const [estimateApprovalTotal, setEstimateApprovalTotal] = useState(0);
  const [actualApprovalTotal, setActualApprovalTotal] = useState(0);

  const [title, setTitle] = useState("");
  const [routeId, setRouteId] = useState("");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");

  const [pRows, setPRows] = useState<PRow[]>([
    { personnelId: "", personnelRoleId: "", compensationRate: "0", tabKey: "bot" },
  ]);
  const [vRows, setVRows] = useState<VRow[]>([
    { vehicleId: "", vehicleRoleId: "", fuelLiters: "", fuelType: "", fuelAmount: "" },
  ]);
  const [dRows, setDRows] = useState<DRow[]>([{ address: "", cargoValue: "0", containerCount: 1 }]);
  const [psRows, setPsRows] = useState<PsRow[]>([{ policeStationId: "", amount: "0", estimateItemCode: "2.4" }]);
  const [savingMission, setSavingMission] = useState(false);
  const [saveFlash, setSaveFlash] = useState<string | null>(null);
  const [mastersReady, setMastersReady] = useState(false);

  const load = useCallback(async () => {
    const [p, v, r, pr, vr, et, ps] = await Promise.all([
      apiJson<Personnel[]>("/api/personnel"),
      apiJson<Vehicle[]>("/api/vehicles"),
      apiJson<RouteMaster[]>("/api/route-master"),
      apiJson<NameMasterRow[]>("/api/mission-personnel-roles"),
      apiJson<NameMasterRow[]>("/api/mission-vehicle-roles"),
      apiJson<NameMasterRow[]>("/api/mission-expense-types"),
      apiJson<NameMasterRow[]>("/api/police-stations"),
    ]);
    setPersonnel(p);
    setVehicles(v);
    setRoutes(r);
    setPersonnelRoleMasters(pr);
    setVehicleRoleMasters(vr);
    setExpenseTypeMasters(et);
    setPoliceStationMasters(ps);
    setMastersReady(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedRoute = useMemo(
    () => routes.find((r) => r.id === routeId) ?? null,
    [routes, routeId],
  );

  const routeMissionDays = useMemo(() => {
    const d = selectedRoute?.missionDays;
    return d != null && d > 0 ? d : null;
  }, [selectedRoute]);

  const vehicleFuelTotal = useMemo(
    () =>
      vRows.reduce((sum, row) => {
        const amount = parseLooseNumber(row.fuelAmount);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0),
    [vRows],
  );

  const estimateCalcMeta = useMemo(() => {
    const text = selectedRoute
      ? `${selectedRoute.name ?? ""} ${selectedRoute.startLocation} ${selectedRoute.endLocation}`
      : "";
    return {
      ...EMPTY_ESTIMATE_CALC_META,
      destinationGroup: detectPoliceDestGroup(text),
      tripType: inferTripType(selectedRoute?.missionDays ?? routeMissionDays),
    };
  }, [selectedRoute, routeMissionDays]);

  const stationItemTotals = useMemo(() => sumStationItemTotals(psRows), [psRows]);

  const routeSearchOptions = useMemo(
    () =>
      routes
        .filter((r) => r.status !== "INACTIVE" || r.id === routeId)
        .map((r) => {
          const bits = [
            `${String(r.distanceKm)} km`,
            r.missionDays != null && r.missionDays > 0 ? `${r.missionDays} วัน` : null,
            r.externalPersonnelCompensation != null && Number(r.externalPersonnelCompensation) > 0
              ? `${Number(r.externalPersonnelCompensation).toLocaleString("th-TH")} ฿`
              : null,
            r.status === "INACTIVE" ? "เลิกใช้" : null,
          ].filter(Boolean);
          return {
            value: r.id,
            label: `${r.name ?? `${r.startLocation} → ${r.endLocation}`} (${bits.join(" · ")})`,
            keywords: `${r.startLocation ?? ""} ${r.endLocation ?? ""} ${r.name ?? ""}`,
          };
        }),
    [routes, routeId],
  );

  const personnelOptionsByTab = useMemo(() => {
    const map = {} as Record<
      MissionPersonnelTabKey,
      Array<{ value: string; label: string; keywords: string }>
    >;
    for (const tab of MISSION_PERSONNEL_TABS) {
      map[tab.key] = personnel
        .filter((p) => tab.categories.includes(p.personnelCategory?.name ?? ""))
        .map((p) => ({
          value: p.id,
          label: personnelSelectLabel(p),
          keywords: `${p.position ?? ""} ${p.phone ?? ""} ${p.idNumber ?? ""}`,
        }));
    }
    return map;
  }, [personnel]);

  const pRowsInActiveTab = useMemo(
    () => pRows.map((row, index) => ({ row, index })).filter(({ row }) => row.tabKey === personnelTab),
    [pRows, personnelTab],
  );

  const personnelTabCounts = useMemo(() => {
    const counts = {} as Record<MissionPersonnelTabKey, number>;
    for (const tab of MISSION_PERSONNEL_TABS) counts[tab.key] = 0;
    for (const row of pRows) {
      if (row.personnelId) counts[row.tabKey] = (counts[row.tabKey] ?? 0) + 1;
    }
    return counts;
  }, [pRows]);

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
    setPRows((prev) =>
      prev.map((row) => {
        const person = personnel.find((p) => p.id === row.personnelId);
        const auto = botAutoCompensationRate(person, plannedStart, plannedEnd, routeMissionDays);
        if (auto == null) return row;
        if (row.compensationRate === auto) return row;
        return { ...row, compensationRate: auto };
      }),
    );
  }, [plannedStart, plannedEnd, personnel, routeMissionDays]);

  useEffect(() => {
    if (!policeStationMasters.length) return;
    setPsRows((cur) => {
      const next = expandSpecialOpsStationRows(cur, policeStationMasters);
      const same =
        next.length === cur.length &&
        next.every(
          (r, i) =>
            r.policeStationId === cur[i].policeStationId &&
            r.estimateItemCode === cur[i].estimateItemCode &&
            r.amount === cur[i].amount,
        );
      return same ? cur : next;
    });
  }, [policeStationMasters]);

  const resetForm = useCallback(() => {
    setStep(0);
    setTitle("");
    setRouteId("");
    setPlannedStart("");
    setPlannedEnd("");
    setMissionStatus("PLANNED");
    setEditingMissionId(null);
    setMissionCode(null);
    setEstimateApprovalTotal(0);
    setActualApprovalTotal(0);
    setSaveFlash(null);
    setPRows([
      {
        personnelId: "",
        personnelRoleId: defaultMissionRoleIdForTab("bot", personnelRoleMasters),
        compensationRate: "0",
        tabKey: "bot",
      },
    ]);
    setPersonnelTab("bot");
    setVRows([
      { vehicleId: "", vehicleRoleId: vehicleRoleMasters[0]?.id ?? "", fuelLiters: "", fuelType: "", fuelAmount: "" },
    ]);
    setDRows([{ address: "", cargoValue: "0", containerCount: 1 }]);
    setPsRows([{ policeStationId: "", amount: "0", estimateItemCode: "2.4" }]);
    estimateRef.current?.reset();
    actualExpenseRef.current?.reset();
  }, [personnelRoleMasters, vehicleRoleMasters]);

  const closeForm = useCallback(() => {
    navigate("/missions");
  }, [navigate]);

  const pageTitle =
    mode === "edit" ? "แก้ไขภารกิจ" : mode === "duplicate" ? "คัดลอกภารกิจ" : "สร้างภารกิจ";

  /** โหมด duplicate = สร้างภารกิจใหม่จากข้อมูลเดิม (ไม่ตั้ง editingMissionId — รหัสใหม่ตอนบันทึก) */
  const applyMissionDetailToForm = useCallback(
    (mission: MissionDetail, mode: "edit" | "duplicate") => {
      if (mode === "edit") {
        setEditingMissionId(mission.id);
        setMissionCode(mission.code);
        setMissionStatus(mission.status);
        setTitle(mission.title ?? "");
      } else {
        setEditingMissionId(null);
        setMissionCode(null);
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
      setPRows(
        personRows.length
          ? personRows.map((p) => {
              const person = personnel.find((x) => x.id === p.personnelId);
              const tabKey =
                missionPersonnelTabByCategory(person?.personnelCategory?.name) ?? "bot";
              return {
                personnelId: p.personnelId,
                personnelRoleId: p.personnelRoleId,
                compensationRate: String(p.compensationRate ?? "0"),
                tabKey,
              };
            })
          : [
              {
                personnelId: "",
                personnelRoleId: defaultMissionRoleIdForTab("bot", personnelRoleMasters),
                compensationRate: "0",
                tabKey: "bot" as const,
              },
            ],
      );
      setPersonnelTab("bot");
      setVRows(
        vehicleRows.length
          ? vehicleRows.map((v) => ({
              vehicleId: v.vehicleId,
              vehicleRoleId: v.vehicleRoleId,
              fuelLiters: v.fuelLiters != null && v.fuelLiters !== "" ? String(v.fuelLiters) : "",
              fuelType: (v.fuelType === "GASOLINE" || v.fuelType === "DIESEL" ? v.fuelType : "") as MissionVehicleFuelTypeUi,
              fuelAmount: v.fuelAmount != null && v.fuelAmount !== "" ? String(v.fuelAmount) : "",
            }))
          : [
              {
                vehicleId: "",
                vehicleRoleId: vehicleRoleMasters[0]?.id ?? "",
                fuelLiters: "",
                fuelType: "",
                fuelAmount: "",
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
      const stationRows = (mission.policeStations ?? []).filter((s) => s.policeStationId);
      const mappedStations: PsRow[] = stationRows.length
        ? stationRows.map((s, i) => ({
            policeStationId: s.policeStationId,
            amount: String(s.amount ?? "0"),
            estimateItemCode: normalizeStationEstimateItemCode(s.estimateItemCode) || (i === 1 ? "2.5" : "2.4"),
            note: s.note ?? null,
          }))
        : [{ policeStationId: "", amount: "0", estimateItemCode: "2.4" }];
      setPsRows(expandSpecialOpsStationRows(mappedStations, policeStationMasters));
    },
    [personnel, personnelRoleMasters, vehicleRoleMasters, policeStationMasters],
  );

  useEffect(() => {
    if (!mastersReady) return;
    if (mode === "create") {
      resetForm();
      setLoadingPage(false);
      return;
    }
    if (!routeMissionId) {
      setLoadingPage(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingPage(true);
      try {
        const mission = await apiJson<MissionDetail>(`/api/missions/${routeMissionId}`);
        if (cancelled) return;
        applyMissionDetailToForm(mission, mode === "duplicate" ? "duplicate" : "edit");
      } catch (e) {
        alert(e instanceof Error ? e.message : "โหลดภารกิจไม่สำเร็จ");
        navigate("/missions", { replace: true });
      } finally {
        if (!cancelled) setLoadingPage(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mastersReady, mode, routeMissionId, applyMissionDetailToForm, resetForm, navigate]);

  async function submitMission(opts?: { close?: boolean; requireComplete?: boolean }) {
    const close = opts?.close ?? true;
    const requireComplete = opts?.requireComplete ?? true;

    const personnelPayload = (() => {
      const seen = new Set<string>();
      const out: typeof pRows = [];
      for (const r of pRows) {
        if (!r.personnelId || !r.personnelRoleId) continue;
        if (seen.has(r.personnelId)) continue;
        seen.add(r.personnelId);
        out.push(r);
      }
      return out;
    })();
    const vehiclesRaw = vRows.filter((r) => r.vehicleId && r.vehicleRoleId);
    const vehiclesById = new Map(vehiclesRaw.map((r) => [r.vehicleId, r]));
    const vehiclesPayload = [...vehiclesById.values()];
    const destPayload = dRows.filter((r) => r.address.trim());
    const expPayload = actualExpenseRef.current?.buildMissionExpensePayload(expenseTypeMasters) ?? [];
    const policeRaw = psRows.filter((r) => r.policeStationId);
    const policeStationPayload = mergeSpecialOpsStationRowsForSave(policeRaw);
    if (vehiclesRaw.length !== vehiclesPayload.length) {
      alert("พบยานพาหนะซ้ำในรายการ — ระบบจะบันทึกคันละครั้ง");
    }
    if (pRows.filter((r) => r.personnelId).length !== personnelPayload.length) {
      alert("พบบุคลากรซ้ำในรายการ — ระบบจะบันทึกคนละครั้ง");
    }

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
        fuelAmount: r.fuelAmount.trim() === "" ? null : r.fuelAmount,
      })),
      destinations: destPayload.map((d, i) => ({
        address: d.address,
        cargoValue: d.cargoValue,
        containerCount: d.containerCount,
        sortOrder: i,
      })),
      expenses: expPayload,
      policeStations: policeStationPayload.map((s, i) => ({
        policeStationId: s.policeStationId,
        amount: s.amount === "" ? 0 : Number(s.amount) || 0,
        estimateItemCode: s.estimateItemCode || null,
        note: s.note ?? null,
        sortOrder: i,
      })),
    };

    setSavingMission(true);
    setSaveFlash(null);
    try {
      let savedMissionId = editingMissionId;
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
        savedMissionId = created.id;
        setEditingMissionId(created.id);
        setMissionStatus(created.status ?? nextStatus);
      }
      if (savedMissionId && routeId) {
        try {
          await estimateRef.current?.save(savedMissionId);
        } catch (e) {
          alert(
            e instanceof Error
              ? `บันทึกภารกิจแล้ว แต่ประมาณการไม่สำเร็จ: ${e.message}`
              : "บันทึกภารกิจแล้ว แต่ประมาณการไม่สำเร็จ",
          );
        }
        try {
          await actualExpenseRef.current?.save(savedMissionId);
        } catch (e) {
          alert(
            e instanceof Error
              ? `บันทึกภารกิจแล้ว แต่ค่าใช้จ่ายจริงไม่สำเร็จ: ${e.message}`
              : "บันทึกภารกิจแล้ว แต่ค่าใช้จ่ายจริงไม่สำเร็จ",
          );
        }
      }
      if (close) {
        resetForm();
        navigate("/missions");
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

  const suggestedEstimatePersonCounts = useMemo(() => {
    const counts = { ...EMPTY_ESTIMATE_PERSON_COUNTS };
    for (const row of pRows) {
      if (!row.personnelId) continue;
      if (row.tabKey === "bot") {
        counts.bot += 1;
      }
      else if (row.tabKey === "driver") counts.driver += 1;
      else if (row.tabKey === "highway" || row.tabKey === "crime" || row.tabKey === "special") {
        const person = personnel.find((p) => p.id === row.personnelId);
        const commissioned = isPoliceCommissionedRank(person?.rank);
        if (row.tabKey === "highway") {
          if (commissioned) counts.highwayCommissioned += 1;
          else counts.highwayEnlisted += 1;
        } else if (row.tabKey === "crime") {
          if (commissioned) counts.crimeCommissioned += 1;
          else counts.crimeEnlisted += 1;
        } else {
          if (commissioned) counts.specialCommissioned += 1;
          else counts.specialEnlisted += 1;
        }
      }
    }
    return counts;
  }, [pRows, personnel]);

  /** ยอดจากจนท.ธปท.: 5.1 จำนวนคน×ที่พัก · 5.2 ค่าพาหนะ · 5.3 เบี้ยเลี้ยง · 8.1 เบี้ยพิเศษ */
  const botLineAmounts = useMemo((): BotLineAmounts => {
    const days =
      routeMissionDays != null && routeMissionDays > 0
        ? routeMissionDays
        : missionInclusiveDays(plannedStart || null, plannedEnd || null);
    const amounts = { ...EMPTY_BOT_LINE_AMOUNTS };
    let botCount = 0;
    for (const row of pRows) {
      if (!row.personnelId || row.tabKey !== "bot") continue;
      const person = personnel.find((p) => p.id === row.personnelId);
      if (!person) continue;
      botCount += 1;
      const perDiem =
        person.perDiemRate != null && person.perDiemRate !== "" && Number(person.perDiemRate) > 0
          ? Number(person.perDiemRate)
          : botPerDiemDailyRate(person.gradeLevel);
      const travel = Number(person.vehicleTravelAllowance);
      amounts["5.3"] += (Number.isFinite(perDiem) && perDiem > 0 ? perDiem : 0) * Math.max(1, days);
      amounts["5.2"] += Number.isFinite(travel) && travel > 0 ? travel : 0;
    }
    amounts["5.1"] = botCount;
    amounts["8.1"] = botCount * BOT_SPECIAL_ALLOWANCE_PER_DAY * Math.max(1, days);
    return amounts;
  }, [pRows, personnel, plannedStart, plannedEnd, routeMissionDays]);

  const hasBotPersonnel = useMemo(
    () => pRows.some((r) => r.tabKey === "bot" && r.personnelId),
    [pRows],
  );

  const personnelTabAmounts = useMemo(() => {
    const amounts = {} as Record<MissionPersonnelTabKey, number>;
    for (const tab of MISSION_PERSONNEL_TABS) amounts[tab.key] = 0;
    for (const row of pRows) {
      if (!row.personnelId) continue;
      const n = parseLooseNumber(row.compensationRate);
      if (Number.isFinite(n) && n > 0) amounts[row.tabKey] += n;
    }
    return amounts;
  }, [pRows]);

  const policePersonnelAmounts = useMemo(() => sumPolicePersonnelCompensation(pRows), [pRows]);

  const personnelCompensationTotal = useMemo(
    () => Object.values(personnelTabAmounts).reduce((sum, n) => sum + n, 0),
    [personnelTabAmounts],
  );

  const policeStationTotal = useMemo(
    () =>
      stationItemTotals.amounts["2.4"] +
      stationItemTotals.amounts["2.5"] +
      stationItemTotals.amounts["2.6"] +
      stationItemTotals.amounts["2.7"],
    [stationItemTotals],
  );

  const handleEstimateTotalChange = useCallback((total: number) => {
    setEstimateApprovalTotal(Number.isFinite(total) ? total : 0);
  }, []);

  const handleActualTotalChange = useCallback((total: number) => {
    setActualApprovalTotal(Number.isFinite(total) ? total : 0);
  }, []);

  const stepExpenseSummaries = useMemo(
    () =>
      [
        { amount: 0, label: "รวมค่าใช้จ่าย" },
        { amount: estimateApprovalTotal, label: "รวมขออนุมัติ (ประมาณการ)" },
        { amount: personnelCompensationTotal, label: "รวมค่าตอบแทนบุคลากร" },
        { amount: policeStationTotal, label: "รวมสถานีตำรวจ" },
        { amount: vehicleFuelTotal, label: "รวมค่าน้ำมัน" },
        {
          amount: actualApprovalTotal > 0 ? actualApprovalTotal : estimateApprovalTotal,
          label: actualApprovalTotal > 0 ? "รวมค่าใช้จ่ายจริง" : "รวมขออนุมัติ (ประมาณการ)",
        },
      ] as const,
    [estimateApprovalTotal, actualApprovalTotal, personnelCompensationTotal, policeStationTotal, vehicleFuelTotal],
  );

  function formatStepTabAmount(amount: number): string | null {
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return `${formatInt(amount)} ฿`;
  }

  const steps = [
    "ข้อมูลทั่วไป",
    "ประมาณการค่าใช้จ่าย",
    "บุคลากร",
    "สถานีตำรวจ",
    "ยานพาหนะ",
    "ค่าใช้จ่าย",
  ];

  if (loadingPage) {
    return (
      <div className="py-16 text-center text-sm text-slate-600">กำลังโหลดแบบฟอร์มภารกิจ…</div>
    );
  }

  return (
    <div className="-mx-4 -mt-1 flex min-h-[calc(100dvh-10rem)] flex-col sm:-mx-6 sm:-mt-2">
      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white/95 shadow-sm">
        <div className="border-b border-slate-200 px-4 py-2.5 sm:px-5">
          <PageHeaderBar
            title={pageTitle}
            extras={
              <>
                <Link to="/missions" className={toolbarLinkBtnClass}>
                  ← กลับรายการภารกิจ
                </Link>
                <button type="button" className={toolbarLinkBtnClass} onClick={closeForm}>
                  ยกเลิก
                </button>
              </>
            }
            primary={<MissionsSubNav />}
          />
        </div>

        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur sm:px-5">
          <div className="flex flex-wrap gap-2">
            {steps.map((label, i) => {
              const tabAmount = formatStepTabAmount(stepExpenseSummaries[i]?.amount ?? 0);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setStep(i)}
                  className={`inline-flex max-w-full flex-col items-start gap-0.5 rounded-lg px-3 py-1.5 text-left sm:flex-row sm:items-center sm:gap-2 ${
                    step === i ? "bg-[#0000BF] text-white" : "bg-slate-100 text-slate-700 hover:text-[#2e2a58]"
                  }`}
                >
                  <span className="text-sm font-medium">
                    {i + 1}. {label}
                  </span>
                  {tabAmount ? (
                    <span
                      className={`text-[11px] font-bold tabular-nums ${
                        step === i ? "text-white/90" : "text-[#0000BF]"
                      }`}
                    >
                      {tabAmount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {stepExpenseSummaries[step]?.amount > 0 ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#0000BF]/15 bg-[#0000BF]/5 px-3 py-2">
              <p className="text-sm font-semibold text-[#2e2a58]">{steps[step]}</p>
              <p className="text-sm text-slate-700">
                {stepExpenseSummaries[step].label}{" "}
                <span className="font-black tabular-nums text-[#0000BF]">
                  {formatBaht(stepExpenseSummaries[step].amount)} บาท
                </span>
              </p>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
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
                    onChange={(id) => {
                      setRouteId(id);
                      const route = routes.find((r) => r.id === id);
                      const days = route?.missionDays;
                      if (days != null && days > 0 && plannedStart) {
                        setPlannedEnd(addInclusiveDaysToLocalDatetime(plannedStart, days));
                      }
                    }}
                    options={routeSearchOptions}
                    emptyLabel="— ไม่ระบุเส้นทาง —"
                    allowEmpty
                  />
                  {selectedRoute &&
                  ((selectedRoute.missionDays != null && selectedRoute.missionDays > 0) ||
                    (selectedRoute.externalPersonnelCompensation != null &&
                      Number(selectedRoute.externalPersonnelCompensation) > 0)) ? (
                    <p className="mt-1 text-[11px] text-slate-600">
                      จากเส้นทาง:
                      {selectedRoute.missionDays != null && selectedRoute.missionDays > 0
                        ? ` ${selectedRoute.missionDays} วัน`
                        : ""}
                      {selectedRoute.externalPersonnelCompensation != null &&
                      Number(selectedRoute.externalPersonnelCompensation) > 0
                        ? ` · ค่าตอบแทนบุคคลภายนอก ${Number(selectedRoute.externalPersonnelCompensation).toLocaleString("th-TH")} บาท`
                        : ""}
                    </p>
                  ) : null}
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

                {/* จุดส่งสินค้า: ไปรวมอยู่ใน "ข้อมูลทั่วไป" */}
                <div className="sm:col-span-2 space-y-2">
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
              </div>
            )}

            {step === 2 && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-0.5 text-[11px] text-slate-600">
                    <p className="font-medium text-slate-700">ลิงก์ไปเมนูค่าใช้จ่ายอัตโนมัติ</p>
                    <p>{PERSONNEL_EXPENSE_LINK_HELP}</p>
                    <p className="text-slate-500">
                      อรินทราช/หนุมาน → 2.1 · ทางหลวง → 2.2 · กองปราบ → 2.3 =
                      รวมค่าตอบแทนในแท็บนั้น · สถานี → 2.4/2.5 · กองกำกับฯ → 2.6+2.7 ·
                      ทริป 2569: ค่าที่พัก/เบี้ย จนท.ธปท. (5.1–8.1) จาก Excel ไม่คูณอัตรา
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-[#4d47b6] hover:bg-slate-100"
                    onClick={() => setCrudPersonnelRoleOpen(true)}
                  >
                    จัดการบทบาท…
                  </button>
                </div>

                <div
                  className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50/80 p-1"
                  role="tablist"
                  aria-label="ประเภทบุคลากร"
                >
                  {MISSION_PERSONNEL_TABS.map((tab) => {
                    const active = personnelTab === tab.key;
                    const count = personnelTabCounts[tab.key] ?? 0;
                    const tabAmount = formatStepTabAmount(personnelTabAmounts[tab.key] ?? 0);
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={`inline-flex flex-col items-start gap-0.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:flex-row sm:items-center ${
                          active
                            ? "bg-[#0000BF] text-white shadow-sm"
                            : "text-slate-700 hover:bg-white hover:text-[#0000BF]"
                        }`}
                        onClick={() => setPersonnelTab(tab.key)}
                      >
                        <span>
                          {tab.label}
                          {count > 0 ? (
                            <span
                              className={`ml-1 tabular-nums ${active ? "text-white/80" : "text-slate-500"}`}
                            >
                              ({count})
                            </span>
                          ) : null}
                        </span>
                        {tabAmount ? (
                          <span
                            className={`text-[10px] font-bold tabular-nums ${
                              active ? "text-white/90" : "text-[#0000BF]"
                            }`}
                          >
                            {tabAmount}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <div className="hidden min-w-[36rem] grid-cols-[minmax(0,1.4fr)_minmax(7rem,0.9fr)_5.5rem_2.5rem] gap-1.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 sm:grid">
                    <span>บุคลากร</span>
                    <span>บทบาท</span>
                    <span>ค่าตอบแทน</span>
                    <span className="sr-only">ลบ</span>
                  </div>
                  <ul className="min-w-[36rem] divide-y divide-slate-100">
                    {pRowsInActiveTab.length === 0 ? (
                      <li className="px-3 py-4 text-center text-xs text-slate-500">
                        ยังไม่มีรายชื่อในแถบนี้ — กด «+ เพิ่มบุคลากร»
                      </li>
                    ) : (
                      pRowsInActiveTab.map(({ row, index: idx }) => (
                        <li
                          key={`${row.tabKey}-${idx}`}
                          className="grid grid-cols-[minmax(0,1.4fr)_minmax(7rem,0.9fr)_5.5rem_2.5rem] items-center gap-1.5 px-2 py-1"
                        >
                          <SearchableSelect
                            value={row.personnelId}
                            onChange={(v) => {
                              const person = personnel.find((p) => p.id === v);
                              const auto = botAutoCompensationRate(
                              person,
                              plannedStart,
                              plannedEnd,
                              routeMissionDays,
                            );
                              const next = [...pRows];
                              next[idx] = {
                                ...row,
                                personnelId: v,
                                compensationRate: auto ?? (v ? row.compensationRate : "0"),
                              };
                              setPRows(next);
                            }}
                            options={personnelOptionsByTab[personnelTab] ?? []}
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
                            className={`w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm tabular-nums text-slate-900 ${
                              isBotPersonnelCategory(
                                personnel.find((p) => p.id === row.personnelId)?.personnelCategory?.name,
                              )
                                ? "border-emerald-300 bg-emerald-50/60"
                                : ""
                            }`}
                            value={row.compensationRate}
                            onChange={(raw) => {
                              const next = [...pRows];
                              next[idx] = { ...row, compensationRate: raw };
                              setPRows(next);
                            }}
                            placeholder="0"
                            maxFractionDigits={2}
                            title={
                              isBotPersonnelCategory(
                                personnel.find((p) => p.id === row.personnelId)?.personnelCategory?.name,
                              )
                                ? "คำนวณอัตโนมัติจากเบี้ยพิเศษ 1,400 + อัตราเบี้ยเลี้ยง × จำนวนวัน"
                                : undefined
                            }
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
                      ))
                    )}
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
                        personnelRoleId: defaultMissionRoleIdForTab(personnelTab, personnelRoleMasters),
                        compensationRate: "0",
                        tabKey: personnelTab,
                      },
                    ])
                  }
                >
                  + เพิ่มบุคลากร
                  {MISSION_PERSONNEL_TABS.find((t) => t.key === personnelTab)
                    ? ` (${MISSION_PERSONNEL_TABS.find((t) => t.key === personnelTab)!.label})`
                    : ""}
                </button>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-2">
                <p className="text-[11px] text-slate-600">
                  สภ. ปลายทาง → 2.4 / 2.5 (ไม่เกิน 2,000) · กองกำกับต่อต้านก่อการร้าย / อรินทราช / หนุมาน →
                  แยกอัตโนมัติเป็น 2.6 ค่าบริหาร 2,000 + 2.7 ค่าพาหนะที่เหลือ
                </p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-[#4d47b6] hover:bg-slate-100"
                    onClick={() => setCrudPoliceStationOpen(true)}
                  >
                    จัดการสถานี…
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <div className="hidden min-w-[42rem] grid-cols-[minmax(0,1.5fr)_minmax(10rem,1fr)_minmax(7rem,0.7fr)_2.5rem] gap-1.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 sm:grid">
                    <span>สถานี / สังกัด</span>
                    <span>ลิงก์รายการ</span>
                    <span>จำนวนเงิน (บาท)</span>
                    <span className="sr-only">ลบ</span>
                  </div>
                  <ul className="min-w-[42rem] divide-y divide-slate-100">
                    {psRows.map((row, idx) => (
                      <li
                        key={idx}
                        className="grid grid-cols-[minmax(0,1.5fr)_minmax(10rem,1fr)_minmax(7rem,0.7fr)_2.5rem] items-center gap-1.5 px-2 py-1"
                      >
                        <select
                          aria-label={`สถานีตำรวจแถว ${idx + 1}`}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
                          value={row.policeStationId}
                          onChange={(e) => {
                            const policeStationId = e.target.value;
                            const station = policeStationMasters.find((s) => s.id === policeStationId);
                            if (policeStationId && isSpecialOpsPoliceStationName(station?.name)) {
                              const amount = parseLooseNumber(row.amount);
                              const total = Number.isFinite(amount) && amount > 0 ? amount : 0;
                              const { admin, vehicle } = splitSpecialOpsAdminVehicle(total);
                              setPsRows((cur) => {
                                const without = cur.filter(
                                  (_, i) =>
                                    i !== idx &&
                                    !(
                                      cur[i].policeStationId === policeStationId &&
                                      (cur[i].estimateItemCode === "2.6" || cur[i].estimateItemCode === "2.7")
                                    ),
                                );
                                const insertAt = Math.min(idx, without.length);
                                return [
                                  ...without.slice(0, insertAt),
                                  {
                                    policeStationId,
                                    estimateItemCode: "2.6",
                                    amount: String(admin),
                                  },
                                  {
                                    policeStationId,
                                    estimateItemCode: "2.7",
                                    amount: String(vehicle),
                                  },
                                  ...without.slice(insertAt),
                                ];
                              });
                              return;
                            }
                            const next = [...psRows];
                            next[idx] = { ...row, policeStationId };
                            setPsRows(next);
                          }}
                        >
                          <option value="">— เลือก —</option>
                          {policeStationMasters.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label={`ลิงก์รายการแถว ${idx + 1}`}
                          className="w-full rounded-md border border-amber-300 bg-amber-50/40 px-2 py-1 text-sm text-slate-900"
                          value={row.estimateItemCode}
                          onChange={(e) => {
                            const next = [...psRows];
                            next[idx] = { ...row, estimateItemCode: e.target.value };
                            setPsRows(next);
                          }}
                        >
                          {STATION_ESTIMATE_ITEM_OPTIONS.map((opt) => (
                            <option key={opt.code} value={opt.code}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <CommaNumberInput
                          aria-label={`จำนวนเงินสถานีแถว ${idx + 1}`}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm tabular-nums text-slate-900"
                          value={row.amount}
                          maxFractionDigits={2}
                          onChange={(raw) => {
                            const station = policeStationMasters.find((s) => s.id === row.policeStationId);
                            const isSpecial = isSpecialOpsPoliceStationName(station?.name);
                            const isCombinedLink =
                              row.estimateItemCode !== "2.6" && row.estimateItemCode !== "2.7";
                            if (isSpecial && isCombinedLink && row.policeStationId) {
                              const n = parseLooseNumber(raw);
                              const total = Number.isFinite(n) && n > 0 ? n : 0;
                              const { admin, vehicle } = splitSpecialOpsAdminVehicle(total);
                              setPsRows((cur) => {
                                const without = cur.filter(
                                  (_, i) =>
                                    i !== idx &&
                                    !(
                                      cur[i].policeStationId === row.policeStationId &&
                                      (cur[i].estimateItemCode === "2.6" || cur[i].estimateItemCode === "2.7")
                                    ),
                                );
                                const insertAt = Math.min(idx, without.length);
                                return [
                                  ...without.slice(0, insertAt),
                                  {
                                    policeStationId: row.policeStationId,
                                    estimateItemCode: "2.6",
                                    amount: String(admin),
                                  },
                                  {
                                    policeStationId: row.policeStationId,
                                    estimateItemCode: "2.7",
                                    amount: String(vehicle),
                                  },
                                  ...without.slice(insertAt),
                                ];
                              });
                              return;
                            }
                            const next = [...psRows];
                            next[idx] = { ...row, amount: raw };
                            setPsRows(next);
                          }}
                          placeholder="0"
                        />
                        <button
                          type="button"
                          className="rounded-md px-1 py-1 text-xs text-rose-600 hover:bg-rose-50"
                          aria-label={`ลบแถว ${idx + 1}`}
                          onClick={() => setPsRows(psRows.filter((_, i) => i !== idx))}
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
                    setPsRows([
                      ...psRows,
                      {
                        policeStationId: "",
                        amount: "0",
                        estimateItemCode: psRows.some((r) => r.estimateItemCode === "2.4") ? "2.5" : "2.4",
                      },
                    ])
                  }
                >
                  + เพิ่มสถานีตำรวจ
                </button>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-600">
                    กรอก <span className="font-semibold text-[#4d47b6]">จำนวนเงินค่าน้ำมัน</span> แต่ละคัน —
                    ยอดรวมลิงก์ไปข้อ 6 ในหน้าค่าใช้จ่าย
                  </p>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-[#4d47b6] hover:bg-slate-100"
                    onClick={() => setCrudVehicleRoleOpen(true)}
                  >
                    จัดการบทบาทรถ…
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200 pr-1">
                  <div className="hidden min-w-[56rem] grid-cols-[minmax(0,1.15fr)_minmax(6rem,0.75fr)_5rem_5rem_minmax(8rem,0.9fr)_2.75rem] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 sm:grid">
                    <span>ยานพาหนะ</span>
                    <span>บทบาท</span>
                    <span>ลิตร</span>
                    <span>ชนิด</span>
                    <span className="text-right text-amber-800">ค่าน้ำมัน (บาท)</span>
                    <span className="sr-only">ลบ</span>
                  </div>
                  <ul className="min-w-[56rem] divide-y divide-slate-100">
                    {vRows.map((row, idx) => (
                      <li
                        key={idx}
                        className="grid grid-cols-[minmax(0,1.15fr)_minmax(6rem,0.75fr)_5rem_5rem_minmax(8rem,0.9fr)_2.75rem] items-center gap-2 px-3 py-1.5"
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
                        <CommaNumberInput
                          aria-label={`ค่าน้ำมันแถว ${idx + 1}`}
                          className="w-full rounded-md border border-amber-400 bg-amber-50 px-2.5 py-1.5 text-right text-sm font-semibold tabular-nums text-slate-900 shadow-sm"
                          value={row.fuelAmount}
                          placeholder="0.00"
                          maxFractionDigits={2}
                          onChange={(raw) => {
                            const next = [...vRows];
                            next[idx] = { ...row, fuelAmount: raw };
                            setVRows(next);
                          }}
                        />
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
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5">
                  <p className="text-xs text-slate-600">รวมค่าน้ำมันเชื้อเพลิง (ลิงก์ข้อ 6)</p>
                  <p className="text-base font-black tabular-nums text-[#0000BF]">
                    {formatBaht(vehicleFuelTotal)} บาท
                  </p>
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
                        fuelAmount: "",
                      },
                    ])
                  }
                >
                  + เพิ่มยานพาหนะ
                </button>
              </div>
            )}

            <div className={step === 1 ? "block" : "hidden"} aria-hidden={step !== 1}>
              <MissionEstimateEditor
                ref={estimateRef}
                routeId={routeId}
                plannedStart={plannedStart}
                plannedEnd={plannedEnd}
                missionId={editingMissionId}
                missionCode={missionCode}
                missionTitle={title.trim() || "ภารกิจ"}
                selectedRoute={selectedRoute}
                suggestedPersonCounts={suggestedEstimatePersonCounts}
                stationItemTotals={stationItemTotals}
                botLineAmounts={botLineAmounts}
                botAmountsLinked={hasBotPersonnel}
                onApprovalTotalChange={handleEstimateTotalChange}
              />
            </div>

            <div className={step === 5 ? "block" : "hidden"} aria-hidden={step !== 5}>
              <MissionActualExpenseEditor
                ref={actualExpenseRef}
                routeId={routeId}
                plannedStart={plannedStart}
                plannedEnd={plannedEnd}
                missionId={editingMissionId}
                missionCode={missionCode}
                missionTitle={title.trim() || "ภารกิจ"}
                selectedRoute={selectedRoute}
                vehicleFuelTotal={vehicleFuelTotal}
                stationItemTotals={stationItemTotals}
                policePersonnelAmounts={policePersonnelAmounts}
                botLineAmounts={botLineAmounts}
                botAmountsLinked={hasBotPersonnel}
                onApprovalTotalChange={handleActualTotalChange}
              />
            </div>
        </div>

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur sm:px-5">
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
                className={`${toolbarPrimaryBtnClass} disabled:opacity-50`}
                onClick={() => setStep(step + 1)}
              >
                ถัดไป
              </button>
            ) : (
              <button
                type="button"
                disabled={savingMission}
                className={`${toolbarPrimaryBtnClass} disabled:opacity-50`}
                onClick={() => void submitMission({ close: true, requireComplete: true })}
              >
                {savingMission ? "กำลังบันทึก…" : editingMissionId ? "บันทึกและปิด" : "บันทึกภารกิจ"}
              </button>
            )}
          </div>
        </div>
      </div>

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
        title="สถานีตำรวจ / สังกัด"
        apiPath="/api/police-stations"
        open={crudPoliceStationOpen}
        onClose={() => setCrudPoliceStationOpen(false)}
        onChanged={load}
      />
    </div>
  );
}
