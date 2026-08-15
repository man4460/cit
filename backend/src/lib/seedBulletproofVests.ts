import { prisma } from "./prisma.js";
import { parseCsvDate, readFireCsv, resolveFireDataDir } from "./fireCsv.js";

function colMap(header: string[]): Map<string, number> {
  const m = new Map<string, number>();
  header.forEach((h, i) => {
    const key = h.replace(/\u00a0/g, " ").trim().replace(/\s+/g, " ");
    m.set(key, i);
  });
  return m;
}

function cell(row: string[], map: Map<string, number>, ...names: string[]): string {
  for (const name of names) {
    const i = map.get(name);
    if (i === undefined) continue;
    return (row[i] ?? "").replace(/\u200b/g, "").trim();
  }
  return "";
}

/** ซิงก์จาก bulletproof_vest.csv — upsert ตามรหัสทุกครั้งที่สตาร์ท API */
export async function seedBulletproofVestData(): Promise<void> {
  const dir = resolveFireDataDir();
  const rows = readFireCsv("bulletproof_vest.csv");
  if (!rows || rows.length <= 1) {
    console.warn("[seed] bulletproof_vest.csv not found" + (dir ? ` near ${dir}` : "") + " — skip");
    return;
  }

  const map = colMap(rows[0]!);
  let upserted = 0;
  let order = 0;
  for (const row of rows.slice(1)) {
    const code = cell(row, map, "Title");
    if (!code) continue;
    const sortOrder = order++;
    const data = {
      description: cell(row, map, "Asset_description") || "เสื้อเกราะ",
      level: cell(row, map, "Lavel", "Level"),
      team: cell(row, map, "Team") || null,
      capturedAt: parseCsvDate(cell(row, map, "Cap_date")),
      costCenter: cell(row, map, "CostCenter") || null,
      registerNo: cell(row, map, "RegisterNo") || null,
      permitBeginsAt: parseCsvDate(cell(row, map, "Date_Begin")),
      permitExpiresAt: parseCsvDate(cell(row, map, "Date_Off")),
      notes: cell(row, map, "Comment") || null,
      docUrl: cell(row, map, "Link") || null,
      mailUrl: cell(row, map, "LinkMail") || null,
      sortOrder,
    };
    await prisma.bulletproofVest.upsert({
      where: { code },
      create: { code, ...data },
      update: data,
    });
    upserted += 1;
  }
  console.log(`[seed] bulletproof vests upserted from CSV: ${upserted}`);
}
