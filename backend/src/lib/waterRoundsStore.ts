import { promises as fs } from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export type WaterReportDoc = {
  meta: Record<string, unknown>;
  sites: Record<string, unknown>;
};

const KEEP_ROUNDS = 56;

export function parseReportTime(iso: unknown): number {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? t : NaN;
}

function rowToReport(row: {
  metaJson: Prisma.JsonValue;
  sitesJson: Prisma.JsonValue;
}): WaterReportDoc | null {
  const meta = row.metaJson && typeof row.metaJson === "object" && !Array.isArray(row.metaJson)
    ? (row.metaJson as Record<string, unknown>)
    : null;
  const sites = row.sitesJson && typeof row.sitesJson === "object" && !Array.isArray(row.sitesJson)
    ? (row.sitesJson as Record<string, unknown>)
    : null;
  if (!meta || !sites) return null;
  return { meta, sites };
}

/** รายงานล่าสุดจาก DB */
export async function dbReadLatest(): Promise<WaterReportDoc | null> {
  const row = await prisma.waterRound.findFirst({ orderBy: { roundAt: "desc" } });
  return row ? rowToReport(row) : null;
}

/** รอบก่อนหน้า roundAt (ไม่รวมตัวเอง) */
export async function dbReadPrevious(beforeRoundAt: Date): Promise<WaterReportDoc | null> {
  const row = await prisma.waterRound.findFirst({
    where: { roundAt: { lt: beforeRoundAt } },
    orderBy: { roundAt: "desc" },
  });
  return row ? rowToReport(row) : null;
}

/** บันทึก/อัปเดตรอบ — ถ้า sites/meta เหมือนเดิมจะข้ามการเขียน (ลด IO) */
export async function dbSaveReport(report: WaterReportDoc, roundAt: Date, opts?: { isSeed?: boolean }): Promise<"created" | "updated" | "unchanged"> {
  const reportedAt = new Date(parseReportTime(report.meta.updatedAt) || roundAt.getTime());
  const builtAtRaw = parseReportTime(report.meta.builtAt);
  const builtAt = Number.isFinite(builtAtRaw) ? new Date(builtAtRaw) : null;
  const roundLabel = String(report.meta.round ?? "");
  const note = report.meta.note != null ? String(report.meta.note) : null;
  const isSeed = Boolean(opts?.isSeed ?? report.meta.seed);
  const metaJson = report.meta as Prisma.InputJsonValue;
  const sitesJson = report.sites as Prisma.InputJsonValue;

  const existing = await prisma.waterRound.findUnique({ where: { roundAt } });
  if (existing) {
    const sameMeta = JSON.stringify(existing.metaJson) === JSON.stringify(report.meta);
    const sameSites = JSON.stringify(existing.sitesJson) === JSON.stringify(report.sites);
    if (sameMeta && sameSites) return "unchanged";
    await prisma.waterRound.update({
      where: { roundAt },
      data: {
        roundLabel,
        reportedAt,
        builtAt,
        note,
        isSeed,
        metaJson,
        sitesJson,
      },
    });
    return "updated";
  }

  await prisma.waterRound.create({
    data: {
      roundAt,
      roundLabel,
      reportedAt,
      builtAt,
      note,
      isSeed,
      metaJson,
      sitesJson,
    },
  });
  return "created";
}

/** ลบรอบเก่าเกินจำนวนที่เก็บ */
export async function dbPruneRounds(keep = KEEP_ROUNDS): Promise<number> {
  const keepIds = await prisma.waterRound.findMany({
    orderBy: { roundAt: "desc" },
    take: Math.max(1, keep),
    select: { id: true },
  });
  if (!keepIds.length) return 0;
  const res = await prisma.waterRound.deleteMany({
    where: { id: { notIn: keepIds.map((r) => r.id) } },
  });
  return res.count;
}

export type RoundListItem = {
  roundAt: Date;
  roundLabel: string;
  reportedAt: Date;
  report: WaterReportDoc;
};

/** รายการรอบล่าสุด N รอบ (เก่า→ใหม่) สำหรับกราฟ */
export async function dbListRounds(limit = KEEP_ROUNDS): Promise<RoundListItem[]> {
  const latest = await prisma.waterRound.findMany({
    orderBy: { roundAt: "desc" },
    take: Math.max(1, Math.min(KEEP_ROUNDS, limit)),
  });
  return latest.reverse().flatMap((row) => {
    const report = rowToReport(row);
    if (!report) return [];
    return [{
      roundAt: row.roundAt,
      roundLabel: row.roundLabel,
      reportedAt: row.reportedAt,
      report,
    }];
  });
}

export async function dbHasRoundAt(roundAt: Date): Promise<boolean> {
  const n = await prisma.waterRound.count({ where: { roundAt } });
  return n > 0;
}

export async function dbCountRounds(): Promise<number> {
  return prisma.waterRound.count();
}

/** นำเข้าไฟล์ water-rounds/*.json + water-situation.json ครั้งแรกเมื่อ DB ว่าง */
export async function dbImportJsonIfEmpty(dataFilePath: string): Promise<number> {
  const n = await dbCountRounds();
  if (n > 0) return 0;

  const dir = path.join(path.dirname(dataFilePath), "water-rounds");
  const names = (await fs.readdir(dir).catch(() => [] as string[]))
    .filter((f) => /^\d{10}\.json$/.test(f))
    .sort();

  let imported = 0;
  for (const name of names) {
    try {
      const raw = await fs.readFile(path.join(dir, name), "utf8");
      const j = JSON.parse(raw.replace(/^\uFEFF/, "")) as WaterReportDoc;
      if (!j?.sites || !j?.meta) continue;
      const t = parseReportTime(j.meta.updatedAt);
      if (!Number.isFinite(t)) continue;
      const roundAt = new Date(t);
      const r = await dbSaveReport(j, roundAt, { isSeed: Boolean(j.meta.seed) });
      if (r !== "unchanged") imported++;
    } catch {
      /* ข้ามไฟล์เสีย */
    }
  }

  /* ไฟล์ล่าสุด */
  try {
    const raw = await fs.readFile(dataFilePath, "utf8");
    const j = JSON.parse(raw.replace(/^\uFEFF/, "")) as WaterReportDoc;
    if (j?.sites && j?.meta) {
      const t = parseReportTime(j.meta.updatedAt);
      if (Number.isFinite(t)) {
        const r = await dbSaveReport(j, new Date(t), { isSeed: Boolean(j.meta.seed) });
        if (r !== "unchanged") imported++;
      }
    }
  } catch {
    /* ไม่มีไฟล์ล่าสุด */
  }

  if (imported) console.log(`[water-db] นำเข้า ${imported} รอบจากไฟล์ JSON → MySQL`);
  return imported;
}
