import { parseLooseNumber } from "./formatNumber";
import type { MissionEstimateLine } from "../types";

export type EstimateFormLine = MissionEstimateLine;

export function estimateLineKey(line: Pick<MissionEstimateLine, "kind" | "groupCode" | "itemCode">): string {
  if (line.itemCode) return line.itemCode;
  return `g:${line.groupCode ?? line.kind}`;
}

/** รายการย่อยใต้หัวข้อกลุ่ม — ใช้เยื้องใน UI / Excel */
export function isEstimateItemLine(line: Pick<MissionEstimateLine, "kind">): boolean {
  return line.kind === "ITEM";
}

export function lineCurrentAmount(line: MissionEstimateLine): number {
  // ค่าใช้จ่ายจริง / ยอดรวม — ใช้ช่อง amount ตรง ๆ ไม่คูณจำนวน×อัตรา
  if (!line.qtyEditable || !line.rateEditable) {
    const amt = parseLooseNumber(line.amount);
    return Number.isFinite(amt) ? amt : 0;
  }
  const qty = parseLooseNumber(line.quantity);
  const rate = parseLooseNumber(line.unitPrice);
  if (Number.isFinite(qty) && Number.isFinite(rate)) {
    return qty * rate;
  }
  const amt = parseLooseNumber(line.amount);
  return Number.isFinite(amt) ? amt : 0;
}

/** รวมยอดรายการที่จ่ายด้วย «ยืมเงินทดรองจ่าย» — ใช้สรุปยอดส่งคืนเงิน */
export function sumAdvancePayoutAmount(lines: MissionEstimateLine[]): number {
  let sum = 0;
  for (const line of lines) {
    if (line.includeInTotal === false) continue;
    if (line.isReserve) continue;
    if ((line.payoutMethod ?? "").trim() !== "ยืมเงินทดรองจ่าย") continue;
    const amt = lineCurrentAmount(line);
    if (Number.isFinite(amt)) sum += amt;
  }
  return sum;
}

/** กลุ่มค่าใช้จ่ายรถบรรทุกสินค้า (แยกตารางจากรายการหลัก) */
export function isCargoTruckExpenseLine(
  line: Pick<MissionEstimateLine, "kind" | "groupCode" | "itemCode" | "expenseTypeName">,
): boolean {
  if (line.groupCode === "10") return true;
  return line.kind === "GROUP" && (line.expenseTypeName ?? "").trim() === "ค่าจ้างรถบรรทุก";
}

/** ข้อ 2.4–2.7 — กรอกยอดรวม (ไม่ใช้จำนวน×อัตรา) พื้นฐาน = อัตราเต็ม */
export function isLumpSumEstimateLine(line: Pick<MissionEstimateLine, "kind" | "groupCode" | "itemCode">): boolean {
  const code = line.itemCode ?? "";
  return code === "2.4" || code === "2.5" || code === "2.6" || code === "2.7";
}

/** อัตราเต็มเริ่มต้นของข้อ 2.4–2.7 (หน้าประมาณการเท่านั้น) */
export const ESTIMATE_LUMP_SUM_DEFAULTS: Record<string, number> = {
  "2.4": 2000,
  "2.5": 2000,
  "2.6": 2000,
  "2.7": 3000,
};

/** อัตราที่พักฐานในหน้าประมาณการ (ไม่ใช้กับหน้าค่าใช้จ่ายจริง) */
export const ESTIMATE_BOT_LODGING_RATE = 1400;

export function forceLumpSumEstimateLines(
  lines: MissionEstimateLine[],
  opts?: { zeroIfEmpty?: boolean },
): MissionEstimateLine[] {
  return lines.map((line) => {
    if (!isLumpSumEstimateLine(line)) return line;
    const code = line.itemCode ?? "";
    const amt = parseLooseNumber(line.amount);
    const fallback = ESTIMATE_LUMP_SUM_DEFAULTS[code] ?? 0;
    const value =
      Number.isFinite(amt) && amt > 0
        ? amt
        : opts?.zeroIfEmpty
          ? 0
          : fallback;
    return {
      ...line,
      quantity: null,
      unitPrice: null,
      qtyEditable: false,
      rateEditable: false,
      amountEditable: true,
      amount: String(value),
    };
  });
}

