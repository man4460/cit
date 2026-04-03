/** ค้นหาแบบไม่สนตัวพิมพ์เล็กใหญ่ (รองรับไทยผ่าน normalize NFC) */
export function normalizeSearchText(s: string): string {
  return s.trim().toLowerCase().normalize("NFC");
}

/** คิวรีว่าง = แสดงทุกแถว; มีคิวรี = ทุกคำต้องปรากฏรวมกันในข้อความที่ต่อจาก fields */
export function rowMatchesFilter(
  query: string,
  parts: (string | number | null | undefined)[],
): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;
  const hay = parts.map((p) => normalizeSearchText(String(p ?? ""))).join(" ");
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((t) => hay.includes(t));
}
