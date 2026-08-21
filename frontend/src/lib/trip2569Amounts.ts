import { estimateLineKey } from "./missionEstimate";
import type { MissionEstimateLine } from "../types";

function toLumpSumFormLine(line: MissionEstimateLine, amount: number): MissionEstimateLine {
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

/**
 * ค่าใช้จ่ายจริง (TRIP-2569) — ใส่ยอดจาก Excel เป็นยอดรวมตรง ๆ (ไม่คูณจำนวน×อัตรา)
 * ข้ามรหัสที่ลิงก์จากบุคลากร/สถานี/น้ำมัน — ให้ลิงก์ทับเอง
 */
export function applyTrip2569ActualLumpSums(
  lines: MissionEstimateLine[],
  amountsByKey: Record<string, number> | null | undefined,
  opts?: { botAmountsLinked?: boolean; skipCodes?: ReadonlySet<string> },
): MissionEstimateLine[] {
  if (!amountsByKey || !Object.keys(amountsByKey).length) return lines;
  const skip = opts?.skipCodes;

  return lines.map((line) => {
    const itemCode = line.itemCode ?? "";
    const groupCode = line.groupCode ?? "";
    const key = estimateLineKey(line);

    if (line.kind === "GROUP" && !line.itemCode) {
      if (skip?.has(groupCode) || skip?.has(key)) return line;
      const raw = amountsByKey[key] ?? amountsByKey[groupCode];
      if (raw == null) return line;
      // สำรอง 8.2 ไม่ดึงจากสรุป trip
      if (groupCode === "8") return line;
      return toLumpSumFormLine({ ...line, includeInTotal: true }, raw);
    }

    if (!itemCode) return line;
    if (skip?.has(itemCode)) return line;
    // สำรองไม่ได้อยู่ในสรุป trip 69 — เคลียร์เพื่อไม่ให้ยอดรวมเพี้ยนจาก Excel
    if (itemCode === "8.2") {
      return toLumpSumFormLine({ ...line, isReserve: true }, 0);
    }

    const raw = amountsByKey[itemCode] ?? amountsByKey[key];
    if (raw == null) return line;
    return toLumpSumFormLine(line, raw);
  });
}

export function hasTrip2569Amounts(
  amounts: Record<string, number> | null | undefined,
): amounts is Record<string, number> {
  return Boolean(amounts && Object.keys(amounts).length > 0);
}

/** ผลรวมยอดจากแผนที่ Excel (ไม่รวม 8.2 สำรอง) */
export function sumTrip2569OperatingAmounts(amountsByKey: Record<string, number>): number {
  let sum = 0;
  for (const [k, v] of Object.entries(amountsByKey)) {
    if (!Number.isFinite(v)) continue;
    if (k === "8.2") continue;
    if (k.endsWith("Combined")) continue;
    if (k === "2.1e" || k === "2.2e" || k === "2.3e") continue;
    sum += v;
  }
  return sum;
}

/** ประมาณการตอนสร้างภารกิจใหม่ — คงอัตรามาตรฐาน · จำนวน/ยอดเป็น 0 */
export function blankEstimateQuantities(lines: MissionEstimateLine[]): MissionEstimateLine[] {
  return lines.map((line) => {
    // กลุ่มที่รวมในยอด (เช่น ทางด่วน / ล้างรถ / น้ำมัน / ประกัน) → เริ่มที่ 0
    if (line.kind === "GROUP" && line.includeInTotal) {
      return { ...line, amount: "0" };
    }
    if (line.kind !== "ITEM") return line;

    const code = line.itemCode ?? "";
    // 2.4–2.7 กรอกยอดรวม — เริ่ม 0 (ยังไม่ใส่เต็มอัตรา)
    if (code === "2.4" || code === "2.5" || code === "2.6" || code === "2.7") {
      return {
        ...line,
        quantity: null,
        unitPrice: null,
        qtyEditable: false,
        rateEditable: false,
        amountEditable: true,
        amount: "0",
      };
    }

    if (line.qtyEditable && line.rateEditable) {
      return { ...line, quantity: "0", amount: "0" };
    }
    if (line.amountEditable || line.includeInTotal !== false) {
      return { ...line, amount: "0" };
    }
    return line;
  });
}

/** @deprecated */
export function applyTrip2569AmountsToLines(
  lines: MissionEstimateLine[],
  amountsByKey: Record<string, number> | null | undefined,
): MissionEstimateLine[] {
  return applyTrip2569ActualLumpSums(lines, amountsByKey);
}

export const TRIP2569_LOCKED_ITEM_CODES = new Set<string>();

/** รหัสที่ลิงก์จากฟอร์ม — ไม่ดึงยอด Excel ทับ (ให้ลิงก์มาก่อน) */
export function trip2569ActualSkipCodes(
  extras?: ReadonlySet<string> | string[],
): Set<string> {
  const skip = new Set<string>([
    "2.1",
    "2.2",
    "2.3",
    "2.4",
    "2.5",
    "2.6",
    "2.7",
    "5.1",
    "5.2",
    "5.3",
    "8.1",
    "6",
  ]);
  if (extras) {
    for (const c of extras) skip.add(c);
  }
  return skip;
}
