import { getRidSeries, rainGraph, stationGraph, type OnwrData } from "../routes/waterOnwr.js";

/**
 * คาดการณ์สถานะ 72 ชม. รายจุดวัดตามเกณฑ์ — ใช้ข้อมูลรายชั่วโมงย้อนหลัง 7 วันจากคลังข้อมูลน้ำแห่งชาติ
 * (nationalthaiwater.onwr.go.th) และกรมชลประทาน
 *
 * หลักการ (ทุกตัวเลขในผลลัพธ์อธิบายย้อนกลับได้):
 *  1. ค่าฐาน = ค่าล่าสุด หรือระดับสูงสุดรอบ 24 ชม. ถ้าจุดวัดขึ้นลงตามน้ำทะเล
 *  2. แนวโน้มของจุดวัดเอง = ความชันถดถอยเชิงเส้น 24 ชม. (จุดน้ำขึ้นลงใช้ระดับสูงสุดรายวัน 4 วัน)
 *     ต่อเวลาแบบชะลอตัว Δ(H) = ความชัน × τ × (1 − e^(−H/τ)), τ = 24 ชม. (ไม่ลากเส้นตรงยาว 72 ชม.)
 *  3. น้ำเหนือ: ส่งต่อเฉพาะ "การเปลี่ยนแปลง" ของจุดเหนือน้ำที่ยังเดินทางมาไม่ถึง (น้ำสูงแต่ทรงตัว
 *     สะท้อนอยู่ในระดับที่ตั้งแล้ว) × สัดส่วนการตอบสนองจากข้อมูล 7 วัน แล้วนับผลเมื่อถึงเวลาเดินทาง
 *  4. ฝนพยากรณ์ (Open-Meteo + กรมอุตุฯ) เผื่อระดับเพิ่มตามชั้นฝนหนัก/หนักมาก สำหรับลุ่มน้ำที่ตอบสนองต่อฝนในพื้นที่
 *  5. น้ำทะเลหนุน (กรมอุทกศาสตร์) สำหรับจุดวัดหน้า บก.ทร.
 *  6. ประเมินจากลำน้ำ/คลองใกล้เคียง: ถดถอยเชิงเส้นแบบหน่วงเวลา (ข้อมูล 7 วัน) ค่าสถานีข้างเคียงตอนนี้ → ค่าที่จุดทริกเกอร์อีก N ชม.
 *  7. ฝนตกจริงรอบจุดทริกเกอร์ (รายชั่วโมงย้อนหลัง) ที่ระดับน้ำยังไม่ตอบสนอง
 *  ค่าคาด = ฐาน + แนวโน้มเอง (จนกว่าน้ำเหนือจะมาถึง) + น้ำเหนือที่มาถึง + ฝน
 *  lvAssess = ระดับของ max(ค่าวัดจริงที่จุดทริกเกอร์, ค่าประเมินภายใน 12 ชม.) — ใช้เป็นคำเตือน สีพื้นที่ใช้ค่าวัดจริง
 */

const H = 3600_000;
const TAU = 24;
const HORIZONS = [12, 24, 48, 72] as const;
type HK = "12" | "24" | "48" | "72";
/** ช่วงเวลาที่นับรวมในการกำหนดสีปัจจุบัน (ชม.) */
const ASSESS_H = 12;
const STATUS_NAME = ["สีเขียว", "สีเหลือง", "สีส้ม", "สีแดง"];

type Field = "msl" | "q" | "pct";
type Src = { name?: string; code?: string; rid?: string };
type Up = Src & { label: string; h: number };
type RainResp = "none" | "msl" | "pct";
type Ind = {
  label: string;
  unit: string;
  field: Field;
  th: [number, number, number];
  gt?: boolean;
  src: Src;
  up: Up[];
  rain: RainResp;
  tide?: boolean;
  /** ค่ารายชั่วโมงแกว่งตามน้ำขึ้นน้ำลง — ประเมินจากค่ารายวันเสมอ */
  daily?: boolean;
  forecastRain?: boolean;
  /** ลำน้ำ/คลองที่ใช้ประเมินค่าที่จุดทริกเกอร์ (ผลรวมของหลายสถานีได้) — ไม่ระบุ = สถานีในรัศมี 25 กม. */
  near?: { label: string; parts: Src[] }[];
  /** รหัสค่าที่เจ้าหน้าที่กรอกได้ (waterManual) — ถ้ามีใช้เป็นค่าวัดจริงหลัก */
  manualKey?: string;
  manualLabel?: string;
  /** คำอธิบายค่าจากสถานีแทน เมื่อเทียบกับค่าที่เจ้าหน้าที่กรอก */
  proxy?: string;
};
type Pt = { t: number; v: number };

export type Comp = { kind: "trend" | "up" | "rain" | "tide" | "dam" | "info" | "near"; text: string; delta?: number };
export type Estimate = {
  value: number;
  label: string;
  r2: number;
  lag: number;
  ahead: number;
  n: number;
  method: "reg" | "balance";
  ratio?: number;
  cv?: number;
};
export type RainObs = { max24: number; sum3: number; max1: number; stations: string[] };
export type IndForecast = {
  label: string;
  unit: string;
  th: [number, number, number];
  now: number | null;
  nowTime: string | null;
  base: number | null;
  tidal: boolean;
  slope: number | null;
  proj: Record<HK, number | null>;
  lvNow: number;
  lv: Record<HK, number>;
  lv72: number;
  est: Estimate | null;
  rain: RainObs | null;
  assess: number | null;
  lvAssess: number;
  assessWhy: string;
  next: number | null;
  gap: string | null;
  need: string | null;
  hours: number;
  conf: "สูง" | "ปานกลาง" | "ต่ำ";
  comps: Comp[];
};
export type SiteForecast = {
  lvNow: number;
  lvAssess: number;
  assessText: string;
  lv72: number;
  lv: Record<HK, number>;
  conf: "สูง" | "ปานกลาง" | "ต่ำ";
  text: string;
  inds: IndForecast[];
  notes: Comp[];
  method: string;
};

/* ---------- จุดวัดตามเกณฑ์ + จุดเหนือน้ำ (ชั่วโมงเดินทางถึงจุดวัด) ---------- */

const pctInd = (name: string, th: [number, number, number], gt: boolean, up: Up[], rain: RainResp = "pct"): Ind => ({
  label: name,
  unit: "%",
  field: "pct",
  th,
  gt,
  src: { name },
  up,
  rain,
});
const REG: [number, number, number] = [30, 70, 100];
const up = (label: string, h: number, code?: string): Up => ({ label, name: code ? undefined : label, code, h });