function toLumpSumLine(line: MissionEstimateLine, amount: number): MissionEstimateLine {
  return {
    ...line,
    quantity: null,
    unitPrice: null,
    qtyEditable: false,
    rateEditable: false,
    amountEditable: true,
    amount: String(Math.max(0, amount)),
  };
}

/** หน้าค่าใช้จ่ายจริงตอนสร้างภารกิจใหม่ — ยอดเริ่ม 0 (ลิงก์จะทับทีหลังเมื่อมีข้อมูล) */
export function zeroActualExpenseAmounts(lines: MissionEstimateLine[]): MissionEstimateLine[] {
  return lines.map((line) => {
    if (line.kind === "GROUP" && line.includeInTotal) {
      return toLumpSumLine(line, 0);
    }
    if (line.kind === "ITEM") {
      return {
        ...toLumpSumLine(line, 0),
        includeInTotal: line.includeInTotal !== false,
        isReserve: Boolean(line.isReserve),
        previousAmount: line.previousAmount ?? "0",
      };
    }
    return {
      ...line,
      quantity: null,
      unitPrice: null,
      qtyEditable: false,
      rateEditable: false,
      amount: line.includeInTotal ? "0" : line.amount,
    };
  });
}

/**
 * หน้าค่าใช้จ่ายจริง — แปลงเป็นยอดรวม และเปิดให้แก้จำนวนเงินได้ทุกแถว
 * (แยกจากหน้าประมาณการ: ไม่ใช้ ESTIMATE_BOT_LODGING_RATE / forceLumpSumEstimateLines)
 */
export function finalizeActualExpenseLines(
  lines: MissionEstimateLine[],
  linkedItemCodes: ReadonlySet<string>,
  referenceOnlyCodes: ReadonlySet<string>,
): MissionEstimateLine[] {
  return lines.map((line) => {
    const code = line.itemCode ?? "";

    // ยอดรวมตรง ๆ — ไม่คำนวณ qty × rate อีก
    const stored = parseLooseNumber(line.amount);
    const value =
      Number.isFinite(stored) && stored >= 0
        ? stored
        : (() => {
            const qty = parseLooseNumber(line.quantity);
            const rate = parseLooseNumber(line.unitPrice);
            if (Number.isFinite(qty) && Number.isFinite(rate)) return Math.max(0, qty * rate);
            return 0;
          })();

    if (line.kind === "GROUP" && !line.itemCode) {
      if (line.includeInTotal) {
        return {
          ...toLumpSumLine(line, value),
          previousAmount: line.previousAmount ?? String(value),
        };
      }
      return {
        ...line,
        quantity: null,
        unitPrice: null,
        qtyEditable: false,
        rateEditable: false,
        amountEditable: false,
      };
    }

    if (line.kind !== "ITEM") {
      return {
        ...line,
        quantity: null,
        unitPrice: null,
        qtyEditable: false,
        rateEditable: false,
      };
    }

    const linked = linkedItemCodes.has(code);
    const referenceOnly = referenceOnlyCodes.has(code);

    if (referenceOnly) {
      return {
        ...toLumpSumLine(line, value),
        includeInTotal: false,
        previousAmount:
          line.previousAmount && parseLooseNumber(line.previousAmount) > 0
            ? line.previousAmount
            : String(value),
      };
    }

    const prevRef = parseLooseNumber(line.previousAmount);
    return {
      ...toLumpSumLine(line, value),
      includeInTotal: linked ? true : line.includeInTotal !== false,
      previousAmount:
        Number.isFinite(prevRef) && prevRef > 0 ? line.previousAmount! : String(value),
    };
  });
}

