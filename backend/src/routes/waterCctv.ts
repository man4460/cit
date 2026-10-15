import { Router } from "express";

/** กล้อง CCTV สาธารณะ รวบรวมโดย cctv.maholan.net — ภาพนิ่งล่าสุดของกล้องใกล้พื้นที่ ธปท. */
const SOURCE = "https://cctv.maholan.net";
const LIST_TTL_MS = 15 * 60_000;
const SNAP_TTL_MS = 60_000;
const MAX_SNAP_CACHE = 200;
/** กล้องที่เห็นลำน้ำ/จุดน้ำท่วม — ให้มาก่อนกล้องจราจร */
const WATER_CAM = /แม่น้ำ|คลอง|น้ำ|เขื่อน|ประตูระบาย|ปตร|สะพาน|River|Canal|Bridge|DWR|flood|climate/i;

type Camera = {
  id: string;
  name: string;
  region?: string;
  district?: string;
  source?: string;
  type?: string;
  lat: number;
  lng: number;
  fr?: { s?: string };
};

let list: { at: number; cams: Camera[] } | null = null;
let listLoading: Promise<Camera[]> | null = null;
const snaps = new Map<string, { at: number; type: string; body: Buffer }>();

async function cameras(): Promise<Camera[]> {
  if (list && Date.now() - list.at < LIST_TTL_MS) return list.cams;
  listLoading ??= (async () => {
    try {
      const r = await fetch(`${SOURCE}/api/cameras`, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new Error(`cameras ${r.status}`);
      const j = (await r.json()) as { cameras?: Camera[] };
      const cams = (j.cameras ?? []).filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
      list = { at: Date.now(), cams };
      return cams;
    } finally {
      listLoading = null;
    }
  })();
  try {
    return await listLoading;
  } catch (e) {
    if (list) return list.cams;
    throw e;
  }
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

export const waterCctvRouter = Router();

waterCctvRouter.get("/near", async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: "lat/lon ไม่ถูกต้อง" });
    const n = Math.min(12, Math.max(1, Number(req.query.n) || 6));
    const radius = Math.min(100, Math.max(1, Number(req.query.km) || 30));
    const near = (await cameras())
      .filter((c) => c.fr?.s !== "dead")
      .map((c) => ({ c, km: distanceKm(lat, lon, c.lat, c.lng), water: WATER_CAM.test(`${c.name} ${c.source ?? ""}`) }))
      .filter((x) => x.km <= radius)
      .sort(
        (a, b) =>
          Number(b.c.fr?.s === "fresh") - Number(a.c.fr?.s === "fresh") || Number(b.water) - Number(a.water) || a.km - b.km,
      )
      .slice(0, n)
      .map(({ c, km, water }) => ({
        id: c.id,
        name: c.name,
        place: [c.district, c.region].filter(Boolean).join(" · "),
        source: c.source ?? "",
        lat: c.lat,
        lng: c.lng,
        km: Math.round(km * 10) / 10,
        fresh: c.fr?.s === "fresh",
        water,
      }));
    res.set("Cache-Control", "no-store");
    res.json({ cameras: near });
  } catch (e) {
    next(e);
  }
});

/** กล้องทั้งหมดในกรอบแผนที่ที่กำลังดู (s,w,n,e) — สำหรับแสดงหมุดบนแผนที่ */
waterCctvRouter.get("/bbox", async (req, res, next) => {
  try {
    const [s, w, n, e] = ["s", "w", "n", "e"].map((k) => Number(req.query[k]));
    if (![s, w, n, e].every(Number.isFinite) || s >= n || w >= e) return res.status(400).json({ error: "กรอบแผนที่ไม่ถูกต้อง" });
    const limit = Math.min(400, Math.max(1, Number(req.query.limit) || 250));
    const inBox = (await cameras())
      .filter((c) => c.fr?.s !== "dead" && c.lat >= s && c.lat <= n && c.lng >= w && c.lng <= e)
      .map((c) => ({ c, water: WATER_CAM.test(`${c.name} ${c.source ?? ""}`) }))
      .sort((a, b) => Number(b.c.fr?.s === "fresh") - Number(a.c.fr?.s === "fresh") || Number(b.water) - Number(a.water));
    res.set("Cache-Control", "no-store");
    res.json({
      total: inBox.length,
      cameras: inBox.slice(0, limit).map(({ c, water }) => ({
        id: c.id,
        name: c.name,
        place: [c.district, c.region].filter(Boolean).join(" · "),
        source: c.source ?? "",
        lat: c.lat,
        lng: c.lng,
        fresh: c.fr?.s === "fresh",
        water,
      })),
    });
  } catch (e) {
    next(e);
  }
});

waterCctvRouter.get("/snap/:id", async (req, res, next) => {
  try {
    const id = String(req.params.id);
    if (!/^[\w.-]{1,80}$/.test(id)) return res.status(400).end();
    const hit = snaps.get(id);
    if (hit && Date.now() - hit.at < SNAP_TTL_MS) {
      res.set("Cache-Control", "public, max-age=60").type(hit.type).send(hit.body);
      return;
    }
    if (!(await cameras()).some((c) => c.id === id)) return res.status(404).end();
    const r = await fetch(`${SOURCE}/api/snap/${encodeURIComponent(id)}?t=${Math.floor(Date.now() / SNAP_TTL_MS)}`, {
      signal: AbortSignal.timeout(20_000),
    });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !type.startsWith("image/")) return res.status(502).end();
    const body = Buffer.from(await r.arrayBuffer());
    if (snaps.size >= MAX_SNAP_CACHE) snaps.delete(snaps.keys().next().value as string);
    snaps.set(id, { at: Date.now(), type, body });
    res.set("Cache-Control", "public, max-age=60").type(type).send(body);
  } catch (e) {
    next(e);
  }
});
