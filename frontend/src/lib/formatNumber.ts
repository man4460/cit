/** จัดรูปแบบตัวเลขแบบมีจุลภาค (ไทย) */

export function parseLooseNumber(raw: string | number | null | undefined): number {
  if (raw == null || raw === "") return NaN;
  if (typeof raw === "number") return raw;
  const cleaned = String(raw).replace(/,/g, "").replace(/\s/g, "").trim();
  if (!cleaned) return NaN;
  return Number(cleaned);
}

export function formatBaht(
  raw: string | number | null | undefined,
  opts?: { digits?: number; empty?: string },
): string {
  const n = parseLooseNumber(raw);
  if (!Number.isFinite(n)) return opts?.empty ?? "—";
  const digits = opts?.digits ?? 2;
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : Math.min(digits, 2),
    maximumFractionDigits: digits,
  });
}

export function formatInt(raw: string | number | null | undefined, empty = "—"): string {
  const n = parseLooseNumber(raw);
  if (!Number.isFinite(n)) return empty;
  return Math.round(n).toLocaleString("th-TH");
}

export function formatLiters(raw: string | number | null | undefined, empty = "—"): string {
  const n = parseLooseNumber(raw);
  if (!Number.isFinite(n)) return empty;
  return n.toLocaleString("th-TH", { maximumFractionDigits: 3 });
}

/** ใส่จุลภาคขณะพิมพ์ — คืนค่าแสดงผล (ยังเก็บ state เป็นตัวเลขดิบได้) */
export function formatGroupedInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const neg = raw.trim().startsWith("-");
  const [intPart, ...rest] = cleaned.split(".");
  const frac = rest.length ? rest.join("") : null;
  const intNum = intPart.replace(/^0+(?=\d)/, "") || (frac != null ? "0" : intPart);
  const grouped = intNum.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = frac != null ? `${grouped}.${frac}` : grouped;
  return neg ? `-${body}` : body;
}

export function stripGroupedInput(display: string): string {
  return display.replace(/,/g, "").trim();
}
