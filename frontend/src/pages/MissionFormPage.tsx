import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gradeSortValue, policeRankIndex } from "../lib/allowanceDocs";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { apiFormJson, apiJson } from "../api/client";
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
import { MissionRateNotesModal } from "../components/MissionRateNotesModal";
import { Modal } from "../components/Modal";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { MissionsSubNav } from "../components/MissionsSubNav";
import { NavIcons } from "../lib/navVisuals";
import { SearchableSelect, personnelSelectLabel } from "../components/SearchableSelect";
import { EMPTY_BOT_LINE_AMOUNTS, type BotLineAmounts } from "../lib/estimatePersonCounts";
import { formatBaht, formatInt, parseLooseNumber } from "../lib/formatNumber";
import {
  BOT_SPECIAL_ALLOWANCE_PER_DAY,
  botPerDiemDailyRate,
  calcBotMissionCompensation,
  isBotPersonnelCategory,
  missionInclusiveDays,
} from "../lib/botAllowancePrint";
import {
  blankCargoTruck,
  cargoRowHasDocumentData,
  cargoSeatKey,
  cargoTruckCallSign,
  cargoTruckFilled,
  isCargoDocImported,
  matchCargoDriverId,
  matchCargoRoleId,
  matchTractorVehicleId,
  nextSuggestedCargoRole,
  toCargoTruckForm,
  withCargoDriver,
  withCargoRole,
  withCargoTractor,
  type CargoTruckRow,
} from "../lib/missionCargoTrucks";
import { sortMissionVehicleRows } from "../lib/missionConvoyOrder";
import {
  MISSION_PERSONNEL_TABS,
  MISSION_STAFF_TABS,
  defaultMissionRoleIdForTab,
  missionPersonnelTabByCategory,
  type MissionPersonnelTabKey,
} from "../lib/missionPersonnelTabs";
import {
  isSpecialOpsPoliceStationName,
  STATION_ESTIMATE_ITEM_OPTIONS,
  sumPolicePersonnelCompensation,
  sumStationItemTotals,
  normalizeStationEstimateItemCode,
  splitSpecialOpsAdminVehicle,
} from "../lib/policeCompensationRates";
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
  /** รถประจำขาไป — ต้องอยู่ในรายการยานพาหนะของภารกิจ */
  assignedVehicleId?: string;
  /** รถสินค้าจ้างเหมาขาไป (แท็บปฏิบัติการพิเศษ) */
  assignedCargoTruckId?: string;
  /** ขากลับโดยสารคันเดียวกับขาไป */
  returnVehicleSameAsGo?: boolean;
  /** รถประจำขากลับ — ใช้เมื่อไม่ติ๊กเหมือนขาไป */
  assignedVehicleReturnId?: string;
};

function tabUsesGoReturnVehicles(tab: MissionPersonnelTabKey) {
  return tab === "bot" || tab === "crime" || tab === "highway" || tab === "special";
}

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
  callSign?: string;
};
type FuelPrices = { GASOLINE: string; DIESEL: string };

function fuelPriceForRow(row: VRow, prices: FuelPrices): number {
  if (row.fuelType === "") return NaN;
  const p = parseLooseNumber(prices[row.fuelType]);
  return Number.isFinite(p) && p > 0 ? p : NaN;
}

/** ลิตร = ค่าน้ำมัน ÷ ราคาต่อลิตรตามชนิด ปัดเป็นจำนวนเต็ม — ไม่มีราคา/ชนิด คงค่าลิตรเดิมไว้ */
function withAutoLiters(row: VRow, prices: FuelPrices): VRow {
  const price = fuelPriceForRow(row, prices);
  if (!Number.isFinite(price)) return row;
  const amount = parseLooseNumber(row.fuelAmount);
  if (!Number.isFinite(amount) || amount <= 0) return { ...row, fuelLiters: "" };
  return { ...row, fuelLiters: String(Math.round(amount / price)) };
}

type DRow = { address: string; cargoValue: string; containerCount: number };
type PsRow = { policeStationId: string; amount: string; estimateItemCode: string; note?: string | null };

const LOADED_MARK = "__loaded__";

const FORM_STEPS = [
  "ข้อมูลทั่วไป",
  "ประมาณการค่าใช้จ่าย",
  "ข้อมูลรถสินค้า",
  "บุคลากร",
  "สถานีตำรวจ",
  "ยานพาหนะ",
  "ค่าใช้จ่าย",
] as const;
const STEP_CARGO = 2;
const STEP_PERSONNEL = 3;
const STEP_STATIONS = 4;
const STEP_VEHICLES = 5;
const STEP_EXPENSES = 6;

const PERSONNEL_TAB_ORDER: MissionPersonnelTabKey[] = ["bot", "crime", "highway", "special", "driver"];

/** เรียงทีละแท็บ: ตำรวจ (กองปราบ/ทางหลวง/ปฏิบัติการพิเศษ) = ยศสูง→ต่ำ · ธปท./คนขับ = บทบาทแล้วชั้น */
function sortMissionPersonnelRows(rows: PRow[], personnel: Personnel[], roles: NameMasterRow[]): PRow[] {
  const roleOrder = new Map(roles.map((r) => [r.id, r.sortOrder]));
  const byId = new Map(personnel.map((p) => [p.id, p]));
  const roleOf = (r: PRow) => roleOrder.get(r.personnelRoleId) ?? Number.MAX_SAFE_INTEGER;

  const sortTab = (tabRows: PRow[], tabKey: MissionPersonnelTabKey) => {
    const police = tabKey === "crime" || tabKey === "highway" || tabKey === "special";
    const filled = tabRows.filter((r) => r.personnelId);
    const blank = tabRows.filter((r) => !r.personnelId);
    filled.sort((a, b) => {
      const pa = byId.get(a.personnelId);
      const pb = byId.get(b.personnelId);
      const byRank = policeRankIndex(pa?.rank ?? "") - policeRankIndex(pb?.rank ?? "");
      const byRole = roleOf(a) - roleOf(b);
      const byGrade = gradeSortValue(pb?.gradeLevel) - gradeSortValue(pa?.gradeLevel);
      const byName = (pa?.fullName ?? "").localeCompare(pb?.fullName ?? "", "th");
      if (police) return byRank || byRole || byName;
      return byRole || (Number.isFinite(byGrade) ? byGrade : 0) || byName;
    });
    return [...filled, ...blank];
  };

  const byTab = new Map<MissionPersonnelTabKey, PRow[]>();
  for (const row of rows) {
    const t = row.tabKey ?? "bot";
    byTab.set(t, [...(byTab.get(t) ?? []), row]);
  }
  const out: PRow[] = [];
  for (const t of PERSONNEL_TAB_ORDER) {
    out.push(...sortTab(byTab.get(t) ?? [], t));
    byTab.delete(t);
  }
  for (const [t, group] of byTab) out.push(...sortTab(group, t));
  return out;
}
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

type CargoParseResult = {
  trucks: CargoTruckRow[];
  cargoRoles?: NameMasterRow[];
  createdPersonnel?: Personnel[];
  warnings?: string[];
};

