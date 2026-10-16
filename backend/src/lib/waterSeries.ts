import { dbListRounds } from "./waterRoundsStore.js";

export type SeriesPoint = {
  round: string;
  at: string;
  status: number;
  /** % ความจุสูงสุดของสถานีใกล้ที่ตั้ง */
  waterPct: number | null;
  /** ระดับน้ำ ม.รทก. ของสถานีหลัก (ถ้ามี) */
  waterMsl: number | null;
  /** ฝนสูงสุดใกล้ที่ตั้ง (มม./24 ชม. ในรอบนั้น) */
  rainMm: number | null;
  /** % ความจุสูงสุดของน้ำเหนือ */
  upstreamPct: number | null;
  /** เขื่อนที่ระบายมากกว่าไหลเข้า (ชื่อสั้น) */
  damRelease: string | null;
  note: string;
};

export type SiteSeries = { siteId: string; points: SeriesPoint[] };

type Gauge = { pct?: number | null; msl?: number | null; name?: string };
type Dam = { name?: string; storage?: number | null; release?: number | null; inflow?: number | null };
type SiteRound = {
  status?: number;
  statusNote?: string;
  water?: Gauge[];
  upstream?: Gauge[];
  rainNear?: { mm?: number | null }[];
  rainTop?: { mm?: number | null }[];
  rain3d?: { mm?: number | null };
  dams?: Dam[];
};

function maxPct(list: Gauge[] | undefined): number | null {
  const vals = (list ?? []).map((g) => (typeof g.pct === "number" ? g.pct : null)).filter((n): n is number => n != null);
  return vals.length ? Math.max(...vals) : null;
}

function firstMsl(list: Gauge[] | undefined): number | null {
  for (const g of list ?? []) if (typeof g.msl === "number") return g.msl;
  return null;
}

function rainMax(site: SiteRound): number | null {
  /* หลัก: ฝนสะสม 3 วัน ตามรายงาน EWI */
  if (typeof site.rain3d?.mm === "number" && Number.isFinite(site.rain3d.mm)) return site.rain3d.mm;
  const near = (site.rainNear ?? []).map((r) => (typeof r.mm === "number" ? r.mm : null)).filter((n): n is number => n != null);
  if (near.length) return Math.max(...near);
  const top = (site.rainTop ?? []).map((r) => (typeof r.mm === "number" ? r.mm : null)).filter((n): n is number => n != null);
  return top.length ? Math.max(...top) : null;
}

function damNote(site: SiteRound): string | null {
  const releasing = (site.dams ?? []).filter(
    (d) => typeof d.release === "number" && typeof d.inflow === "number" && d.release > d.inflow && (d.storage ?? 0) >= 80,
  );
  if (!releasing.length) return null;
  return releasing
    .slice(0, 2)
    .map((d) => `${d.name} ระบาย ${Number(d.release).toFixed(1)} > ไหลเข้า ${Number(d.inflow).toFixed(1)}`)
    .join(" · ");
}

function pointOf(roundLabel: string, at: string, site: SiteRound): SeriesPoint {
  return {
    round: roundLabel,
    at,
    status: Number.isFinite(site.status) ? Number(site.status) : -1,
    waterPct: maxPct(site.water),
    waterMsl: firstMsl(site.water),
    rainMm: rainMax(site),
    upstreamPct: maxPct(site.upstream),
    damRelease: damNote(site),
    note: String(site.statusNote ?? "")
      .replace(/^รอบ [^:]+:\s*/, "")
      .slice(0, 220),
  };
}

/** ชุดข้อมูลย้อนหลังทุกรอบ 3 ชม. — จาก MySQL WaterRound */
export async function loadSiteSeries(limit = 56): Promise<{ rounds: string[]; sites: SiteSeries[] }> {
  const list = await dbListRounds(limit);
  const bySite = new Map<string, SeriesPoint[]>();
  const rounds: string[] = [];

  for (const item of list) {
    const label = item.roundLabel || String(item.report.meta.round ?? "");
    const at = String(item.report.meta.updatedAt ?? item.reportedAt.toISOString());
    rounds.push(label);
    const sites = item.report.sites as Record<string, SiteRound>;
    for (const [siteId, site] of Object.entries(sites ?? {})) {
      if (!bySite.has(siteId)) bySite.set(siteId, []);
      bySite.get(siteId)!.push(pointOf(label, at, site ?? {}));
    }
  }

  return {
    rounds,
    sites: [...bySite.entries()].map(([siteId, points]) => ({ siteId, points })),
  };
}