const UP: Record<string, Up[]> = {
  ipd: [up("วัดบางไผ่นารถ", 12), up("บางเลน", 12), up("วัดท่าเจดีย์ (TTC06)", 36), up("สามชุก", 72)],
  cnx: [up("เชียงดาว", 24), up("แม่แตง", 12), up("บ้านแม่แตง", 12), up("บ้านแม่แต", 5), up("สะพานวงแหวนรอบ 3", 1.5)],
  kkn: [up("บ้านท่าเม่า", 18), up("ลำน้ำพอง โรงเรียนลำน้ำพอง", 9), up("บ้านท่านางเลื่อน", 36), up("ชนบท", 20)],
  hdy: [up("สะเดา", 15), up("บ้านม่วงก็อง", 12), up("บ้านบางศาลา", 4.5), up("บ้านคลองหวะ", 3)],
  ryg: [up("หนองบัว", 10), up("บ้านค่าย", 6)],
  phs: [up("บ้านหาดสองแคว (N.60)", 42), up("พิชัย", 24), up("นครไทย", 30), up("อ.วัดโบสถ์ (N.22A)", 10), up("ท้ายเขื่อนนเรศวร", 9)],
  ubn: [up("บ้านสีถาน", 60), up("บ้านเขื่องใน", 30), up("เขื่องใน", 24), up("บ้านป่าก่อ", 24)],
  nrm: [up("บ้านลาดบัวขาว", 18)],
  urt: [up("ท่าขนอม", 24), up("บ้านย่านดินแดง", 60), up("บ้านเคียนซา", 30), up("บ้านท่าข้าม", 9)],
};

/** เกณฑ์ฝนรายชั่วโมง — ชุดเดียวกับ สนญ. (50 / 80 / 120 มม./ชม.) ใช้ทุกพื้นที่ */
const RAIN_TH: [number, number, number] = [50, 80, 120];
const rainHourInd = (id: string, label = "ฝน 1 ชม. ใกล้ที่ตั้ง", manualKey?: string): Ind => ({
  label,
  unit: "มม./ชม.",
  field: "q",
  th: RAIN_TH,
  src: {},
  up: [],
  rain: "none",
  forecastRain: true,
  manualKey: manualKey ?? (id === "hq" ? "phranakhon_rain" : `${id}_rain`),
  manualLabel: `${label} (เจ้าหน้าที่กรอก)`,
});

/** จุดวัดตามเกณฑ์ ธปท. (ตรงกับ BOT_TRIGGERS ในหน้าเว็บ) */
const IND: Record<string, Ind[]> = {
  hq: [
    {
      label: "น้ำไหลผ่านสามโคก (C.29B) เฉลี่ย 24 ชม.",
      unit: "ลบ.ม./วิ.",
      field: "q",
      th: [2500, 3000, 3500],
      src: { rid: "C.29B" },
      daily: true,
      manualKey: "samkhok_q",
      manualLabel: "น้ำไหลผ่านสามโคก (เจ้าหน้าที่กรอก)",
      proxy: "C.29B สามโคกเฉลี่ย 24 ชม.",
      near: [
        { label: "บ้านป้อม (C.35) + ท้ายเขื่อนพระรามหก (S.26 ป่าสัก)", parts: [{ code: "C.35" }, { code: "S.26" }] },
        { label: "บ้านบางแก้ว (C.7A) + ท้ายเขื่อนพระรามหก (S.26 ป่าสัก)", parts: [{ code: "C.7A" }, { code: "S.26" }] },
        { label: "บ้านบางพุทรา (C.3) + ท้ายเขื่อนพระรามหก (S.26 ป่าสัก)", parts: [{ code: "C.3" }, { code: "S.26" }] },
        { label: "บ้านป้อม (C.35)", parts: [{ code: "C.35" }] },
      ],
      up: [up("ค่ายจิรประวัติ (C.2)", 66, "C.2"), up("ท้ายเขื่อนเจ้าพระยา (C.13)", 42, "C.13"), up("บ้านบางแก้ว (C.7A)", 30, "C.7A")],
      rain: "none",
    },
    rainHourInd("hq", "ฝน 1 ชม. เขตพระนคร", "phranakhon_rain"),
    {
      label: "ระดับน้ำขึ้นสูงสุด ณ บก.ทร. (C.12)",
      unit: "ม.รทก.",
      field: "msl",
      th: [2.0, 2.2, 2.5],
      src: { rid: "C.12" },
      up: [],
      rain: "msl",
      tide: true,
      manualKey: "navy_msl",
      manualLabel: "ระดับน้ำขึ้นสูงสุด ณ บก.ทร. (เจ้าหน้าที่กรอก)",
      proxy: "C.12 สามเสนสูงสุด 24 ชม.",
    },
  ],
  ipd: [
    { label: "ท่าจีน ที่ว่าการอ.นครชัยศรี (T.1)", unit: "ม.รทก.", field: "msl", th: [1.8, 2.0, 2.5], src: { name: "ที่ว่าการอ.นครชัยศรี" }, up: UP.ipd, rain: "msl" },
  ],
  kkn: [pctInd("ลำน้ำพอง โรงเรียนลำน้ำพอง", REG, true, UP.kkn), pctInd("บ้านกุดกว้าง", REG, true, UP.kkn)],
  cnx: [pctInd("สะพานนวรัฐ", REG, true, UP.cnx), pctInd("สะพานวงแหวนรอบ 3", REG, true, UP.cnx), pctInd("บ้านแม่แต", REG, true, UP.cnx)],
  hdy: [pctInd("บ้านม่วงก็อง", REG, true, UP.hdy), pctInd("บ้านบางศาลา", REG, true, UP.hdy), pctInd("บ้านคลองหวะ", REG, true, UP.hdy)],
  urt: [pctInd("ท่าขนอม", REG, true, UP.urt), pctInd("บ้านย่านดินแดง", REG, true, UP.urt), pctInd("บ้านเคียนซา", REG, true, UP.urt), pctInd("บ้านท่าข้าม", REG, true, UP.urt)],
};

/** พื้นที่ที่ ธปท. ยังไม่กำหนดจุดวัด — ใช้เกณฑ์ % ปริมาณน้ำท่า (30/70/100) · ฝนรายชั่วโมงเฉพาะ สนญ. */
const indFor = (id: string, gauges: string[]) => IND[id] ?? gauges.map((g) => pctInd(g, REG, true, UP[id] ?? []));

/** เขื่อนที่ส่งผลต่อพื้นที่ — ใช้เตือนเมื่ออ่างเต็มและน้ำไหลเข้ามากกว่าระบาย */
const DAMS: Record<string, string[]> = {
  ryg: ["หนองปลาไหล"],
  kkn: ["อุบลรัตน์"],
  phs: ["สิริกิติ์", "แควน้อยบำรุงแดน"],
  nrm: ["ลำตะคอง"],
  urt: ["รัชชประภา"],
  hq: ["ภูมิพล", "สิริกิติ์", "ป่าสักชลสิทธิ์"],
  ipd: ["กระเสียว"],
};

/* ---------- ข้อมูลย้อนหลัง ---------- */

const parseT = (s: string) => Date.parse(s.replace(" ", "T") + (s.length <= 16 ? ":00" : "") + "+07:00");

type Graph = Awaited<ReturnType<typeof stationGraph>>;
type RainPts = Awaited<ReturnType<typeof rainGraph>>;
type Loader = { graph: (id: number) => Promise<Graph | null>; rain: (id: number) => Promise<RainPts | null> };

function makeLoader(): Loader {
  const g = new Map<number, Promise<Graph | null>>();
  const r = new Map<number, Promise<RainPts | null>>();
  return {
    graph: (id) => {
      if (!g.has(id)) g.set(id, stationGraph(id, 7).catch(() => null));
      return g.get(id)!;
    },
    rain: (id) => {
      if (!r.has(id)) r.set(id, rainGraph(id).catch(() => null));
      return r.get(id)!;
    },
  };
}
const stationOf = (src: Src, onwr: OnwrData) =>
  onwr.levels.find((l) => (src.code || src.rid ? l.code === (src.code ?? src.rid) : l.name === src.name)) ?? null;

