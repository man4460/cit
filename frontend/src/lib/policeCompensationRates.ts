import type { EstimatePersonCounts, EstimatePersonKey } from "./estimatePersonCounts";

export type PoliceTripType = "oneWay" | "roundTrip";

export type PoliceDestGroupId = "songkhla" | "chiangMai" | "khonKaen" | "koratRayong";

export type PoliceDestGroup = {
  id: PoliceDestGroupId;
  label: string;
  codes: string[];
  names: string[];
  commissioned: { oneWay: number; roundTrip: number };
  enlisted: { oneWay: number; roundTrip: number };
};

/** เกณฑ์จ่ายค่าตอบแทนจนท.ตร. คุ้มครองการปฏิบัติงานของ ธปท. (มีผล 1 ส.ค. 2566) */
export const POLICE_DEST_GROUPS: PoliceDestGroup[] = [
  {
    id: "songkhla",
    label: "สงขลา / ศหญ.",
    codes: ["ศหญ"],
    names: ["สงขลา", "หาดใหญ่"],
    commissioned: { oneWay: 4500, roundTrip: 5500 },
    enlisted: { oneWay: 3800, roundTrip: 4600 },
  },
  {
    id: "chiangMai",
    label: "เชียงใหม่ / สุราษฎร์ธานี / อุบลราชธานี",
    codes: ["ศชม", "ศสร", "ศอบ"],
    names: ["เชียงใหม่", "สุราษฎร์", "อุบล"],
    commissioned: { oneWay: 4000, roundTrip: 4900 },
    enlisted: { oneWay: 3500, roundTrip: 4300 },
  },
  {
    id: "khonKaen",
    label: "ขอนแก่น / พิษณุโลก",
    codes: ["ศขก", "ศพล"],
    names: ["ขอนแก่น", "พิษณุโลก"],
    commissioned: { oneWay: 3500, roundTrip: 4300 },
    enlisted: { oneWay: 3000, roundTrip: 3600 },
  },
  {
    id: "koratRayong",
    label: "นครราชสีมา / ระยอง",
    codes: ["ศนร", "ศรย"],
    names: ["นครราชสีมา", "โคราช", "ระยอง"],
    commissioned: { oneWay: 3000, roundTrip: 3600 },
    enlisted: { oneWay: 2500, roundTrip: 3000 },
  },
];

export const POLICE_SUPPORT_MAX = 2000;
export const POLICE_SPECIAL_TRANSPORT_MAX = 3000;
export const POLICE_ESCORT_MAX = 2000;

/** สังกัดปฏิบัติการพิเศษ — ยอดรวมแยกเป็น 2.6 ค่าบริหาร (ไม่เกิน 2,000) + 2.7 ค่าพาหนะที่เหลือ */
export function isSpecialOpsPoliceStationName(name: string | null | undefined): boolean {
  const n = (name ?? "").replace(/\s+/g, "");
  return /ก่อการร้าย|ต่อต้านการก่อการร้าย|อรินทราช|หนุมาน|ปฏิบัติการพิเศษ/.test(n);
}

/** แยกยอดรวมปฏิบัติการพิเศษ → ค่าบริหาร + ค่าพาหนะ */
export function splitSpecialOpsAdminVehicle(total: number): { admin: number; vehicle: number } {
  const n = Number.isFinite(total) && total > 0 ? total : 0;
  const admin = n > 0 ? Math.min(POLICE_SUPPORT_MAX, n) : 0;
  return { admin, vehicle: Math.max(0, n - admin) };
}

export const POLICE_COMP_NOTES = [
  "เกณฑ์จ่ายค่าตอบแทนจนท.ตร. คุ้มครองการปฏิบัติงานของ ธปท. มีผลตั้งแต่วันที่ 1 สิงหาคม 2566 เป็นต้นไป",
  "ค่าตอบแทนขบวนขนส่งธนบัตร คิดเป็นบาท/คน/ครั้ง ตามชั้นยศและปลายทาง (เที่ยวเดียว หรือ ไป-กลับ)",
  "เงินสนับสนุนบริหารกำลังพล จ่ายได้ไม่เกิน 2,000 บาท/หน่วยงาน/ครั้ง",
  "ค่าพาหนะจนท.ปฏิบัติการพิเศษ จ่ายได้ไม่เกิน 3,000 บาท/ครั้ง",
  "ค่าตอบแทนจนท.ตร.อำนวยความสะดวกการจราจรนำเข้าตัวเมือง/ศูนย์ธนบัตรปลายทาง จ่ายได้ไม่เกิน 2,000 บาท ตามความจำเป็น",
  "ขบวนขนส่งกระดาษพิมพ์ธนบัตร: กทม./ปริมณฑล 600 บาท/คน/วัน · จังหวัดอื่นๆ 1,000 บาท/คน/วัน (เบิกตามวันปฏิบัติงานจริง)",
];

