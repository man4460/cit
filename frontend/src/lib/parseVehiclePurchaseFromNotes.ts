/** จับวันที่ DD/MM/YYYY จากบรรทัด «ปีจัดซื้อ …: …» ในหมายเหตุ */

const PURCHASE_LINE = /^\s*ปีจัดซื้อ(?:\s*\([^)]*\))?\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/;

export function parsePurchaseDdMmYyyyFromNotes(notes: string | null | undefined): string | null {
  if (!notes?.trim()) return null;
  for (const line of notes.split(/\r?\n/)) {
    const m = line.match(PURCHASE_LINE);
    if (!m) continue;
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const year = parseInt(m[3], 10);
    const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  return null;
}

export function stripPurchaseLineFromNotes(notes: string | null | undefined): string | null {
  if (!notes?.trim()) return null;
  const lines = notes.split(/\r?\n/).filter((line) => !PURCHASE_LINE.test(line));
  const t = lines.join("\n").trim();
  return t.length ? t : null;
}