export function roundToThousand(value: number): number {
  return Math.round(value / 1000) * 1000;
}

export function computeEstimateTotals(lines: MissionEstimateLine[]) {
  const groupSubtotals = new Map<string, { current: number; previous: number }>();
  let spend = 0;
  let reserve = 0;
  let previousSpend = 0;
  let previousReserve = 0;

  for (const line of lines) {
    const g = line.groupCode ?? "";
    if (!groupSubtotals.has(g)) groupSubtotals.set(g, { current: 0, previous: 0 });
    const bucket = groupSubtotals.get(g)!;
    const current = lineCurrentAmount(line);
    const prev = parseLooseNumber(line.previousAmount);
    const previous = Number.isFinite(prev) ? prev : 0;
    if (line.includeInTotal === false) continue;
    if (line.isReserve) {
      reserve += current;
      previousReserve += previous;
    } else {
      spend += current;
      previousSpend += previous;
      bucket.current += current;
      bucket.previous += previous;
    }
  }

  const roundedSpend = roundToThousand(spend);
  const previousRounded = roundToThousand(previousSpend);
  return {
    spend,
    roundedSpend,
    reserveAmount: reserve,
    approvalTotal: roundedSpend + reserve,
    previousSpend,
    previousReserve,
    previousApproval: previousRounded + previousReserve,
    groupSubtotals,
  };
}

export function applyPreviousAmounts(
  lines: MissionEstimateLine[],
  amountsByKey: Record<string, number> | undefined,
): MissionEstimateLine[] {
  if (!amountsByKey) {
    return lines.map((line) => ({ ...line, previousAmount: null }));
  }
  return lines.map((line) => {
    const key = estimateLineKey(line);
    const prev = amountsByKey[key];
    return {
      ...line,
      previousAmount: prev != null && Number.isFinite(prev) ? String(prev) : null,
    };
  });
}

export function templateToFormLines(template: {
  lines: Array<
    Omit<MissionEstimateLine, "quantity" | "unitPrice" | "amount" | "previousAmount"> & {
      quantity?: number | string | null;
      unitPrice?: number | string | null;
      amount?: number | string | null;
      previousAmount?: number | string | null;
    }
  >;
}): MissionEstimateLine[] {
  return mergeLegacyEnlistedEstimateLines(
    template.lines.map((line, i) => ({
      ...line,
      sortOrder: line.sortOrder ?? i,
      quantity: line.quantity == null ? null : String(line.quantity),
      unitPrice: line.unitPrice == null ? null : String(line.unitPrice),
      amount: String(line.amount ?? 0),
      previousAmount: line.previousAmount == null ? null : String(line.previousAmount),
    })),
  );
}

/** รวมแถวเก่า 2.1e/2.2e/2.3e เข้าช่องเดียว 2.1/2.2/2.3 */
export function mergeLegacyEnlistedEstimateLines(lines: MissionEstimateLine[]): MissionEstimateLine[] {
  const MERGE: Record<string, string> = { "2.1e": "2.1", "2.2e": "2.2", "2.3e": "2.3" };
  const addInto = new Map<string, number>();
  for (const line of lines) {
    const code = line.itemCode ?? "";
    const target = MERGE[code];
    if (!target) continue;
    addInto.set(target, (addInto.get(target) ?? 0) + lineCurrentAmount(line));
  }

  const NAMES: Record<string, string> = {
    "2.1": "จนท.ตร.ปฏิบัติการพิเศษ (อรินทราช / หนุมาน)",
    "2.2": "จนท.ตร.ทางหลวง",
    "2.3": "จนท.ตร.กองปราบ",
  };

  const merged = lines
    .filter((line) => !MERGE[line.itemCode ?? ""])
    .map((line) => {
      const code = line.itemCode ?? "";
      const extra = addInto.get(code) ?? 0;
      if (!extra && !NAMES[code]) return line;
      const base = lineCurrentAmount(line);
      const amount = base + extra;
      const next = {
        ...line,
        includeInTotal: true,
        name: NAMES[code] ?? line.name,
      };
      if (extra) {
        return {
          ...next,
          amount: String(amount),
          quantity: line.qtyEditable ? (line.quantity ?? "1") : line.quantity,
        };
      }
      return next;
    });

  return ensureCargoTruckExpenseLine(merged);
}

