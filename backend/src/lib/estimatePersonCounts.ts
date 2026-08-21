/** ประเภทคนสำหรับกรอกจำนวนในประมาณการค่าใช้จ่าย (shared with frontend) */
export type EstimatePersonKey =
  | "bot"
  | "highwayCommissioned"
  | "highwayEnlisted"
  | "crimeCommissioned"
  | "crimeEnlisted"
  | "specialCommissioned"
  | "specialEnlisted"
  | "driver";

export type EstimatePersonCounts = Record<EstimatePersonKey, number>;

export const ESTIMATE_PERSON_KEYS: EstimatePersonKey[] = [
  "bot",
  "highwayCommissioned",
  "highwayEnlisted",
  "crimeCommissioned",
  "crimeEnlisted",
  "specialCommissioned",
  "specialEnlisted",
  "driver",
];

export const EMPTY_ESTIMATE_PERSON_COUNTS: EstimatePersonCounts = {
  bot: 0,
  highwayCommissioned: 0,
  highwayEnlisted: 0,
  crimeCommissioned: 0,
  crimeEnlisted: 0,
  specialCommissioned: 0,
  specialEnlisted: 0,
  driver: 0,
};

function nCount(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function normalizePersonCounts(raw: unknown): EstimatePersonCounts {
  const base = { ...EMPTY_ESTIMATE_PERSON_COUNTS };
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  for (const key of ESTIMATE_PERSON_KEYS) {
    base[key] = nCount(obj[key]);
  }
  // Backward compat: botJras + botJrasConcurrent → bot
  if (!base.bot) {
    base.bot = nCount(obj.botJras) + nCount(obj.botJrasConcurrent);
  }
  if (!base.highwayCommissioned && !base.highwayEnlisted && nCount(obj.highway)) {
    base.highwayCommissioned = nCount(obj.highway);
  }
  if (!base.crimeCommissioned && !base.crimeEnlisted && nCount(obj.crime)) {
    base.crimeCommissioned = nCount(obj.crime);
  }
  if (!base.specialCommissioned && !base.specialEnlisted && nCount(obj.special)) {
    base.specialCommissioned = nCount(obj.special);
  }
  return base;
}

export type EstimateCalcMeta = {
  tripType: "oneWay" | "roundTrip";
  destinationGroup: string;
  supportAmount: number;
  specialTransport: number;
  escort1: number;
  escort2: number;
};

function nMeta(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function parseCalcMeta(raw: unknown): EstimateCalcMeta {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    tripType: obj.tripType === "oneWay" ? "oneWay" : "roundTrip",
    destinationGroup: typeof obj.destinationGroup === "string" ? obj.destinationGroup : "",
    supportAmount: nMeta(obj.supportAmount, 2000),
    specialTransport: nMeta(obj.specialTransport, 3000),
    escort1: nMeta(obj.escort1, 2000),
    escort2: nMeta(obj.escort2, 2000),
  };
}

export function mergePersonCountsPayload(counts: EstimatePersonCounts, meta: EstimateCalcMeta) {
  return { ...counts, ...meta };
}
