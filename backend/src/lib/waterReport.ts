import path from "path";
import { getOnwr, getRidSeries, refreshOnwr, seedOnwrFallbackFromSites, SITE_POINTS, type OnwrData } from "../routes/waterOnwr.js";
import { agencies, type AgencyData, type AgencyStatus } from "./waterAgencies.js";
import { forecastLoader, forecastSite, type SiteForecast } from "./waterForecast.js";
import { activeManual, MANUAL_KEYS, type ManualEntry, type ManualKey } from "./waterManual.js";
import {
  dbImportJsonIfEmpty,
  dbPruneRounds,
  dbReadLatest,
  dbReadPrevious,
  dbSaveReport,
  parseReportTime,
} from "./waterRoundsStore.js";
import { estRunoffFromStoragePct, findLevelForRunoff, runoffPctOf as runoffPctStrictOf } from "./waterRunoff.js";

/** ค่าที่เจ้าหน้าที่กรอก (จุดวัด ธปท. สนญ.) ของรอบที่กำลังสร้าง — ใช้เป็นหลักแทนสถานีแทน */
let manualNow: Partial<Record<ManualKey, ManualEntry>> = {};
/** รูปแบบ sites.hq.bot ที่หน้าเว็บใช้เป็นค่าหลักของจุดวัด ธปท. */
export const manualBot = (active: Partial<Record<ManualKey, ManualEntry>>) => {
  const out: Record<string, unknown> = {};
  for (const [k, m] of Object.entries(active))
    if (m) out[k] = { value: m.value, time: m.time, manual: true, by: m.by, note: m.note, at: m.at, photoUrl: m.photoUrl ?? null };
  return Object.keys(out).length ? out : undefined;
};
const manualLabel = (m: ManualEntry) => `ค่าวัดจริงที่เจ้าหน้าที่กรอก ${m.time.slice(11, 16)} น. ${Number(m.time.slice(8, 10))}/${Number(m.time.slice(5, 7))}`;

/**
 * รอบรายงานสถานการณ์น้ำ ธปท. — ทุก 3 ชม. (00 03 06 … 21 น. เวลาไทย)
 * ดึงข้อมูลทั้งหมด (ระดับน้ำ ฝน เขื่อน กรมชลประทาน พยากรณ์ฝน ข่าว) วิเคราะห์เทียบรอบก่อน แล้วบันทึกเป็นรายงานรอบนั้น
 */
const ROUND_MS = 3 * 3600_000;
const TZ_MS = 7 * 3600_000;
/** เผื่อให้หน่วยงานต้นทางส่งข้อมูลชั่วโมงนั้นเข้าระบบก่อนดึง */
const ROUND_DELAY_MS = 5 * 60_000;
/** เก็บย้อนหลัง 7 วัน (รอบละ 3 ชม. = 8 รอบ/วัน × 7) */
const KEEP_ROUNDS = 56;
/** ไฟล์ที่เก่ากว่านี้ถือว่าไม่มีรอบรายงาน — สร้างรอบใหม่ทันที */
const FILE_MAX_AGE_MS = ROUND_MS + 30 * 60_000;

export function dataFile(): string {
  const env = process.env.WATER_DATA_FILE?.trim();
  return env ? path.resolve(env) : path.join(process.cwd(), "data", "water-situation.json");
}
/** จังหวัด + สถานีใกล้ที่ตั้ง + จุดน้ำเหนือ (ชื่อตามคลังข้อมูลน้ำแห่งชาติ ต้องตรงกับ UPSTREAM ใน water-monitor/index.html) */
const SITE_INFO: Record<string, { name: string; prov: string; gauges: string[]; upstream: string[] }> = {
  hq: {
    name: "สนญ.",
    prov: "กรุงเทพมหานคร",
    gauges: ["กรมชลประทานสามเสน", "สะพานกรุงเทพ", "คลองลำปลาทิว ลาดกระบัง", "คลองมหาสวัสดิ บางกรวย-สวนผัก"],
    upstream: ["ค่ายจิรประวัติ", "ท้ายเขื่อนเจ้าพระยา", "บ้านบางแก้ว", "บ้านป้อม", "สะพานนวลฉวี"],
  },
  ipd: {
    name: "สพฐ./ศกท.",
    prov: "นครปฐม",
    gauges: ["ที่ว่าการอ.นครชัยศรี", "สะพานนครชัยศรี", "วัดบางไผ่นารถ", "บางเลน"],
    upstream: ["สะพานคง-ศุข ศรีสวัสดิ์", "สามชุก", "วัดท่าเจดีย์ (TTC06)", "วัดบางไผ่นารถ", "บางเลน"],
  },
  cnx: {
    name: "สภน./ศชม.",
    prov: "เชียงใหม่",
    gauges: ["สะพานนวรัฐ", "บ้านสบสอย", "บ้านแม่แต", "บ้านสบแปะ"],
    upstream: ["เชียงดาว", "แม่แตง", "บ้านแม่แตง", "บ้านแม่แต", "สะพานวงแหวนรอบ 3"],
  },
  kkn: {
    name: "สภอ./ศขก.",
    prov: "ขอนแก่น",
    gauges: ["เมืองขอนแก่น", "บ้านกุดกว้าง"],
    upstream: ["บ้านท่าเม่า", "ลำน้ำพอง โรงเรียนลำน้ำพอง", "บ้านท่านางเลื่อน", "ชนบท"],
  },
  hdy: {
    name: "สภต./ศหญ.",
    prov: "สงขลา",
    gauges: ["สะพานข้ามคลองอู่ตะเภา", "บ้านหาดใหญ่ใน", "บ้านบางศาลา", "บ้านคลองหวะ"],
    upstream: ["สะเดา", "บ้านม่วงก็อง"],
  },
  ryg: {
    name: "ศรย.",
    prov: "ระยอง",
    gauges: ["บ้านเขาโบสถ์"],
    upstream: ["หนองบัว", "บ้านค่าย", "บ้านเขาวังไทร"],
  },
  phs: {
    name: "ศพล.",
    prov: "พิษณุโลก",
    gauges: ["สะพานสุพรรณกัลยา", "คลองผันน้ำยม-น่าน4", "เมืองพิษณุโลก"],
    upstream: ["บ้านหาดสองแคว (N.60)", "พิชัย", "นครไทย", "อ.วัดโบสถ์ (N.22A)", "ท้ายเขื่อนนเรศวร"],
  },
  ubn: {
    name: "ศอบ.",
    prov: "อุบลราชธานี",
    gauges: ["แม่น้ำมูล เมืองอุบลราชธานี (M.7)", "สะพานเสรีประชาธิปไตย"],
    upstream: ["บ้านสีถาน", "บ้านเขื่องใน", "เขื่องใน", "บ้านป่าก่อ", "แม่น้ำมูล วัดปากโดม", "แม่น้ำมูล บ้านคันไร่"],
  },
  nrm: {
    name: "ศนร.",
    prov: "นครราชสีมา",
    gauges: ["ตำบลในเมือง", "สำนักเทคโนโลยีชีวภัณฑ์สัตว์"],
    upstream: ["บ้านท่ามะปรางค์", "สะพานน้ำลำตะคอง", "บ้านลาดบัวขาว"],
  },
  urt: {
    name: "ศสร.",
    prov: "สุราษฎร์ธานี",
    /* จุดที่ตั้ง = ท่าข้าม · แสดงสถานี EWI ครบในรายการน้ำ · สีพื้นที่ยังใช้เฉพาะจุด local ผ่าน botStatus */
    gauges: ["บ้านท่าข้าม", "บ้านเคียนซา", "บ้านย่านดินแดง", "ท่าขนอม"],
    upstream: ["ท่าขนอม", "บ้านย่านดินแดง", "บ้านเคียนซา"],
  },
};

