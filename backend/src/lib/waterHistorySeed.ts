import { ensureWaterDbReady } from "./waterReport.js";
import { dbCountRounds, dbHasRoundAt, dbSaveReport } from "./waterRoundsStore.js";
import { getOnwr, SITE_POINTS, stationGraph } from "../routes/waterOnwr.js";

/**
 * Seed รอบรายงานย้อนหลัง 7 วัน (ทุก 3 ชม.) จากกราฟสถานี สทนช. + ฝน Open-Meteo
 * เพื่อให้กราฟแนวโน้ม / วิเคราะห์มีข้อมูลระหว่างที่ระบบสะสมรอบจริง
 *
 * ก่อนขึ้น server: npm run seed:water-history
 * หรือตั้ง WATER_HISTORY_SEED=await ให้รอ seed ตอนสตาร์ทเมื่อรอบไม่พอ
 */

const ROUND_MS = 3 * 3600_000;
const TZ_MS = 7 * 3600_000;
const DAYS = 7;
const ROUNDS = DAYS * 8; /* 8 รอบ/วัน */
const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** สถานีหลักต่อพื้นที่ — ลำดับเดียวกับ SITE_INFO ใน waterReport */
const SITE_GAUGES: Record<string, string[]> = {
  hq: ["กรมชลประทานสามเสน", "สะพานกรุงเทพ", "คลองลำปลาทิว ลาดกระบัง", "คลองมหาสวัสดิ บางกรวย-สวนผัก"],
  ipd: ["ที่ว่าการอ.นครชัยศรี", "สะพานนครชัยศรี", "วัดบางไผ่นารถ", "บางเลน"],
  cnx: ["สะพานนวรัฐ", "บ้านสบสอย", "บ้านแม่แต", "บ้านสบแปะ"],
  kkn: ["เมืองขอนแก่น", "บ้านกุดกว้าง", "บ้านท่านางเลื่อน", "ชนบท"],
  hdy: ["สะพานข้ามคลองอู่ตะเภา", "บ้านหาดใหญ่ใน", "บ้านม่วงก็อง", "สะเดา"],
  ryg: ["บ้านเขาโบสถ์", "บ้านเขาวังไทร", "บ้านค่าย"],
  phs: ["สะพานสุพรรณกัลยา", "ท้ายเขื่อนนเรศวร", "คลองผันน้ำยม-น่าน4", "เมืองพิษณุโลก"],
  ubn: ["แม่น้ำมูล เมืองอุบลราชธานี (M.7)", "สะพานเสรีประชาธิปไตย", "แม่น้ำมูล วัดปากโดม", "แม่น้ำมูล บ้านคันไร่"],
  nrm: ["ตำบลในเมือง", "บ้านลาดบัวขาว", "บ้านท่ามะปรางค์", "สำนักเทคโนโลยีชีวภัณฑ์สัตว์"],
  urt: ["ท่าขนอม", "บ้านย่านดินแดง", "บ้านเคียนซา", "บ้านท่าข้าม"],
};

const roundStart = (ms = Date.now()) => Math.floor((ms + TZ_MS) / ROUND_MS) * ROUND_MS - TZ_MS;
const bkkIso = (ms: number) => new Date(ms + TZ_MS).toISOString().slice(0, 19) + "+07:00";
function roundLabel(ms: number) {
  const d = new Date(ms + TZ_MS);
  return `${String(d.getUTCHours()).padStart(2, "0")}:00 น. ${d.getUTCDate()} ${TH_MONTH[d.getUTCMonth()]}`;
}
const pctStatus = (p: number | null) => (p === null ? -1 : p >= 100 ? 3 : p >= 90 ? 2 : p >= 80 ? 1 : 0);

type WlPt = { t: number; msl: number; pct: number | null };
type RainHour = { t: number; mm: number };

function parseT(s: string): number {
  const raw = s.includes("T") ? s : s.replace(" ", "T");
  const withTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : raw.length <= 16 ? `${raw}:00+07:00` : `${raw}+07:00`;
  return Date.parse(withTz);
}