async function series(src: Src, field: Field, onwr: OnwrData, load: Loader): Promise<Pt[] | null> {
  if (src.rid) {
    const pts = (getRidSeries()[src.rid] ?? []).flatMap((p) => {
      const v = field === "q" ? p.q : p.msl;
      return v === null ? [] : [{ t: parseT(p.time), v }];
    });
    return pts.length ? pts : null;
  }
  const st = onwr.levels.find((l) => (src.code ? l.code === src.code : l.name === src.name));
  if (!st?.id) return null;
  const g = await load.graph(st.id);
  if (!g || !g.points.length) return null;
  const ground = g.ground ?? st.ground;
  const bank = g.minBank ?? st.minBank;
  const qmax = st.qmax;
  const pts = g.points.flatMap((p) => {
    let v: number | null = p.msl;
    if (field === "q") v = p.q;
    if (field === "pct") {
      /* % ปริมาณน้ำท่า (Q/Qmax) ตามรายงาน EWI เท่านั้น — ไม่ใช้ % ความจุระดับน้ำ */
      if (qmax != null && qmax > 0 && p.q != null) v = Math.round((p.q / qmax) * 1000) / 10;
      else v = null;
    }
    return v === null ? [] : [{ t: parseT(p.time), v }];
  });
  return pts.length ? pts.sort((a, b) => a.t - b.t) : null;
}

/* ---------- สถิติ ---------- */

const win = (s: Pt[], from: number, to: number) => s.filter((p) => p.t > from && p.t <= to);
const mean = (s: Pt[]) => (s.length ? s.reduce((a, p) => a + p.v, 0) / s.length : null);
/** ความชันถดถอยเชิงเส้น (หน่วยต่อชั่วโมง) */
function slopeOf(s: Pt[]): number | null {
  if (s.length < 4 || s.at(-1)!.t - s[0].t < 3 * H) return null;
  const xs = s.map((p) => p.t / H), mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = mean(s)!;
  let num = 0, den = 0;
  s.forEach((p, i) => {
    num += (xs[i] - mx) * (p.v - my);
    den += (xs[i] - mx) ** 2;
  });
  return den ? num / den : null;
}
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
/** ช่วงแกว่งของค่าเฉลี่ยรายวันในช่วงข้อมูล */
function dailyRange(s: Pt[]) {
  const end = s.at(-1)!.t;
  const means: number[] = [];
  for (let k = 0; k < 7; k++) {
    const m = mean(win(s, end - (k + 1) * 24 * H, end - k * 24 * H));
    if (m !== null) means.push(m);
  }
  return means.length >= 3 ? Math.max(...means) - Math.min(...means) : null;
}

/* ---------- รูปแบบตัวเลข ---------- */

function fmtV(v: number, unit: string) {
  if (unit === "ลบ.ม./วิ.") return `${Math.round(v).toLocaleString("th-TH")} ลบ.ม./วิ.`;
  if (unit === "%") return `${v.toFixed(1)}%`;
  if (unit === "มม./ชม.") return `${v.toFixed(1)} มม./ชม.`;
  return `${v.toFixed(2)} ม.รทก.`;
}
function fmtD(d: number, unit: string) {
  const s = d >= 0 ? "+" : "−", a = Math.abs(d);
  if (unit === "ลบ.ม./วิ.") return `${s}${Math.round(a).toLocaleString("th-TH")} ลบ.ม./วิ.`;
  if (unit === "%") return `${s}${a.toFixed(1)}%`;
  return `${s}${a < 0.1 ? (a * 100).toFixed(1) : Math.round(a * 100)} ซม.`;
}
/** ขึ้นลงตามน้ำทะเล: แกว่งใน 24 ชม. มากกว่าเกณฑ์ และมากกว่าการเปลี่ยนแปลงสุทธิ 3 เท่า */
function isTidal(d24: Pt[], unit: string) {
  if (d24.length < 6) return false;
  const vals = d24.map((p) => p.v);
  const range = Math.max(...vals) - Math.min(...vals);
  const net = d24.at(-1)!.v - d24[0].v;
  const min = unit === "%" ? 4 : unit === "ลบ.ม./วิ." ? 150 : 0.15;
  return range > min && range > 3 * Math.abs(net);
}

function kmBetween(a: number, b: number, c: number, d: number) {
  const r = Math.PI / 180;
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}
/** ค่ารอบ 24 ชม. ย้อนหลังทุกชั่วโมง (เฉลี่ยสำหรับปริมาณน้ำ · สูงสุดสำหรับระดับน้ำขึ้นลง) */
function roll24(s: Pt[], flow: boolean): Pt[] {
  const out: Pt[] = [];
  let j = 0;
  for (let i = 0; i < s.length; i++) {
    while (s[j].t <= s[i].t - 24 * H) j++;
    if (s[i].t - s[0].t < 20 * H) continue;
    const w = s.slice(j, i + 1).map((p) => p.v);
    out.push({ t: s[i].t, v: flow ? w.reduce((a, b) => a + b, 0) / w.length : Math.max(...w) });
  }
  return out;
}
const hourKey = (t: number) => Math.round(t / H);
function sumSeries(list: Pt[][]): Pt[] {
  const maps = list.map((s) => new Map(s.map((p) => [hourKey(p.t), p.v])));
  return list[0].flatMap((p) => {
    const k = hourKey(p.t);
    const vs = maps.map((m) => m.get(k));
    return vs.every((v) => v !== undefined) ? [{ t: p.t, v: (vs as number[]).reduce((a, b) => a + b, 0) }] : [];
  });
}
/** ถดถอยเชิงเส้น Y(t) = a + b·X(t − lag) */
function fitLag(Y: Pt[], X: Pt[], lag: number) {
  const xm = new Map(X.map((p) => [hourKey(p.t), p.v]));
  const pairs: [number, number][] = [];
  for (const y of Y) {
    const x = xm.get(hourKey(y.t) - lag);
    if (x !== undefined) pairs.push([x, y.v]);
  }
  if (pairs.length < 24) return null;
  const n = pairs.length, mx = pairs.reduce((a, p) => a + p[0], 0) / n, my = pairs.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  const ratios = pairs.filter((p) => p[0] > 0).map((p) => p[1] / p[0]);
  const c = ratios.length ? ratios.reduce((a, r) => a + r, 0) / ratios.length : 0;
  const cv = c > 0 ? Math.sqrt(ratios.reduce((a, r) => a + (r - c) ** 2, 0) / ratios.length) / c : Infinity;
  if (!sxx || !syy) return { a: 0, b: 0, r2: 0, n, c, cv };
  const b = sxy / sxx;
  return { a: my - b * mx, b, r2: (sxy * sxy) / (sxx * syy), n, c, cv };
}