/** แถว «รถบรรทุกสินค้า» (กลุ่ม 10) — แทรกให้ข้อมูลเก่าที่ยังไม่มี */
export function ensureCargoTruckExpenseLine(
  lines: MissionEstimateLine[],
  opts?: { seedAmount?: number },
): MissionEstimateLine[] {
  const seed =
    opts?.seedAmount != null && Number.isFinite(opts.seedAmount) && opts.seedAmount > 0
      ? opts.seedAmount
      : null;

  const isTruckLine = isCargoTruckExpenseLine;

  const normalizeTruck = (line: MissionEstimateLine): MissionEstimateLine => {
    const cur = lineCurrentAmount(line);
    return {
      ...line,
      name: line.name?.trim() ? line.name : "รถบรรทุกสินค้า",
      expenseTypeName: line.expenseTypeName?.trim() || "ค่าจ้างรถบรรทุก",
      includeInTotal: true,
      amountEditable: true,
      qtyEditable: false,
      rateEditable: false,
      quantity: null,
      unitPrice: null,
      amount: cur > 0 ? String(cur) : seed != null ? String(seed) : line.amount || "0",
    };
  };

  if (lines.some(isTruckLine)) {
    return lines.map((line) => (isTruckLine(line) ? normalizeTruck(line) : line));
  }

  const truckLine: MissionEstimateLine = normalizeTruck({
    sortOrder: 0,
    kind: "GROUP",
    groupCode: "10",
    itemCode: null,
    name: "รถบรรทุกสินค้า",
    payoutMethod: "บิลเรียกเก็บ",
    quantity: null,
    unitPrice: null,
    amount: "0",
    previousAmount: null,
    qtyEditable: false,
    rateEditable: false,
    amountEditable: true,
    includeInTotal: true,
    isReserve: false,
    expenseTypeName: "ค่าจ้างรถบรรทุก",
  });

  const insertAt = (() => {
    const idx8 = lines.findIndex((l) => l.kind === "GROUP" && l.groupCode === "8");
    if (idx8 >= 0) return idx8;
    const idx9 = lines.findIndex((l) => l.kind === "GROUP" && l.groupCode === "9");
    if (idx9 >= 0) return idx9;
    return lines.length;
  })();

  const next = [...lines];
  next.splice(insertAt, 0, truckLine);
  return next.map((line, i) => ({ ...line, sortOrder: i }));
}

const TH_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

export function formatThaiDateRangeLabel(startLocal: string, endLocal: string): string {
  if (!startLocal) return "";
  const start = new Date(startLocal);
  if (Number.isNaN(start.getTime())) return "";
  const end = endLocal ? new Date(endLocal) : null;
  const be = (d: Date) => d.getFullYear() + 543;
  const day = (d: Date) => d.getDate();
  const month = (d: Date) => TH_MONTHS[d.getMonth()] ?? "";
  if (!end || Number.isNaN(end.getTime())) {
    return `วันที่ ${day(start)} ${month(start)} ${be(start)}`;
  }
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `ระหว่างวันที่ ${day(start)}–${day(end)} ${month(start)} ${be(start)}`;
  }
  return `ระหว่างวันที่ ${day(start)} ${month(start)} ${be(start)} – ${day(end)} ${month(end)} ${be(end)}`;
}

export function isoToLocalDatetimeValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
