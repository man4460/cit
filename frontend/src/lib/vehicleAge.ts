/** อายุเต็มปี นับจากวันจัดซื้อถึงวันที่อ้างอิง (ค่าเริ่มต้น = วันนี้ ตามเครื่องผู้ใช้) */
export function vehicleAgeCompletedYears(
  purchasedAtIso: string | null | undefined,
  asOf: Date = new Date(),
): number | null {
  if (!purchasedAtIso?.trim()) return null;
  const p = new Date(purchasedAtIso);
  if (Number.isNaN(p.getTime())) return null;
  let years = asOf.getFullYear() - p.getFullYear();
  const monthDiff = asOf.getMonth() - p.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < p.getDate())) years--;
  return Math.max(0, years);
}

export function formatVehiclePurchaseDateTh(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}