async function fetchOpenMeteoRain(lat: number, lon: number): Promise<RainHour[]> {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: "precipitation",
    past_days: String(DAYS),
    forecast_days: "1",
    timezone: "Asia/Bangkok",
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) throw new Error(`open-meteo ${r.status}`);
  const j = (await r.json()) as { hourly?: { time?: string[]; precipitation?: (number | null)[] } };
  const times = j.hourly?.time ?? [];
  const precip = j.hourly?.precipitation ?? [];
  const out: RainHour[] = [];
  for (let i = 0; i < times.length; i++) {
    const mm = precip[i];
    if (typeof mm !== "number" || !Number.isFinite(mm)) continue;
    const t = Date.parse(times[i] + "+07:00");
    if (Number.isFinite(t)) out.push({ t, mm });
  }
  return out;
}

function rain24(hours: RainHour[], at: number): number | null {
  const from = at - 24 * 3600_000;
  const sum = hours.filter((h) => h.t > from && h.t <= at).reduce((a, h) => a + h.mm, 0);
  return hours.some((h) => h.t > from && h.t <= at) ? Math.round(sum * 10) / 10 : null;
}

function nearestWl(pts: WlPt[], at: number, maxSkewMs = 2 * 3600_000): WlPt | null {
  let best: WlPt | null = null;
  let bestD = Infinity;
  for (const p of pts) {
    const d = Math.abs(p.t - at);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best && bestD <= maxSkewMs ? best : null;
}

async function loadStationSeries(
  onwr: Awaited<ReturnType<typeof getOnwr>>,
  names: string[],
): Promise<{ name: string; pts: WlPt[] } | null> {
  for (const name of names) {
    const st = onwr.levels.find((l) => l.name === name);
    if (!st?.id) continue;
    const g = await stationGraph(st.id, DAYS).catch(() => null);
    if (!g?.points?.length) continue;
    const ground = g.ground ?? st.ground;
    const bank = g.minBank ?? st.minBank;
    const pts: WlPt[] = g.points.map((p) => {
      const t = parseT(p.time);
      const pct =
        ground != null && bank != null && bank > ground ? ((p.msl - ground) / (bank - ground)) * 100 : st.pct;
      return {
        t,
        msl: p.msl,
        pct: typeof pct === "number" && Number.isFinite(pct) ? Math.round(pct * 10) / 10 : null,
      };
    });
    return { name, pts: pts.filter((p) => Number.isFinite(p.t)).sort((a, b) => a.t - b.t) };
  }
  return null;
}

let seeding: Promise<{ written: number; skipped: number; sites: number }> | null = null;

/** สร้างรอบย้อนหลังใน MySQL ที่ยังไม่มี — ไม่ทับรอบจริง */
export function seedHistoryRounds(): Promise<{ written: number; skipped: number; sites: number }> {
  seeding ??= (async () => {
    await ensureWaterDbReady();
    const now = roundStart();
    const needed: number[] = [];
    for (let i = ROUNDS; i >= 1; i--) {
      const at = now - i * ROUND_MS;
      if (!(await dbHasRoundAt(new Date(at)))) needed.push(at);
    }
    if (!needed.length) return { written: 0, skipped: ROUNDS, sites: Object.keys(SITE_GAUGES).length };

    console.log(`[water-seed] เริ่ม seed ประวัติ ${needed.length} รอบย้อนหลัง 7 วัน → MySQL…`);
    const onwr = await getOnwr();
    const siteIds = Object.keys(SITE_GAUGES);
    const wlBySite = new Map<string, { name: string; pts: WlPt[] }>();
    const rainBySite = new Map<string, RainHour[]>();

    for (const id of siteIds) {
      const wl = await loadStationSeries(onwr, SITE_GAUGES[id] ?? []);
      if (wl) wlBySite.set(id, wl);
      const pt = SITE_POINTS[id];
      if (pt) {
        const rain = await fetchOpenMeteoRain(pt[0], pt[1]).catch(() => [] as RainHour[]);
        rainBySite.set(id, rain);
      }
      /* เว้นจังหวะไม่ยิง API ถี่เกิน */
      await new Promise((r) => setTimeout(r, 120));
    }

    let written = 0;
    for (const at of needed) {
      if (await dbHasRoundAt(new Date(at))) continue;
      const sites: Record<string, unknown> = {};
      for (const id of siteIds) {
        const wl = wlBySite.get(id);
        const hit = wl ? nearestWl(wl.pts, at) : null;
        const rainMm = rain24(rainBySite.get(id) ?? [], at);
        const pct = hit?.pct ?? null;
        const status = pctStatus(pct);
        sites[id] = {
          status,
          statusNote: `รอบ ${roundLabel(at)}: seed ประวัติ${hit ? ` · ${wl!.name} ${pct != null ? pct.toFixed(1) + "%" : hit.msl.toFixed(2) + " ม."}` : ""}${rainMm != null ? ` · ฝน 24 ชม. ${rainMm} มม.` : ""}`,
          water: hit
            ? [{ name: wl!.name, pct, msl: hit.msl, amphoe: "", river: "", prev: null, runPrev: null, bank: null, q: null, level: null, time: bkkIso(hit.t) }]
            : [],
          upstream: [],
          rainNear: rainMm != null ? [{ name: "Open-Meteo (ณ พิกัดที่ตั้ง)", amphoe: "", mm: rainMm, time: bkkIso(at) }] : [],
          rainTop: [],
          dams: [],
          forecast: [],
          updatedAt: bkkIso(at),
        };
      }
      const report = {
        meta: {
          round: roundLabel(at),
          updatedAt: bkkIso(at),
          seed: true,
          note: "seed ย้อนหลัง 7 วัน จากกราฟสถานี สทนช. + ฝน Open-Meteo — รอบจริงทุก 3 ชม. จะทับเมื่อถึงเวลา",
        },
        sites,
      };
      const r = await dbSaveReport(report, new Date(at), { isSeed: true });
      if (r === "created" || r === "updated") written++;
    }
    console.log(`[water-seed] เสร็จ — เขียน MySQL ${written} รอบ · ข้ามที่มีแล้ว ${ROUNDS - written}`);
    return { written, skipped: ROUNDS - written, sites: siteIds.length };
  })().finally(() => {
    seeding = null;
  });
  return seeding;
}

/** ตรวจว่ามีรอบย้อนหลังพอสำหรับวิเคราะห์ 7 วันหรือไม่ */
export async function historyCoverageOk(minRounds = Math.floor(ROUNDS * 0.75)): Promise<{
  ok: boolean;
  count: number;
  need: number;
}> {
  await ensureWaterDbReady();
  const count = await dbCountRounds();
  return { ok: count >= minRounds, count, need: minRounds };
}

/**
 * ถ้า DB ไม่พอ 7 วัน — ดึงจาก สทนช./Open-Meteo ใส่ MySQL
 * ใช้ตอนสตาร์ทเซิร์ฟเวอร์และสคริปต์ deploy
 */
export async function ensureHistoryCoverage(): Promise<{ written: number; skipped: number; sites: number; count: number }> {
  const cov = await historyCoverageOk();
  if (cov.ok) {
    console.log(`[water-seed] รอบใน DB พอแล้ว (${cov.count}/${ROUNDS}) — ข้าม seed`);
    return { written: 0, skipped: ROUNDS, sites: Object.keys(SITE_GAUGES).length, count: cov.count };
  }
  console.log(`[water-seed] รอบใน DB ไม่พอ (${cov.count}/${cov.need}) — ดึงประวัติ 7 วันใส่ MySQL…`);
  const result = await seedHistoryRounds();
  const count = await dbCountRounds();
  return { ...result, count };
}

/**
 * เรียกตอนสตาร์ทเซิร์ฟเวอร์
 * - WATER_HISTORY_SEED=off → ปิด
 * - WATER_HISTORY_SEED=await → รอ seed ถ้า DB ไม่พอ
 * - production (ค่าเริ่ม) → รอ seed ถ้า DB ไม่พอ (กันขึ้น server แล้วยังวิเคราะห์ไม่ได้)
 * - ค่าอื่น / development → รันพื้นหลังทันทีเมื่อรอบไม่พอ
 */
export function startHistorySeed(): void | Promise<unknown> {
  if (process.env.WATER_HISTORY_SEED === "off") return;
  const run = () =>
    ensureHistoryCoverage().catch((e) => {
      console.error("[water-seed] seed ไม่สำเร็จ:", e instanceof Error ? e.message : e);
    });
  const mode = (process.env.WATER_HISTORY_SEED || "").trim().toLowerCase();
  const awaitSeed =
    mode === "await" || (mode !== "bg" && process.env.NODE_ENV === "production");
  if (awaitSeed) return run();
  void run();
}
