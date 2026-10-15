import { Router } from "express";

/** ข้อมูลสดจากคลังข้อมูลน้ำแห่งชาติ (nationalthaiwater.onwr.go.th ใช้ API ชุดเดียวกันนี้) */
const SOURCE = "https://api-v3.thaiwater.net/api/v1/thaiwater30";
const TTL_MS = 10 * 60_000;
const RAIN_RADIUS_KM = 40;

/** พิกัดที่ตั้ง ธปท. — ใช้คัดสถานีฝนใกล้ที่ตั้ง (ต้องตรงกับ SITES ใน water-monitor/index.html) */
export const SITE_POINTS: Record<string, [number, number]> = {
  hq: [13.7676, 100.5034],
  ipd: [13.7784, 100.2227],
  cnx: [18.8217, 98.9812],
  kkn: [16.4228, 102.839],
  hdy: [7.017, 100.4766],
  ryg: [12.6839, 101.2293],
  phs: [16.8607, 100.2145],
  ubn: [15.281, 104.8398],
  nrm: [14.9983, 102.1134],
  urt: [9.108, 99.2929],
};

type Json = Record<string, any>;

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
};
const th = (o: Json | undefined): string => (o?.th ?? "").toString().trim();

function km(a: [number, number], lat: number, lon: number): number {
  const r = Math.PI / 180;
  const x =
    Math.sin(((lat - a[0]) * r) / 2) ** 2 +
    Math.cos(a[0] * r) * Math.cos(lat * r) * Math.sin(((lon - a[1]) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}

async function getJson(path: string): Promise<Json> {
  const r = await fetch(SOURCE + path, {
    headers: { Accept: "application/json", "User-Agent": "CIT-water-monitor" },
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) throw new Error(`thaiwater ${path} ${r.status}`);
  return (await r.json()) as Json;
}

function compactLevels(rows: Json[]) {
  return rows
    .filter((w) => w?.station && num(w.station.tele_station_lat) !== null)
    .map((w) => ({
      id: num(w.station.id),
      name: th(w.station.tele_station_name),
      code: w.station.tele_station_oldcode ?? "",
      ground: num(w.station.ground_level),
      minBank: num(w.station.min_bank),
      river: w.river_name ?? "",
      amphoe: th(w.geocode?.amphoe_name).replace(/^อ\./, ""),
      prov: th(w.geocode?.province_name),
      area: th(w.geocode?.area_name),
      agency: th(w.agency?.agency_shortname),
      lat: num(w.station.tele_station_lat),
      lon: num(w.station.tele_station_long),
      msl: num(w.waterlevel_msl),
      prev: num(w.waterlevel_msl_previous),
      pct: num(w.storage_percent),
      q: num(w.discharge),
      bank: num(w.diff_wl_bank),
      time: w.waterlevel_datetime ?? null,
    }));
}

function compactRain(rows: Json[]) {
  const all = rows
    .filter((r) => r?.station && num(r.station.tele_station_lat) !== null && num(r.rain_24h) !== null)
    .map((r) => ({
      id: num(r.station.id),
      name: th(r.station.tele_station_name),
      amphoe: th(r.geocode?.amphoe_name).replace(/^อ\./, ""),
      prov: th(r.geocode?.province_name),
      area: th(r.geocode?.area_name),
      lat: num(r.station.tele_station_lat) as number,
      lon: num(r.station.tele_station_long) as number,
      mm: num(r.rain_24h) as number,
      h1: num(r.rain_1h),
      time: r.rainfall_datetime ?? null,
    }));
  const near: Record<string, Array<(typeof all)[number] & { km: number }>> = {};
  for (const [id, p] of Object.entries(SITE_POINTS)) {
    near[id] = all
      .map((r) => ({ ...r, km: Math.round(km(p, r.lat, r.lon) * 10) / 10 }))
      .filter((r) => r.km <= RAIN_RADIUS_KM)
      .sort((a, b) => a.km - b.km)
      .slice(0, 30);
  }
  const bands = { over90: 0, over35: 0, over10: 0, any: 0 };
  for (const r of all) {
    if (r.mm > 90) bands.over90++;
    else if (r.mm > 35) bands.over35++;
    else if (r.mm > 10) bands.over10++;
    else if (r.mm > 0) bands.any++;
  }
  const sorted = [...all].sort((a, b) => b.mm - a.mm);
  const byProv: Record<string, { count: number; top: typeof all }> = {};
  for (const r of sorted) {
    const p = (byProv[r.prov] ??= { count: 0, top: [] });
    p.count++;
    if (p.top.length < 3) p.top.push(r);
  }
  return { stations: all.length, bands, top: sorted.slice(0, 20), near, byProv };
}

function compactDams(rows: Json[]) {
  return rows
    .filter((d) => d?.dam)
    .map((d) => ({
      name: th(d.dam.dam_name),
      lat: num(d.dam.dam_lat),
      lon: num(d.dam.dam_long),
      storage: num(d.dam_storage_percent),
      volume: num(d.dam_storage),
      usable: num(d.dam_uses_water_percent),
      inflow: num(d.dam_inflow),
      release: num(d.dam_released),
      spill: num(d.dam_spilled),
      maxStorage: num(d.dam.max_storage),
      date: d.dam_date ?? null,
    }));
}

/** กรมชลประทาน (hyd-app-db.rid.go.th) — ระดับน้ำ/ปริมาณน้ำรายชั่วโมง กลุ่ม "เจ้าพระยาตอนล่าง"
 *  มีสถานี C.29B วัดกร่าง อ.สามโคก ซึ่งคลังข้อมูลน้ำแห่งชาติไม่มี */
const RID = "https://hyd-app-db.rid.go.th/webservice/";
const RID_GROUP = "1072";

async function ridLowerChaoPhraya() {
  const now = new Date(Date.now() + 7 * 3600_000);
  const ymd = now.toISOString().slice(0, 10);
  const [y, m, d] = ymd.split("-");
  const thDate = `${d}/${m}/${Number(y) + 543}`;
  const opt = { signal: AbortSignal.timeout(30_000) };
  const cm = (await (
    await fetch(RID + "HDService.svc/GetColModelHL", {
      ...opt,
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ hydro: { StationGroupID: RID_GROUP, TimeCurrent: thDate } }),
    })
  ).json()) as Json;
  const body = new URLSearchParams({
    "DW[StationGroupID]": RID_GROUP,
    "DW[TimeCurrent]": thDate,
    "DW[Frozen]": "false",
    _search: "false",
    rows: "100",
    page: "1",
    sidx: "indexhourly",
    sord: "asc",
  });
  const grid = (await (
    await fetch(RID + "getGroupHourlyWaterLevelReportHL.ashx", {
      ...opt,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body,
    })
  ).json()) as Json;
  const title = (list: Json[] | undefined, col: string) => list?.find((h) => h.startColumnName === col)?.titleText ?? "";
  const days = Math.max(1, (cm.groupHeadersTop ?? []).length);
  const rows: Json[] = grid?.rows ?? [];
  const out = [];
  const series: Record<string, RidPoint[]> = {};
  const dayYmd = (i: number) => new Date(Date.parse(ymd) - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
  const stamp = (day: string, hour: number) => (hour >= 24 ? `${day} 23:59` : `${day} ${String(hour).padStart(2, "0")}:00`);
  for (const h of (cm.groupHeadersStationCode ?? []) as Json[]) {
    const col = String(h.startColumnName);
    const k = col.replace("wlvalues", "");
    const code = String(h.titleText);
    // คอลัมน์ของแต่ละสถานีเรียงตามวัน (ย้อนหลัง → วันนี้)
    const dayIdx = (Number(k) - 1) % days;
    const day = dayYmd(dayIdx);
    const pts = (series[code] ??= []);
    for (const r of rows) {
      if (num(r[col]) === null) continue;
      pts.push({ time: stamp(day, Math.round(num(r.hourlytime) ?? 0)), msl: num(r[col]), q: num(r["qvalues" + k]) });
    }
    if (dayIdx !== days - 1) continue;
    const last = rows.filter((r) => num(r[col]) !== null).pop();
    if (!last) continue;
    out.push({
      code,
      name: title(cm.groupHeadersStationDetail, col),
      amphoe: title(cm.groupHeadersStationAmpur, col).replace(/^เขต\s*/, ""),
      msl: num(last[col]),
      q: num(last["qvalues" + k]),
      qPct: num(last["QPercent" + k]),
      time: stamp(ymd, Math.round(num(last.hourlytime) ?? 0)),
    });
  }
  for (const pts of Object.values(series)) pts.sort((a, b) => a.time.localeCompare(b.time));
  ridSeries = series;
  return out.map((r) => ({ ...r, peak24: peak24(series[r.code] ?? []), qMean24: qMean24(series[r.code] ?? []) }));
}

/** ปริมาณน้ำเฉลี่ย 24 ชม. — ค่ารายชั่วโมงช่วงน้ำขึ้นน้ำลงแกว่งมาก (สามโคก ±600 ลบ.ม./วิ. ในวันเดียว) */
function qMean24(pts: RidPoint[]): { q: number; n: number; time: string } | null {
  const last = pts.at(-1);
  if (!last) return null;
  const from = Date.parse(last.time.replace(" ", "T") + ":00+07:00") - 24 * 3600_000;
  const qs = pts.filter((p) => p.q !== null && Date.parse(p.time.replace(" ", "T") + ":00+07:00") > from).map((p) => p.q as number);
  return qs.length >= 12 ? { q: qs.reduce((a, b) => a + b, 0) / qs.length, n: qs.length, time: last.time } : null;
}

/** ระดับน้ำสูงสุดรอบ 24 ชม. — เกณฑ์ที่ใช้ "ระดับน้ำขึ้นสูงสุด" (จุดที่ขึ้นลงตามน้ำทะเล) */
function peak24(pts: RidPoint[]): { msl: number; time: string } | null {
  const last = pts.at(-1);
  if (!last) return null;
  const from = Date.parse(last.time.replace(" ", "T") + ":00+07:00") - 24 * 3600_000;
  return pts.reduce<{ msl: number; time: string } | null>((m, p) => {
    if (p.msl === null || Date.parse(p.time.replace(" ", "T") + ":00+07:00") <= from) return m;
    return !m || p.msl > m.msl ? { msl: p.msl, time: p.time } : m;
  }, null);
}

export type RidPoint = { time: string; msl: number | null; q: number | null };
let ridSeries: Record<string, RidPoint[]> = {};
/** ระดับน้ำ/ปริมาณน้ำรายชั่วโมงย้อนหลัง 3 วันของกรมชลประทาน (จากการดึงครั้งล่าสุด) */
export const getRidSeries = () => ridSeries;

/** ฝนรายชั่วโมงย้อนหลังราว 2 วันของสถานีโทรมาตร */
export async function rainGraph(stationId: number) {
  const j = await getJson(`/public/rain_24h_graph?station_id=${stationId}`);
  const pts: Json[] = Array.isArray(j?.data) ? j.data : [];
  return pts
    .filter((p) => num(p.rainfall_value) !== null)
    .map((p) => ({ time: String(p.rainfall_datetime), mm: num(p.rainfall_value) as number }));
}

/** ระดับน้ำรายชั่วโมงย้อนหลังของสถานีโทรมาตร (ข้อมูลเดียวกับกราฟใน nationalthaiwater.onwr.go.th) */
export async function stationGraph(stationId: number, days: number) {
  const end = new Date(Date.now() + 7 * 3600_000);
  const start = new Date(end.getTime() - days * 86_400_000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const j = await getJson(
    `/public/waterlevel_graph?station_type=tele_waterlevel&station_id=${stationId}&start_date=${ymd(start)}&end_date=${ymd(end)}`,
  );
  const pts: Json[] = j?.data?.graph_data ?? [];
  return {
    minBank: num(j?.data?.min_bank),
    ground: num(j?.data?.ground_level),
    points: pts
      .filter((p) => num(p.value) !== null)
      .map((p) => ({ time: String(p.datetime), msl: num(p.value) as number, q: num(p.discharge) })),
  };
}

async function build() {
  const [wl, nation, rid] = await Promise.all([
    getJson("/public/waterlevel_load"),
    getJson("/public/thailand"),
    ridLowerChaoPhraya().catch(() => []),
  ]);
  const levels = compactLevels(wl?.waterlevel_data?.data ?? nation?.waterlevel?.data?.data ?? []);
  return {
    source: "คลังข้อมูลน้ำแห่งชาติ (สทนช. / สสน.)",
    sourceUrl: "https://nationalthaiwater.onwr.go.th/",
    fetchedAt: new Date().toISOString(),
    levels,
    rain: compactRain(nation?.rain?.data?.data ?? []),
    dams: compactDams(nation?.dam?.data?.data ?? []),
    rid,
  };
}

let cache: { at: number; body: Awaited<ReturnType<typeof build>> } | null = null;
let inflight: Promise<void> | null = null;

function refresh(): Promise<void> {
  inflight ??= build()
    .then((body) => {
      cache = { at: Date.now(), body };
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export type OnwrData = Awaited<ReturnType<typeof build>>;

/** ข้อมูลสดล่าสุด (แคช 10 นาที — หมดอายุแล้วส่งของเดิมไปก่อนและดึงใหม่เบื้องหลัง) */
export async function getOnwr(): Promise<OnwrData> {
  if (!cache) await refresh();
  else if (Date.now() - cache.at > TTL_MS) refresh().catch(() => undefined);
  return cache!.body;
}

export const waterOnwrRouter = Router();

waterOnwrRouter.get("/", async (_req, res) => {
  try {
    const body = await getOnwr();
    res.set("Cache-Control", "no-store");
    res.json(body);
  } catch (e) {
    res.status(502).json({ error: `ดึงข้อมูลคลังข้อมูลน้ำแห่งชาติไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}` });
  }
});
