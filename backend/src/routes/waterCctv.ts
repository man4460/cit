import { Router } from "express";

/**
 * กล้อง CCTV สาธารณะจากหลายแหล่ง — รวม ตัดซ้ำ (จุดเดียวกันเก็บตัวที่ภาพใหม่กว่า) แล้วส่งภาพนิ่งผ่าน backend
 *  1) cctv.maholan.net — รวบรวมกล้องหน่วยงานรัฐทั่วประเทศ
 *  2) POPNIX Flood (flood.pop.in.th) — ข้อมูลเปิด ไม่ต้องใช้คีย์ จำกัด 300 ครั้ง/นาที
 *  3) คลังข้อมูลน้ำแห่งชาติ — กล้องเขื่อน กฟผ.
 */
const MAHOLAN = "https://cctv.maholan.net";
const POPNIX = "https://flood.pop.in.th";
const THAIWATER_CCTV = "https://api-v3.thaiwater.net/api/v1/thaiwater30/analyst/cctv";
const UA = { "User-Agent": "CIT-water-monitor (BOT flood watch)" };
const LIST_TTL_MS = 15 * 60_000;
const SNAP_TTL_MS = 2 * 60_000;
const MAX_SNAP_CACHE = 300;
/** ภาพใหม่กว่านี้ถือว่า "สด" / เก่ากว่านี้ไม่แสดง */
const FRESH_S = 3 * 3600;
const MAX_AGE_S = 48 * 3600;
/** กล้องห่างกันไม่เกินนี้ถือว่าเป็นจุดเดียวกัน */
const SAME_SPOT_KM = 0.03;
/** กล้องที่เห็นลำน้ำ/จุดน้ำท่วม — ให้มาก่อนกล้องจราจร */
const WATER_CAM =
  /แม่น้ำ|คลอง|น้ำ|เขื่อน|ประตูระบาย|ปตร|สะพาน|อ่าว|ชายฝั่ง|River|Canal|Bridge|DWR|flood|climate|ทรัพยากรน้ำ|การระบายน้ำ|EGAT|กฟผ/i;

/** แหล่งของ POPNIX (ตาม assets/js/cctv.js ของเว็บ) — ไม่รวม สำนักการระบายน้ำ กทม. ที่ไม่มีภาพใหม่ */
const POPNIX_FEEDS = [
  { key: "bma", url: "/cctv/cams.json", path: "/cctv/", org: "กล้องจราจร กทม." },
  { key: "dds", url: "/cctv/dds.json", path: "/cctv/dds/", org: "สำนักการระบายน้ำ กทม." },
  { key: "itic", url: "/itic/cams.json", path: "/itic/", org: "iTIC" },
  { key: "dwr", url: "/cctv/dwr.json", path: "/cctv/dwr/", org: "กรมทรัพยากรน้ำ" },
  { key: "doh", url: "/cctv/doh.json", path: "/cctv/doh/", org: "กรมทางหลวง" },
  { key: "nbi", url: "/cctv/nbi.json", path: "/cctv/nbi/", org: "เทศบาลนครนนทบุรี" },
  { key: "udon", url: "/cctv/udon.json", path: "/cctv/udon/", org: "เทศบาลนครอุดรธานี" },
  { key: "pkk", url: "/cctv/pkk.json", path: "/cctv/pkk/", org: "เทศบาลนครปากเกร็ด" },
  { key: "hatyai", url: "/cctv/hatyai.json", path: "/cctv/hatyai/", org: "Hatyai City Climate" },
  { key: "gistda", url: "/cctv/gistda.json", path: "/cctv/gistda/", org: "GISTDA" },
  { key: "drr", url: "/cctv/drr.json", path: "/cctv/drr/", org: "กรมทางหลวงชนบท" },
];

type Cam = {
  id: string;
  name: string;
  place: string;
  source: string;
  via: string;
  lat: number;
  lng: number;
  fresh: boolean;
  /** เวลาภาพล่าสุด (unix วินาที) ถ้าทราบ */
  at: number | null;
  snap: string;
  water: boolean;
};

const safeId = (s: string) => s.replace(/[^\w.-]/g, "_").slice(0, 70);
const isWater = (...parts: (string | undefined)[]) => WATER_CAM.test(parts.filter(Boolean).join(" "));
const nowS = () => Date.now() / 1000;