type Forecast = {
  date: string;
  mm: number;
  maxHour: number;
  tMax?: number | null;
  tMin?: number | null;
  weatherCode?: number | null;
  rainPct?: number | null;
};
type HourlyFc = { time: string; mm: number; temp: number | null; wind: number | null };
type Rain3d = { mm: number; days: { date: string; mm: number }[] };
/** สถานีฝนตามรายงาน EWI (ศหญ./ศสร.) — ค่าหลัก = สะสม 3 วัน ณ พิกัดสถานี */
const EWI_RAIN: Record<string, { code: string; name: string; altName?: string }[]> = {
  hdy: [
    { code: "SLA003", name: "สะเดา" },
    { code: "NPCT", name: "อบต.พิจิตร" },
  ],
  /* รายงาน EWI เรียก «พุนพิน 1» — ในคลัง สทนช. มีพุนพิน 2 (TPI002) */
  urt: [{ code: "TPI002", name: "พุนพิน 1", altName: "พุนพิน 2" }],
};
type EwiRainRow = { code: string; name: string; mm: number | null; mm24: number | null; time: string | null };
type News = { title: string; url: string; source: string; date: string };
type Level = OnwrData["levels"][number];
type Gauge = {
  name: string;
  code?: string;
  amphoe: string;
  river: string;
  msl: number | null;
  prev: number | null;
  runPrev: number | null;
  bank: number | null;
  /** แสดงผล/แนวโน้ม: % น้ำท่า (Q/Qmax) หรือ % ตลิ่งเมื่อไม่มี Q */
  pct: number | null;
  q: number | null;
  qmax?: number | null;
  qPct?: number | null;
  storagePct?: number | null;
  level: number | null;
  time: string | null;
};
type SiteDoc = { status: number; water: Gauge[]; upstream: Gauge[] } & Record<string, unknown>;
type Report = { meta: Record<string, unknown>; sites: Record<string, SiteDoc> };

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt1 = (n: number) => round1(n).toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const bkkIso = (ms: number) => new Date(ms + TZ_MS).toISOString().slice(0, 19) + "+07:00";
const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function roundLabel(ms: number) {
  const d = new Date(ms + TZ_MS);
  return `${String(d.getUTCHours()).padStart(2, "0")}:00 น. ${d.getUTCDate()} ${TH_MONTH[d.getUTCMonth()]}`;
}
/** ต้นรอบปัจจุบัน (เวลาไทย) */
const roundStart = (ms = Date.now()) => Math.floor((ms + TZ_MS) / ROUND_MS) * ROUND_MS - TZ_MS;
/** ระดับ % ความจุลำน้ำแบบคลังข้อมูลน้ำแห่งชาติ 1 น้อยวิกฤต … 5 ล้นตลิ่ง */
const pctLevel = (p: number | null) => (p === null ? null : p > 100 ? 5 : p > 70 ? 4 : p > 30 ? 3 : p > 10 ? 2 : 1);
/** สถานะพื้นที่จาก % ความจุลำน้ำ (เกณฑ์เฝ้าระวังทั่วไป 80 / 90 / 100) */
const pctStatus = (p: number | null) => (p === null ? -1 : p >= 100 ? 3 : p >= 90 ? 2 : p >= 80 ? 1 : 0);
/** ชื่อระดับ — ตรงกับ STATUS ในหน้าเว็บ */
const STATUS_NAME = ["สีเขียว", "สีเหลือง", "สีส้ม", "สีแดง"];
const rainClass = (mm: number) => (mm > 90 ? "หนักมาก" : mm > 35 ? "หนัก" : mm > 10 ? "ปานกลาง" : mm > 0 ? "เล็กน้อย" : "ไม่มีฝน");
const cm = (m: number) => `${m >= 0 ? "+" : "−"}${Math.round(Math.abs(m) * 100)} ซม.`;

/* ---------- แหล่งข้อมูลเพิ่มเติม ---------- */

/** พยากรณ์ฝน 7 วัน + ฝนสะสม 3 วันย้อนหลัง รายพื้นที่ (Open-Meteo — ไม่ต้องใช้คีย์) */
type OmDaily = {
  daily: {
    time: string[];
    precipitation_sum: (number | null)[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    weather_code?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
  };
  hourly?: {
    time: string[];
    precipitation: (number | null)[];
    temperature_2m?: (number | null)[];
    wind_speed_10m?: (number | null)[];
  };
};

async function openMeteoBatch(points: [number, number][], opts: { hourly: boolean; forecastDays: number }): Promise<OmDaily[]> {
  if (!points.length) return [];
  const q = new URLSearchParams({
    latitude: points.map((p) => p[0]).join(","),
    longitude: points.map((p) => p[1]).join(","),
    daily: "precipitation_sum,temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max",
    timezone: "Asia/Bangkok",
    past_days: "3",
    forecast_days: String(opts.forecastDays),
  });
  if (opts.hourly) q.set("hourly", "precipitation,temperature_2m,wind_speed_10m");
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: AbortSignal.timeout(25_000) });
  if (!r.ok) throw new Error(`open-meteo ${r.status}`);
  const j = (await r.json()) as OmDaily | OmDaily[];
  return Array.isArray(j) ? j : [j];
}

function rain3dFromDaily(d: OmDaily, today: string): Rain3d {
  const daily = d.daily.time.map((date, k) => ({ date, mm: round1(d.daily.precipitation_sum[k] ?? 0) }));
  const window = daily.filter((x) => x.date <= today).slice(-3);
  return { mm: round1(window.reduce((a, x) => a + x.mm, 0)), days: window };
}

async function forecasts(): Promise<{
  fc: Record<string, Forecast[]>;
  rain3d: Record<string, Rain3d>;
  hourly: Record<string, HourlyFc[]>;
}> {
  const ids = Object.keys(SITE_POINTS);
  const j = await openMeteoBatch(
    ids.map((id) => SITE_POINTS[id]),
    { hourly: true, forecastDays: 7 },
  );
  const now = bkkIso(Date.now());
  const today = now.slice(0, 10);
  const hourFloor = now.slice(0, 13); // YYYY-MM-DDTHH
  const fc: Record<string, Forecast[]> = {};
  const rain3d: Record<string, Rain3d> = {};
  const hourly: Record<string, HourlyFc[]> = {};
  ids.forEach((id, i) => {
    const d = j[i];
    if (!d?.daily) {
      fc[id] = [];
      hourly[id] = [];
      return;
    }
    const daily = d.daily.time.map((date, k) => ({
      date,
      mm: round1(d.daily.precipitation_sum[k] ?? 0),
      maxHour: round1(
        Math.max(0, ...((d.hourly?.time ?? []).flatMap((t, h) => (t.startsWith(date) ? [d.hourly!.precipitation[h] ?? 0] : [])))),
      ),
      tMax: d.daily.temperature_2m_max?.[k] ?? null,
      tMin: d.daily.temperature_2m_min?.[k] ?? null,
      weatherCode: d.daily.weather_code?.[k] ?? null,
      rainPct: d.daily.precipitation_probability_max?.[k] ?? null,
    }));
    fc[id] = daily.filter((x) => x.date >= today).slice(0, 7);
    rain3d[id] = rain3dFromDaily(d, today);
    hourly[id] = (d.hourly?.time ?? [])
      .map((t, h) => ({
        time: t,
        mm: round1(d.hourly!.precipitation[h] ?? 0),
        temp: d.hourly!.temperature_2m?.[h] ?? null,
        wind: d.hourly!.wind_speed_10m?.[h] ?? null,
      }))
      .filter((x) => x.time.replace(" ", "T").slice(0, 13) >= hourFloor)
      .slice(0, 48);
  });
  return { fc, rain3d, hourly };
}

