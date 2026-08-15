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

function cell(row: string[], map: Map<string, number>, name: string): string {
  const i = map.get(name);
  if (i === undefined) return "";
  return (row[i] ?? "").replace(/\u200b/g, "").trim();
}

function ammoSourceKey(code: string, kind: string, team: string, receivedRaw: string, index: number): string {
  return `${code}::${kind}::${team}::${receivedRaw}::${index}`;
}

/** ซิงก์จาก Gun.csv + Bullet.csv — upsert ทุกครั้งที่สตาร์ท API */
export async function seedWeaponData(): Promise<void> {
  const dir = resolveFireDataDir();
  if (!dir) {
    console.warn("[seed] weapon CSV not found (expected data/Gun.csv) — skip");
    return;
  }

  const gunRows = readFireCsv("Gun.csv");
  if (gunRows && gunRows.length > 1) {
    const map = colMap(gunRows[0]!);
    let upserted = 0;
    let order = 0;
    for (const row of gunRows.slice(1)) {
      const code = cell(row, map, "Title");
      if (!code) continue;
      const sortOrder = order++;
      const data = {
        costCenter: cell(row, map, "Cost Center") || null,
        brand: cell(row, map, "Brand") || "—",
        serial: cell(row, map, "Serial") || null,
        registerNo: cell(row, map, "Register") || null,
        registerCard: cell(row, map, "RegisCard") || null,
        purchasedAt: parseCsvDate(cell(row, map, "DateBuy")),
        detail: cell(row, map, "Detail") || null,
        team: cell(row, map, "Team") || null,
        docUrl: cell(row, map, "Link") || null,
        photoUrl: cell(row, map, "LinkPic") || null,
        status: cell(row, map, "Status"),
        checked: cell(row, map, "Checked") || null,
        fixNote: cell(row, map, "DetailFix") || null,
        sortOrder,
      };
      const existing = await prisma.firearm.findUnique({ where: { code }, select: { status: true } });
      const keepStatus = existing && /คงคลัง|จำหน่าย|ฝากคลัง/.test(existing.status);
      await prisma.firearm.upsert({
        where: { code },
        create: { code, ...data },
        update: keepStatus ? { ...data, status: existing.status } : data,
      });
      upserted += 1;
    }
    console.log(`[seed] firearms upserted from CSV: ${upserted}`);
  } else {
    console.warn("[seed] Gun.csv empty or missing");
  }

  const bulletRows = readFireCsv("Bullet.csv");
  if (bulletRows && bulletRows.length > 1) {
    const map = colMap(bulletRows[0]!);
    let upserted = 0;
    let order = 0;
    const seen = new Map<string, number>();
    for (const row of bulletRows.slice(1)) {
      const code = cell(row, map, "Title");
      const kind = cell(row, map, "TypeBullet");
      if (!code && !kind) continue;
      const team = cell(row, map, "Team");
      const receivedRaw = cell(row, map, "Date_Recive");
      const base = `${code}::${kind}::${team}::${receivedRaw}`;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      const purchasedAt = parseCsvDate(receivedRaw);
      const sourceKey = ammoSourceKey(code || "ไม่ทราบ", kind || "—", team, receivedRaw, n);
      const qtyRaw = cell(row, map, "Volum").replace(/,/g, "");
      const quantity = Number.parseInt(qtyRaw, 10);
      const qty = Number.isFinite(quantity) ? quantity : 0;
      const sortOrder = order++;
      const existing = await prisma.ammunition.findUnique({
        where: { sourceKey },
        include: { moves: { where: { kind: "OUT" }, take: 1 } },
      });
      const data = {
        code: code || "ไม่ทราบ",
        kind: kind || "—",
        purchasedAt,
        team: team || null,
        detail: cell(row, map, "Detail") || null,
        sortOrder,
      };
      if (!existing) {
        await prisma.ammunition.create({
          data: {
            sourceKey,
            ...data,
            receivedQty: qty,
            remainingQty: qty,
            moves:
              qty > 0
                ? {
                    create: {
                      kind: "IN",
                      quantity: qty,
                      movedAt: purchasedAt ?? new Date(),
                      note: "นำเข้าจากทะเบียน",
                      remainingAfter: qty,
                    },
                  }
                : undefined,
          },
        });
      } else {
        const hasOut = existing.moves.length > 0;
        await prisma.ammunition.update({
          where: { sourceKey },
          data: hasOut ? data : { ...data, receivedQty: qty, remainingQty: qty },
        });
      }
      upserted += 1;
    }
    console.log(`[seed] ammunition upserted from CSV: ${upserted}`);
  } else {
    console.warn("[seed] Bullet.csv empty or missing");
  }
}
