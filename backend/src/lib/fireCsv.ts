import fs from "fs";
import path from "path";

/** RFC4180-ish CSV → แถวของคอลัมน์ (รองรับ multiline ใน quote) */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, "");

  while (i < s.length) {
    const ch = s[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function resolveFireDataDir(): string | null {
  const markers = ["FireDetail.csv", "Gun.csv", "Bullet.csv", "bulletproof_vest.csv"];
  const candidates = [
    process.env.FIRE_DATA_DIR,
    path.join(process.cwd(), "data"),
    path.join(process.cwd(), "..", "data"),
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    try {
      if (markers.some((f) => fs.existsSync(path.join(dir, f)))) return dir;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function readFireCsv(fileName: string): string[][] | null {
  const candidates = [
    process.env.FIRE_DATA_DIR,
    path.join(process.cwd(), "data"),
    path.join(process.cwd(), "..", "data"),
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    try {
      const full = path.join(dir, fileName);
      if (!fs.existsSync(full)) continue;
      const text = fs.readFileSync(full, "utf8");
      return parseCsv(text);
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** แปลงวันที่แบบ M/D/YYYY หรือ D/M/YYYY จาก CSV */
export function parseCsvDate(raw: string | undefined | null): Date | null {
  if (!raw || !String(raw).trim()) return null;
  const t = String(raw).trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    // CSV จากระบบใช้ M/D/YYYY
    const month = a;
    const day = b;
    const d = new Date(y, month - 1, day);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}