async function getJson<T>(url: string, ms = 20_000): Promise<T> {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return (await r.json()) as T;
}

async function fromMaholan(): Promise<Cam[]> {
  type M = { id: string; name: string; region?: string; district?: string; source?: string; lat: number; lng: number; fr?: { s?: string } };
  const j = await getJson<{ cameras?: M[] }>(`${MAHOLAN}/api/cameras`);
  return (j.cameras ?? [])
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng) && c.fr?.s !== "dead")
    .map((c) => ({
      id: safeId(c.id),
      name: c.name,
      place: [c.district, c.region].filter(Boolean).join(" · "),
      source: c.source ?? "",
      via: "cctv.maholan.net",
      lat: c.lat,
      lng: c.lng,
      fresh: c.fr?.s === "fresh",
      at: null,
      snap: `${MAHOLAN}/api/snap/${encodeURIComponent(c.id)}`,
      water: isWater(c.name, c.source),
    }));
}

async function fromPopnix(): Promise<Cam[]> {
  type P = { id: string | number; name: string; detail?: string; province?: string; lat: number | null; lng: number | null; img?: number; org?: string };
  const lists = await Promise.all(
    POPNIX_FEEDS.map((f) =>
      getJson<{ cams?: P[] }>(POPNIX + f.url)
        .then((j) => ({ f, cams: j.cams ?? [] }))
        .catch(() => ({ f, cams: [] as P[] })),
    ),
  );
  const now = nowS();
  return lists.flatMap(({ f, cams }) =>
    cams
      .filter((c) => c.lat != null && c.lng != null && c.img && now - c.img < MAX_AGE_S)
      .map((c) => {
        const org = (c.org ?? f.org).split(" · ")[0];
        return {
          id: safeId(`pp-${f.key}-${c.id}`),
          name: c.name,
          place: c.detail ?? c.province ?? "",
          source: org,
          via: "POPNIX Flood",
          lat: c.lat as number,
          lng: c.lng as number,
          fresh: now - (c.img as number) < FRESH_S,
          at: c.img as number,
          snap: `${POPNIX}${f.path}${encodeURIComponent(String(c.id))}.jpg?t=${c.img}`,
          water: isWater(c.name, c.detail, org) || f.key === "dwr" || f.key === "dds" || f.key === "nbi",
        };
      }),
  );
}

/** กล้องเขื่อน กฟผ. จากคลังข้อมูลน้ำแห่งชาติ — ตรวจว่ายังให้ภาพได้ก่อนนำมาแสดง (กล้อง DDNS ส่วนใหญ่ปิดไปแล้ว) */
async function fromThaiwater(): Promise<Cam[]> {
  type T = { id: number; title: string; description?: string; lat: string; long: string; media_type: string; cctv_url: string; is_active: boolean; agency?: { agency_shortname?: { th?: string } } };
  const j = await getJson<{ data?: T[] }>(THAIWATER_CCTV);
  const cand = (j.data ?? []).filter((c) => c.is_active && c.media_type === "img" && /egat\.co\.th/i.test(c.cctv_url));
  const alive = await Promise.all(
    cand.map((c) =>
      fetch(c.cctv_url, { headers: UA, signal: AbortSignal.timeout(10_000) })
        .then(async (r) => r.ok && (r.headers.get("content-type") ?? "").startsWith("image/") && (await r.arrayBuffer()).byteLength > 2000)
        .catch(() => false),
    ),
  );
  return cand
    .filter((c, i) => alive[i] && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.long)))
    .map((c) => ({
      id: `tw-${c.id}`,
      name: c.title,
      place: c.description ?? "",
      source: "การไฟฟ้าฝ่ายผลิตฯ (กฟผ.)",
      via: "คลังข้อมูลน้ำแห่งชาติ",
      lat: Number(c.lat),
      lng: Number(c.long),
      fresh: true,
      at: null,
      snap: c.cctv_url,
      water: true,
    }));
}