/** ฝนสะสม 3 วันรายสถานีตามรายงาน EWI (พิกัดจาก สทนช.) */
async function ewiRainRows(onwr: OnwrData): Promise<Record<string, EwiRainRow[]>> {
  const today = bkkIso(Date.now()).slice(0, 10);
  const specs: { site: string; code: string; name: string; altName?: string; lat: number; lon: number; mm24: number | null; time: string | null }[] = [];
  for (const [site, list] of Object.entries(EWI_RAIN)) {
    for (const st of list) {
      const hit =
        onwr.rain.byCode[st.code] ||
        onwr.rain.byName[st.name] ||
        (st.altName ? onwr.rain.byName[st.altName] : undefined);
      if (!hit) {
        specs.push({ site, code: st.code, name: st.name, altName: st.altName, lat: NaN, lon: NaN, mm24: null, time: null });
        continue;
      }
      specs.push({
        site,
        code: st.code,
        name: st.name,
        altName: st.altName,
        lat: hit.lat,
        lon: hit.lon,
        mm24: hit.mm,
        time: hit.time,
      });
    }
  }
  const pts = specs.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));
  let om: OmDaily[] = [];
  try {
    om = await openMeteoBatch(
      pts.map((s) => [s.lat, s.lon]),
      { hourly: false, forecastDays: 0 },
    );
  } catch {
    om = [];
  }
  const out: Record<string, EwiRainRow[]> = {};
  let oi = 0;
  for (const s of specs) {
    const row: EwiRainRow = { code: s.code, name: s.name, mm: null, mm24: s.mm24, time: s.time };
    if (Number.isFinite(s.lat) && Number.isFinite(s.lon)) {
      const d = om[oi++];
      if (d?.daily) row.mm = rain3dFromDaily(d, today).mm;
      else if (s.mm24 != null) row.mm = s.mm24;
    }
    (out[s.site] ??= []).push(row);
  }
  return out;
}

