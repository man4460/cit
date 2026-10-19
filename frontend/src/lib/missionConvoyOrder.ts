/**
 * ลำดับรูปขบวนมาตรฐาน (ขาไป):
 * ส่วนล่วงหน้า → นำขบวน → ประสานท้องที่ → คุ้มกันหน้า → สินค้า 1..n → คุ้มกันหลัง → ปิดท้าย → หัวลากสำรอง
 *
 * ขากลับ: ส่วนล่วงหน้า (เช่น อินทรี) เลื่อนมาอยู่หลังคุ้มกันหลัง (เช่น อัลฟ่า 2) ก่อนปิดท้าย
 */

export type ConvoyLeg = "go" | "return";

/** ดึงเลขลำดับสินค้าจากข้อความ เช่น «สินค้า 1» */
export function cargoSequenceNum(...parts: string[]): number | null {
  const text = parts.filter(Boolean).join(" ");
  if (!/สินค้า/.test(text) || /หัวลาก/.test(text)) return null;
  const m = text.match(/สินค้า\s*(?:เพิ่ม\s*)?(\d+)/i) ?? text.match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** คีย์เรียง [กลุ่ม, ลำดับย่อย] — กลุ่มน้อยอยู่ก่อน */
export function convoySortKey(
  roleName: string,
  callSign?: string | null,
  leg: ConvoyLeg = "go",
): [number, number] {
  const formation = (roleName ?? "").replace(/^รถ/, "").trim();
  const cs = (callSign ?? "").trim();
  const f = `${formation} ${cs}`.trim();

  /* ขากลับ: อินทรี/ส่วนล่วงหน้า อยู่หลังอัลฟ่า 2 (คุ้มกันหลัง) */
  if (/ส่วนล่วงหน้า/.test(f) || (/อินทรี/.test(f) && !/นำขบวน|คุ้มกัน|ปิดท้าย|สินค้า|ประสาน/.test(f))) {
    return [leg === "return" ? 65 : 10, 0];
  }
  if (/นำขบวน/.test(f)) return [20, 0];
  if (/ประสาน/.test(f)) return [30, 0];
  if (/คุ้มกันหน้า|กำกับ/.test(f) && !/หลัง/.test(f)) return [40, 0];
  const cargoNo = cargoSequenceNum(formation, cs);
  if (cargoNo != null || (/สินค้า/.test(f) && !/หัวลาก/.test(f))) {
    return [50, cargoNo ?? 999];
  }
  if (/คุ้มกันหลัง/.test(f) || /อัลฟ่า\s*2/.test(f)) return [60, 0];
  if (/ปิดท้าย/.test(f)) return [70, 0];
  if (/หัวลาก/.test(f)) return [80, 0];
  if (/ยังไม่ระบุ/.test(f)) return [95, 0];
  // อื่นๆ (เช่น วิทยุ) — หลังคุ้มกันหน้า ก่อนสินค้า
  return [45, 0];
}

export function compareConvoyOrder(
  a: { roleName: string; callSign?: string | null },
  b: { roleName: string; callSign?: string | null },
  leg: ConvoyLeg = "go",
): number {
  const [ga, sa] = convoySortKey(a.roleName, a.callSign, leg);
  const [gb, sb] = convoySortKey(b.roleName, b.callSign, leg);
  if (ga !== gb) return ga - gb;
  if (sa !== sb) return sa - sb;
  return `${a.roleName} ${a.callSign ?? ""}`.localeCompare(`${b.roleName} ${b.callSign ?? ""}`, "th");
}

/** เรียงแถวยานพาหนะในฟอร์มภารกิจ — แถวว่างไว้ท้าย */
export function sortMissionVehicleRows<T extends { vehicleId?: string; vehicleRoleId?: string; callSign?: string }>(
  rows: T[],
  roleNameById: (roleId: string) => string,
): T[] {
  const blank: T[] = [];
  const filled: T[] = [];
  for (const r of rows) {
    if (r.vehicleId?.trim()) filled.push(r);
    else blank.push(r);
  }
  filled.sort((a, b) =>
    compareConvoyOrder(
      { roleName: roleNameById(a.vehicleRoleId ?? ""), callSign: a.callSign },
      { roleName: roleNameById(b.vehicleRoleId ?? ""), callSign: b.callSign },
      "go",
    ),
  );
  return blank.length ? [...filled, ...blank] : filled;
}