export const OTHER_MISSION_COMP_RATES = [
  {
    order: 1,
    itemType: "ชั้นสัญญาบัตร",
    qtyNote: "จำนวนคนให้เป็นไปตามความจำเป็นที่ จะต้องใช้กำลังในแต่ละวัน",
    rate: 1500,
    note: "เบิกจ่ายตามการมาปฏิบัติงานจริง",
  },
  {
    order: 2,
    itemType: "ชั้นประทวน",
    qtyNote: "จำนวนคนให้เป็นไปตามความจำเป็นที่ จะต้องใช้กำลังในแต่ละวัน",
    rate: 1000,
    note: "เบิกจ่ายตามการมาปฏิบัติงานจริง",
  },
] as const;

export type EstimateCalcMeta = {
  tripType: PoliceTripType;
  destinationGroup: PoliceDestGroupId | "";
  supportAmount: number;
  specialTransport: number;
  escort1: number;
  escort2: number;
};

export const EMPTY_ESTIMATE_CALC_META: EstimateCalcMeta = {
  tripType: "oneWay",
  destinationGroup: "",
  supportAmount: POLICE_SUPPORT_MAX,
  specialTransport: POLICE_SPECIAL_TRANSPORT_MAX,
  escort1: POLICE_ESCORT_MAX,
  escort2: POLICE_ESCORT_MAX,
};

const DEST_PRIORITY: PoliceDestGroupId[] = ["songkhla", "chiangMai", "khonKaen", "koratRayong"];

export function detectPoliceDestGroup(text: string | null | undefined): PoliceDestGroupId | "" {
  const raw = (text ?? "").replace(/\s+/g, "");
  if (!raw) return "";
  for (const id of DEST_PRIORITY) {
    const g = POLICE_DEST_GROUPS.find((x) => x.id === id)!;
    if (g.codes.some((c) => raw.includes(c))) return id;
    if (g.names.some((n) => raw.includes(n))) return id;
  }
  return "";
}

export function inferTripType(missionDays: number | null | undefined): PoliceTripType {
  if (missionDays != null && missionDays <= 1) return "oneWay";
  return "roundTrip";
}

export function policeRateFor(
  groupId: PoliceDestGroupId | "",
  tripType: PoliceTripType,
  rank: "commissioned" | "enlisted",
): number {
  const g = POLICE_DEST_GROUPS.find((x) => x.id === groupId);
  if (!g) return 0;
  return g[rank][tripType];
}

export function destGroupLabel(groupId: PoliceDestGroupId | ""): string {
  return POLICE_DEST_GROUPS.find((x) => x.id === groupId)?.label ?? "— เลือกปลายทาง —";
}

