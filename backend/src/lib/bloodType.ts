export const BLOOD_TYPES = ["A", "B", "AB", "O", "A Rh-", "B Rh-", "AB Rh-", "O Rh-"] as const;

/** undefined = ค่าไม่ถูกต้อง, null = ไม่ระบุ */
export function normalizeBloodType(v: unknown): string | null | undefined {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return (BLOOD_TYPES as readonly string[]).find((t) => t.toLowerCase() === s.toLowerCase());
}
