import { prisma } from "./prisma.js";
import { parseCsvDate, readFireCsv, resolveFireDataDir } from "./fireCsv.js";

function colMap(header: string[]): Map<string, number> {
  const m = new Map<string, number>();
  header.forEach((h, i) => m.set(h.trim(), i));
  return m;
}

function cell(row: string[], map: Map<string, number>, name: string): string {
  const i = map.get(name);
  if (i === undefined) return "";
  return (row[i] ?? "").trim();
}

/** ซิงก์จาก FireDetail.csv + FireHost.csv — upsert ตามรหัส ทุกครั้งที่สตาร์ท API */
export async function seedFireExtinguisherData(): Promise<void> {
  const dir = resolveFireDataDir();
  if (!dir) {
    console.warn("[seed] fire CSV not found (expected data/FireDetail.csv) — skip");
    return;
  }

  const detailRows = readFireCsv("FireDetail.csv");
  if (detailRows && detailRows.length > 1) {
    const map = colMap(detailRows[0]!);
    let upserted = 0;
    let order = 0;
    for (const row of detailRows.slice(1)) {
      const code = cell(row, map, "Title");
      if (!code) continue;
      const location = cell(row, map, "Location") || "—";
      const kind = cell(row, map, "Type1") || "—";
      const sizeLabel = cell(row, map, "Volum") || "—";
      const manufacturedAt = parseCsvDate(cell(row, map, "Date_mfg"));
      const status = cell(row, map, "Status") || "ปกติ";
      const guardTeam = cell(row, map, "NameHost") || null;
      const notes = [cell(row, map, "Note"), cell(row, map, "DetailStatus")].filter(Boolean).join(" · ") || null;
      const sortOrder = order++;
      await prisma.fireExtinguisher.upsert({
        where: { code },
        create: {
          code,
          location,
          kind,
          sizeLabel,
          manufacturedAt,
          status,
          guardTeam,
          notes,
          sortOrder,
        },
        update: {
          location,
          kind,
          sizeLabel,
          manufacturedAt,
          status,
          guardTeam,
          notes,
          sortOrder,
        },
      });
      upserted += 1;
    }
    console.log(`[seed] fire extinguishers upserted from CSV: ${upserted}`);
  } else {
    console.warn("[seed] FireDetail.csv empty or missing");
  }

  const hostRows = readFireCsv("FireHost.csv");
  if (hostRows && hostRows.length > 1) {
    const map = colMap(hostRows[0]!);
    let upserted = 0;
    let order = 0;
    for (const row of hostRows.slice(1)) {
      const code = cell(row, map, "Title");
      if (!code) continue;
      // ข้ามแถวทดสอบสั้น ๆ เช่น 111, 222
      if (/^\d{1,3}$/.test(code)) continue;
      const detail = cell(row, map, "Detail").replace(/\u200b/g, "").trim() || "—";
      const location = cell(row, map, "Location").replace(/\u200b/g, "").trim() || "—";
      const guardTeam = cell(row, map, "NameHost") || null;
      const trackRaw = cell(row, map, "Track").toUpperCase();
      const track = trackRaw !== "FALSE" && trackRaw !== "0";
      const sortOrder = order++;
      await prisma.fireHost.upsert({
        where: { code },
        create: { code, detail, location, guardTeam, track, sortOrder },
        update: { detail, location, guardTeam, track, sortOrder },
      });
      upserted += 1;
    }
    console.log(`[seed] fire hosts upserted from CSV: ${upserted}`);
  } else {
    console.warn("[seed] FireHost.csv empty or missing");
  }
}