/** ประเมินค่าที่จุดทริกเกอร์จากลำน้ำ/คลองใกล้เคียง — เลือกสถานีและช่วงหน่วงเวลาที่อธิบายข้อมูล 7 วันได้ดีที่สุด */
async function neighbourEstimate(ind: Ind, S: Pt[], useRoll: boolean, onwr: OnwrData, load: Loader): Promise<Estimate | null> {
  const flow = ind.field === "q";
  let cands: { label: string; parts: Src[] }[] = ind.near ?? [];
  if (!cands.length) {
    const st = stationOf(ind.src, onwr);
    if (!st || st.lat === null || st.lon === null) return null;
    cands = onwr.levels
      .filter((l) => l.id && l.name !== st.name && l.lat !== null && l.lon !== null)
      .map((l) => ({ l, km: kmBetween(st.lat!, st.lon!, l.lat!, l.lon!) }))
      .filter((x) => x.km <= 25)
      .sort((a, b) => a.km - b.km)
      .slice(0, 6)
      .map((x) => ({
        label: `${x.l.name}${x.l.river ? ` (${x.l.river})` : ""} ${x.km < 0.3 ? "สถานีหน่วยงานอื่น ณ จุดเดียวกัน" : `ห่าง ${x.km.toFixed(1)} กม.`}`,
        parts: [{ name: x.l.name }],
      }));
  }
  const Y = useRoll ? roll24(S, flow) : S;
  if (Y.length < 12) return null;
  const yl = Y.at(-1)!;
  const lags = flow ? [0, 6, 12, 24] : [0, 3, 6, 12];
  let best: (Estimate & { score: number }) | null = null;
  let bal: (Estimate & { score: number }) | null = null;
  for (const c of cands) {
    const parts = await Promise.all(c.parts.map((p) => series(p, ind.field, onwr, load)));
    if (parts.some((p) => !p || Date.now() - p.at(-1)!.t > 12 * H)) continue;
    const raw = parts.length > 1 ? sumSeries(parts as Pt[][]) : (parts[0] as Pt[]);
    if (raw.length < 24) continue;
    const X = useRoll ? roll24(raw, flow) : raw;
    if (!X.length) continue;
    const xm = new Map(X.map((p) => [hourKey(p.t), p.v]));
    const xl = X.at(-1)!;
    for (const lag of lags) {
      const f = fitLag(Y, X, lag);
      if (!f) continue;
      const ahead = Math.round((xl.t + lag * H - yl.t) / H);
      /* ค่าล่วงหน้ายึดค่าวัดจริงปัจจุบัน + การเปลี่ยนแปลงของสถานีข้างเคียง (ตัดความเอนเอียงของสมการ) */
      const xRef = xm.get(hourKey(yl.t) - lag);
      if (f.b > 0 && f.r2 >= 0.6) {
        const value = ahead > 0 && xRef !== undefined ? yl.v + f.b * (xl.v - xRef) : f.a + f.b * xl.v;
        if (!best || f.r2 > best.score) best = { value, label: c.label, r2: f.r2, lag, ahead, n: f.n, method: "reg", score: f.r2 };
      }
      /* สมดุลมวลน้ำ: ปริมาณน้ำที่จุดทริกเกอร์ ≈ c × ผลรวมลำน้ำสาขา (ใช้เมื่อข้อมูลสั้นเกินกว่าจะถดถอยได้) */
      if (flow && ind.near && f.cv < 0.15 && (!bal || f.cv < bal.score)) {
        const value = ahead > 0 && xRef !== undefined ? yl.v + f.c * (xl.v - xRef) : f.c * xl.v;
        bal = { value, label: c.label, r2: f.r2, lag, ahead, n: f.n, method: "balance", ratio: f.c, cv: f.cv, score: f.cv };
      }
    }
  }
  const pick = best ?? bal;
  if (!pick) return null;
  const { score: _s, ...est } = pick;
  return est;
}

/** ฝนตกจริงรอบจุดทริกเกอร์ (สถานีฝนในรัศมี 15 กม. สูงสุด 3 สถานี) */
async function rainAround(ind: Ind, onwr: OnwrData, ctx: Ctx, load: Loader, radiusKm = 15): Promise<RainObs | null> {
  const st = ind.src.name || ind.src.code || ind.src.rid ? stationOf(ind.src, onwr) : null;
  const at: [number, number] = st && st.lat !== null && st.lon !== null ? [st.lat, st.lon] : ctx.site;
  const near = ctx.rainSta
    .filter((r) => r.id)
    .map((r) => ({ r, km: kmBetween(at[0], at[1], r.lat, r.lon) }))
    .filter((x) => x.km <= radiusKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, 3);
  if (!near.length) return null;
  let max24 = 0, sum3 = 0, max1 = 0;
  const names: string[] = [];
  for (const { r, km } of near) {
    if (r.mm < 0.1 && Date.now() - parseT(r.time ?? "1970-01-01 00:00") <= 6 * H) {
      names.push(`${r.name} (${km.toFixed(1)} กม.)`);
      continue;
    }
    const pts = await load.rain(r.id as number);
    if (!pts || !pts.length) continue;
    const end = parseT(pts.at(-1)!.time);
    if (Date.now() - end > 6 * H) continue;
    const w = (h: number) => pts.filter((p) => parseT(p.time) > end - h * H);
    max24 = Math.max(max24, w(24).reduce((a, p) => a + p.mm, 0));
    sum3 = Math.max(sum3, w(3).reduce((a, p) => a + p.mm, 0));
    max1 = Math.max(max1, ...w(24).map((p) => p.mm));
    names.push(`${r.name} (${km.toFixed(1)} กม.)`);
  }
  return names.length ? { max24, sum3, max1, stations: names } : null;
}

/* ---------- วิเคราะห์ ---------- */

type Ctx = {
  fc: { date: string; mm: number; maxHour: number }[];
  tmd: { date: string; rainPct: number | null; desc: string }[];
  tide: { estimate: number; navyHigh: number; navyHighTime: string; surplus: number | null } | null;
  site: [number, number];
  rainSta: { id: number | null; name: string; lat: number; lon: number; mm: number; time: string | null }[];
  /** ค่าวัดจริงที่เจ้าหน้าที่กรอก ณ จุดทริกเกอร์ (ตาม Ind.manualKey) */
  manual?: Partial<Record<string, { value: number; time: string; by: string }>>;
};

const RAIN_ALLOW: Record<RainResp, [number, number]> = { none: [0, 0], msl: [0.1, 0.25], pct: [8, 20] };

function levelOf(v: number, ind: Ind) {
  const ge = ind.gt ? (a: number, b: number) => a > b : (a: number, b: number) => a >= b;
  return ge(v, ind.th[2]) ? 3 : ge(v, ind.th[1]) ? 2 : ge(v, ind.th[0]) ? 1 : 0;
}
const fmtTime = (t: number) => new Date(t + 7 * H).toISOString().slice(0, 16).replace("T", " ");