type CargoCrewInfo = { name: string; phone: string; idNumber: string };

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
  const [cargoRoleMasters, setCargoRoleMasters] = useState<NameMasterRow[]>([]);
  const [expenseTypeMasters, setExpenseTypeMasters] = useState<NameMasterRow[]>([]);
  const [policeStationMasters, setPoliceStationMasters] = useState<NameMasterRow[]>([]);

  const [step, setStep] = useState(0);
  const [personnelTab, setPersonnelTab] = useState<MissionPersonnelTabKey>("bot");
  useEffect(() => {
    if (personnelTab === "driver") setPersonnelTab("special");
  }, [personnelTab]);
  const [crudPersonnelRoleOpen, setCrudPersonnelRoleOpen] = useState(false);
  const [crudVehicleRoleOpen, setCrudVehicleRoleOpen] = useState(false);
  const [crudCargoRoleOpen, setCrudCargoRoleOpen] = useState(false);
  const [crudPoliceStationOpen, setCrudPoliceStationOpen] = useState(false);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(
    mode === "edit" ? (routeMissionId ?? null) : null,
  );
  const [missionCode, setMissionCode] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
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
  const [cargoTruckRows, setCargoTruckRows] = useState<CargoTruckRow[]>([blankCargoTruck("สินค้า 1")]);
  const [vRows, setVRows] = useState<VRow[]>([
    { vehicleId: "", vehicleRoleId: "", fuelLiters: "", fuelType: "", fuelAmount: "" },
  ]);
  const [fuelPrices, setFuelPrices] = useState<FuelPrices>({ GASOLINE: "", DIESEL: "" });
  const [dRows, setDRows] = useState<DRow[]>([{ address: "", cargoValue: "0", containerCount: 1 }]);
  const [psRows, setPsRows] = useState<PsRow[]>([{ policeStationId: "", amount: "0", estimateItemCode: "2.4" }]);
  // แก้รหัส Vendor ของสถานี (master) — บันทึกพร้อมภารกิจ; ไม่แก้ policeStationMasters ตรง ๆ เพราะจะโหลดฟอร์มใหม่
  const [vendorDrafts, setVendorDrafts] = useState<Record<string, string>>({});
  const [savingMission, setSavingMission] = useState(false);
  const [saveFlash, setSaveFlash] = useState<string | null>(null);
  const [mastersReady, setMastersReady] = useState(false);
  const [crewPopupVehicleId, setCrewPopupVehicleId] = useState<string | null>(null);
  const [crewPopupCargoId, setCrewPopupCargoId] = useState<string | null>(null);
  const cargoDocInputRef = useRef<HTMLInputElement>(null);
  const [cargoDocBusy, setCargoDocBusy] = useState(false);
  const [cargoDocMsg, setCargoDocMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, v, r, pr, vr, cr, et, ps] = await Promise.all([
      apiJson<Personnel[]>("/api/personnel"),
      apiJson<Vehicle[]>("/api/vehicles"),
      apiJson<RouteMaster[]>("/api/route-master"),
      apiJson<NameMasterRow[]>("/api/mission-personnel-roles"),
      apiJson<NameMasterRow[]>("/api/mission-vehicle-roles"),
      apiJson<NameMasterRow[]>("/api/mission-cargo-roles"),
      apiJson<NameMasterRow[]>("/api/mission-expense-types"),
      apiJson<NameMasterRow[]>("/api/police-stations"),
    ]);
    setPersonnel(p);
    setVehicles(v);
    setRoutes(r);
    setPersonnelRoleMasters(pr);
    setVehicleRoleMasters(vr);
    setCargoRoleMasters(cr);
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

  const cargoDriverOptions = useMemo(
    () =>
      personnel
        .filter((p) => (p.personnelCategory?.name ?? "").trim() === "ขับรถสินค้า")
        .map((p) => ({
          value: p.id,
          label: personnelSelectLabel(p),
          keywords: `${p.position ?? ""} ${p.phone ?? ""} ${p.idNumber ?? ""} ขับรถสินค้า`,
        })),
    [personnel],
  );

  const personnelOptionsByTab = useMemo(() => {
    const map = {} as Record<
      MissionPersonnelTabKey,
      Array<{ value: string; label: string; keywords: string }>
    >;
    for (const tab of MISSION_STAFF_TABS) {
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
    for (const tab of MISSION_STAFF_TABS) counts[tab.key] = 0;
    for (const row of pRows) {
      if (row.personnelId && row.tabKey !== "driver") counts[row.tabKey] = (counts[row.tabKey] ?? 0) + 1;
    }
    return counts;
  }, [pRows]);

  const vehicleSearchOptions = useMemo(
    () =>
      vehicles.map((v) => ({
        value: v.id,
        label: v.licensePlate,
        keywords: `${v.brand ?? ""} ${v.model ?? ""} ${v.brandModel ?? ""} ${vehicleDisplayLabel(v)}`,
        imageUrl: (v.documents ?? []).find((d) => d.kind === "PHOTO")?.fileUrl ?? null,
      })),
    [vehicles],
  );

  const missionVehicleIds = useMemo(() => new Set(vRows.map((r) => r.vehicleId).filter(Boolean)), [vRows]);

  /** ป้ายทะเบียน + (นามเรียกขาน) จากขั้นยานพาหนะ */
  const missionVehicleLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of vRows) {
      if (!r.vehicleId) continue;
      const v = vehicles.find((x) => x.id === r.vehicleId);
      const plate = v?.licensePlate?.trim() || "—";
      const cs = r.callSign?.trim() || "";
      map.set(r.vehicleId, cs ? `${plate}(${cs})` : plate);
    }
    return map;
  }, [vRows, vehicles]);

  /** รถในภารกิจขึ้นก่อน — เลือกรถนอกรายการจะถูกเพิ่มเข้าขั้นยานพาหนะให้อัตโนมัติ */
  const crewVehicleOptions = useMemo(() => {
    const withMissionLabel = (o: (typeof vehicleSearchOptions)[number]) => {
      const labeled = missionVehicleLabelById.get(o.value);
      if (!labeled) return o;
      return {
        ...o,
        label: labeled,
        keywords: `${o.keywords} ${labeled}`,
      };
    };
    const inMission = vehicleSearchOptions.filter((o) => missionVehicleIds.has(o.value)).map(withMissionLabel);
    const others = vehicleSearchOptions.filter((o) => !missionVehicleIds.has(o.value));
    return [...inMission, ...others];
  }, [vehicleSearchOptions, missionVehicleIds, missionVehicleLabelById]);

  const cargoTractorIds = useMemo(
    () => new Set(cargoTruckRows.map((r) => r.tractorVehicleId).filter(Boolean)),
    [cargoTruckRows],
  );

  const crewByVehicle = useMemo(() => {
    const map = new Map<string, { go: string[]; ret: string[] }>();
    const add = (vehicleId: string, leg: "go" | "ret", name: string) => {
      if (!vehicleId) return;
      const cur = map.get(vehicleId) ?? { go: [], ret: [] };
      cur[leg].push(name);
      map.set(vehicleId, cur);
    };
    for (const r of pRows) {
      if (!r.personnelId) continue;
      const p = personnel.find((x) => x.id === r.personnelId);
      const name = p ? `${p.rank ? `${p.rank} ` : ""}${p.fullName}` : "—";
      if (r.assignedVehicleId) add(r.assignedVehicleId, "go", name);
      const onCargo = Boolean(r.assignedVehicleId && cargoTractorIds.has(r.assignedVehicleId));
      const same = onCargo ? false : r.returnVehicleSameAsGo !== false;
      const retId = same ? r.assignedVehicleId ?? "" : r.assignedVehicleReturnId ?? "";
      if (retId) add(retId, "ret", name);
    }
    return map;
  }, [pRows, personnel, cargoTractorIds]);

  const crewByCargoTruck = useMemo(() => {
    const map = new Map<string, CargoCrewInfo[]>();
    for (const r of pRows) {
      if (!r.personnelId) continue;
      const truck = cargoTruckRows.find(
        (t) =>
          (r.assignedVehicleId && t.tractorVehicleId === r.assignedVehicleId) ||
          (r.assignedCargoTruckId && t.id === r.assignedCargoTruckId),
      );
      if (!truck) continue;
      const p = personnel.find((x) => x.id === r.personnelId);
      const info: CargoCrewInfo = {
        name: p ? `${p.rank ? `${p.rank} ` : ""}${p.fullName}` : "—",
        phone: p?.phone ?? "",
        idNumber: p?.idNumber ?? "",
      };
      map.set(cargoSeatKey(truck), [...(map.get(cargoSeatKey(truck)) ?? []), info]);
    }
    return map;
  }, [pRows, personnel, cargoTruckRows]);

  const crewPopupCargo = crewPopupCargoId
    ? cargoTruckRows.find((r) => r.id === crewPopupCargoId)
    : undefined;
  const crewPopupCargoRiders = crewPopupCargo
    ? (crewByCargoTruck.get(cargoSeatKey(crewPopupCargo)) ?? [])
    : [];

  const vehicleRoleName = useCallback(
    (roleId: string) => vehicleRoleMasters.find((r) => r.id === roleId)?.name ?? "",
    [vehicleRoleMasters],
  );

  /** เรียงยานพาหนะตามลำดับรูปขบวน (ส่วนล่วงหน้า → … → สินค้า → คุ้มกันหลัง → ปิดท้าย → หัวลาก) */
  const orderVehicleRows = useCallback(
    (rows: VRow[]) => sortMissionVehicleRows(rows, vehicleRoleName),
    [vehicleRoleName],
  );

  /** เรียงบุคลากร — แท็บตำรวจเรียงยศสูง→ต่ำ */
  const orderPersonnelRows = useCallback(
    (rows: PRow[]) => sortMissionPersonnelRows(rows, personnel, personnelRoleMasters),
    [personnel, personnelRoleMasters],
  );

  const ensureVehiclesInMission = (
    items: Array<{ vehicleId: string; vehicleRoleId?: string; callSign?: string }>,
  ) => {
    setVRows((prev) => {
      let next = prev;
      let changed = false;
      for (const item of items) {
        if (!item.vehicleId || next.some((r) => r.vehicleId === item.vehicleId)) continue;
        const blank = next.findIndex((r) => !r.vehicleId);
        const row: VRow = {
          vehicleId: item.vehicleId,
          vehicleRoleId:
            item.vehicleRoleId ||
            (blank >= 0 ? next[blank].vehicleRoleId : "") ||
            vehicleRoleMasters[0]?.id ||
            "",
          fuelLiters: "",
          fuelType: "",
          fuelAmount: "",
          callSign: item.callSign ?? "",
        };
        next =
          blank >= 0
            ? next.map((r, i) => (i === blank ? { ...r, ...row, fuelAmount: r.fuelAmount } : r))
            : [...next, row];
        changed = true;
      }
      return changed ? orderVehicleRows(next) : prev;
    });
  };

  const ensureVehicleInMission = (
    vehicleId: string,
    extras?: { vehicleRoleId?: string; callSign?: string },
  ) => {
    ensureVehiclesInMission([{ vehicleId, ...extras }]);
  };

  const assignCrewVehicle = (idx: number, vehicleId: string, leg: "go" | "return" = "go") => {
    setPRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        if (leg === "return") return { ...r, assignedVehicleReturnId: vehicleId, returnVehicleSameAsGo: false };
        const onCargo = Boolean(vehicleId && cargoTractorIds.has(vehicleId));
        return {
          ...r,
          assignedVehicleId: vehicleId,
          assignedCargoTruckId: onCargo
            ? (cargoTruckRows.find((t) => t.tractorVehicleId === vehicleId)?.id ?? "")
            : "",
          returnVehicleSameAsGo: onCargo ? false : r.returnVehicleSameAsGo,
        };
      }),
    );
    if (vehicleId) ensureVehicleInMission(vehicleId);
  };

  const applyCargoDocument = async (file: File) => {
    if (cargoTruckRows.some(cargoRowHasDocumentData)) {
      if (!window.confirm("มีข้อมูลรถสินค้าอยู่แล้ว จะแทนที่ด้วยข้อมูลจากเอกสาร?")) {
        if (cargoDocInputRef.current) cargoDocInputRef.current.value = "";
        return;
      }
    }
    setCargoDocBusy(true);
    setCargoDocMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await apiFormJson<CargoParseResult>("/api/missions/cargo-trucks/parse", fd);
      if (result.cargoRoles?.length) setCargoRoleMasters(result.cargoRoles);
      if (result.createdPersonnel?.length) {
        setPersonnel((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          return [...prev, ...result.createdPersonnel!.filter((p) => !ids.has(p.id))];
        });
      }
      const roles = result.cargoRoles?.length ? result.cargoRoles : cargoRoleMasters;
      const next = (result.trucks ?? []).map((raw) => {
        let row = toCargoTruckForm(raw);
        const tractorId = matchTractorVehicleId(vehicles, row.tractorVehicleId, row.tractorPlate);
        const vehicle = vehicles.find((v) => v.id === tractorId);
        if (tractorId) row = withCargoTractor(row, tractorId, vehicle);
        const roleId = matchCargoRoleId(roles, row.roleId, row.role);
        if (roleId) row = withCargoRole(row, roleId, roles);
        return row;
      });
      setCargoTruckRows(next.length ? next : [blankCargoTruck()]);
      const goodsRoleId = vehicleRoleMasters.find((r) => r.name === "สินค้า")?.id;
      const spareRoleId = vehicleRoleMasters.find((r) => r.name === "หัวลากสำรอง")?.id;
      ensureVehiclesInMission(
        next
          .filter((r) => r.tractorVehicleId)
          .map((r) => ({
            vehicleId: r.tractorVehicleId,
            vehicleRoleId: /หัวลาก/.test(r.role) ? spareRoleId : goodsRoleId,
            callSign: r.role,
          })),
      );
      const matchedHead = next.filter((r) => r.tractorVehicleId).length;
      const added = result.createdPersonnel?.length ?? 0;
      setCargoDocMsg(
        added
          ? `อ่านได้ ${next.length} คัน · จับคู่หัวลาก ${matchedHead}/${next.length} · เพิ่มกำลังพลใหม่ ${added} คน`
          : `อ่านได้ ${next.length} คัน · จับคู่หัวลาก ${matchedHead}/${next.length}`,
      );
    } catch (e) {
      setCargoDocMsg(e instanceof Error ? e.message : "อ่านเอกสารไม่สำเร็จ");
    } finally {
      setCargoDocBusy(false);
      if (cargoDocInputRef.current) cargoDocInputRef.current.value = "";
    }
  };

  const setCargoDriver = (rowId: string, slot: 1 | 2, personnelId: string) => {
    const person = personnel.find((p) => p.id === personnelId);
    setCargoTruckRows((cur) =>
      cur.map((r) => {
        if (r.id !== rowId) return r;
        const cleared =
          personnelId && slot === 1 && r.driver2PersonnelId === personnelId
            ? withCargoDriver(r, 2, "", undefined)
            : personnelId && slot === 2 && r.driver1PersonnelId === personnelId
              ? withCargoDriver(r, 1, "", undefined)
              : r;
        return withCargoDriver(cleared, slot, personnelId, person);
      }),
    );
  };

  const setReturnSameAsGo = (idx: number, same: boolean) => {
    setPRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        if (same && r.assignedVehicleId && cargoTractorIds.has(r.assignedVehicleId)) {
          return { ...r, returnVehicleSameAsGo: false };
        }
        return {
          ...r,
          returnVehicleSameAsGo: same,
          assignedVehicleReturnId: same ? "" : r.assignedVehicleReturnId || r.assignedVehicleId || "",
        };
      }),
    );
  };

  const onFuelPriceChange = (type: "GASOLINE" | "DIESEL", raw: string) => {
    const nextPrices = { ...fuelPrices, [type]: raw };
    setFuelPrices(nextPrices);
    setVRows((rows) => rows.map((r) => (r.fuelType === type ? withAutoLiters(r, nextPrices) : r)));
  };

  const patchVRow = (idx: number, patch: Partial<VRow>) => {
    const next = vRows.map((r, i) => {
      if (i !== idx) return r;
      const merged = { ...r, ...patch };
      return patch.fuelLiters !== undefined ? merged : withAutoLiters(merged, fuelPrices);
    });
    setVRows(next);
  };

  /** คำนวณค่าตอบแทน ธปท. ใหม่เฉพาะเมื่อวันที่/จำนวนวันเปลี่ยน — ไม่ทับยอดที่แก้เองตอนเปิดภารกิจ */
  const autoCompKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${plannedStart}|${plannedEnd}|${routeMissionDays ?? ""}`;
    if (autoCompKeyRef.current === LOADED_MARK) {
      autoCompKeyRef.current = key;
      return;
    }
    if (autoCompKeyRef.current === key) return;
    autoCompKeyRef.current = key;
    setPRows((prev) =>
      prev.map((row) => {
        const person = personnel.find((p) => p.id === row.personnelId);
        const auto = botAutoCompensationRate(person, plannedStart, plannedEnd, routeMissionDays);
        if (auto == null) return row;
        if (row.compensationRate === auto) return row;
        return { ...row, compensationRate: auto };
      }),
    );
  }, [plannedStart, plannedEnd, routeMissionDays, personnel]);

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
    {
      const nextRole = nextSuggestedCargoRole([], cargoRoleMasters);
      setCargoTruckRows([blankCargoTruck(nextRole.role, nextRole.roleId)]);
    }
    setPersonnelTab("bot");
    setVRows([
      { vehicleId: "", vehicleRoleId: vehicleRoleMasters[0]?.id ?? "", fuelLiters: "", fuelType: "", fuelAmount: "" },
    ]);
    setFuelPrices({ GASOLINE: "", DIESEL: "" });
    setDRows([{ address: "", cargoValue: "0", containerCount: 1 }]);
    setPsRows([{ policeStationId: "", amount: "0", estimateItemCode: "2.4" }]);
    setVendorDrafts({});
    estimateRef.current?.reset();
    actualExpenseRef.current?.reset();
  }, [personnelRoleMasters, vehicleRoleMasters, cargoRoleMasters]);

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
      autoCompKeyRef.current = LOADED_MARK;
      setRouteId(mission.routeId ?? "");
      setPlannedStart(isoToLocalDatetimeValue(mission.plannedStart));
      setPlannedEnd(isoToLocalDatetimeValue(mission.plannedEnd));
      const sortedDest = [...mission.destinations]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .filter((d) => d.address.trim());
      const personRows = mission.personnel.filter((p) => p.personnelId && p.personnelRoleId);
      const vehicleRows = mission.vehicles.filter((v) => v.vehicleId && v.vehicleRoleId);
      const savedTrucks = (mission.cargoTrucks ?? [])
        .map((t) => {
          let row = toCargoTruckForm(t);
          const tractorId = matchTractorVehicleId(vehicles, t.tractorVehicleId, t.tractorPlate);
          if (tractorId) {
            row = withCargoTractor(
              row,
              tractorId,
              vehicles.find((v) => v.id === tractorId),
            );
          }
          const id1 = matchCargoDriverId(personnel, t.driver1PersonnelId, t.driver1IdNumber, t.driver1Name);
          const id2 = matchCargoDriverId(personnel, t.driver2PersonnelId, t.driver2IdNumber, t.driver2Name);
          if (id1) row = withCargoDriver(row, 1, id1, personnel.find((p) => p.id === id1));
          if (id2) row = withCargoDriver(row, 2, id2, personnel.find((p) => p.id === id2));
          const roleId = matchCargoRoleId(cargoRoleMasters, t.roleId, row.role);
          if (roleId) row = withCargoRole(row, roleId, cargoRoleMasters);
          return row;
        })
        .filter(cargoTruckFilled);
      const mappedPeople = personRows.map((p) => {
        const person = personnel.find((x) => x.id === p.personnelId);
        const tabKey = missionPersonnelTabByCategory(person?.personnelCategory?.name) ?? "bot";
        const cargo = savedTrucks.find((t) => t.id === p.assignedCargoTruckId);
        const goVehicleId = p.assignedVehicleId || cargo?.tractorVehicleId || "";
        const onCargo = Boolean(goVehicleId && savedTrucks.some((t) => t.tractorVehicleId === goVehicleId));
        return {
          personnelId: p.personnelId,
          personnelRoleId: p.personnelRoleId,
          compensationRate: String(p.compensationRate ?? "0"),
          tabKey,
          assignedVehicleId: goVehicleId,
          assignedCargoTruckId: cargo?.id ?? p.assignedCargoTruckId ?? "",
          returnVehicleSameAsGo: onCargo ? false : p.returnVehicleSameAsGo !== false,
          assignedVehicleReturnId: p.assignedVehicleReturnId ?? "",
        };
      });
      const staffRows = mappedPeople.filter((r) => r.tabKey !== "driver");
      setPRows(
        staffRows.length
          ? sortMissionPersonnelRows(staffRows, personnel, personnelRoleMasters)
          : [
              {
                personnelId: "",
                personnelRoleId: defaultMissionRoleIdForTab("bot", personnelRoleMasters),
                compensationRate: "0",
                tabKey: "bot" as const,
              },
            ],
      );
      if (savedTrucks.length) {
        setCargoTruckRows(savedTrucks);
      } else {
        const legacyDrivers = mappedPeople.filter((r) => r.tabKey === "driver");
        if (legacyDrivers.length) {
          const paired: CargoTruckRow[] = [];
          for (let i = 0; i < legacyDrivers.length; i += 2) {
            const a = personnel.find((x) => x.id === legacyDrivers[i]?.personnelId);
            const b = personnel.find((x) => x.id === legacyDrivers[i + 1]?.personnelId);
            const nextRole = nextSuggestedCargoRole(paired, cargoRoleMasters);
            let row = blankCargoTruck(nextRole.role, nextRole.roleId);
            row = withCargoDriver(row, 1, a?.id ?? "", a);
            row = withCargoDriver(row, 2, b?.id ?? "", b);
            paired.push(row);
          }
          const emptyRole = nextSuggestedCargoRole([], cargoRoleMasters);
          setCargoTruckRows(paired.length ? paired : [blankCargoTruck(emptyRole.role, emptyRole.roleId)]);
        } else {
          const nextRole = nextSuggestedCargoRole([], cargoRoleMasters);
          setCargoTruckRows([blankCargoTruck(nextRole.role, nextRole.roleId)]);
        }
      }
      setPersonnelTab("bot");
      const loadedVRows: VRow[] = vehicleRows.length
        ? vehicleRows.map((v) => ({
            vehicleId: v.vehicleId,
            vehicleRoleId: v.vehicleRoleId,
            fuelLiters: v.fuelLiters != null && v.fuelLiters !== "" ? String(v.fuelLiters) : "",
            fuelType: (v.fuelType === "GASOLINE" || v.fuelType === "DIESEL" ? v.fuelType : "") as MissionVehicleFuelTypeUi,
            fuelAmount: v.fuelAmount != null && v.fuelAmount !== "" ? String(v.fuelAmount) : "",
            callSign: v.callSign ?? "",
          }))
        : [];
      const cargoRoleId =
        vehicleRoleMasters.find((r) => r.name === "สินค้า")?.id ??
        vehicleRoleMasters.find((r) => r.name === "หัวลากสำรอง")?.id ??
        vehicleRoleMasters[0]?.id ??
        "";
      for (const t of savedTrucks) {
        if (!t.tractorVehicleId || loadedVRows.some((r) => r.vehicleId === t.tractorVehicleId)) continue;
        loadedVRows.push({
          vehicleId: t.tractorVehicleId,
          vehicleRoleId: /หัวลาก/.test(t.role)
            ? (vehicleRoleMasters.find((r) => r.name === "หัวลากสำรอง")?.id ?? cargoRoleId)
            : cargoRoleId,
          fuelLiters: "",
          fuelType: "",
          fuelAmount: "",
          callSign: t.role,
        });
      }
      if (!loadedVRows.length) {
        loadedVRows.push({
          vehicleId: "",
          vehicleRoleId: vehicleRoleMasters[0]?.id ?? "",
          fuelLiters: "",
          fuelType: "",
          fuelAmount: "",
        });
      }
      setVRows(orderVehicleRows(loadedVRows));
      setFuelPrices({ GASOLINE: "", DIESEL: "" });
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
    [personnel, personnelRoleMasters, vehicleRoleMasters, cargoRoleMasters, policeStationMasters, orderVehicleRows, vehicles],
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
        if (r.tabKey === "driver") continue;
        if (!r.personnelId || !r.personnelRoleId) continue;
        if (seen.has(r.personnelId)) continue;
        seen.add(r.personnelId);
        out.push(r);
      }
      return out;
    })();
    const cargoTrucksPayload = cargoTruckRows
      .map((r, i) => ({ ...r, sortOrder: i }))
      .filter(cargoTruckFilled);
    const vehiclesOrdered = orderVehicleRows(vRows).filter((r) => r.vehicleId && r.vehicleRoleId);
    const vehiclesById = new Map<string, VRow>();
    for (const r of vehiclesOrdered) {
      if (!vehiclesById.has(r.vehicleId)) vehiclesById.set(r.vehicleId, r);
    }
    const vehiclesPayload = [...vehiclesById.values()];
    const vehiclesRaw = vehiclesOrdered;
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
      personnel: personnelPayload.map((r) => {
        const go =
          r.assignedVehicleId && vehiclesById.has(r.assignedVehicleId) ? r.assignedVehicleId : null;
        const cargoId =
          (go && cargoTrucksPayload.find((t) => t.tractorVehicleId === go)?.id) ||
          (r.assignedCargoTruckId && cargoTrucksPayload.some((t) => t.id === r.assignedCargoTruckId)
            ? r.assignedCargoTruckId
            : null);
        const same = cargoId ? false : tabUsesGoReturnVehicles(r.tabKey) ? r.returnVehicleSameAsGo !== false : true;
        const ret =
          !same && r.assignedVehicleReturnId && vehiclesById.has(r.assignedVehicleReturnId)
            ? r.assignedVehicleReturnId
            : null;
        return {
          personnelId: r.personnelId,
          personnelRoleId: r.personnelRoleId,
          compensationRate: r.compensationRate === "" ? 0 : Number(r.compensationRate) || 0,
          assignedVehicleId: go,
          assignedCargoTruckId: cargoId,
          returnVehicleSameAsGo: same,
          assignedVehicleReturnId: ret,
        };
      }),
      cargoTrucks: cargoTrucksPayload,
      vehicles: vehiclesPayload.map((r) => ({
        vehicleId: r.vehicleId,
        vehicleRoleId: r.vehicleRoleId,
        fuelLiters: r.fuelLiters.trim() === "" ? null : r.fuelLiters,
        fuelType: r.fuelType === "" ? null : r.fuelType,
        fuelAmount: r.fuelAmount.trim() === "" ? null : r.fuelAmount,
        callSign: r.callSign?.trim() || null,
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
      const vendorChanges = Object.entries(vendorDrafts).filter(([stationId, draft]) => {
        const master = policeStationMasters.find((s) => s.id === stationId);
        return master && draft.trim() !== (master.vendorCode ?? "").trim();
      });
      if (vendorChanges.length) {
        try {
          await Promise.all(
            vendorChanges.map(([stationId, draft]) =>
              apiJson(`/api/police-stations/${stationId}`, {
                method: "PATCH",
                body: JSON.stringify({ vendorCode: draft.trim() || null }),
              }),
            ),
          );
        } catch (e) {
          alert(
            e instanceof Error
              ? `บันทึกภารกิจแล้ว แต่รหัส Vendor ไม่สำเร็จ: ${e.message}`
              : "บันทึกภารกิจแล้ว แต่รหัส Vendor ไม่สำเร็จ",
          );
        }
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
    for (const tab of MISSION_STAFF_TABS) amounts[tab.key] = 0;
    for (const row of pRows) {
      if (!row.personnelId || row.tabKey === "driver") continue;
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
        { amount: 0, label: "รถสินค้า" },
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

  const steps = FORM_STEPS;

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
            titleSuffix={
              mode !== "create" ? [mode === "edit" ? missionCode : null, title.trim()].filter(Boolean).join(" · ") || null : null
            }
            extras={
              <>
                <Link to="/missions" className={toolbarLinkBtnClass}>
                  ← กลับรายการภารกิจ
                </Link>
                <button type="button" className={toolbarLinkBtnClass} onClick={() => setNotesOpen(true)}>
                  โน้ตสำคัญ
                </button>
                <button type="button" className={toolbarLinkBtnClass} onClick={closeForm}>
                  ยกเลิก
                </button>
              </>
            }
            primary={<MissionsSubNav />}
          />
        </div>

        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-1.5 backdrop-blur sm:px-5">
          <div className="flex flex-wrap gap-1">
            {steps.map((label, i) => {
              const tabAmount = formatStepTabAmount(stepExpenseSummaries[i]?.amount ?? 0);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setStep(i)}
                  className={`inline-flex max-w-full items-center gap-1 rounded-md px-2 py-1 text-left ${
                    step === i ? "bg-[#0000BF] text-white" : "bg-slate-100 text-slate-700 hover:text-[#2e2a58]"
                  }`}
                >
                  <span className="text-[11px] font-medium leading-none">
                    {i + 1}. {label}
                  </span>
                  {tabAmount ? (
                    <span
                      className={`text-[10px] font-bold tabular-nums leading-none ${
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
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#0000BF]/15 bg-[#0000BF]/5 px-2.5 py-1">
              <p className="text-[11px] font-semibold text-[#2e2a58]">{steps[step]}</p>
              <p className="text-[11px] text-slate-700">
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

            {step === STEP_CARGO && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <input
                      ref={cargoDocInputRef}
                      type="file"
                      accept="application/pdf,image/png,image/jpeg,image/webp,image/tiff,.pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void applyCargoDocument(file);
                        else e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      disabled={cargoDocBusy}
                      className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-[#4d47b6] hover:bg-slate-100 disabled:opacity-50"
                      onClick={() => cargoDocInputRef.current?.click()}
                    >
                      {cargoDocBusy ? "กำลังอ่าน…" : "อัปโหลดเอกสาร"}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-[#4d47b6] hover:bg-slate-100"
                      onClick={() => setCrudCargoRoleOpen(true)}
                    >
                      จัดการบทบาท
                    </button>
                </div>
                {cargoDocMsg ? (
                  <p className={`text-[11px] ${/ไม่สำเร็จ|ไม่อ่าน/.test(cargoDocMsg) ? "text-rose-600" : "text-emerald-700"}`}>
                    {cargoDocMsg}
                  </p>
                ) : null}
                {cargoDriverOptions.length === 0 ? (
                  <p className="text-[11px] text-amber-700">ยังไม่มีกำลังพลประเภทขับรถสินค้า</p>
                ) : null}
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <div className="hidden min-w-[68rem] grid-cols-[2rem_minmax(7rem,1fr)_minmax(5.2rem,0.55fr)_minmax(5.2rem,0.55fr)_minmax(8rem,1.15fr)_minmax(8rem,1.15fr)_minmax(5.5rem,0.7fr)_2.2rem_2.3rem] gap-1.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 sm:grid">
                    <span>ที่</span>
                    <span>รถส่วนหัว</span>
                    <span>ส่วนหาง</span>
                    <span>บทบาท</span>
                    <span>คนขับ 1</span>
                    <span>คนขับ 2</span>
                    <span>หมายเหตุ</span>
                    <span className="sr-only">ผู้โดยสาร</span>
                    <span className="sr-only">ลบ</span>
                  </div>
                  <ul className="min-w-[68rem] divide-y divide-slate-100">
                    {cargoTruckRows.length === 0 ? (
                      <li className="px-3 py-4 text-center text-xs text-slate-500">
                        ยังไม่มีรายการ — กด «+ เพิ่มคัน»
                      </li>
                    ) : (
                      cargoTruckRows.map((row, idx) => {
                        const patch = (part: Partial<CargoTruckRow>) =>
                          setCargoTruckRows((cur) => cur.map((r, i) => (i === idx ? { ...r, ...part } : r)));
                        const usedTractors = new Set(
                          cargoTruckRows.flatMap((r) =>
                            r.id === row.id || !r.tractorVehicleId ? [] : [r.tractorVehicleId],
                          ),
                        );
                        const tractorOpts = vehicleSearchOptions.filter(
                          (o) => o.value === row.tractorVehicleId || !usedTractors.has(o.value),
                        );
                        const setTractor = (vehicleId: string) => {
                          const vehicle = vehicles.find((v) => v.id === vehicleId);
                          setCargoTruckRows((cur) =>
                            cur.map((r, i) => (i === idx ? withCargoTractor(r, vehicleId, vehicle) : r)),
                          );
                          if (vehicleId) {
                            const cargoRoleId = /หัวลาก/.test(row.role)
                              ? vehicleRoleMasters.find((r) => r.name === "หัวลากสำรอง")?.id
                              : vehicleRoleMasters.find((r) => r.name === "สินค้า")?.id;
                            ensureVehicleInMission(vehicleId, {
                              vehicleRoleId: cargoRoleId,
                              callSign: row.role,
                            });
                          }
                        };
                        const riders = crewByCargoTruck.get(cargoSeatKey(row)) ?? [];
                        const driverCount = [row.driver1Name, row.driver2Name].filter((n) => n.trim()).length;
                        const crewCount = driverCount + riders.length;
                        const usedDrivers = new Set(
                          cargoTruckRows.flatMap((r) =>
                            r.id === row.id ? [] : [r.driver1PersonnelId, r.driver2PersonnelId].filter(Boolean),
                          ),
                        );
                        const driverSelect = (slot: 1 | 2) => {
                          const currentId = slot === 1 ? row.driver1PersonnelId : row.driver2PersonnelId;
                          const otherId = slot === 1 ? row.driver2PersonnelId : row.driver1PersonnelId;
                          const name = (slot === 1 ? row.driver1Name : row.driver2Name).trim();
                          const person = personnel.find((p) => p.id === currentId);
                          const unregistered =
                            (slot === 1 ? row.driver1Unregistered : row.driver2Unregistered) ||
                            isCargoDocImported(person?.remarks) ||
                            Boolean(name && !currentId);
                          const driverOpts = [
                            ...(currentId && !cargoDriverOptions.some((o) => o.value === currentId)
                              ? [
                                  {
                                    value: currentId,
                                    label: name || (person ? personnelSelectLabel(person) : currentId),
                                    keywords: `${name} ${person?.phone ?? ""} ${person?.idNumber ?? ""}`,
                                  },
                                ]
                              : []),
                            ...cargoDriverOptions.filter(
                              (o) => o.value === currentId || (o.value !== otherId && !usedDrivers.has(o.value)),
                            ),
                          ];
                          return (
                            <div className="flex min-w-0 items-start gap-0.5">
                              <div className="min-w-0 flex-1">
                                <SearchableSelect
                                  value={currentId}
                                  onChange={(v) => setCargoDriver(row.id, slot, v)}
                                  options={driverOpts}
                                  emptyLabel={`— คนขับ ${slot} —`}
                                  allowEmpty
                                  aria-label={`คนขับ ${slot} คัน ${idx + 1}`}
                                  inputClassName="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-sm text-slate-900"
                                />
                              </div>
                              {unregistered ? (
                                <span
                                  className="mt-1.5 shrink-0 text-amber-500"
                                  title="ไม่มีในทะเบียนกำลังพล — เพิ่มจากเอกสาร"
                                >
                                  {NavIcons.alert({ className: "h-3.5 w-3.5" })}
                                </span>
                              ) : null}
                            </div>
                          );
                        };
                        return (
                          <li
                            key={row.id || `cargo-truck-${idx}`}
                            className="grid grid-cols-[2rem_minmax(7rem,1fr)_minmax(5.2rem,0.55fr)_minmax(5.2rem,0.55fr)_minmax(8rem,1.15fr)_minmax(8rem,1.15fr)_minmax(5.5rem,0.7fr)_2.2rem_2.3rem] items-start gap-1.5 px-2 py-1.5"
                          >
                            <span className="pt-1.5 text-center text-xs tabular-nums text-slate-500">{idx + 1}</span>
                            <div>
                            <SearchableSelect
                              value={row.tractorVehicleId}
                              onChange={setTractor}
                              options={tractorOpts}
                              emptyLabel="— หัวลาก —"
                              allowEmpty
                              aria-label={`รถส่วนหัว คัน ${idx + 1}`}
                              inputClassName="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-sm text-slate-900"
                            />
                            {!row.tractorVehicleId && row.tractorPlate.trim() ? (
                              <p className="mt-0.5 px-0.5 text-[10px] text-amber-700">
                                {row.tractorPlate} — ไม่พบในยานพาหนะ
                              </p>
                            ) : null}
                            </div>
                            <input
                              aria-label={`ทะเบียนหางลาก คัน ${idx + 1}`}
                              className="mt-0.5 w-full rounded-md border border-slate-200 px-1.5 py-1 text-sm tabular-nums text-slate-900"
                              placeholder="70-3311"
                              value={row.trailerPlate}
                              onChange={(e) => patch({ trailerPlate: e.target.value })}
                            />
                            <select
                              aria-label={`บทบาทรถสินค้า คัน ${idx + 1}`}
                              className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-sm text-slate-900"
                              value={row.roleId}
                              onChange={(e) => {
                                const next = withCargoRole(row, e.target.value, cargoRoleMasters);
                                patch({ roleId: next.roleId, role: next.role });
                              }}
                            >
                              <option value="">—</option>
                              {cargoRoleMasters.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))}
                            </select>
                            {driverSelect(1)}
                            {driverSelect(2)}
                            <input
                              aria-label={`หมายเหตุ คัน ${idx + 1}`}
                              className="mt-0.5 w-full rounded-md border border-slate-200 px-1.5 py-1 text-xs text-slate-800"
                              placeholder="ผู้ควบคุม…"
                              value={row.note}
                              onChange={(e) => patch({ note: e.target.value })}
                            />
                            <button
                              type="button"
                              className={`relative mt-0.5 rounded-md p-1 ${
                                crewCount
                                  ? "text-[#0000BF] hover:bg-[#0000BF]/10"
                                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                              }`}
                              aria-label={crewCount ? `บุคลากร ${crewCount} คน` : "ดูคนขับและผู้โดยสาร"}
                              title="คนขับ / ผู้โดยสาร"
                              onClick={() => setCrewPopupCargoId(row.id)}
                            >
                              {NavIcons.personnel({ className: "h-4 w-4" })}
                              {crewCount > 0 ? (
                                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#0000BF] px-0.5 text-[9px] font-bold leading-none text-white">
                                  {crewCount}
                                </span>
                              ) : null}
                            </button>
                            <button
                              type="button"
                              className="mt-0.5 rounded-md px-1 py-1 text-xs text-rose-600 hover:bg-rose-50"
                              aria-label={`ลบคัน ${idx + 1}`}
                              onClick={() => {
                                const removedId = row.id;
                                setCargoTruckRows((cur) => {
                                  if (cur.length > 1) return cur.filter((_, i) => i !== idx);
                                  const nextRole = nextSuggestedCargoRole([], cargoRoleMasters);
                                  return [blankCargoTruck(nextRole.role, nextRole.roleId)];
                                });
                                if (removedId) {
                                  setCrewPopupCargoId((cur) => (cur === removedId ? null : cur));
                                  setPRows((prev) =>
                                    prev.map((r) =>
                                      r.assignedCargoTruckId === removedId ? { ...r, assignedCargoTruckId: "" } : r,
                                    ),
                                  );
                                }
                              }}
                            >
                              ลบ
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
                <button
                  type="button"
                  className="text-xs font-medium text-[#5b61ff] hover:text-[#4d47b6] hover:underline"
                  onClick={() =>
                    setCargoTruckRows((cur) => {
                      const nextRole = nextSuggestedCargoRole(cur, cargoRoleMasters);
                      return [...cur, blankCargoTruck(nextRole.role, nextRole.roleId)];
                    })
                  }
                >
                  + เพิ่มคัน
                </button>
              </div>
            )}

            {step === STEP_PERSONNEL && (
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

                <div
                  className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50/80 p-1"
                  role="tablist"
                  aria-label="ประเภทบุคลากร"
                >
                  {MISSION_STAFF_TABS.map((tab) => {
                    const active = personnelTab === tab.key;
                    const count = personnelTabCounts[tab.key] ?? 0;
                    const tabAmount = formatStepTabAmount(personnelTabAmounts[tab.key] ?? 0);
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition ${
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

                {tabUsesGoReturnVehicles(personnelTab) ? (
                  <p className="text-[11px] text-slate-500">
                    {personnelTab === "special" ? "ขาไปนั่งรถสินค้าได้ · ขากลับเลือกจากยานพาหนะ" : "ประจำรถขาไป / ขากลับ"}
                  </p>
                ) : null}

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  {tabUsesGoReturnVehicles(personnelTab) ? (
                    <div className="hidden min-w-[56rem] grid-cols-[minmax(0,1.2fr)_minmax(6.5rem,0.7fr)_minmax(8rem,1fr)_auto_minmax(8rem,1fr)_5.5rem_2.5rem] gap-1.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 sm:grid">
                      <span>บุคลากร</span>
                      <span>บทบาท</span>
                      <span className="flex items-center justify-between gap-1">
                        ประจำรถขาไป
                        <button
                          type="button"
                          className="normal-case tracking-normal text-[#0000BF] hover:underline"
                          onClick={() => setStep(STEP_VEHICLES)}
                        >
                          ไปยานพาหนะ →
                        </button>
                      </span>
                      <span className="text-center normal-case tracking-normal">เหมือนขาไป</span>
                      <span>ประจำรถขากลับ</span>
                      <span>ค่าตอบแทน</span>
                      <span className="sr-only">ลบ</span>
                    </div>
                  ) : (
                    <div className="hidden min-w-[48rem] grid-cols-[minmax(0,1.3fr)_minmax(7rem,0.8fr)_minmax(9rem,1fr)_5.5rem_2.5rem] gap-1.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 sm:grid">
                      <span>บุคลากร</span>
                      <span>บทบาท</span>
                      <span className="flex items-center justify-between gap-1">
                        ประจำรถ
                        <button
                          type="button"
                          className="normal-case tracking-normal text-[#0000BF] hover:underline"
                          onClick={() => setStep(STEP_VEHICLES)}
                        >
                          ไปยานพาหนะ →
                        </button>
                      </span>
                      <span>ค่าตอบแทน</span>
                      <span className="sr-only">ลบ</span>
                    </div>
                  )}
                  <ul
                    className={`divide-y divide-slate-100 ${
                      tabUsesGoReturnVehicles(personnelTab) ? "min-w-[56rem]" : "min-w-[48rem]"
                    }`}
                  >
                    {pRowsInActiveTab.length === 0 ? (
                      <li className="px-3 py-4 text-center text-xs text-slate-500">
                        ยังไม่มีรายชื่อในแถบนี้ — กด «+ เพิ่มบุคลากร»
                      </li>
                    ) : (
                      pRowsInActiveTab.map(({ row, index: idx }) => {
                        const dual = tabUsesGoReturnVehicles(row.tabKey);
                        const onCargo = Boolean(
                          row.assignedVehicleId && cargoTractorIds.has(row.assignedVehicleId),
                        );
                        const sameReturn = onCargo ? false : row.returnVehicleSameAsGo !== false;
                        const goVehicleValue = row.assignedVehicleId ?? "";
                        const returnVehicleId = sameReturn
                          ? row.assignedVehicleId ?? ""
                          : row.assignedVehicleReturnId ?? "";
                        const goInvalid = Boolean(
                          row.assignedVehicleId && !missionVehicleIds.has(row.assignedVehicleId),
                        );
                        return (
                        <li
                          key={`${row.tabKey}-${idx}`}
                          className={
                            dual
                              ? "grid grid-cols-[minmax(0,1.2fr)_minmax(6.5rem,0.7fr)_minmax(8rem,1fr)_auto_minmax(8rem,1fr)_5.5rem_2.5rem] items-center gap-1.5 px-2 py-1"
                              : "grid grid-cols-[minmax(0,1.3fr)_minmax(7rem,0.8fr)_minmax(9rem,1fr)_5.5rem_2.5rem] items-center gap-1.5 px-2 py-1"
                          }
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
                              setPRows(orderPersonnelRows(next));
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
                              setPRows(orderPersonnelRows(next));
                            }}
                          >
                            <option value="">—</option>
                            {personnelRoleMasters.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                          <SearchableSelect
                            value={goVehicleValue}
                            onChange={(v) => assignCrewVehicle(idx, v, "go")}
                            options={crewVehicleOptions}
                            emptyLabel="— ไม่ระบุ —"
                            allowEmpty
                            aria-label={dual ? `ประจำรถขาไปแถว ${idx + 1}` : `ประจำรถแถว ${idx + 1}`}
                            inputClassName={`w-full rounded-md border bg-white px-2 py-1 text-sm text-slate-900 ${
                              goInvalid ? "border-rose-300" : "border-slate-200"
                            }`}
                          />
                          {dual ? (
                            <>
                              <label
                                className={`flex items-center justify-center gap-1 px-1 ${
                                  onCargo ? "cursor-not-allowed opacity-40" : "cursor-pointer"
                                }`}
                                title={
                                  onCargo
                                    ? "นั่งรถสินค้าขาไป — ขากลับต้องเลือกยานพาหนะคุ้มกัน"
                                    : "ติ๊กหากโดยสารขากลับคันเดียวกับขาไป"
                                }
                              >
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5 rounded border-slate-300 text-[#0000BF]"
                                  checked={sameReturn}
                                  disabled={onCargo}
                                  onChange={(e) => setReturnSameAsGo(idx, e.target.checked)}
                                  aria-label={`ขากลับเหมือนขาไปแถว ${idx + 1}`}
                                />
                              </label>
                              <SearchableSelect
                                value={returnVehicleId}
                                onChange={(v) => assignCrewVehicle(idx, v, "return")}
                                options={crewVehicleOptions}
                                emptyLabel="— ไม่ระบุ —"
                                allowEmpty
                                disabled={sameReturn}
                                aria-label={`ประจำรถขากลับแถว ${idx + 1}`}
                                inputClassName={`w-full rounded-md border bg-white px-2 py-1 text-sm text-slate-900 ${
                                  sameReturn
                                    ? "border-slate-100 bg-slate-50 text-slate-500"
                                    : returnVehicleId && !missionVehicleIds.has(returnVehicleId)
                                      ? "border-rose-300"
                                      : "border-slate-200"
                                }`}
                              />
                            </>
                          ) : null}
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
                        );
                      })
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
                        returnVehicleSameAsGo: true,
                        assignedVehicleReturnId: "",
                      },
                    ])
                  }
                >
                  + เพิ่มบุคลากร
                  {MISSION_STAFF_TABS.find((t) => t.key === personnelTab)
                    ? ` (${MISSION_STAFF_TABS.find((t) => t.key === personnelTab)!.label})`
                    : ""}
                </button>
              </div>
            )}

            {step === STEP_STATIONS && (
              <div className="space-y-2">
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
                  <div className="hidden min-w-[50rem] grid-cols-[minmax(0,1.5fr)_minmax(8rem,0.8fr)_minmax(10rem,1fr)_minmax(7rem,0.7fr)_2.5rem] gap-1.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 sm:grid">
                    <span>สถานี / สังกัด</span>
                    <span>Vendor</span>
                    <span>ลิงก์รายการ</span>
                    <span>จำนวนเงิน (บาท)</span>
                    <span className="sr-only">ลบ</span>
                  </div>
                  <ul className="min-w-[50rem] divide-y divide-slate-100">
                    {psRows.map((row, idx) => (
                      <li
                        key={idx}
                        className="grid grid-cols-[minmax(0,1.5fr)_minmax(8rem,0.8fr)_minmax(10rem,1fr)_minmax(7rem,0.7fr)_2.5rem] items-center gap-1.5 px-2 py-1"
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
                        <input
                          aria-label={`รหัส Vendor แถว ${idx + 1}`}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm tabular-nums text-slate-900 disabled:bg-slate-50 disabled:text-slate-400"
                          disabled={!row.policeStationId}
                          maxLength={50}
                          placeholder={row.policeStationId ? "รหัส Vendor" : "—"}
                          title="รหัส Vendor ของสถานี — แก้แล้วใช้กับทุกภารกิจ"
                          value={
                            row.policeStationId
                              ? (vendorDrafts[row.policeStationId] ??
                                policeStationMasters.find((s) => s.id === row.policeStationId)?.vendorCode ??
                                "")
                              : ""
                          }
                          onChange={(e) => {
                            const value = e.target.value;
                            setVendorDrafts((cur) => ({ ...cur, [row.policeStationId]: value }));
                          }}
                        />
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

            {step === STEP_VEHICLES && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-600">กรอกค่าน้ำมันแต่ละคัน — ระบบคำนวณลิตรตามชนิดน้ำมัน</p>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-[#4d47b6] hover:bg-slate-100"
                    onClick={() => setCrudVehicleRoleOpen(true)}
                  >
                    จัดการบทบาทรถ…
                  </button>
                </div>
                <div className="grid gap-3 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-white p-3 shadow-sm sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600">ราคาเบนซิน (บาท/ลิตร)</span>
                    <CommaNumberInput
                      aria-label="ราคาเบนซินต่อลิตร"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm tabular-nums text-slate-900 shadow-sm focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20"
                      value={fuelPrices.GASOLINE}
                      placeholder="เช่น 35.50"
                      maxFractionDigits={2}
                      onChange={(raw) => onFuelPriceChange("GASOLINE", raw)}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600">ราคาดีเซล (บาท/ลิตร)</span>
                    <CommaNumberInput
                      aria-label="ราคาดีเซลต่อลิตร"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm tabular-nums text-slate-900 shadow-sm focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20"
                      value={fuelPrices.DIESEL}
                      placeholder="เช่น 32.94"
                      maxFractionDigits={2}
                      onChange={(raw) => onFuelPriceChange("DIESEL", raw)}
                    />
                  </label>
                </div>
                <p className="text-[11px] text-slate-500">เรียงตามรูปขบวนอัตโนมัติ</p>
                <div className="overflow-x-auto rounded-lg border border-slate-200 pr-1">
                  <div className="hidden min-w-[63rem] grid-cols-[minmax(0,1.15fr)_minmax(6rem,0.75fr)_7rem_5rem_5rem_minmax(8rem,0.9fr)_2.4rem_2.75rem] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 sm:grid">
                    <span>ยานพาหนะ</span>
                    <span>บทบาท</span>
                    <span>นามเรียกขาน</span>
                    <span>ลิตร</span>
                    <span>ชนิด</span>
                    <span className="text-right text-amber-800">ค่าน้ำมัน (บาท)</span>
                    <span className="sr-only">ประจำรถ</span>
                    <span className="sr-only">ลบ</span>
                  </div>
                  <ul className="min-w-[63rem] divide-y divide-slate-100">
                    {vRows.map((row, idx) => (
                      <li
                        key={idx}
                        className="grid grid-cols-[minmax(0,1.15fr)_minmax(6rem,0.75fr)_7rem_5rem_5rem_minmax(8rem,0.9fr)_2.4rem_2.75rem] items-center gap-2 px-3 py-1.5"
                      >
                        <SearchableSelect
                          value={row.vehicleId}
                          onChange={(v) => {
                            const next = [...vRows];
                            next[idx] = { ...row, vehicleId: v };
                            setVRows(orderVehicleRows(next));
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
                            setVRows(orderVehicleRows(next));
                          }}
                        >
                          <option value="">—</option>
                          {vehicleRoleMasters.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label={`นามเรียกขานแถว ${idx + 1}`}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
                          value={row.callSign ?? ""}
                          placeholder="—"
                          maxLength={100}
                          onChange={(e) => {
                            const next = [...vRows];
                            next[idx] = { ...row, callSign: e.target.value };
                            setVRows(next);
                          }}
                          onBlur={() => setVRows((prev) => orderVehicleRows(prev))}
                        />
                        <CommaNumberInput
                          aria-label={`ลิตรแถว ${idx + 1}`}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm tabular-nums text-slate-900"
                          value={row.fuelLiters}
                          placeholder={row.fuelType ? "—" : "เลือกชนิด"}
                          title={
                            Number.isFinite(fuelPriceForRow(row, fuelPrices))
                              ? "คำนวณอัตโนมัติจากค่าน้ำมัน ÷ ราคาต่อลิตร"
                              : "เลือกชนิดน้ำมันและกรอกราคาต่อลิตรเพื่อคำนวณอัตโนมัติ"
                          }
                          maxFractionDigits={0}
                          onChange={(raw) => patchVRow(idx, { fuelLiters: raw })}
                        />
                        <select
                          aria-label={`ชนิดน้ำมันแถว ${idx + 1}`}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
                          value={row.fuelType}
                          onChange={(e) =>
                            patchVRow(idx, { fuelType: e.target.value as MissionVehicleFuelTypeUi })
                          }
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
                          onChange={(raw) => patchVRow(idx, { fuelAmount: raw })}
                        />
                        {row.vehicleId ? (
                          (() => {
                            const crew = crewByVehicle.get(row.vehicleId);
                            const count = new Set([...(crew?.go ?? []), ...(crew?.ret ?? [])]).size;
                            return (
                              <button
                                type="button"
                                className={`relative rounded-md p-1 ${
                                  count
                                    ? "text-[#0000BF] hover:bg-[#0000BF]/10"
                                    : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                }`}
                                aria-label={
                                  count
                                    ? `ผู้ประจำรถ ${count} คน`
                                    : "ดูผู้ประจำรถ — ยังไม่ระบุ"
                                }
                                title="ผู้ประจำรถ"
                                onClick={() => setCrewPopupVehicleId(row.vehicleId)}
                              >
                                {NavIcons.personnel({ className: "h-4 w-4" })}
                                {count > 0 ? (
                                  <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#0000BF] px-0.5 text-[9px] font-bold leading-none text-white">
                                    {count}
                                  </span>
                                ) : null}
                              </button>
                            );
                          })()
                        ) : (
                          <span />
                        )}
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
                  <p className="text-xs text-slate-600">รวมค่าน้ำมันเชื้อเพลิง</p>
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
                onApprovalTotalChange={handleEstimateTotalChange}
              />
            </div>

            <div className={step === STEP_EXPENSES ? "block" : "hidden"} aria-hidden={step !== STEP_EXPENSES}>
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
        title="บทบาทรถสินค้า"
        apiPath="/api/mission-cargo-roles"
        open={crudCargoRoleOpen}
        onClose={() => setCrudCargoRoleOpen(false)}
        onChanged={load}
      />
      <CrudNameMasterModal
        title="สถานีตำรวจ / สังกัด"
        apiPath="/api/police-stations"
        vendorField
        open={crudPoliceStationOpen}
        onClose={() => setCrudPoliceStationOpen(false)}
        onChanged={() => {
          setVendorDrafts({});
          void load();
        }}
      />
      <MissionRateNotesModal open={notesOpen} onClose={() => setNotesOpen(false)} />
      <Modal
        open={Boolean(crewPopupVehicleId)}
        onClose={() => setCrewPopupVehicleId(null)}
        title={`ประจำรถ — ${crewPopupVehicleId ? missionVehicleLabelById.get(crewPopupVehicleId) ?? "ยานพาหนะ" : ""}`}
        size="sm"
      >
        {crewPopupVehicleId ? (
          <div className="space-y-4">
            {(["go", "ret"] as const).map((leg) => {
              const names = crewByVehicle.get(crewPopupVehicleId)?.[leg] ?? [];
              return (
                <div key={leg}>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                    {leg === "go" ? "ขาไป" : "ขากลับ"}
                  </p>
                  {names.length ? (
                    <ul className="space-y-1">
                      {names.map((n, i) => (
                        <li
                          key={`${leg}-${n}-${i}`}
                          className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm text-slate-800"
                        >
                          {n}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500">ยังไม่ระบุ</p>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              className="text-sm font-semibold text-[#0000BF] hover:underline"
              onClick={() => {
                setCrewPopupVehicleId(null);
                setStep(STEP_PERSONNEL);
              }}
            >
              กำหนดในบุคลากร →
            </button>
          </div>
        ) : null}
      </Modal>
      <Modal
        open={Boolean(crewPopupCargoId)}
        onClose={() => setCrewPopupCargoId(null)}
        title={`บุคลากร — ${
          crewPopupCargo
            ? crewPopupCargo.role || cargoTruckCallSign(crewPopupCargo) || "รถสินค้า"
            : ""
        }`}
        size="sm"
      >
        {crewPopupCargo ? (
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">คนขับ</p>
              <div className="space-y-2">
                {([1, 2] as const).map((slot) => {
                  const currentId = slot === 1 ? crewPopupCargo.driver1PersonnelId : crewPopupCargo.driver2PersonnelId;
                  const name = (slot === 1 ? crewPopupCargo.driver1Name : crewPopupCargo.driver2Name).trim();
                  const phone = slot === 1 ? crewPopupCargo.driver1Phone : crewPopupCargo.driver2Phone;
                  const idNumber = slot === 1 ? crewPopupCargo.driver1IdNumber : crewPopupCargo.driver2IdNumber;
                  const person = personnel.find((p) => p.id === currentId);
                  const unregistered =
                    (slot === 1 ? crewPopupCargo.driver1Unregistered : crewPopupCargo.driver2Unregistered) ||
                    isCargoDocImported(person?.remarks) ||
                    Boolean(name && !currentId);
                  return (
                    <div key={slot} className="rounded-lg border border-slate-200 px-2.5 py-2">
                      <p className="flex items-center gap-1 text-sm font-medium text-slate-900">
                        {name || `คนขับ ${slot} — ยังไม่ระบุ`}
                        {unregistered ? (
                          <span className="text-amber-500" title="ไม่มีในทะเบียนกำลังพล — เพิ่มจากเอกสาร">
                            {NavIcons.alert({ className: "h-3.5 w-3.5" })}
                          </span>
                        ) : null}
                      </p>
                      <div className="mt-0.5 space-y-0.5 text-[11px] text-slate-600">
                        {phone ? <p>โทร {phone}</p> : null}
                        {idNumber ? <p>บัตร {idNumber}</p> : null}
                        {unregistered ? <p className="text-amber-700">เพิ่มจากเอกสาร — ยังไม่มีในทะเบียนเดิม</p> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">ผู้โดยสาร</p>
              {crewPopupCargoRiders.length ? (
                <ul className="space-y-1">
                  {crewPopupCargoRiders.map((r, i) => (
                    <li key={`${r.name}-${i}`} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm text-slate-800">
                      <p>{r.name}</p>
                      {r.phone ? <p className="text-[11px] text-slate-600">โทร {r.phone}</p> : null}
                      {r.idNumber ? <p className="text-[11px] text-slate-600">บัตร {r.idNumber}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">ยังไม่มีผู้โดยสาร</p>
              )}
            </div>
            <button
              type="button"
              className="text-sm font-semibold text-[#0000BF] hover:underline"
              onClick={() => {
                setCrewPopupCargoId(null);
                setPersonnelTab("special");
                setStep(STEP_PERSONNEL);
              }}
            >
              กำหนดผู้โดยสารในบุคลากร →
            </button>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
