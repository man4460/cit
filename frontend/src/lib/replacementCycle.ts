import { parsePurchaseDdMmYyyyFromNotes } from "./parseVehiclePurchaseFromNotes";

/** อายุใช้งานรถก่อนจัดซื้อทดแทน — รถที่จำหน่ายแล้วในระบบมีอายุราว 10 ปี */
export const VEHICLE_LIFE_YEARS = 10;
/** อายุกระสุน (ตรงกับหน้าอาวุธ) */
export const AMMO_LIFE_YEARS = 5;
/** ระยะเวลาเตรียมจัดจ้างก่อนสัญญา OS สิ้นสุด */
export const OS_PROCUREMENT_LEAD_DAYS = 180;

export type CycleGroup = "ครุภัณฑ์" | "วัสดุ" | "งานจ้าง";

export type CycleItem = {
  key: string;
  group: CycleGroup;
  kind: string;
  unit: string;
  name: string;
  /** วันที่ต้องมีของใหม่ / สัญญาใหม่ */
  dueDate: Date;
  qty: number;
  note?: string;
  to: string;
};

/** ปีงบที่ต้องมีเงิน — ปีงบประมาณตามปีปฏิทิน (ม.ค.–ธ.ค.) เหมือนหน้างบประมาณ */
export function budgetYearOf(item: CycleItem): number {
  return item.dueDate.getFullYear();
}

export type CycleBucket = "overdue" | "thisRound" | "nextRound";

/**
 * overdue   = ครบกำหนดแล้วหรือภายในปีนี้ (ต้องหางบปีนี้ / เร่งใส่คำของบรอบนี้)
 * thisRound = ต้องใช้งบปีหน้า → ต้องตั้งในคำของบที่จัดทำปีนี้
 * nextRound = ต้องใช้งบปีถัดไป → เตรียมข้อมูล/ราคากลางไว้ล่วงหน้า
 */
export function bucketOf(item: CycleItem, now = new Date()): CycleBucket | null {
  const y = now.getFullYear();
  const by = budgetYearOf(item);
  if (by <= y) return "overdue";
  if (by === y + 1) return "thisRound";
  if (by === y + 2) return "nextRound";
  return null;
}

function addYears(iso: string | null | undefined, years: number): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function tankLifeYears(kind: string) {
  const n = kind.toLowerCase().replace(/[\s\-_.]/g, "");
  return n.includes("bf2000") || n.includes("dryche") || n.includes("softex") || n.includes("halotron") ? 10 : 15;
}

type VehicleLike = { id: string; licensePlate: string; brandModel: string; purchasedAt: string | null; notes: string | null };
type ArmorAssetLike = { id: string; serialNumber: string; itemName: string; armorExpiresAt: string | null };
type FireLike = { id: string; code: string; location: string; kind: string; manufacturedAt: string | null; status: string };
type AmmoLike = { id: string; code: string; kind: string; purchasedAt: string | null; remainingQty: number };
type OsGroupLike = {
  name: string;
  contracts: { id: string; vendorName: string; contractNo: string | null; endDate: string; active: boolean }[];
};

export function buildCycleItems(src: {
  vehicles?: VehicleLike[] | null;
  armorAssets?: ArmorAssetLike[] | null;
  fire?: FireLike[] | null;
  ammo?: AmmoLike[] | null;
  osGroups?: OsGroupLike[] | null;
}): CycleItem[] {
  const out: CycleItem[] = [];

  for (const v of src.vehicles ?? []) {
    const purchased = v.purchasedAt?.slice(0, 10) || parsePurchaseDdMmYyyyFromNotes(v.notes);
    const due = addYears(purchased ? `${purchased.slice(0, 10)}T12:00:00.000Z` : null, VEHICLE_LIFE_YEARS);
    if (!due) continue;
    out.push({
      key: `veh-${v.id}`,
      group: "ครุภัณฑ์",
      kind: "ยานพาหนะ",
      unit: "คัน",
      name: `${v.licensePlate} ${v.brandModel}`.trim(),
      dueDate: due,
      qty: 1,
      note: `ซื้อ ${new Date(purchased!).toLocaleDateString("th-TH", { month: "short", year: "numeric" })} · ครบ ${VEHICLE_LIFE_YEARS} ปี`,
      to: "/vehicles",
    });
  }

  for (const a of src.armorAssets ?? []) {
    if (!a.armorExpiresAt) continue;
    const due = new Date(a.armorExpiresAt);
    if (Number.isNaN(due.getTime())) continue;
    out.push({
      key: `armor-${a.id}`,
      group: "ครุภัณฑ์",
      kind: "เสื้อเกราะ",
      unit: "ตัว",
      name: `${a.serialNumber} ${a.itemName}`.trim(),
      dueDate: due,
      qty: 1,
      note: "วันหมดอายุตามทะเบียนครุภัณฑ์",
      to: "/assets/armor-monthly",
    });
  }

  for (const f of src.fire ?? []) {
    if (f.status.includes("จำหน่าย")) continue;
    const life = tankLifeYears(f.kind);
    const due = addYears(f.manufacturedAt, life);
    if (!due) continue;
    out.push({
      key: `fire-${f.id}`,
      group: "วัสดุ",
      kind: "ถังดับเพลิง",
      unit: "ถัง",
      name: `${f.code} · ${f.location}`,
      dueDate: due,
      qty: 1,
      note: `${f.kind} · อายุ ${life} ปี`,
      to: "/fire-safety",
    });
  }

  for (const lot of src.ammo ?? []) {
    if (!(lot.remainingQty > 0)) continue;
    const due = addYears(lot.purchasedAt, AMMO_LIFE_YEARS);
    if (!due) continue;
    out.push({
      key: `ammo-${lot.id}`,
      group: "วัสดุ",
      kind: "กระสุน",
      unit: "ล็อต",
      name: `${lot.code} ${lot.kind}`.trim(),
      dueDate: due,
      qty: 1,
      note: `คงเหลือ ${lot.remainingQty.toLocaleString("th-TH")} นัด`,
      to: "/weapons",
    });
  }

  for (const g of src.osGroups ?? []) {
    const active = g.contracts.filter((c) => c.active);
    if (!active.length) continue;
    const latest = active.reduce((a, b) => (new Date(a.endDate) > new Date(b.endDate) ? a : b));
    const end = new Date(latest.endDate);
    if (Number.isNaN(end.getTime())) continue;
    const due = new Date(end);
    due.setDate(due.getDate() + 1);
    const startBy = new Date(end);
    startBy.setDate(startBy.getDate() - OS_PROCUREMENT_LEAD_DAYS);
    out.push({
      key: `os-${latest.id}`,
      group: "งานจ้าง",
      kind: "งานจ้าง OS",
      unit: "สัญญา",
      name: `${g.name} · ${latest.vendorName}`,
      dueDate: due,
      qty: 1,
      note: `สิ้นสุด ${end.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })} · เริ่มจัดจ้างภายใน ${startBy.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}`,
      to: "/os-outsourcing",
    });
  }

  return out.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}
