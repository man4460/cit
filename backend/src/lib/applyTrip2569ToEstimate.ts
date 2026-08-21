import type { EstimateTemplate, EstimateTemplateLine } from "./missionEstimateTemplate.js";
import { lineKey } from "./missionEstimateTemplate.js";
import type { Trip2569Data } from "./missionTrip2569Workbook.js";

const POLICE_ESCORT_MAX = 2000;

function n(v: number | null | undefined): number {
  return Number.isFinite(v) ? (v as number) : 0;
}

/** ตั้ง qty×rate ให้ตรงยอด Excel (ปรับ unitPrice เมื่อปัดจำนวนแล้วคูณไม่ตรง) */
function applyQtyRateAmount(line: EstimateTemplateLine, amount: number): EstimateTemplateLine {
  if (!line.qtyEditable || !line.rateEditable) {
    return { ...line, amount };
  }
  const rate = n(line.unitPrice);
  if (rate > 0) {
    let qty = Math.round(amount / rate);
    if (qty <= 0) qty = n(line.quantity) || 1;
    const unitPrice = amount / qty;
    return { ...line, quantity: qty, unitPrice, amount };
  }
  return { ...line, amount, quantity: 1, unitPrice: amount };
}

/**
 * นำยอดจากชีต trip 69 มาใส่ในเทมเพลตประมาณการ
 * — ใช้เป็นค่าหลักสำหรับ 5 ทริปปี 2569
 */
export function applyTrip2569ToTemplate(template: EstimateTemplate, trip: Trip2569Data): EstimateTemplate {
  const amounts = trip.amountsByKey;
  const gt = trip.groupTotals;

  const lines = template.lines.map((line) => {
    if (line.kind === "GROUP" && !line.itemCode) {
      const code = line.groupCode ?? "";
      if (code === "3" && (amounts["3"] != null || gt.fees > 0)) {
        return { ...line, amount: amounts["3"] ?? gt.fees };
      }
      if (code === "4" && (amounts["4"] != null || gt.misc > 0)) {
        return { ...line, amount: amounts["4"] ?? gt.misc };
      }
      if (code === "6" && (amounts["6"] != null || gt.fuel > 0)) {
        return { ...line, amount: amounts["6"] ?? gt.fuel };
      }
      if (code === "7" && (amounts["7"] != null || gt.insurance > 0)) {
        return { ...line, amount: amounts["7"] ?? gt.insurance };
      }
      return line;
    }

    if (!line.itemCode) return line;
    const code = line.itemCode;
    const raw = amounts[code];
    if (raw == null || raw === 0) return line;

    if (code === "2.4" || code === "2.5") {
      const capped = Math.min(POLICE_ESCORT_MAX, raw);
      return applyQtyRateAmount(line, capped);
    }
    if (code === "2.6") {
      return applyQtyRateAmount(line, Math.min(POLICE_ESCORT_MAX, raw));
    }
    if (code === "2.7") {
      return applyQtyRateAmount(line, raw);
    }
    if (code.startsWith("1.") || code === "5.1" || code === "5.2" || code === "8.1") {
      return applyQtyRateAmount(line, raw);
    }
    if (code === "5.3") {
      return { ...line, amount: raw };
    }
    return line;
  });

  const label = trip.routeText.replace(/\n/g, " ").trim() || template.currentLabel;
  const notes =
    `${template.notes}\n\n` +
    `(อ้างอิงชีต trip 69 — ${trip.missionCode} ${trip.dateRange})`.trim();

  return {
    currentLabel: label,
    notes,
    lines,
  };
}

/**
 * แผนที่ยอดสำหรับค่าใช้จ่ายจริง — รวมทุกหมวดให้รวมแล้ว = คชจ.ดำเนินงานในชีตสรุป
 * 2.1 ปฏิบัติการพิเศษ · 2.2 ทางหลวง · 2.3 กองปราบ (ไม่แยกสัญญาบัตร/ประทวน)
 * 2.4–2.7 จากสถานี / ชีต (นำเข้า + ค่าบริหาร/พาหนะ)
 */
export function trip2569AmountsByKey(trip: Trip2569Data): Record<string, number> {
  const src = trip.amountsByKey;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(src)) {
    if (k.endsWith("Combined")) continue;
    if (k === "2.1e" || k === "2.2e" || k === "2.3e") continue;
    out[k] = v;
  }

  out["2.1"] = n(src.specialCombined);
  out["2.2"] = n(src.highwayCombined);
  out["2.3"] = n(src.crimeCombined);
  // 2.6/2.7 จากสถานี (กองกำกับฯ) — ไม่ดึงจากยอด special ในชีตอีก
  if (out["2.6"] == null) out["2.6"] = 0;
  if (out["2.7"] == null) out["2.7"] = 0;

  const gt = trip.groupTotals;
  out["3"] = n(src["3"] ?? gt.fees);
  out["4"] = n(src["4"] ?? gt.misc);
  out["6"] = n(src["6"] ?? gt.fuel);
  out["7"] = n(src["7"] ?? gt.insurance);
  return out;
}

export function trip2569Meta(trip: Trip2569Data) {
  return {
    tripNo: trip.tripNo,
    missionCode: trip.missionCode,
    routeText: trip.routeText,
    dateRange: trip.dateRange,
    spareTractor: trip.spareTractor,
    personnel: trip.personnel,
    personCounts: trip.personCounts,
    amountsByKey: trip2569AmountsByKey(trip),
    groupTotals: trip.groupTotals,
    lineKeys: Object.keys(trip2569AmountsByKey(trip)).map((k) => ({ key: k, amount: trip2569AmountsByKey(trip)[k] })),
  };
}

export { lineKey };