/** เกณฑ์ฝนรายชั่วโมง (สนญ.) — ค่าวัดจริงจากสถานีฝนรอบที่ตั้ง 10 กม. + พยากรณ์รายชั่วโมง */
async function rainInd(ind: Ind, onwr: OnwrData, ctx: Ctx, load: Loader): Promise<IndForecast | null> {
  const obs = await rainAround(ind, onwr, ctx, load, 10);
  const man = (ind.manualKey && ctx.manual?.[ind.manualKey]) || null;
  if (!obs && !man && !ctx.fc.length) return null;
  const lv = { "12": 0, "24": 0, "48": 0, "72": 0 } as IndForecast["lv"];
  const proj = { "12": null, "24": null, "48": null, "72": null } as IndForecast["proj"];
  ctx.fc.slice(0, 3).forEach((f, i) => {
    for (const k of (i === 0 ? ["12", "24"] : [String(HORIZONS[i + 1])]) as HK[]) {
      proj[k] = f.maxHour;
      lv[k] = levelOf(f.maxHour, ind);
    }
  });
  const now = man ? man.value : obs ? obs.max1 : null;
  const lvNow = now === null ? 0 : levelOf(now, ind);
  const max = Math.max(0, ...ctx.fc.slice(0, 3).map((f) => f.maxHour));
  const comps: Comp[] = [];
  if (man)
    comps.push({
      kind: "info",
      text: `ใช้ค่าที่เจ้าหน้าที่กรอก ${man.value.toFixed(1)} มม./ชม. (${man.time} น.${man.by ? ` โดย ${man.by}` : ""}) เป็นหลัก${obs ? ` · สถานีฝนรอบที่ตั้งวัดได้สูงสุด ${obs.max1.toFixed(1)} มม./ชม.` : ""}`,
    });
  if (obs)
    comps.push({
      kind: "rain",
      text: `ฝนตกจริงรอบที่ตั้ง ${obs.stations.join(", ")}: รายชั่วโมงสูงสุด 24 ชม. ${obs.max1.toFixed(1)} มม. · 3 ชม. ล่าสุด ${obs.sum3.toFixed(1)} มม. · สะสม 24 ชม. ${obs.max24.toFixed(1)} มม.`,
    });
  comps.push({ kind: "rain", text: `พยากรณ์ฝนรายชั่วโมง ณ พิกัดที่ตั้ง (Open-Meteo) สูงสุด ${ctx.fc.slice(0, 3).map((f) => f.maxHour.toFixed(1)).join(" / ")} มม./ชม. ใน 3 วัน — แบบจำลองบอกแนวโน้ม ไม่ใช่ค่าวัดจริง` });
  return {
    label: man ? ind.manualLabel ?? ind.label : ind.label, unit: ind.unit, th: ind.th, now, nowTime: man ? man.time : null, base: now, tidal: false, slope: null, proj,
    lvNow, lv, lv72: Math.max(lvNow, lv["24"], lv["48"], lv["72"]), hours: 0, conf: man || obs ? "ปานกลาง" : "ต่ำ", next: null,
    est: null, rain: obs, assess: now, lvAssess: lvNow,
    assessWhy: `${STATUS_NAME[lvNow]}: ${man ? `ตามค่าที่เจ้าหน้าที่กรอก ${man.value.toFixed(1)} มม./ชม.` : obs ? `ฝนรายชั่วโมงสูงสุดที่วัดได้ ${obs.max1.toFixed(1)} มม.` : "ไม่มีสถานีฝนรอบที่ตั้ง"}`,
    gap: `ฝนรายชั่วโมงสูงสุด วัดได้ ${now === null ? "–" : now.toFixed(1)} / คาด ${max.toFixed(1)} มม./ชม. — ต้องถึง ${ind.th[0]} มม./ชม. จึงเข้าเกณฑ์สีเหลือง`,
    need: null,
    comps,
  };
}