const decodeXml = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/** ข่าวน้ำท่วมในจังหวัด 2 วันล่าสุด (Google News RSS) */
async function news(prov: string): Promise<News[]> {
  const q = encodeURIComponent(`น้ำท่วม ${prov === "กรุงเทพมหานคร" ? "กรุงเทพ" : prov} when:2d`);
  const r = await fetch(`https://news.google.com/rss/search?q=${q}&hl=th&gl=TH&ceid=TH:th`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) return [];
  const xml = await r.text();
  const out: News[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const tag = (t: string) => decodeXml(m[1].match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "").trim();
    const source = tag("source");
    if (!source || /facebook|youtube|tiktok|instagram|x\.com|twitter/i.test(source)) continue;
    const pub = new Date(tag("pubDate"));
    const d = new Date(pub.getTime() + TZ_MS);
    out.push({
      title: tag("title").replace(new RegExp(`\\s+-\\s+${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), ""),
      url: tag("link"),
      source,
      date: Number.isNaN(pub.getTime()) ? "" : `${d.getUTCDate()} ${TH_MONTH[d.getUTCMonth()]} ${(d.getUTCFullYear() + 543) % 100}`,
    });
    if (out.length >= 4) break;
  }
  return out;
}

/* ---------- เกณฑ์ ธปท. (ต้องตรงกับ BOT_TRIGGERS / LIVE_BOT ใน water-monitor/index.html) ---------- */

type BotInd = {
  label: string;
  unit: string;
  th: [number, number, number];
  gt?: boolean;
  manual?: ManualKey;
  /** local = กระทบที่ตั้ง (กำหนดสีพื้นที่) · upstream = น้ำเหนือ (เฝ้า/คาดการณ์เท่านั้น) */
  impact?: "local" | "upstream";
  lead?: string;
  read: (o: OnwrData) => number | null;
};
/** % ปริมาณน้ำท่า (Q/Qmax ตาม EWI) — รวมค่าจากสถานี proxy ถ้ามี · ไม่ใช้ % ความจุระดับน้ำ */
const runoffPctOf = (
  l: Parameters<typeof runoffPctStrictOf>[0],
  opts?: { allowEstimate?: boolean },
): number | null => runoffPctStrictOf(l, opts);
const regional = (
  station: string,
  code?: string,
  opts?: { impact?: "local" | "upstream"; lead?: string },
): BotInd => ({
  label: station,
  unit: "%",
  th: [30, 70, 100],
  gt: true,
  impact: opts?.impact ?? "local",
  lead: opts?.lead,
  /* ลุ่มใต้/ท่าจีนมักไม่มี Q ในคลัง — ประมาณจาก % ตลิ่งเมื่อจำเป็น */
  read: (o) => runoffPctOf(findLevelForRunoff(o.levels, station, code), { allowEstimate: true }),
});
const byCode = (o: OnwrData, code: string) => o.levels.find((l) => l.code === code);
/** เกณฑ์ฝนรายชั่วโมง — ชุดเดียวกับ สนญ. · สพฐ. คัดเฉพาะอ.นครชัยศรี */
const rainHour = (
  id: string,
  label = "ฝน 1 ชม. ใกล้ที่ตั้ง",
  manual?: ManualKey,
  opts?: { amphoe?: string; radiusKm?: number; impact?: "local" | "upstream" },
): BotInd => ({
  label,
  unit: "มม./ชม.",
  th: [50, 80, 120],
  impact: opts?.impact ?? "local",
  manual: manual ?? ((id === "hq" ? "phranakhon_rain" : `${id}_rain`) as ManualKey),
  read: (o) => {
    const radius = opts?.radiusKm ?? 10;
    const near = (o.rain.near[id] ?? []).filter((r) => r.km <= radius && r.h1 != null);
    const matched = opts?.amphoe
      ? near.filter((r) => String(r.amphoe || "").includes(opts.amphoe!))
      : near;
    const list = matched.length ? matched : near;
    return list.length ? Math.max(...list.map((r) => r.h1 as number)) : null;
  },
});
const withRain = (
  id: string,
  inds: BotInd[],
  label?: string,
  manual?: ManualKey,
  opts?: { amphoe?: string; radiusKm?: number; impact?: "local" | "upstream" },
) => (inds.some((i) => i.unit === "มม./ชม.") ? inds : [...inds, rainHour(id, label, manual, opts)]);
const BOT_CRITERIA: Record<string, BotInd[]> = {
  hq: [
    {
      label: "น้ำไหลผ่านสามโคก (เฉลี่ย 24 ชม.)",
      unit: "ลบ.ม./วิ.",
      th: [2500, 3000, 3500],
      manual: "samkhok_q",
      read: (o) => {
        const m = o.rid.find((r) => r.code === "C.29B");
        if (m?.qMean24) return m.qMean24.q;
        if (m?.q != null) return m.q;
        const a = byCode(o, "C.13")?.q;
        return a == null ? null : a + (byCode(o, "S.26")?.q ?? 0);
      },
    },
    rainHour("hq", "ฝน 1 ชม. เขตพระนคร", "phranakhon_rain"),
    {
      label: "ระดับน้ำขึ้นสูงสุด 24 ชม. (C.12 แทน บก.ทร.)",
      unit: "ม.รทก.",
      th: [2.0, 2.2, 2.5],
      manual: "navy_msl",
      read: (o) => {
        const p = o.rid.find((r) => r.code === "C.12")?.peak24;
        if (p) return p.msl;
        const c = [byCode(o, "C.12"), o.rid.find((r) => r.code === "C.12")].filter((x) => x?.msl != null);
        return c.length ? (c.sort((a, b) => String(b!.time).localeCompare(String(a!.time)))[0]!.msl as number) : null;
      },
    },
  ],
  /* ฝนรายชั่วโมงทริกเกอร์สีเฉพาะ สนญ. — พื้นที่อื่นฝังค่าแสดง (upstream) */
  ipd: withRain(
    "ipd",
    [
      {
        label: "ท่าจีน ที่ว่าการอ.นครชัยศรี (T.1)",
        unit: "ม.รทก.",
        th: [1.8, 2.0, 2.5],
        manual: "nakhonchaisi_msl",
        read: (o) =>
          o.levels.find((l) => l.name === "ที่ว่าการอ.นครชัยศรี")?.msl
          ?? o.levels.find((l) => l.name === "สะพานนครชัยศรี")?.msl
          ?? null,
      },
    ],
    "ฝน 1 ชม. อ.นครชัยศรี",
    "ipd_rain",
    { amphoe: "นครชัยศรี", radiusKm: 15, impact: "upstream" },
  ),
  kkn: [
    regional("ลำน้ำพอง โรงเรียนลำน้ำพอง", "URTD02", { impact: "upstream", lead: "6–12 ชม." }),
    regional("บ้านกุดกว้าง", "E.16A", { impact: "local" }),
  ],
  cnx: [
    regional("สะพานนวรัฐ", "P.1", { impact: "local" }),
    regional("สะพานวงแหวนรอบ 3", "P.103", { impact: "local" }),
    regional("บ้านแม่แต", "P.67", { impact: "local", lead: "4–6 ชม." }),
  ],
  hdy: [
    regional("บ้านม่วงก็อง", "X.173A", { impact: "upstream", lead: "10–14 ชม." }),
    regional("บ้านบางศาลา", "X.90", { impact: "local" }),
    regional("บ้านคลองหวะ", "X.174", { impact: "local" }),
  ],
  urt: withRain(
    "urt",
    [
      regional("ท่าขนอม", "TPI004", { impact: "upstream", lead: "ประมาณ 1 วัน" }),
      regional("บ้านย่านดินแดง", "X.37A", { impact: "upstream", lead: "2–3 วัน" }),
      regional("บ้านเคียนซา", "X.217", { impact: "upstream", lead: "1–1.5 วัน" }),
      regional("บ้านท่าข้าม", "X.5C", { impact: "local", lead: "6–12 ชม." }),
    ],
    "ฝน 1 ชม. อ.เมืองสุราษฎร์ธานี",
    "urt_rain",
    { amphoe: "เมืองสุราษฎร์ธานี", radiusKm: 15, impact: "upstream" },
  ),
  ryg: [
    regional("บ้านเขาโบสถ์", "Z.38", { impact: "local", lead: "คลองทับมา · ใกล้ที่ตั้ง" }),
    regional("บ้านเขาวังไทร", "Z.11", { impact: "upstream", lead: "ลุ่มประแสร์ · ไม่ไหลสู่ที่ตั้ง" }),
    regional("บ้านค่าย", "RAY004", { impact: "upstream", lead: "4–8 ชม. · คลองใหญ่" }),
  ],
  phs: [
    regional("สะพานสุพรรณกัลยา", "N.5A", { impact: "local" }),
    regional("ท้ายเขื่อนนเรศวร", "N.27A", { impact: "upstream", lead: "6–12 ชม. · น้ำเหนือน่าน" }),
    regional("คลองผันน้ำยม-น่าน4", "DIV004", { impact: "local" }),
    regional("เมืองพิษณุโลก", "NAN012", { impact: "local" }),
  ],
  ubn: [
    /* จุดหลัก M.7 สะพานเสรีฯ — PMTS16 ชื่อคล้ายแต่ Q ในคลังเพี้ยน ใช้เป็น alias ผ่าน proxy เท่านั้น */
    regional("สะพานเสรีประชาธิปไตย", "M.7", { impact: "local" }),
    regional("แม่น้ำมูล เมืองอุบลราชธานี (M.7)", "PMTS16", { impact: "local", lead: "alias M.7 · ใช้ Q/Qmax จากสะพานเสรีฯ" }),
    regional("แม่น้ำมูล วัดปากโดม", "PMTS4", { impact: "upstream", lead: "ท้ายน้ำ · อ.พิบูลมังสาหาร" }),
    regional("แม่น้ำมูล บ้านคันไร่", "PMTS15", { impact: "upstream", lead: "ท้ายน้ำ · ไม่กระทบที่ตั้ง" }),
  ],
  nrm: [
    regional("ตำบลในเมือง", "M.164", { impact: "local" }),
    regional("บ้านลาดบัวขาว", "M.177", { impact: "upstream", lead: "12–24 ชม. · ท้ายเขื่อนลำตะคอง" }),
    regional("บ้านท่ามะปรางค์", "M.43A", { impact: "upstream", lead: "เหนือเขื่อนลำตะคอง" }),
    regional("สำนักเทคโนโลยีชีวภัณฑ์สัตว์", "M.89", { impact: "local" }),
  ],
};

/** ค่าทริกเกอร์จากคลังน้ำ — ฝังใน sites[id].bot ให้หน้าเว็บใช้ได้แม้ยังไม่มี onwr สด */
function computedBotReadings(id: string, o: OnwrData): Record<string, { value: number; time: string; live: boolean }> {
  const list = BOT_CRITERIA[id];
  if (!list) return {};
  const stamp = String(o.fetchedAt || bkkIso(Date.now()));
  const out: Record<string, { value: number; time: string; live: boolean }> = {};
  for (const ind of list) {
    if (!ind.manual || manualNow[ind.manual]) continue;
    const v = ind.read(o);
    if (v == null || !Number.isFinite(v)) continue;
    out[ind.manual] = { value: v, time: stamp, live: true };
  }
  return out;
}

function botStatus(id: string, o: OnwrData): { s: number; text: string } | null {
  const list = BOT_CRITERIA[id];
  if (!list) return null;
  const ev = list.flatMap((ind) => {
    const man = ind.manual ? manualNow[ind.manual] : undefined;
    const v = man ? man.value : ind.read(o);
    if (v === null) return [];
    const ge = (a: number, b: number) => (ind.gt ? a > b : a >= b);
    const s = ge(v, ind.th[2]) ? 3 : ge(v, ind.th[1]) ? 2 : ge(v, ind.th[0]) ? 1 : 0;
    return [{ ind, v, s, man }];
  });
  if (!ev.length) return null;
  const rank = (a: (typeof ev)[0], b: (typeof ev)[0]) =>
    b.s - a.s || b.v / b.ind.th[Math.min(b.s, 2)] - a.v / a.ind.th[Math.min(a.s, 2)];
  const localEv = ev.filter((e) => (e.ind.impact ?? "local") !== "upstream");
  const upEv = ev.filter((e) => e.ind.impact === "upstream");
  /* สีพื้นที่ = จุดกระทบที่ตั้งเท่านั้น · ถ้าไม่มีค่า local แต่มีน้ำเหนือ → ไม่ดึงสีขึ้น (คงเขียว + ข้อความเฝ้า) */
  const top = localEv.length
    ? [...localEv].sort(rank)[0]
    : { ind: upEv[0]!.ind, v: upEv[0]!.v, s: 0 as number, man: upEv[0]!.man };
  const areaS = localEv.length ? top.s : 0;
  const upTop = upEv.length ? [...upEv].sort(rank)[0] : null;
  const v =
    top.ind.unit === "ลบ.ม./วิ."
      ? Math.round(top.v).toLocaleString("th-TH")
      : top.ind.unit === "%"
        ? fmt1(top.v)
        : top.v.toFixed(2);
  const gap =
    areaS >= 3
      ? "เกินเกณฑ์สีแดง"
      : localEv.length
        ? `อีก ${top.ind.unit === "%" ? fmt1(top.ind.th[areaS] - top.v) + "%" : (top.ind.th[areaS] - top.v).toFixed(top.ind.unit === "ลบ.ม./วิ." ? 0 : 2) + " " + top.ind.unit} ถึง${STATUS_NAME[areaS + 1]}`
        : "รอจุดกระทบที่ตั้ง";
  const label = top.man
    ? `${MANUAL_KEYS[top.man.key].label} (${manualLabel(top.man)})`
    : localEv.length
      ? top.ind.label
      : `จุดกระทบที่ตั้ง (ยังไม่มีค่า)`;
  const manNote = ev
    .filter((e) => e.man && e !== top)
    .map((e) => `${MANUAL_KEYS[e.man!.key].label} ${e.v.toLocaleString("th-TH")} ${e.ind.unit} (เจ้าหน้าที่กรอก · ${STATUS_NAME[e.s]})`);
  const upNote =
    upTop && upTop.s > areaS
      ? ` · น้ำเหนือ${upTop.ind.label} ${upTop.ind.unit === "%" ? fmt1(upTop.v) + "%" : upTop.v.toFixed(2) + " " + upTop.ind.unit} (${STATUS_NAME[upTop.s]}${upTop.ind.lead ? " · " + upTop.ind.lead : ""}) — ยังไม่กำหนดสีพื้นที่`
      : "";
  return {
    s: areaS,
    text: `เกณฑ์ ธปท. ${STATUS_NAME[areaS]}: ${label}${localEv.length ? ` ${v}${top.ind.unit === "%" ? "%" : " " + top.ind.unit}` : ""} (${gap})${upNote}${manNote.length ? ` · ${manNote.join(" · ")}` : ""}`,
  };
}

/* ---------- วิเคราะห์ ---------- */

function gaugeOf(name: string, l: Level, prevRound: Gauge | undefined): Gauge {
  const qPct = runoffPctOf(l);
  const storagePct = l.pct;
  const displayPct = qPct ?? storagePct;
  const levelPct = qPct ?? estRunoffFromStoragePct(storagePct);
  return {
    name,
    code: l.code || "",
    amphoe: l.amphoe,
    river: l.river,
    msl: l.msl,
    prev: l.prev,
    runPrev: prevRound?.msl ?? null,
    bank: l.bank,
    pct: displayPct,
    q: l.q,
    qmax: l.qmax,
    qPct,
    storagePct,
    level: pctLevel(levelPct),
    time: l.time,
  };
}

const deltaOf = (g: Gauge) => (g.msl !== null && g.runPrev !== null ? g.msl - g.runPrev : null);

function gaugeText(g: Gauge) {
  if (g.pct === null && g.msl === null) return g.name;
  const d = deltaOf(g);
  const move = d === null ? "" : Math.abs(d) < 0.02 ? " (ทรงตัว)" : ` (${cm(d)} จากรอบก่อน)`;
  const msl = g.msl != null ? `${fmt1(g.msl)} ม.รทก.` : "";
  const q = g.q != null ? ` · Q ${fmt1(g.q)} ลบ.ม./วิ.` : "";
  const pct =
    g.qPct != null
      ? ` · ${fmt1(g.qPct)}% น้ำท่า`
      : g.storagePct != null
        ? ` · ${fmt1(g.storagePct)}% ของตลิ่ง`
        : "";
  return `${g.name} ${msl}${q}${pct}${move}`.replace(/\s+/g, " ").trim();
}

function upstreamText(list: Gauge[]) {
  const valid = list.filter((g) => g.pct !== null);
  if (!valid.length) return "";
  const high = valid.filter((g) => (g.pct as number) > 70).sort((a, b) => (b.pct as number) - (a.pct as number));
  const rising = valid.filter((g) => (deltaOf(g) ?? 0) >= 0.05);
  const falling = valid.filter((g) => (deltaOf(g) ?? 0) <= -0.05);
  const trend = rising.length > falling.length ? "กำลังสูงขึ้น" : falling.length > rising.length ? "เริ่มลดลง" : "ทรงตัว";
  const head = high.length
    ? `น้ำเหนือ${trend}: ${high
        .slice(0, 3)
        .map((g) => `${g.name} ${fmt1(g.pct as number)}%${deltaOf(g) !== null && Math.abs(deltaOf(g)!) >= 0.02 ? ` (${cm(deltaOf(g)!)})` : ""}`)
        .join(", ")}`
    : `น้ำเหนือต่ำกว่า 70% ทุกจุด (${trend})`;
  return rising.length ? `${head} · สูงขึ้น ${rising.length} จาก ${valid.length} จุด` : head;
}

function buildSite(
  id: string,
  onwr: OnwrData,
  fc: Forecast[],
  rain3d: Rain3d | undefined,
  ewiRain: EwiRainRow[] | undefined,
  newsList: News[],
  prev: SiteDoc | undefined,
  updatedAt: string,
  label: string,
  ag: AgencyData,
  f72: SiteForecast | null,
): SiteDoc {
  const info = SITE_INFO[id];
  const byName = new Map(onwr.levels.map((l) => [l.name, l]));
  const byCodeMap = new Map(onwr.levels.filter((l) => l.code).map((l) => [l.code as string, l]));
  const pick = (names: string[], prevList: Gauge[] = []) =>
    names.flatMap((name) => {
      const prevG = prevList.find((g) => g.name === name);
      const l = byName.get(name) || (prevG?.code ? byCodeMap.get(prevG.code) : undefined);
      if (l) return [gaugeOf(name, l, prevG)];
      /** สทนช. หลุดสถานี (พบบ่อยที่ สภต.) — คงค่าจากรอบก่อนไว้ก่อน */
      if (prevG && (prevG.msl != null || prevG.pct != null || prevG.q != null)) {
        return [{ ...prevG, time: prevG.time ? `${prevG.time} · ค่ารอบก่อน (สถานีหลุดจาก สทนช.)` : "ค่ารอบก่อน (สถานีหลุดจาก สทนช.)" }];
      }
      return [];
    });
  const water = pick(info.gauges, prev?.water as Gauge[] | undefined);
  const upstream = pick(info.upstream, prev?.upstream as Gauge[] | undefined);

  const near = onwr.rain.near[id] ?? [];
  /* รายสถานีใกล้ที่ตั้ง — ฝน 24 ชม. จาก สทนช. (อ้างอิง) · ค่าหลักใช้ฝนสะสม 3 วันด้านล่าง */
  const rainNear = [...near]
    .sort((a, b) => b.mm - a.mm)
    .slice(0, 5)
    .map((r) => ({ name: r.name, amphoe: r.amphoe, mm: r.mm, time: r.time, km: r.km }));
  const prov = onwr.rain.byProv[info.prov];
  const rainTop = (prov?.top ?? []).map((r) => ({ name: r.name, amphoe: r.amphoe, mm: r.mm, time: r.time }));
  const rain3dMm = rain3d?.mm ?? null;

  const worst = water.reduce<Gauge | null>((m, w) => ((w.pct ?? -1) > (m?.pct ?? -1) ? w : m), null);
  const bot = botStatus(id, onwr);
  /* สีพื้นที่ = ค่าวัดจริงที่จุดทริกเกอร์ตามเกณฑ์ ธปท. — ค่าประเมินภายใน 12 ชม. เป็นคำเตือน ไม่เปลี่ยนสี */
  const status = bot ? bot.s : pctStatus(worst?.pct ?? null);
  const sitePt = SITE_POINTS[id];
  const dams = sitePt
    ? onwr.dams
        .map((d) => {
          const lat = typeof d.lat === "number" ? d.lat : null;
          const lon = typeof d.lon === "number" ? d.lon : null;
          if (lat == null || lon == null) return null;
          const dy = (lat - sitePt[0]) * 111;
          const dx = (lon - sitePt[1]) * 111 * Math.cos((sitePt[0] * Math.PI) / 180);
          const km = Math.sqrt(dx * dx + dy * dy);
          return km <= 180 ? { name: d.name, storage: d.storage, release: d.release, inflow: d.inflow, km: Math.round(km) } : null;
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
        .sort((a, b) => a.km - b.km)
        .slice(0, 4)
    : [];

  const parts: string[] = [];
  if (bot) parts.push(bot.text);
  if (f72 && f72.lvAssess > status) parts.push(`เฝ้าระวัง: ค่าประเมินจุดทริกเกอร์ภายใน 12 ชม. ถึง${STATUS_NAME[f72.lvAssess]} — ${f72.assessText}`);
  const ordered = [...water].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  for (const g of ordered.slice(0, 2)) if (g.pct !== null) parts.push(gaugeText(g));
  const up = upstreamText(upstream);
  if (up) parts.push(up);
  if (rain3dMm != null) {
    parts.push(`ฝนสะสม 3 วัน ${fmt1(rain3dMm)} มม. ณ พิกัดที่ตั้ง (${rainClass(rain3dMm)})`);
    if (rainNear[0] && rainNear[0].mm >= 0.1) parts.push(`ฝน 24 ชม. สถานีใกล้สุด ${fmt1(rainNear[0].mm)} มม. ที่${rainNear[0].name}`);
  } else if (rainNear[0] && rainNear[0].mm >= 0.1) {
    parts.push(`ฝน 24 ชม. ใกล้ที่ตั้งสูงสุด ${fmt1(rainNear[0].mm)} มม. ที่${rainNear[0].name} (${rainClass(rainNear[0].mm)})`);
  } else if (rainTop[0]) {
    parts.push(`ฝน 24 ชม. ใน${info.prov} สูงสุด ${fmt1(rainTop[0].mm)} มม. ที่${rainTop[0].name}`);
  }
  if (fc.length) {
    const peak = fc.reduce((m, f) => (f.mm > m.mm ? f : m));
    const sum7 = round1(fc.reduce((a, f) => a + f.mm, 0));
    parts.push(
      `คาดฝน 7 วันรวม ${fmt1(sum7)} มม. (${fc
        .slice(0, 3)
        .map((f) => fmt1(f.mm))
        .join(" / ")}${fc.length > 3 ? "…" : ""})${peak.mm > 35 ? ` — ฝน${rainClass(peak.mm)}วันที่ ${Number(peak.date.slice(8))}` : ""}`,
    );
  }
  const tmd = ag.tmd[info.prov] ?? [];
  if (tmd.length) {
    const head = tmd.slice(0, 3);
    const descs = [...new Set(head.map((d) => d.desc).filter(Boolean))];
    parts.push(`กรมอุตุฯ: โอกาสฝน ${head.map((d) => `${d.rainPct ?? "–"}%`).join(" / ")}${descs.length ? ` (${descs.join(", ")})` : ""}`);
  }
  const tide = id === "hq" ? tideAnalysis(ag, onwr) : null;
  if (tide) parts.push(tide.text);
  if (f72) parts.push(`คาด 72 ชม.: ${f72.text}`);
  const prevStatus = prev?.status ?? -1;
  const change =
    status < 0 ? "" : prevStatus < 0 || prevStatus === status ? `คงอยู่ที่${STATUS_NAME[status]}` : `${status > prevStatus ? "เพิ่มขึ้น" : "ลดลง"}จาก${STATUS_NAME[prevStatus]}เป็น${STATUS_NAME[status]}`;

  return {
    updatedAt,
    status,
    statusNote: `รอบ ${label}: ${parts.join(" · ")}${change ? ` — ${change}` : ""}`,
    upstreamNote: up,
    forecast: fc,
    tmd,
    ...(tide ? { tide: tide.data } : {}),
    ...(f72 ? { fc72: f72 } : {}),
    rainCount: prov?.count ?? 0,
    rainNear,
    rainTop,
    ...(rain3d ? { rain3d } : {}),
    ...(ewiRain && ewiRain.length ? { ewiRain } : {}),
    water,
    upstream,
    dams,
    news: newsList,
  };
}

/**
 * น้ำทะเลหนุนหน้า บก.ทร. — เทียบระดับน้ำทำนายของกรมอุทกศาสตร์ (น้ำขึ้น-ลงตามดาราศาสตร์)
 * กับระดับจริงล่าสุดแถว สนญ. (C.12 สามเสน) ส่วนที่สูงกว่าคือน้ำเหนือ/ฝนที่เสริมเข้ามา
 */
function tideAnalysis(ag: AgencyData, onwr: OnwrData) {
  const navy = ag.tide.find((t) => /กองบัญชาการกองทัพเรือ/.test(t.name));
  if (!navy || navy.high === null) return null;
  const c12 = [onwr.levels.find((l) => l.code === "C.12"), onwr.rid.find((r) => r.code === "C.12")]
    .filter((x) => x?.msl != null)
    .sort((a, b) => String(b!.time).localeCompare(String(a!.time)))[0];
  const fort = ag.seaObs.find((o) => /ป้อมพระจุล/.test(o.name));
  /* ส่วนเสริม = ระดับจริงสูงสุดช่วง ±2 ชม. รอบเวลาน้ำขึ้นสูงสุดทำนายวันนี้ − ระดับทำนาย */
  const today = bkkIso(Date.now()).slice(0, 10);
  const [hh, mm] = (navy.highTime ?? "").split(":").map(Number);
  const atHigh = Number.isFinite(hh)
    ? (getRidSeries()["C.12"] ?? []).filter((p) => {
        if (p.msl === null || !p.time.startsWith(today)) return false;
        const h = Number(p.time.slice(11, 13)) + Number(p.time.slice(14, 16)) / 60;
        return Math.abs(h - (hh + (mm || 0) / 60)) <= 2;
      })
    : [];
  const peak = atHigh.length ? atHigh.reduce((m, p) => ((p.msl as number) > (m.msl as number) ? p : m)) : null;
  const man = manualNow.navy_msl;
  const obs = man?.value ?? peak?.msl ?? c12?.msl ?? null;
  const obsTime = man?.time ?? peak?.time ?? c12?.time ?? null;
  const surplus = obs !== null ? obs - navy.high : null;
  /** ประมาณระดับสูงสุดวันนี้ = น้ำขึ้นสูงสุดทำนาย + ส่วนเสริมที่เห็นตอนนี้ (ถ้ามี) */
  const est = surplus !== null && surplus > 0 ? navy.high + surplus : navy.high;
  const level = est >= 2.5 ? 3 : est >= 2.2 ? 2 : est >= 2.0 ? 1 : 0;
  const text =
    `กรมอุทกศาสตร์: น้ำขึ้นสูงสุดทำนายที่ บก.ทร. ${navy.high.toFixed(2)} ม.รทก. เวลา ${navy.highTime} น.` +
    (obs !== null ? ` · ${man ? `ระดับจริง ณ บก.ทร. (${manualLabel(man)})` : `ระดับจริง C.12${peak ? ` ช่วงน้ำขึ้น (${peak.time.slice(11, 16)} น.)` : ""}`} ${obs.toFixed(2)} ม.${surplus !== null && surplus > 0.05 ? ` สูงกว่าน้ำทำนาย ${surplus.toFixed(2)} ม. (น้ำเหนือเสริม)` : ""}` : "") +
    (fort?.value != null ? ` · ป้อมพระจุลฯ ${fort.value.toFixed(2)} ม.` : "") +
    ` → คาดสูงสุดราว ${est.toFixed(2)} ม.รทก. (เกณฑ์ ธปท. ${STATUS_NAME[level]})`;
  return {
    text,
    data: { navyHigh: navy.high, navyHighTime: navy.highTime, navyLow: navy.low, navyLowTime: navy.lowTime, observed: obs, observedTime: obsTime, observedBy: man ? "manual" : "C.12", surplus, estimate: est, level, fort: fort ?? null, stations: ag.tide.slice(0, 4) },
  };
}

function nationNote(onwr: OnwrData, sites: Record<string, SiteDoc>, prev: Report | null, label: string, ag: AgencyData) {
  const over = onwr.levels.filter((l) => (l.pct ?? 0) > 100).length;
  const high = onwr.levels.filter((l) => (l.pct ?? 0) > 70 && (l.pct ?? 0) <= 100).length;
  const damsFull = onwr.dams.filter((d) => (d.storage ?? 0) >= 100).map((d) => `${d.name} ${fmt1(d.storage as number)}%`);
  const byStatus = [3, 2, 1].flatMap((s) => {
    const ids = Object.keys(sites).filter((id) => sites[id].status === s);
    return ids.length ? [`${STATUS_NAME[s]}: ${ids.map((id) => SITE_INFO[id].name).join(", ")}`] : [];
  });
  const changes = Object.keys(sites).flatMap((id) => {
    const a = prev?.sites?.[id]?.status ?? -1;
    const b = sites[id].status;
    return a >= 0 && b >= 0 && a !== b ? [{ id, from: a, to: b }] : [];
  });
  const changeTxt = changes.length
    ? `เปลี่ยนจากรอบก่อน: ${changes.map((c) => `${SITE_INFO[c.id].name} ${STATUS_NAME[c.from]}→${STATUS_NAME[c.to]}`).join(", ")}`
    : prev
      ? "สถานะทุกพื้นที่คงเดิมจากรอบก่อน"
      : "";
  const note = [
    `รอบ ${label}`,
    byStatus.length ? byStatus.join(" · ") : "ทุกพื้นที่อยู่ในเกณฑ์สีเขียว",
    changeTxt,
    `ทั่วประเทศ: ล้นตลิ่ง ${over} · น้ำมาก ${high} จาก ${onwr.levels.length} สถานี · ฝนหนักมาก (>90 มม.) ${onwr.rain.bands.over90} สถานี${damsFull.length ? ` · เขื่อนเกินความจุ ${damsFull.join(", ")}` : ""}`,
    ag.warnings.length
      ? `ประกาศกรมอุตุนิยมวิทยา: ${ag.warnings.map((w) => w.title).filter(Boolean).slice(0, 2).join(" / ")}`
      : ag.status.some((s) => s.name === "กรมอุตุนิยมวิทยา" && s.ok)
        ? "กรมอุตุนิยมวิทยา: ไม่มีประกาศเตือนภัย"
        : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return { note, changes };
}

async function seedFallbackFromHistory() {
  try {
    let cursor = await dbReadLatest();
    for (let i = 0; i < 24 && cursor; i++) {
      const hdy = cursor.sites?.hdy as { water?: unknown[] } | undefined;
      if (Array.isArray(hdy?.water) && hdy.water.length >= 3) {
        seedOnwrFallbackFromSites(cursor.sites as Parameters<typeof seedOnwrFallbackFromSites>[0]);
        return;
      }
      const t = parseReportTime(cursor.meta?.updatedAt);
      if (!Number.isFinite(t)) break;
      cursor = await dbReadPrevious(new Date(t));
    }
  } catch {
    /* ignore */
  }
}

async function buildReport(at: number, prev: Report | null): Promise<Report> {
  await seedFallbackFromHistory();
  if (prev?.sites) seedOnwrFallbackFromSites(prev.sites as Parameters<typeof seedOnwrFallbackFromSites>[0]);
  /** ดึงใหม่ทุกครั้งที่สร้างรายงาน + ตรวจครบ/retry ใน refreshOnwr */
  const onwr = await refreshOnwr().catch(() => getOnwr());
  const [weather, ewiRainBySite, newsBySite, ag] = await Promise.all([
    forecasts().catch((): { fc: Record<string, Forecast[]>; rain3d: Record<string, Rain3d>; hourly: Record<string, HourlyFc[]> } => {
      const fc: Record<string, Forecast[]> = {};
      const rain3d: Record<string, Rain3d> = {};
      const hourly: Record<string, HourlyFc[]> = {};
      for (const [id, s] of Object.entries(prev?.sites ?? {})) {
        fc[id] = (s.forecast as Forecast[]) ?? [];
        if (s.rain3d && typeof s.rain3d === "object") rain3d[id] = s.rain3d as Rain3d;
        if (Array.isArray((s as { hourly?: HourlyFc[] }).hourly)) hourly[id] = (s as { hourly: HourlyFc[] }).hourly;
      }
      return { fc, rain3d, hourly };
    }),
    ewiRainRows(onwr).catch(() => {
      const out: Record<string, EwiRainRow[]> = {};
      for (const [id, s] of Object.entries(prev?.sites ?? {})) {
        const rows = (s as { ewiRain?: EwiRainRow[] }).ewiRain;
        if (Array.isArray(rows)) out[id] = rows;
      }
      return out;
    }),
    Promise.all(
      Object.entries(SITE_INFO).map(async ([id, info]) => [id, await news(info.prov).catch(() => (prev?.sites?.[id]?.news as News[]) ?? [])] as const),
    ).then(Object.fromEntries) as Promise<Record<string, News[]>>,
    agencies(),
  ]);
  const fc = weather.fc;
  const rain3d = weather.rain3d;
  const hourly = weather.hourly;
  manualNow = await activeManual().catch(() => ({}));
  const updatedAt = bkkIso(at);
  const label = roundLabel(at);
  const load = forecastLoader();
  const hqTide = tideAnalysis(ag, onwr)?.data;
  const f72 = Object.fromEntries(
    await Promise.all(
      Object.entries(SITE_INFO).map(async ([id, info]) => {
        const ctx = {
          fc: (fc[id] ?? []).slice(0, 3),
          tmd: (ag.tmd[info.prov] ?? []).slice(0, 3),
          tide: id === "hq" && hqTide ? hqTide : null,
          site: SITE_POINTS[id],
          rainSta: onwr.rain.near[id] ?? [],
          manual: id === "hq" ? manualNow : {},
        };
        return [id, await forecastSite(id, info.gauges, onwr, ctx, load).catch(() => null)] as const;
      }),
    ),
  ) as Record<string, SiteForecast | null>;
  const sites: Record<string, SiteDoc> = {};
  for (const id of Object.keys(SITE_INFO)) {
    sites[id] = buildSite(id, onwr, fc[id] ?? [], rain3d[id], ewiRainBySite[id], newsBySite[id] ?? [], prev?.sites?.[id], updatedAt, label, ag, f72[id]);
    if (hourly[id]?.length) sites[id].hourly = hourly[id];
    const computed = computedBotReadings(id, onwr);
    const fromManual = Object.fromEntries(
      Object.entries(manualBot(manualNow) ?? {}).filter(([k]) => MANUAL_KEYS[k as ManualKey]?.site === id),
    );
    const siteBot = { ...computed, ...fromManual };
    if (Object.keys(siteBot).length) sites[id].bot = siteBot;
  }
  const { note, changes } = nationNote(onwr, sites, prev, label, ag);
  const stamp = bkkIso(Date.now()).slice(0, 16).replace("T", " ");
  const newsCount = Object.values(newsBySite).reduce((a, n) => a + n.length, 0);
  const gapNote = onwr.gaps?.length
    ? ` · ยังขาดจาก สทนช.: ${onwr.gaps.filter((g) => g.startsWith("level:") || g.startsWith("rain:")).slice(0, 8).join(", ")}`
    : "";
  const fillNote = onwr.filledFromCache?.length ? ` · เติมจากรอบที่เคยครบ ${onwr.filledFromCache.length} รายการ` : "";
  const agencyStatus: AgencyStatus[] = [
    {
      name: "คลังข้อมูลน้ำแห่งชาติ (สทนช./สสน.)",
      what: `ระดับน้ำ ${onwr.levels.length} สถานี · ฝน ${onwr.rain.stations} สถานี · เขื่อน ${onwr.dams.length} แห่ง${onwr.complete ? " · ครบเกณฑ์" : " · ไม่ครบเกณฑ์"}${fillNote}${gapNote}`,
      ok: onwr.levels.length > 0 && (onwr.complete || Boolean(onwr.filledFromCache?.length)),
      at: stamp,
    },
    { name: "กรมชลประทาน", what: `ระดับน้ำ/ปริมาณน้ำรายชั่วโมง เจ้าพระยาตอนล่าง ${onwr.rid.length} สถานี (สามโคก C.29B, สามเสน C.12)`, ok: onwr.rid.length > 0, at: stamp },
    ...ag.status,
    { name: "Open-Meteo", what: "ฝนสะสม 3 วัน + คาดการณ์ 7 วัน / รายชั่วโมง ณ พิกัดที่ตั้ง", ok: Object.values(fc).some((f) => f.length > 0) || Object.values(rain3d).some((r) => r.mm >= 0), at: stamp },
    { name: "Google News", what: `ข่าวน้ำท่วมรายจังหวัด ${newsCount} ข่าว`, ok: newsCount > 0, at: stamp },
  ];
  return {
    meta: {
      updatedAt,
      generated: "round",
      round: label,
      nextRound: roundLabel(at + ROUND_MS),
      builtAt: bkkIso(Date.now()),
      prevRound: prev?.meta?.round ?? null,
      changes,
      note,
      warnings: ag.warnings,
      agencies: agencyStatus,
      sources: [...new Set(agencyStatus.filter((s) => s.ok).map((s) => s.name))],
      onwrComplete: onwr.complete,
      onwrGaps: onwr.gaps ?? [],
      onwrFilled: onwr.filledFromCache ?? [],
    },
    sites,
  };
}

/* ---------- เก็บ MySQL (WaterRound) + ตั้งเวลา ---------- */

async function readReport(): Promise<Report | null> {
  const j = await dbReadLatest();
  return j?.sites ? (j as Report) : null;
}

const reportTime = (r: Report | null) => parseReportTime(r?.meta?.updatedAt);

async function saveReport(r: Report, roundAtMs: number) {
  const roundAt = new Date(roundAtMs);
  const result = await dbSaveReport(r, roundAt);
  if (result !== "unchanged") await dbPruneRounds(KEEP_ROUNDS);
  return result;
}

let running: Promise<Report> | null = null;
let dbReady: Promise<void> | null = null;

/** นำเข้า JSON เดิมครั้งแรกเมื่อตารางว่าง */
export function ensureWaterDbReady(): Promise<void> {
  dbReady ??= dbImportJsonIfEmpty(dataFile())
    .then(() => undefined)
    .catch((e) => {
      console.error("[water-db] นำเข้า JSON ไม่สำเร็จ:", e instanceof Error ? e.message : e);
    });
  return dbReady;
}

/** สร้างรายงานรอบปัจจุบัน (ถ้ายังไม่มี) แล้วบันทึก */
export function runRound(): Promise<Report> {
  running ??= (async () => {
    await ensureWaterDbReady();
    const at = roundStart();
    const prev = await readReport();
    if (prev && reportTime(prev) >= at) return prev;
    const rep = await buildReport(at, prev);
    const saved = await saveReport(rep, at);
    console.log(`[water-report] รอบ ${rep.meta.round} ${saved === "unchanged" ? "ไม่เปลี่ยน" : "บันทึก MySQL"} — ${rep.meta.note}`);
    return rep;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** คำนวณรอบปัจจุบันใหม่ (เช่น หลังเจ้าหน้าที่กรอกค่าวัดจริง) — เทียบการเปลี่ยนสถานะกับรอบก่อนหน้า ไม่ใช่กับตัวเอง */
export async function rebuildRound(): Promise<Report> {
  if (running) await running.catch(() => undefined);
  running = (async () => {
    await ensureWaterDbReady();
    const at = roundStart();
    const cur = await readReport();
    let prev = cur && reportTime(cur) < at ? cur : null;
    if (!prev) prev = (await dbReadPrevious(new Date(at))) as Report | null;
    const rep = await buildReport(at, prev);
    const saved = await saveReport(rep, at);
    console.log(`[water-report] คำนวณรอบ ${rep.meta.round} ใหม่ (${saved}) — ${rep.meta.note}`);
    return rep;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** รายงานล่าสุด — ถ้าไม่มีหรือเก่าเกินรอบ จะสร้างรอบใหม่ทันที */
export async function latestReport(): Promise<Report> {
  await ensureWaterDbReady();
  const cur = await readReport();
  if (cur && Date.now() - reportTime(cur) < FILE_MAX_AGE_MS) return cur;
  return runRound();
}

let timer: NodeJS.Timeout | null = null;

export function startWaterReportScheduler() {
  if (timer || process.env.WATER_REPORT_SCHEDULER === "off") return;
  const tick = () => {
    void ensureWaterDbReady().then(() =>
      runRound().catch((e) => {
        console.error("[water-report] สร้างรอบรายงานไม่สำเร็จ จะลองใหม่ใน 10 นาที:", e instanceof Error ? e.message : e);
        setTimeout(() => void runRound().catch(() => undefined), 10 * 60_000).unref();
      }),
    );
    const next = roundStart() + ROUND_MS + ROUND_DELAY_MS;
    timer = setTimeout(tick, Math.max(60_000, next - Date.now()));
  };
  tick();
}
