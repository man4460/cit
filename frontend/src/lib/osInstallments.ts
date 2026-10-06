type InstallmentContract = {
  startDate: string;
  endDate: string;
  monthlyAmount: number | null;
  totalAmount?: number | null;
};

function ymOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function installmentCount(startIso: string, endIso: string): number | null {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return null;
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
}

export function lastInstallmentYm(endIso: string): string | null {
  const e = new Date(endIso);
  return Number.isNaN(e.getTime()) ? null : ymOf(e);
}

/** เลขกลมต่องวด: ปัดลงตามหลักที่เลือก เศษทั้งหมดไปรวมที่งวดสุดท้าย */
export function suggestRoundMonthly(total: number, count: number, unit: number): number {
  if (!(total > 0) || !(count > 0)) return 0;
  const avg = total / count;
  const rounded = Math.floor(avg / unit) * unit;
  return rounded > 0 ? rounded : Math.floor(avg);
}

export function lastInstallmentAmount(total: number, monthly: number, count: number): number {
  return round2(total - monthly * (count - 1));
}

/** ยอดตามสัญญาของเดือนนั้น — งวดสุดท้ายรับเศษ (เมื่อมีมูลค่าสัญญารวม) */
export function installmentFor(c: InstallmentContract, monthYm: string): number | null {
  if (c.monthlyAmount == null) return null;
  if (c.totalAmount == null || monthYm !== lastInstallmentYm(c.endDate)) return c.monthlyAmount;
  const count = installmentCount(c.startDate, c.endDate);
  return count ? lastInstallmentAmount(c.totalAmount, c.monthlyAmount, count) : c.monthlyAmount;
}

export function isLastInstallment(c: Pick<InstallmentContract, "endDate">, monthYm: string): boolean {
  return monthYm === lastInstallmentYm(c.endDate);
}