async function analyseInd(ind: Ind, onwr: OnwrData, load: Loader, ctx: Ctx): Promise<IndForecast | null> {
  if (ind.forecastRain) return rainInd(ind, onwr, ctx, load);
  const S = await series(ind.src, ind.field, onwr, load);
  if (!S) return null;
  const last = S.at(-1)!;
  if (Date.now() - last.t > 24 * H) return null;
  const stale = Date.now() - last.t > 6 * H;
  const tNow = last.t;
  const comps: Comp[] = [];
  const d24 = win(S, tNow - 24 * H, tNow);
  const vals = d24.map((p) => p.v);
  const range24 = vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
  const tidal = Boolean(ind.tide || ind.daily) || isTidal(d24, ind.unit);
  /* ระดับน้ำขึ้นลง: เกณฑ์ดูระดับสูงสุด · ปริมาณน้ำขึ้นลง: ใช้ค่าเฉลี่ย 24 ชม. (ปริมาณน้ำสุทธิ) */
  const flow = ind.field === "q";
  const agg = (w: Pt[]) => (flow ? mean(w)! : Math.max(...w.map((p) => p.v)));
  const proxyBase = tidal && vals.length ? agg(d24) : last.v;
  const man = (ind.manualKey && ctx.manual?.[ind.manualKey]) || null;
  const base = man ? man.value : proxyBase;
  const label = man ? ind.manualLabel ?? `${ind.label} (เจ้าหน้าที่กรอก)` : ind.label;
  if (man)
    comps.push({
      kind: "info",
      text: `ใช้ค่าวัดจริงที่เจ้าหน้าที่กรอก ${fmtV(man.value, ind.unit)} (${man.time} น.${man.by ? ` โดย ${man.by}` : ""}) เป็นหลัก · ${ind.proxy ?? "ค่าจากสถานี"} ${fmtV(proxyBase, ind.unit)} (ต่าง ${fmtD(proxyBase - man.value, ind.unit)}) ใช้เฉพาะแนวโน้ม`,
    });
  else if (ind.tide)
    comps.push({ kind: "info", text: "เกณฑ์ ธปท. ใช้ระดับน้ำขึ้นสูงสุด จึงประเมินจากระดับสูงสุดรอบ 24 ชม. · ใช้สถานี C.12 สามเสน (กรมชลประทาน) ซึ่งอยู่เหนือ บก.ทร. ขึ้นไปราว 5 กม. แทน ระดับจริงหน้า บก.ทร. มักต่ำกว่า — เจ้าหน้าที่กรอกค่าวัดจริงได้ที่การ์ดเกณฑ์ ธปท." });
  const hours = Math.round((tNow - S[0].t) / H);

  /* 2. แนวโน้มของจุดวัดเอง */
  let slope: number | null;
  if (tidal) {
    const peaks: Pt[] = [];
    for (let k = 0; k < 4; k++) {
      const w = win(S, tNow - (k + 1) * 24 * H, tNow - k * 24 * H);
      if (w.length >= 6) peaks.push({ t: tNow - (k + 0.5) * 24 * H, v: agg(w) });
    }
    slope = peaks.length >= 2 ? slopeOf(peaks.reverse()) ?? (peaks.at(-1)!.v - peaks[0].v) / ((peaks.at(-1)!.t - peaks[0].t) / H) : null;
    if (slope !== null)
      comps.push({
        kind: "trend",
        text: `ขึ้นลงตามน้ำทะเล (แกว่ง ${fmtD(range24, ind.unit).slice(1)} ใน 24 ชม.) — ใช้${flow ? "ค่าเฉลี่ยรายวัน" : "ระดับสูงสุดรายวัน"} ${peaks.map((p) => fmtV(p.v, ind.unit).replace(" ม.รทก.", "")).join(" → ")}: เปลี่ยน ${fmtD(slope * 24, ind.unit)} ต่อวัน`,
        delta: slope * 24,
      });
  } else {
    const s24 = slopeOf(d24), s6 = slopeOf(win(S, tNow - 6 * H, tNow));
    slope = s24;
    if (s24 !== null && s6 !== null && Math.sign(s6) !== Math.sign(s24) && Math.abs(s6) > Math.abs(s24) * 0.5) {
      slope = (s24 + s6) / 2;
      comps.push({ kind: "trend", text: `24 ชม. ${fmtD(s24 * 24, ind.unit)}/วัน แต่ 6 ชม. ล่าสุดกลับทิศ (${fmtD(s6, ind.unit)}/ชม.) — ใช้ค่าเฉลี่ย`, delta: slope * 24 });
    } else if (slope !== null) {
      comps.push({ kind: "trend", text: `แนวโน้ม 24 ชม. ${fmtD(slope, ind.unit)}/ชม. (${fmtD(slope * 24, ind.unit)}/วัน)${Math.abs(slope * 24) < (ind.unit === "%" ? 1 : ind.unit === "ลบ.ม./วิ." ? 30 : 0.03) ? " — ทรงตัว" : ""}`, delta: slope * 24 });
    }
  }
  const own = (h: number) => (slope === null ? 0 : slope * TAU * (1 - Math.exp(-h / TAU)));

  /* 3. น้ำเหนือ */
  const selfUp = ind.up.find((u) => (u.name ?? u.label) === ind.src.name);
  const h0 = selfUp?.h ?? 0;
  const ups = ind.up.filter((u) => u.h > h0 && (u.name ?? u.label) !== ind.src.name);
  const upC: { h: number; d: number }[] = [];
  let upOk = 0;
  const range = dailyRange(S);
  for (const u of ups) {
    const U = await series(u, ind.field, onwr, load);
    const lag = u.h - h0;
    if (!U || Date.now() - U.at(-1)!.t > 24 * H) {
      comps.push({ kind: "up", text: `${u.label}: ไม่มีข้อมูลย้อนหลัง` });
      continue;
    }
    upOk++;
    const uEnd = U.at(-1)!.t;
    /* จุดเหนือน้ำที่ขึ้นลงตามน้ำทะเลเทียบค่าเฉลี่ย 24 ชม. กับ 24 ชม. ก่อนหน้า เพื่อตัดรอบน้ำขึ้นน้ำลงออก */
    const uTidal = isTidal(win(U, uEnd - 24 * H, uEnd), ind.unit);
    const w = uTidal ? 24 : clamp(lag, 6, 24);
    const span = uTidal ? 24 : 3;
    const a = mean(win(U, uEnd - span * H, uEnd)), b = mean(win(U, uEnd - (w + span) * H, uEnd - w * H));
    if (a === null || b === null) continue;
    const dU = a - b;
    let k = 1;
    if (!(ind.field === "q")) {
      const ru = dailyRange(U);
      k = range !== null && ru !== null && ru > (ind.unit === "%" ? 2 : 0.05) && range > (ind.unit === "%" ? 1 : 0.02) ? clamp(range / ru, 0.2, 1) : 0.5;
    }
    const eff = dU * k;
    const tiny = Math.abs(dU) < (ind.unit === "%" ? 1 : ind.unit === "ลบ.ม./วิ." ? 30 : 0.03);
    comps.push({
      kind: "up",
      text: `${u.label}: ${tiny ? "ทรงตัว" : fmtD(dU, ind.unit)} ${uTidal ? "(ค่าเฉลี่ย 24 ชม. เทียบวันก่อน — จุดนี้ขึ้นลงตามน้ำทะเล)" : `ใน ${Math.round(w)} ชม.`} (ตอนนี้ ${fmtV(a, ind.unit)})${lag > 72 ? ` — ถึงจุดวัดราว ${Math.round(lag)} ชม. เกินช่วงคาดการณ์` : tiny ? "" : ` → ถึงจุดวัดราว ${Math.round(lag)} ชม. ส่งผล ${fmtD(eff, ind.unit)}${k !== 1 ? ` (สัดส่วนตอบสนอง ${k.toFixed(2)} จากข้อมูล 7 วัน)` : ""}`}`,
      delta: eff,
    });
    if (lag <= 72 && !tiny) upC.push({ h: lag, d: eff });
  }
  /* แนวโน้มของจุดวัดเองใช้จนกว่าการเปลี่ยนแปลงของน้ำเหนือจะมาถึง หลังจากนั้นระดับตามน้ำเหนือ
     (หลายจุดมาถึงแล้วใช้ผลที่สูงสุดเพื่อความระมัดระวัง) */
  const firstArrival = upC.length ? Math.min(...upC.map((c) => c.h)) : null;
  const deltaAt = (h: number) => {
    if (firstArrival === null || h < firstArrival) return own(h);
    return own(firstArrival) + Math.max(...upC.filter((c) => c.h <= h).map((c) => c.d));
  };
  if (firstArrival !== null)
    comps.push({ kind: "info", text: `ใช้แนวโน้มของจุดวัดเองถึงชั่วโมงที่ ${Math.round(firstArrival)} จากนั้นระดับเปลี่ยนตามน้ำเหนือที่เดินทางมาถึง` });

  /* 4. ฝนตกจริงรอบจุดทริกเกอร์ — ส่วนที่ระดับน้ำยังไม่ตอบสนอง (หักส่วนที่ขึ้นแล้วใน 6 ชม.) */
  const [small, big] = RAIN_ALLOW[ind.rain];
  const rain = await rainAround(ind, onwr, ctx, load);
  let rainObsAllow = 0;
  if (rain) {
    const cls = rain.max24 > 90 ? big : rain.max24 > 35 ? small : 0;
    const six = win(S, tNow - 7 * H, tNow - 5 * H);
    const rise6 = !tidal && six.length ? Math.max(0, last.v - six[0].v) : 0;
    rainObsAllow = Math.max(0, cls - rise6);
    comps.push({
      kind: "rain",
      text: `ฝนตกจริงรอบจุดวัด ${rain.stations.join(", ")}: สะสม 24 ชม. ${rain.max24.toFixed(1)} มม. · 3 ชม. ล่าสุด ${rain.sum3.toFixed(1)} มม. · รายชั่วโมงสูงสุด ${rain.max1.toFixed(1)} มม.` +
        (cls > 0
          ? rainObsAllow > 0
            ? ` — ฝน${rain.max24 > 90 ? "หนักมาก" : "หนัก"} ระดับน้ำยังไม่ตอบสนอง เผื่อเพิ่ม ${fmtD(rainObsAllow, ind.unit)} ภายใน 6–12 ชม.`
            : ` — ระดับน้ำตอบสนองแล้ว (ขึ้น ${fmtD(rise6, ind.unit)} ใน 6 ชม.)`
          : " — ไม่ถึงชั้นฝนหนัก"),
      delta: rainObsAllow,
    });
  } else if (ind.rain !== "none") comps.push({ kind: "rain", text: "ไม่มีสถานีฝนในรัศมี 15 กม. รอบจุดวัด" });

  /* 5. ฝนพยากรณ์ */
  const rainAt = (h: number) => {
    let a = h >= 6 ? rainObsAllow : 0;
    ctx.fc.slice(0, 3).forEach((f, i) => {
      if (h < 24 * i + 12) return;
      const t = ctx.tmd.find((x) => x.date === f.date);
      const heavyTmd = t && /หนัก/.test(t.desc) && (t.rainPct ?? 0) >= 60;
      a = Math.max(a, f.mm > 90 ? big : f.mm > 35 || heavyTmd ? small : 0);
    });
    return a;
  };
  if (small > 0) {
    const days = ctx.fc.slice(0, 3).filter((f, i) => f.mm > 35 || (ctx.tmd[i] && /หนัก/.test(ctx.tmd[i].desc) && (ctx.tmd[i].rainPct ?? 0) >= 60));
    comps.push({
      kind: "rain",
      text: days.length
        ? `ฝนหนักที่คาด ${days.map((f) => `${Number(f.date.slice(8))}: ${f.mm.toFixed(0)} มม.`).join(", ")} — เผื่อระดับเพิ่ม ${fmtD(rainAt(72), ind.unit)}`
        : `ฝนคาด 3 วัน ${ctx.fc.slice(0, 3).map((f) => f.mm.toFixed(0)).join(" / ")} มม. ไม่ถึงชั้นฝนหนัก (>35 มม./วัน) — ไม่เผื่อเพิ่ม`,
      delta: rainAt(72),
    });
  }

  /* 6. น้ำทะเลหนุน */
  if (ind.tide && ctx.tide)
    comps.push({
      kind: "tide",
      text: `กรมอุทกศาสตร์: น้ำขึ้นสูงสุดทำนาย ${ctx.tide.navyHigh.toFixed(2)} ม.รทก. (${ctx.tide.navyHighTime} น.)${ctx.tide.surplus !== null && ctx.tide.surplus > 0 ? ` + น้ำเหนือเสริม ${ctx.tide.surplus.toFixed(2)} ม.` : ""} → ${ctx.tide.estimate.toFixed(2)} ม.รทก. (ข้อมูลทำนายวันนี้)`,
      delta: ctx.tide.estimate - base,
    });

  const proj = {} as IndForecast["proj"];
  const lv = {} as IndForecast["lv"];
  for (const h of HORIZONS) {
    let v = base + deltaAt(h) + rainAt(h);
    if (ind.tide && ctx.tide) v = Math.max(v, ctx.tide.estimate);
    if (ind.unit === "ลบ.ม./วิ." || ind.unit === "%") v = Math.max(0, v);
    proj[String(h) as HK] = v;
    lv[String(h) as HK] = levelOf(v, ind);
  }

  /* 7. ประเมินจากลำน้ำ/คลองใกล้เคียง */
  const est = man ? null : await neighbourEstimate(ind, S, tidal, onwr, load).catch(() => null);
  const measuredV = man || ind.tide || (tidal && flow) ? base : last.v;
  if (est) {
    const diff = est.value - measuredV;
    comps.push({
      kind: "near",
      text:
        `ประเมินจาก ${est.label}${est.lag ? ` (ล่วงหน้า ${est.lag} ชม.)` : ""}: ${fmtV(est.value, ind.unit)}${est.ahead > 0 ? ` ในอีก ${est.ahead} ชม.` : ""} · ` +
        (est.method === "balance"
          ? `สมดุลมวลน้ำ จุดทริกเกอร์ ≈ ${est.ratio!.toFixed(2)} เท่าของผลรวม (คลาดเคลื่อน ±${(est.cv! * 100).toFixed(0)}% จาก ${est.n} ชม.)`
          : `ความแม่นจากข้อมูล 7 วัน R² ${est.r2.toFixed(2)} (${est.n} ชม.)`) +
        ` · ${est.ahead > 0 ? "เทียบค่าปัจจุบัน" : "ต่างจากค่าวัดจริง"} ${fmtD(diff, ind.unit)}`,
      delta: est.ahead > 0 ? diff : undefined,
    });
  } else if (!man) comps.push({ kind: "near", text: "ไม่มีลำน้ำ/คลองใกล้เคียงที่ข้อมูลสัมพันธ์กับจุดนี้พอจะใช้ประเมิน (R² < 0.6)" });

  /* ค่าประเมินจุดทริกเกอร์ = ค่าวัดจริง (ค้างเกิน 6 ชม. ใช้ค่าประเมิน) เทียบกับค่าประเมินภายใน 12 ชม. */
  const primary = stale && est && est.ahead <= 1 ? est.value : measuredV;
  let nowcast = proj["12"] as number;
  let nowSrc = "แนวโน้ม/น้ำเหนือ/ฝน";
  if (est && est.ahead > 0 && est.ahead <= ASSESS_H && est.value > nowcast) {
    nowcast = est.value;
    nowSrc = est.label;
  }
  const assess = Math.max(primary, nowcast);
  const lvAssess = levelOf(assess, ind);
  const lvPrimary = levelOf(primary, ind);
  const assessWhy =
    lvAssess > lvPrimary
      ? `${STATUS_NAME[lvAssess]}: ค่าประเมินภายใน ${ASSESS_H} ชม. ${fmtV(nowcast, ind.unit)} จาก${nowSrc} ถึงเกณฑ์ ${fmtV(ind.th[lvAssess - 1], ind.unit)} (ค่าวัดจริง ${fmtV(primary, ind.unit)})`
      : `${STATUS_NAME[lvAssess]}: ตามค่า${man ? "วัดจริงที่เจ้าหน้าที่กรอก" : stale && est && est.ahead <= 1 ? "ประเมินจากลำน้ำใกล้เคียง (ค่าวัดจริงค้าง)" : "วัดจริง"} ${fmtV(primary, ind.unit)} · ค่าประเมินภายใน ${ASSESS_H} ชม. ${fmtV(nowcast, ind.unit)}`;
  const lvNow = levelOf(measuredV, ind);
  const lv72 = Math.max(lvNow, lv["24"], lv["48"], lv["72"]);
  const lvB = levelOf(base, ind);
  const next = lvB < 3 ? (ind.th as number[])[lvB] : null;
  let gap: string | null = null, need: string | null = null;
  if (next !== null) {
    const g = next - base;
    gap = `อีก ${fmtD(g, ind.unit).slice(1)} ถึง${STATUS_NAME[lvB + 1]} (เกณฑ์ ${fmtV(next, ind.unit)})`;
    need = `ต้องเพิ่มเฉลี่ย ${fmtD(g / 72, ind.unit)}/ชม. ต่อเนื่อง 72 ชม.${slope !== null ? ` — ตอนนี้ ${fmtD(slope, ind.unit)}/ชม.` : ""}`;
  } else gap = `เกินเกณฑ์สีแดง ${fmtD(base - ind.th[2], ind.unit)}`;

  let conf: IndForecast["conf"] =
    hours >= 48 && slope !== null && (ups.length === 0 || upOk >= Math.ceil(ups.length / 2)) ? "สูง" : hours >= 12 && slope !== null ? "ปานกลาง" : "ต่ำ";
  if (ind.tide && conf === "สูง") conf = "ปานกลาง";
  if (stale && !man) conf = "ต่ำ";
  return {
    label, unit: ind.unit, th: ind.th, now: man ? man.value : last.v, nowTime: man ? man.time : fmtTime(tNow), base, tidal, slope, proj, lvNow, lv,
    lv72: Math.max(lv72, lvAssess), next, gap, need, hours, conf, comps, est, rain, assess, lvAssess, assessWhy,
  };
}