function nMeta(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function parseCalcMeta(raw: unknown): EstimateCalcMeta {
  const base = { ...EMPTY_ESTIMATE_CALC_META };
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  if (obj.tripType === "oneWay" || obj.tripType === "roundTrip") base.tripType = obj.tripType;
  const dest = String(obj.destinationGroup ?? "");
  if (POLICE_DEST_GROUPS.some((g) => g.id === dest)) base.destinationGroup = dest as PoliceDestGroupId;
  base.supportAmount = nMeta(obj.supportAmount, POLICE_SUPPORT_MAX);
  base.specialTransport = nMeta(obj.specialTransport, POLICE_SPECIAL_TRANSPORT_MAX);
  base.escort1 = nMeta(obj.escort1, POLICE_ESCORT_MAX);
  base.escort2 = nMeta(obj.escort2, POLICE_ESCORT_MAX);
  return base;
}

export function mergePersonCountsPayload(
  counts: EstimatePersonCounts,
  meta: EstimateCalcMeta,
): Record<string, unknown> {
  return { ...counts, ...meta };
}

const COMBINED_COMP_LINES: Record<
  string,
  { commissioned: EstimatePersonKey; enlisted: EstimatePersonKey }
> = {
  "2.1": { commissioned: "specialCommissioned", enlisted: "specialEnlisted" },
  "2.2": { commissioned: "highwayCommissioned", enlisted: "highwayEnlisted" },
  "2.3": { commissioned: "crimeCommissioned", enlisted: "crimeEnlisted" },
};

export function applyCompensationToLines<
  T extends {
    itemCode?: string | null;
    qtyEditable?: boolean;
    rateEditable?: boolean;
    amountEditable?: boolean;
    quantity?: string | number | null;
    unitPrice?: string | number | null;
    amount?: string | number | null;
    includeInTotal?: boolean;
  },
>(
  lines: T[],
  counts: EstimatePersonCounts,
  meta: EstimateCalcMeta,
  opts?: { onlyWhenPresent?: boolean },
): T[] {
  return lines.map((line) => {
    const code = line.itemCode ?? "";
    const spec = COMBINED_COMP_LINES[code];
    if (!spec) return line;
    const qtyC = counts[spec.commissioned] ?? 0;
    const qtyE = counts[spec.enlisted] ?? 0;
    const qty = qtyC + qtyE;
    // TRIP-2569: ไม่มีคนในลิงก์ → คงยอดเดิม (เช่นจาก Excel)
    if (opts?.onlyWhenPresent && qty <= 0) return line;
    const rateC = policeRateFor(meta.destinationGroup, meta.tripType, "commissioned");
    const rateE = policeRateFor(meta.destinationGroup, meta.tripType, "enlisted");
    const amount = qtyC * rateC + qtyE * rateE;
    const unitPrice = qty > 0 ? amount / qty : 0;
    return {
      ...line,
      quantity: line.qtyEditable ? String(qty) : line.quantity,
      unitPrice: line.rateEditable ? String(unitPrice) : line.unitPrice,
      amount: String(amount),
      includeInTotal: true,
    };
  });
}

/** @deprecated 2.6/2.7 ลิงก์จากสถานีเท่านั้น — ไม่คำนวณจากบุคลากรปฏิบัติการพิเศษ */
export function applySpecialOpsAdminVehicleSplit<
  T extends {
    itemCode?: string | null;
    includeInTotal?: boolean;
  },
>(lines: T[], _counts?: EstimatePersonCounts, _meta?: EstimateCalcMeta): T[] {
  return lines;
}

export function applyPoliceExpenseLinks<
  T extends {
    itemCode?: string | null;
    qtyEditable?: boolean;
    rateEditable?: boolean;
    amountEditable?: boolean;
    quantity?: string | number | null;
    unitPrice?: string | number | null;
    amount?: string | number | null;
    includeInTotal?: boolean;
  },
>(
  lines: T[],
  counts: EstimatePersonCounts,
  meta: EstimateCalcMeta,
  opts?: { onlyWhenPresent?: boolean },
): T[] {
  return applyCompensationToLines(lines, counts, meta, opts);
}

/** ยอดรวมค่าตอบแทนตำรวจจากเมนูบุคลากร (ผลรวม compensationRate ตามแท็บ) → ข้อ 2.1/2.2/2.3 */
export type PolicePersonnelItemCode = "2.1" | "2.2" | "2.3";

export type PolicePersonnelLineAmounts = {
  amounts: Record<PolicePersonnelItemCode, number>;
  linked: Record<PolicePersonnelItemCode, boolean>;
};

export const EMPTY_POLICE_PERSONNEL_LINE_AMOUNTS: PolicePersonnelLineAmounts = {
  amounts: { "2.1": 0, "2.2": 0, "2.3": 0 },
  linked: { "2.1": false, "2.2": false, "2.3": false },
};

const TAB_TO_POLICE_ITEM: Record<string, PolicePersonnelItemCode> = {
  special: "2.1",
  highway: "2.2",
  crime: "2.3",
};

export function sumPolicePersonnelCompensation(
  rows: Array<{
    tabKey?: string | null;
    personnelId?: string | null;
    compensationRate?: string | number | null;
  }>,
): PolicePersonnelLineAmounts {
  const totals: PolicePersonnelLineAmounts = {
    amounts: { "2.1": 0, "2.2": 0, "2.3": 0 },
    linked: { "2.1": false, "2.2": false, "2.3": false },
  };
  for (const row of rows) {
    if (!row.personnelId) continue;
    const code = TAB_TO_POLICE_ITEM[row.tabKey ?? ""];
    if (!code) continue;
    totals.linked[code] = true;
    const n = Number(String(row.compensationRate ?? "").replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) totals.amounts[code] += n;
  }
  return totals;
}

/** ใส่ยอดรวมจากบุคลากรตรง ๆ — ไม่คูณอัตราตารางปลายทาง */
export function applyPolicePersonnelAmountsToLines<
  T extends {
    itemCode?: string | null;
    qtyEditable?: boolean;
    rateEditable?: boolean;
    quantity?: string | number | null;
    unitPrice?: string | number | null;
    amount?: string | number | null;
    includeInTotal?: boolean;
  },
>(lines: T[], totals: PolicePersonnelLineAmounts): T[] {
  return lines.map((line) => {
    const code = line.itemCode ?? "";
    if (code !== "2.1" && code !== "2.2" && code !== "2.3") return line;
    if (!totals.linked[code]) return line;
    const sum = Math.max(0, totals.amounts[code] ?? 0);
    return {
      ...line,
      quantity: line.qtyEditable ? "1" : null,
      unitPrice: line.rateEditable ? String(sum) : null,
      amount: String(sum),
      includeInTotal: true,
    };
  });
}

export const STATION_ESTIMATE_ITEM_OPTIONS = [
  { code: "2.4", label: "2.4 นำเข้าพื้นที่ 1" },
  { code: "2.5", label: "2.5 นำเข้าพื้นที่ 2" },
  { code: "2.6", label: "2.6 ค่าบริหารปฏิบัติการพิเศษ" },
  { code: "2.7", label: "2.7 ค่าพาหนะปฏิบัติการพิเศษ" },
] as const;

export type StationEstimateItemCode = (typeof STATION_ESTIMATE_ITEM_OPTIONS)[number]["code"];

export const STATION_ESTIMATE_ITEM_CODES = new Set<string>(
  STATION_ESTIMATE_ITEM_OPTIONS.map((o) => o.code),
);

export type StationItemTotals = {
  amounts: Record<StationEstimateItemCode, number>;
  linked: Record<StationEstimateItemCode, boolean>;
};

export const EMPTY_STATION_ITEM_TOTALS: StationItemTotals = {
  amounts: { "2.4": 0, "2.5": 0, "2.6": 0, "2.7": 0 },
  linked: { "2.4": false, "2.5": false, "2.6": false, "2.7": false },
};

export function isStationEstimateItemCode(v: string | null | undefined): v is StationEstimateItemCode {
  return v === "2.4" || v === "2.5" || v === "2.6" || v === "2.7";
}

export function normalizeStationEstimateItemCode(v: string | null | undefined): StationEstimateItemCode | "" {
  if (v === "2.4" || v === "2.5" || v === "2.6" || v === "2.7") return v;
  return "";
}

export function sumStationItemTotals(
  rows: Array<{ estimateItemCode?: string | null; amount?: string | number | null }>,
): StationItemTotals {
  const totals: StationItemTotals = {
    amounts: { "2.4": 0, "2.5": 0, "2.6": 0, "2.7": 0 },
    linked: { "2.4": false, "2.5": false, "2.6": false, "2.7": false },
  };
  let auto24 = false;
  let auto25 = false;
  for (const row of rows) {
    let code = normalizeStationEstimateItemCode(row.estimateItemCode);
    if (!code) {
      if (!auto24) {
        code = "2.4";
        auto24 = true;
      } else if (!auto25) {
        code = "2.5";
        auto25 = true;
      } else {
        code = "2.4";
      }
    }
    totals.linked[code] = true;
    const n = Number(String(row.amount ?? "").replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) totals.amounts[code] += n;
  }
  return totals;
}

export function applyStationTotalsToLines<
  T extends {
    itemCode?: string | null;
    qtyEditable?: boolean;
    rateEditable?: boolean;
    amountEditable?: boolean;
    quantity?: string | number | null;
    unitPrice?: string | number | null;
    amount?: string | number | null;
  },
>(lines: T[], totals: StationItemTotals): T[] {
  /** ใช้กับหน้าค่าใช้จ่ายจริง — ใส่ยอดรวมอย่างเดียว ไม่ยุ่งรูปแบบประมาณการ */
  return lines.map((line) => {
    const code = line.itemCode ?? "";
    if (!isStationEstimateItemCode(code) || !totals.linked[code]) return line;
    const raw = Math.max(0, totals.amounts[code] ?? 0);
    const sum =
      code === "2.4" || code === "2.5" || code === "2.6" ? Math.min(POLICE_ESCORT_MAX, raw) : raw;
    return {
      ...line,
      amount: String(sum),
    };
  });
}

/** หน้าประมาณการเท่านั้น — ข้อ 2.4–2.7 เป็นช่องยอดรวม (ไม่มีจำนวน×อัตรา) */
export function applyStationTotalsToEstimateLines<
  T extends {
    itemCode?: string | null;
    qtyEditable?: boolean;
    rateEditable?: boolean;
    amountEditable?: boolean;
    quantity?: string | number | null;
    unitPrice?: string | number | null;
    amount?: string | number | null;
  },
>(lines: T[], totals: StationItemTotals): T[] {
  return lines.map((line) => {
    const code = line.itemCode ?? "";
    if (!isStationEstimateItemCode(code) || !totals.linked[code]) return line;
    const raw = Math.max(0, totals.amounts[code] ?? 0);
    const sum =
      code === "2.4" || code === "2.5" || code === "2.6"
        ? Math.min(POLICE_ESCORT_MAX, raw)
        : Math.min(POLICE_SPECIAL_TRANSPORT_MAX, raw);
    return {
      ...line,
      quantity: null,
      unitPrice: null,
      qtyEditable: false,
      rateEditable: false,
      amountEditable: true,
      amount: String(sum),
    };
  });
}
