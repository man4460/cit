import { parseLooseNumber } from "./formatNumber";
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

export type EstimatePersonTypeDef =
  | { key: "bot" | "driver"; label: string; kind: "single" }
  | {
      key: "highway" | "crime" | "special";
      label: string;
      kind: "police";
      commissionedKey: EstimatePersonKey;
      enlistedKey: EstimatePersonKey;
    };

export const ESTIMATE_PERSON_TYPES: EstimatePersonTypeDef[] = [
  { key: "bot", label: "จนท.ธปท.", kind: "single" },
  {
    key: "highway",
    label: "จนท.ตร.ทางหลวง",
    kind: "police",
    commissionedKey: "highwayCommissioned",
    enlistedKey: "highwayEnlisted",
  },
  {
    key: "crime",
    label: "จนท.ตร.กองปราบ",
    kind: "police",
    commissionedKey: "crimeCommissioned",
    enlistedKey: "crimeEnlisted",
  },
  {
    key: "special",
    label: "จนท.ปฏิบัติการพิเศษ",
    kind: "police",
    commissionedKey: "specialCommissioned",
    enlistedKey: "specialEnlisted",
  },
  { key: "driver", label: "พลขับรถสินค้า", kind: "single" },
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

export type EstimateQtySource = EstimatePersonKey | "police" | "total";

/** รายการที่ใช้จำนวนคน×อัตราในประมาณการ — ดึงจำนวนจากประเภทคน */
export const ESTIMATE_QTY_SOURCE_BY_ITEM: Record<string, EstimateQtySource> = {
  "1.1": "driver",
  "1.2": "total",
  "1.3": "total",
  "1.4": "total",
  "1.5": "total",
  "1.6": "police",
  "1.7": "total",
  "1.8": "police",
  "5.1": "bot",
};

/** รายการที่ลิงก์จากจนท.ธปท. — 5.1 จำนวนคน×อัตราที่พัก · 5.2–8.1 ยอดรวม
 *  หมายเหตุ: หน้าประมาณการส่ง defaultLodgingRate=1400 · หน้าค่าใช้จ่ายไม่ใช้ค่านี้ปนกัน */
export const BOT_AMOUNT_ITEM_CODES = ["5.1", "5.2", "5.3", "8.1"] as const;
export type BotAmountItemCode = (typeof BOT_AMOUNT_ITEM_CODES)[number];

export type BotLineAmounts = Record<BotAmountItemCode, number>;

export const EMPTY_BOT_LINE_AMOUNTS: BotLineAmounts = {
  "5.1": 0,
  "5.2": 0,
  "5.3": 0,
  "8.1": 0,
};

export function applyBotLineAmountsToLines<
  T extends {
    itemCode?: string | null;
    qtyEditable?: boolean;
    rateEditable?: boolean;
    amountEditable?: boolean;
    quantity?: string | number | null;
    unitPrice?: string | number | null;
    amount?: string | number | null;
  },
>(
  lines: T[],
  amounts: BotLineAmounts,
  linked: boolean,
  opts?: { defaultLodgingRate?: number },
): T[] {
  if (!linked) return lines;
  return lines.map((line) => {
    const code = line.itemCode ?? "";
    if (code === "5.1") {
      const botCount = Math.max(0, Math.floor(amounts["5.1"] ?? 0));
      const rate = parseLooseNumber(line.unitPrice);
      const fallback = opts?.defaultLodgingRate;
      const unitRate =
        Number.isFinite(rate) && rate > 0
          ? rate
          : fallback != null && fallback > 0
            ? fallback
            : 0;
      if (!botCount) {
        return {
          ...line,
          quantity: line.qtyEditable ? "0" : line.quantity,
          amount: "0",
        };
      }
      return {
        ...line,
        quantity: line.qtyEditable ? String(botCount) : line.quantity,
        unitPrice: line.rateEditable ? String(unitRate) : line.unitPrice,
        amount: String(botCount * unitRate),
      };
    }
    if (code !== "5.2" && code !== "5.3" && code !== "8.1") return line;
    const sum = Math.max(0, amounts[code] ?? 0);
    return {
      ...line,
      quantity: line.qtyEditable ? "1" : null,
      unitPrice: line.rateEditable ? String(sum) : null,
      amount: String(sum),
    };
  });
}

const POLICE_ENLISTED_RE = /^(จ\.?\s*ส\.?\s*ต\.?|ด\.?\s*ต\.?|ส\.?\s*ต\.?)/i;
const POLICE_COMMISSIONED_RE = /^(ว่าที่|พล\.?\s*ต\.?|พ\.?\s*ต\.?|ร\.?\s*ต\.?)/i;

/** สัญญาบัตร = ร.ต. / พ.ต. / พล.ต. · ประทวน = ส.ต. / ด.ต. / จ.ส.ต. · ไม่มียศถือเป็นประทวน */
export function isPoliceCommissionedRank(rank: string | null | undefined): boolean {
  const r = (rank ?? "").trim().replace(/\s+/g, "");
  if (!r) return false;
  if (POLICE_ENLISTED_RE.test(r)) return false;
  return POLICE_COMMISSIONED_RE.test(r);
}

function nCount(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function normalizePersonCounts(raw: unknown): EstimatePersonCounts {
  const base = { ...EMPTY_ESTIMATE_PERSON_COUNTS };
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(base) as EstimatePersonKey[]) {
    base[key] = nCount(obj[key]);
  }
  // Backward compat: botJras + botJrasConcurrent → bot
  if (!base.bot) {
    base.bot = nCount(obj.botJras) + nCount(obj.botJrasConcurrent);
  }
  // Backward compat: ข้อมูลเก่าที่ยังไม่แยกสัญญาบัตร/ประทวน
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

export function policePersonCount(counts: EstimatePersonCounts): number {
  return (
    counts.highwayCommissioned +
    counts.highwayEnlisted +
    counts.crimeCommissioned +
    counts.crimeEnlisted +
    counts.specialCommissioned +
    counts.specialEnlisted
  );
}

export function totalPersonCount(counts: EstimatePersonCounts): number {
  return counts.bot + policePersonCount(counts) + counts.driver;
}

export function qtyFromPersonSource(counts: EstimatePersonCounts, source: EstimateQtySource): number {
  if (source === "total") return totalPersonCount(counts);
  if (source === "police") return policePersonCount(counts);
  return counts[source] ?? 0;
}

export function applyPersonCountsToLines<
  T extends { itemCode?: string | null; qtyEditable?: boolean; quantity?: string | number | null },
>(lines: T[], counts: EstimatePersonCounts, skipItemCodes?: ReadonlySet<string>): T[] {
  return lines.map((line) => {
    if (!line.qtyEditable || !line.itemCode) return line;
    if (skipItemCodes?.has(line.itemCode)) return line;
    const source = ESTIMATE_QTY_SOURCE_BY_ITEM[line.itemCode];
    if (!source) return line;
    const qty = qtyFromPersonSource(counts, source);
    return { ...line, quantity: String(qty) };
  });
}