function km(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** ตัดกล้องซ้ำ (แหล่งอื่นที่จุดเดียวกัน หรือชื่อเดียวกัน) — เก็บตัวที่สดกว่า/ภาพใหม่กว่า; กล้องหลายทิศในแหล่งเดียวกันเก็บไว้ทั้งหมด */
function dedupe(all: Cam[]): Cam[] {
  const sorted = [...all].sort((a, b) => Number(b.fresh) - Number(a.fresh) || (b.at ?? 0) - (a.at ?? 0));
  const grid = new Map<string, Cam[]>();
  const cell = (lat: number, lng: number) => `${Math.floor(lat * 100)}:${Math.floor(lng * 100)}`;
  const kept: Cam[] = [];
  for (const c of sorted) {
    const gy = Math.floor(c.lat * 100), gx = Math.floor(c.lng * 100);
    let dup = false;
    for (let dy = -1; dy <= 1 && !dup; dy++)
      for (let dx = -1; dx <= 1 && !dup; dx++)
        dup = (grid.get(`${gy + dy}:${gx + dx}`) ?? []).some(
          (k) => (k.via !== c.via || k.name === c.name) && km(k.lat, k.lng, c.lat, c.lng) < SAME_SPOT_KM,
        );
    if (dup) continue;
    kept.push(c);
    const key = cell(c.lat, c.lng);
    grid.set(key, [...(grid.get(key) ?? []), c]);
  }
  return kept;
}

let list: { at: number; cams: Cam[]; byId: Map<string, Cam>; stats: Record<string, number> } | null = null;
let listLoading: Promise<Cam[]> | null = null;
const snaps = new Map<string, { at: number; type: string; body: Buffer }>();

async function cameras(): Promise<Cam[]> {
  if (list && Date.now() - list.at < LIST_TTL_MS) return list.cams;
  listLoading ??= (async () => {
    try {
      const parts = await Promise.all([fromMaholan(), fromPopnix(), fromThaiwater()].map((p) => p.catch(() => [] as Cam[])));
      const cams = dedupe(parts.flat());
      if (!cams.length) throw new Error("ไม่มีแหล่งกล้องที่ตอบกลับ");
      const stats: Record<string, number> = {};
      for (const c of cams) stats[c.via] = (stats[c.via] ?? 0) + 1;
      list = { at: Date.now(), cams, byId: new Map(cams.map((c) => [c.id, c])), stats };
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

const rank = (a: Cam, b: Cam) => Number(b.fresh) - Number(a.fresh) || Number(b.water) - Number(a.water);
const out = (c: Cam) => ({
  id: c.id,
  name: c.name,
  place: c.place,
  source: c.via === "cctv.maholan.net" ? c.source : `${c.source} · ${c.via}`,
  lat: c.lat,
  lng: c.lng,
  fresh: c.fresh,
  water: c.water,
});

export const waterCctvRouter = Router();

waterCctvRouter.get("/near", async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: "lat/lon ไม่ถูกต้อง" });
    const n = Math.min(12, Math.max(1, Number(req.query.n) || 6));
    const radius = Math.min(100, Math.max(1, Number(req.query.km) || 30));
    const near = (await cameras())
      .map((c) => ({ c, d: km(lat, lon, c.lat, c.lng) }))
      .filter((x) => x.d <= radius)
      .sort((a, b) => rank(a.c, b.c) || a.d - b.d)
      .slice(0, n)
      .map(({ c, d }) => ({ ...out(c), km: Math.round(d * 10) / 10 }));
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
    const inBox = (await cameras()).filter((c) => c.lat >= s && c.lat <= n && c.lng >= w && c.lng <= e).sort(rank);
    res.set("Cache-Control", "no-store");
    res.json({ total: inBox.length, cameras: inBox.slice(0, limit).map(out) });
  } catch (e) {
    next(e);
  }
});

/** จำนวนกล้องแยกตามแหล่ง */
waterCctvRouter.get("/sources", async (_req, res, next) => {
  try {
    const cams = await cameras();
    res.set("Cache-Control", "no-store");
    res.json({ total: cams.length, fresh: cams.filter((c) => c.fresh).length, bySource: list?.stats ?? {} });
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
    await cameras();
    const cam = list?.byId.get(id);
    if (!cam) return res.status(404).end();
    const url = cam.via === "cctv.maholan.net" ? `${cam.snap}?t=${Math.floor(Date.now() / SNAP_TTL_MS)}` : cam.snap;
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20_000) });
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