function damNotes(id: string, onwr: OnwrData): Comp[] {
  return (DAMS[id] ?? []).flatMap((n) => {
    const d = onwr.dams.find((x) => x.name === n || x.name === "เขื่อน" + n);
    if (!d || d.storage === null) return [];
    const inflow = d.inflow ?? 0, release = d.release ?? 0;
    if (d.storage >= 100 && inflow > release)
      return [{ kind: "dam" as const, text: `เขื่อน${n} ${d.storage.toFixed(1)}% น้ำไหลเข้า ${inflow.toFixed(1)} > ระบาย ${release.toFixed(1)} ล้าน ลบ.ม./วัน — มีแนวโน้มต้องเพิ่มการระบาย ให้ติดตามสถานีท้ายเขื่อน` }];
    if (d.storage >= 100)
      return [{ kind: "dam" as const, text: `เขื่อน${n} ${d.storage.toFixed(1)}% ระบาย ${release.toFixed(1)} ≥ ไหลเข้า ${inflow.toFixed(1)} ล้าน ลบ.ม./วัน — อ่างเต็มแต่ควบคุมการระบายได้ ผลต่อท้ายน้ำดูจากสถานีท้ายเขื่อน` }];
    if (d.storage >= 90) return [{ kind: "dam" as const, text: `เขื่อน${n} ${d.storage.toFixed(1)}% (ไหลเข้า ${inflow.toFixed(1)} · ระบาย ${release.toFixed(1)} ล้าน ลบ.ม./วัน)` }];
    return [];
  });
}

