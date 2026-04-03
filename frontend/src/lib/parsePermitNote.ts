/** ดึงวันหมดอายุจากข้อความหมายเหตุ (เช่น ใบอนุญาตหมดอายุ 28 พ.ย. 69) → ISO date yyyy-mm-dd */

const TH_MONTH: Record<string, number> = {
  "ม.ค.": 0,
  "ก.พ.": 1,
  "มี.ค.": 2,
  "เม.ย.": 3,
  "พ.ค.": 4,
  "มิ.ย.": 5,
  "ก.ค.": 6,
  "ส.ค.": 7,
  "ก.ย.": 8,
  "ต.ค.": 9,
  "พ.ย.": 10,
  "ธ.ค.": 11,
};

const DATE_IN_NOTE = new RegExp(
  "(\\d{1,2})\\s+(ม\\.ค\\.|ก\\.พ\\.|มี\\.ค\\.|เม\\.ย\\.|พ\\.ค\\.|มิ\\.ย\\.|ก\\.ค\\.|ส\\.ค\\.|ก\\.ย\\.|ต\\.ค\\.|พ\\.ย\\.|ธ\\.ค\\.)\\s+(\\d{2,4})",
  "u",
);

export function parsePermitExpiryIsoFromNotes(notes: string | null | undefined): string | null {
  if (!notes?.trim()) return null;
  const m = notes.match(DATE_IN_NOTE);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const mon = TH_MONTH[m[2]];
  if (mon === undefined || !Number.isFinite(day)) return null;
  let y = parseInt(m[3], 10);
  const ceYear = y < 100 ? 2500 + y - 543 : y >= 2400 ? y - 543 : y;
  const d = new Date(Date.UTC(ceYear, mon, day, 12, 0, 0));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function stripPermitExpiryPhraseFromNotes(notes: string | null | undefined): string | null {
  if (!notes?.trim()) return null;
  const cleaned = notes.replace(DATE_IN_NOTE, "").replace(/ใบอนุญาตหมดอายุ\s*/u, "").trim();
  return cleaned.length ? cleaned : null;
}
