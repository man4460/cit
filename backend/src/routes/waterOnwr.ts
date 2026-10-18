import { Router } from "express";
import { enrichLevelsRunoff } from "../lib/waterRunoff.js";

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
    .map((w) => {
      const q = num(w.discharge);
      const qmax = num(w.station.qmax);
      /** % ปริมาณน้ำท่า = Q ปัจจุบัน / ความจุลำน้ำ (qmax) — วิธีคิดตามรายงาน EWI */
      const qPct =
        q != null && qmax != null && qmax > 0 ? Math.round((q / qmax) * 1000) / 10 : null;
      return {
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
        /** % ความจุจากระดับน้ำ (ท้องน้ำ–ตลิ่ง) — ใช้แผนที่ภาพรวม */
        pct: num(w.storage_percent),
        q,
        qmax,
        qPct,
        bank: num(w.diff_wl_bank),
        time: w.waterlevel_datetime ?? null,
      };
    });
}

function compactRain(rows: Json[]) {
  const all = rows
    .filter((r) => r?.station && num(r.station.tele_station_lat) !== null && num(r.rain_24h) !== null)
    .map((r) => ({
      id: num(r.station.id),
      name: th(r.station.tele_station_name),
      code: r.station.tele_station_oldcode ?? "",
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
  /** ดัชนีเฉพาะสถานีที่ตาราง EWI อ้างอิง (ไม่ส่งทั้งประเทศ — payload เคยใหญ่ ~3 MB จนโหลดไม่ครบ) */
  const EWI_RAIN_CODES = new Set(["SLA003", "NPCT", "TPI002"]);
  const EWI_RAIN_NAMES = new Set(["สะเดา", "อบต.พิจิตร", "พุนพิน 1", "พุนพิน 2"]);
  const byCode: Record<string, (typeof all)[number]> = {};
  const byName: Record<string, (typeof all)[number]> = {};
  for (const r of all) {
    if (r.code && EWI_RAIN_CODES.has(r.code) && !byCode[r.code]) byCode[r.code] = r;
    if (r.name && EWI_RAIN_NAMES.has(r.name) && !byName[r.name]) byName[r.name] = r;
  }
  return { stations: all.length, bands, top: sorted.slice(0, 20), near, byProv, byCode, byName };
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

/** สถานีระดับน้ำที่ต้องมีครบ — โดยเฉพาะ สภต./ศหญ. ที่ สทนช. มักหลุดเป็นช่วง ๆ */
const REQUIRED_LEVEL_CODES = [
  /* สภต./ศหญ. */
  "X.173A",
  "X.90",
  "X.174",
  "X.44",
  "ONE037",
  /* ศสร. */
  "TPI004",
  "X.37A",
  "X.217",
  "X.5C",
  /* อื่น ๆ ที่ใช้ทริกเกอร์สี */
  "P.1",
  "P.103",
  "P.67",
  "E.16A",
  "Z.38",
  "N.5A",
  "M.7",
  "M.164",
] as const;
const REQUIRED_RAIN_CODES = ["SLA003", "NPCT", "TPI002"] as const;
const MIN_LEVELS = 400;
const MIN_RAIN = 500;
const MIN_DAMS = 10;
const FETCH_TRIES = 4;
const FETCH_GAP_MS = 2000;

function levelCodesOf(levels: { code?: string }[]) {
  return new Set(levels.map((l) => l.code).filter(Boolean) as string[]);
}

/** รายการที่ขาดจากชุดบังคับ — ว่าง = ครบขั้นต่ำ */
export function onwrGaps(body: {
  levels: { code?: string }[];
  rain: { stations: number; byCode?: Record<string, unknown> };
  dams: unknown[];
  rid: unknown[];
}): string[] {
  const codes = levelCodesOf(body.levels);
  const gaps: string[] = [];
  for (const c of REQUIRED_LEVEL_CODES) if (!codes.has(c)) gaps.push(`level:${c}`);
  for (const c of REQUIRED_RAIN_CODES) if (!body.rain.byCode?.[c]) gaps.push(`rain:${c}`);
  if (body.levels.length < MIN_LEVELS) gaps.push(`levels<${MIN_LEVELS}(${body.levels.length})`);
  if (body.rain.stations < MIN_RAIN) gaps.push(`rain<${MIN_RAIN}(${body.rain.stations})`);
  if (body.dams.length < MIN_DAMS) gaps.push(`dams<${MIN_DAMS}(${body.dams.length})`);
  if (!body.rid.length) gaps.push("rid:empty");
  return gaps;
}

function mergeLevels<T extends { code?: string; name?: string }>(fresh: T[], fallback: T[]): T[] {
  if (!fallback.length) return fresh;
  const have = levelCodesOf(fresh);
  const names = new Set(fresh.map((l) => l.name).filter(Boolean));
  const extra = fallback.filter((l) => (l.code && !have.has(l.code)) || (l.name && !names.has(l.name)));
  return extra.length ? [...fresh, ...extra] : fresh;
}

function mergeRain(
  fresh: ReturnType<typeof compactRain>,
  fallback: ReturnType<typeof compactRain> | undefined,
): ReturnType<typeof compactRain> {
  if (!fallback) return fresh;
  const byCode = { ...fallback.byCode, ...fresh.byCode };
  const byName = { ...fallback.byName, ...fresh.byName };
  const near = { ...fallback.near };
  for (const [id, list] of Object.entries(fresh.near)) {
    const prev = near[id] ?? [];
    const codes = new Set(list.map((r) => r.code).filter(Boolean));
    near[id] = [...list, ...prev.filter((r) => r.code && !codes.has(r.code))];
  }
  return {
    ...fresh,
    stations: Math.max(fresh.stations, fallback.stations),
    byCode,
    byName,
    near,
  };
}

type OnwrBody = Awaited<ReturnType<typeof buildOnce>>;
let cache: { at: number; body: OnwrBody } | null = null;
/** ชุดล่าสุดที่ผ่านเกณฑ์ครบ — ใช้เติมเมื่อ สทนช. ส่งมาไม่ครบ */
let lastComplete: { at: number; body: OnwrBody } | null = null;
let inflight: Promise<void> | null = null;

async function buildOnce() {
  const [wl, nation, rid] = await Promise.all([
    getJson("/public/waterlevel_load"),
    getJson("/public/thailand"),
    ridLowerChaoPhraya().catch(() => []),
  ]);
  const fromLoad = wl?.waterlevel_data?.data ?? [];
  const fromNation = nation?.waterlevel?.data?.data ?? [];
  /** รวมสอง endpoint — บางรอบ waterlevel_load หลุดสถานี RID ภาคใต้ */
  const byId = new Map<string, Json>();
  for (const row of [...fromNation, ...fromLoad]) {
    const id = String(row?.station?.id ?? row?.id ?? "");
    const code = String(row?.station?.tele_station_oldcode ?? "");
    const key = id || `c:${code}`;
    if (key && key !== "c:") byId.set(key, row);
  }
  const rawLevels = compactLevels([...byId.values()]);
  /** เติม qPct = Q/Qmax เท่านั้น + proxy เมื่อไม่มีปริมาณน้ำท่า — ไม่ใช้ % ความจุระดับน้ำ */
  const levels = enrichLevelsRunoff(rawLevels);
  return {
    source: "คลังข้อมูลน้ำแห่งชาติ (สทนช. / สสน.)",
    sourceUrl: "https://nationalthaiwater.onwr.go.th/",
    fetchedAt: new Date().toISOString(),
    levels,
    rain: compactRain(nation?.rain?.data?.data ?? []),
    dams: compactDams(nation?.dam?.data?.data ?? []),
    rid,
    complete: true as boolean,
    gaps: [] as string[],
    filledFromCache: [] as string[],
  };
}

async function build() {
  let lastErr: unknown;
  let best: Awaited<ReturnType<typeof buildOnce>> | null = null;
  let bestGaps = REQUIRED_LEVEL_CODES.length + REQUIRED_RAIN_CODES.length + 4;
  for (let i = 0; i < FETCH_TRIES; i++) {
    try {
      const body = await buildOnce();
      const gaps = onwrGaps(body);
      body.gaps = gaps;
      body.complete = gaps.length === 0;
      if (!gaps.length) return body;
      if (gaps.length < bestGaps) {
        best = body;
        bestGaps = gaps.length;
      }
      console.warn(`[water-onwr] รอบ ${i + 1}/${FETCH_TRIES} ข้อมูลไม่ครบ: ${gaps.join(", ")}`);
    } catch (e) {
      lastErr = e;
      console.warn(`[water-onwr] รอบ ${i + 1}/${FETCH_TRIES} ล้มเหลว:`, e instanceof Error ? e.message : e);
    }
    if (i < FETCH_TRIES - 1) await new Promise((r) => setTimeout(r, FETCH_GAP_MS * (i + 1)));
  }
  if (!best) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "ดึงข้อมูล สทนช. ไม่สำเร็จ"));
  /** เติมสถานีที่ยังขาดจากชุดล่าสุดที่เคยครบ (เช่น สภต. X.173A/X.90/X.174) */
  if (lastComplete?.body) {
    const before = onwrGaps(best);
    best.levels = enrichLevelsRunoff(mergeLevels(best.levels, lastComplete.body.levels));
    best.rain = mergeRain(best.rain, lastComplete.body.rain);
    if (!best.rid.length && lastComplete.body.rid.length) best.rid = lastComplete.body.rid;
    if (best.dams.length < lastComplete.body.dams.length) best.dams = lastComplete.body.dams;
    const after = onwrGaps(best);
    best.filledFromCache = before.filter((g) => !after.includes(g));
    best.gaps = after;
    best.complete = after.length === 0;
    if (best.filledFromCache.length) {
      console.warn(`[water-onwr] เติมจากแคชที่เคยครบ: ${best.filledFromCache.join(", ")}`);
    }
  }
  return best;
}

function remember(body: OnwrBody) {
  cache = { at: Date.now(), body };
  /** เก็บเฉพาะรอบที่ครบจาก API จริง — ไม่เก็บชุดที่เติมจากแคช (กันข้อมูลเก่าหมุนเวียน) */
  if (body.complete && !body.filledFromCache.length) lastComplete = { at: Date.now(), body };
}

function refresh(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && cache && Date.now() - cache.at < TTL_MS && cache.body.complete) return Promise.resolve();
  inflight = build()
    .then((body) => {
      remember(body);
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export type OnwrData = OnwrBody;

/** ข้อมูลสดล่าสุด — ตรวจความครบทุกครั้ง ถ้าไม่ครบดึงใหม่จนกว่าจะครบหรือครบจำนวนครั้ง */
export async function getOnwr(): Promise<OnwrData> {
  if (!cache) await refresh(true);
  else if (!cache.body.complete || Date.now() - cache.at > TTL_MS) await refresh(true).catch(() => undefined);
  else if (Date.now() - cache.at > TTL_MS / 2) refresh(false).catch(() => undefined);
  return cache!.body;
}

/** บังคับดึงใหม่และรอผล (ใช้ตอน rebuild รายงาน) */
export async function refreshOnwr(): Promise<OnwrData> {
  await refresh(true);
  return cache!.body;
}

type GaugeSeed = {
  name?: string;
  code?: string | null;
  amphoe?: string;
  river?: string;
  msl?: number | null;
  prev?: number | null;
  bank?: number | null;
  pct?: number | null;
  q?: number | null;
  qmax?: number | null;
  qPct?: number | null;
  time?: string | null;
};

/**
 * เติม lastComplete จากรอบรายงานใน DB ที่มีสถานี สภต. ครบ
 * (หลังรีสตาร์ทยังเติมสถานีที่ สทนช. หลุดได้)
 */
export function seedOnwrFallbackFromSites(sites: Record<string, { water?: GaugeSeed[]; upstream?: GaugeSeed[] }>) {
  if (lastComplete) return;
  const levels: OnwrBody["levels"] = [];
  const seen = new Set<string>();
  for (const s of Object.values(sites)) {
    for (const g of [...(s.water ?? []), ...(s.upstream ?? [])]) {
      const code = g.code || "";
      const key = code || g.name || "";
      if (!key || seen.has(key)) continue;
      seen.add(key);
      levels.push({
        id: null,
        name: g.name || code,
        code,
        ground: null,
        minBank: null,
        river: g.river || "",
        amphoe: g.amphoe || "",
        prov: "",
        area: "",
        agency: "",
        lat: null,
        lon: null,
        msl: g.msl ?? null,
        prev: g.prev ?? null,
        pct: g.pct ?? null,
        q: g.q ?? null,
        qmax: g.qmax ?? null,
        qPct: g.qPct ?? null,
        bank: g.bank ?? null,
        time: g.time ?? null,
      });
    }
  }
  if (!levels.some((l) => l.code === "X.173A" || l.code === "X.90")) return;
  const emptyRain = compactRain([]);
  lastComplete = {
    at: Date.now(),
    body: {
      source: "ค่ารอบก่อนในระบบ (สำรองเมื่อ สทนช. หลุดสถานี)",
      sourceUrl: "https://nationalthaiwater.onwr.go.th/",
      fetchedAt: new Date().toISOString(),
      levels: enrichLevelsRunoff(levels),
      rain: emptyRain,
      dams: [],
      rid: [],
      complete: false,
      gaps: onwrGaps({ levels, rain: emptyRain, dams: [], rid: [] }),
      filledFromCache: [],
    },
  };
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