const METHOD =
  "ค่าคาด = ค่าฐาน + แนวโน้มของจุดวัดเอง (จนกว่าน้ำเหนือที่เปลี่ยนแปลงจะมาถึง) + การเปลี่ยนแปลงของน้ำเหนือที่มาถึง + เผื่อฝนหนักที่พยากรณ์ · " +
  "ค่าฐาน = ค่าล่าสุด (จุดขึ้นลงตามน้ำทะเลใช้ระดับสูงสุด 24 ชม.) · แนวโน้มจากข้อมูลรายชั่วโมงย้อนหลัง 7 วัน ต่อเวลาแบบชะลอตัว (τ 24 ชม.) · " +
  "น้ำเหนือนับเฉพาะส่วนที่เปลี่ยนแปลงและยังมาไม่ถึง (น้ำสูงแต่ทรงตัวสะท้อนอยู่ในระดับที่ตั้งแล้ว) คูณสัดส่วนการตอบสนองจากข้อมูลจริง 7 วัน · " +
  "หลายจุดเหนือน้ำมาถึงพร้อมกันใช้ผลที่สูงสุดเพื่อความระมัดระวัง · " +
  "ประเมินจากลำน้ำ/คลองใกล้เคียง: ถดถอยเชิงเส้นแบบหน่วงเวลา 0–24 ชม. จากข้อมูลรายชั่วโมง 7 วัน เลือกสถานีที่ R² สูงสุด (ต้อง ≥ 0.6) · " +
  "ฝนตกจริง: สถานีฝนในรัศมี 15 กม. รอบจุดทริกเกอร์ ถ้าสะสม 24 ชม. เกิน 35/90 มม. และระดับน้ำยังไม่ตอบสนอง เผื่อเพิ่มภายใน 6–12 ชม. · " +
  "สีพื้นที่ตามเกณฑ์ ธปท. ใช้ค่าวัดจริงที่จุดทริกเกอร์เท่านั้น — ค่าประเมินภายใน 12 ชม. (ลำน้ำใกล้เคียง + ฝน + แนวโน้ม) เป็นคำเตือนล่วงหน้า";

/** วิเคราะห์ 72 ชม. ของหนึ่งพื้นที่ — gauges ใช้กับพื้นที่ที่ไม่มีเกณฑ์ ธปท. */
export async function forecastSite(id: string, gauges: string[], onwr: OnwrData, ctx: Ctx, load: Loader): Promise<SiteForecast | null> {
  const inds = indFor(id, gauges);
  const res = (await Promise.all(inds.map((i) => analyseInd(i, onwr, load, ctx).catch(() => null)))).filter((x): x is IndForecast => x !== null);
  if (!res.length) return null;
  const measured = res.filter((r) => r.now !== null);
  const lvNow = Math.max(...res.map((r) => r.lvNow));
  const lv = { "12": 0, "24": 0, "48": 0, "72": 0 } as SiteForecast["lv"];
  for (const h of ["12", "24", "48", "72"] as const) lv[h] = Math.max(...res.map((r) => r.lv[h]));
  const lv72 = Math.max(lv["12"], lv["24"], lv["48"], lv["72"]);
  const lvAssess = Math.max(...res.map((r) => r.lvAssess));
  const gov = res.filter((r) => r.lvAssess === lvAssess);
  const assessText = `${gov.map((r) => `${r.label} — ${r.assessWhy}`).join(" · ")}`;
  const confRank = { สูง: 2, ปานกลาง: 1, ต่ำ: 0 };
  const conf = (measured.length ? measured : res).reduce((m, r) => (confRank[r.conf] < confRank[m] ? r.conf : m), "สูง" as SiteForecast["conf"]);
  const notes = damNotes(id, onwr);

  let text: string;
  if (lv72 > lvNow) {
    const first = (["12", "24", "48", "72"] as const).find((h) => lv[h] === lv72)!;
    const drv = res.filter((r) => r.lv[first] === lv72).sort((a, b) => b.lv72 - a.lv72)[0];
    const why = drv.comps.filter((c) => (c.delta ?? 0) > 0).sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))[0];
    const peakNote =
      drv.tidal && drv.base !== null && drv.now !== null && drv.base - drv.now > 0.05 * Math.abs(drv.base)
        ? ` · ระดับสูงสุดรอบ 24 ชม. ${fmtV(drv.base, drv.unit)} ถึงเกณฑ์แล้ว (ค่าล่าสุด ${fmtV(drv.now, drv.unit)} เป็นช่วงน้ำลง) คาดแตะเกณฑ์ทุกรอบน้ำขึ้น`
        : "";
    text = `คาดเพิ่มเป็น${STATUS_NAME[lv72]}ภายใน ${first} ชม. — ${drv.label} คาด ${fmtV(drv.proj[first]!, drv.unit)} (เกณฑ์${STATUS_NAME[lv72]} ${fmtV(drv.th[lv72 - 1], drv.unit)})${peakNote || (why ? ` · ปัจจัยหลัก: ${why.text}` : "")}`;
  } else {
    /* จุดที่ใกล้เกณฑ์ถัดไปที่สุด เมื่อเทียบค่าคาด 72 ชม. กับระยะห่างถึงเกณฑ์ */
    const cands = measured
      .filter((r) => r.base !== null && r.next !== null)
      .map((r) => ({ r, ratio: (r.proj["72"]! - r.base!) / Math.max(1e-9, r.next! - r.base!), raises: r.th.indexOf(r.next!) + 1 > lvNow }));
    const close = (cands.some((c) => c.raises) ? cands.filter((c) => c.raises) : cands).sort((a, b) => b.ratio - a.ratio)[0];
    text =
      (lv["72"] < lvNow ? `มีแนวโน้มลดลงเป็น${STATUS_NAME[lv["72"]]}ภายใน 72 ชม. — ` : `คาดคงที่${STATUS_NAME[lvNow]}ใน 72 ชม. — `) +
      (close
        ? `${close.r.label} ${fmtV(close.r.base!, close.r.unit)} คาด ${fmtV(close.r.proj["72"]!, close.r.unit)} ที่ 72 ชม. · ${close.r.gap}`
        : "ทุกจุดวัดห่างจากเกณฑ์ถัดไป");
  }
  return { lvNow, lvAssess, assessText, lv72: Math.max(lvNow, lvAssess, lv72), lv, conf, text, inds: res, notes, method: METHOD };
}

export function forecastLoader() {
  return makeLoader();
}
