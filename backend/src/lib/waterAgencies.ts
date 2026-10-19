/**
 * ข้อมูลจากหน่วยงานเพิ่มเติมสำหรับการวิเคราะห์รอบรายงาน
 *  - กรมอุตุนิยมวิทยา (data.tmd.go.th — ข้อมูลเปิด ใช้ uid/ukey สาธารณะตาม GD Catalog)
 *  - กรมอุทกศาสตร์ กองทัพเรือ — ระดับน้ำทำนาย (กองบัญชาการกองทัพเรือ ฯลฯ) และสถานีวัดระดับน้ำทะเล สสน.
 *    เผยแพร่ผ่าน tiwrm.hii.or.th/v3/sealevel (ไม่มี JSON — อ่านจากตาราง)
 */
const TMD = "https://data.tmd.go.th/api";
const TMD_KEY = `uid=${process.env.TMD_UID?.trim() || "api"}&ukey=${process.env.TMD_UKEY?.trim() || "api12345"}`;
const SEALEVEL = "https://tiwrm.hii.or.th/v3/sealevel";
const UA = { "User-Agent": "CIT-water-monitor (BOT flood watch)" };

export type TmdDay = { date: string; rainPct: number | null; desc: string; tMax: number | null };
export type TmdWarning = { title: string; desc: string; at: string; url?: string };
export type TideStation = { code: string; name: string; high: number | null; highTime: string; low: number | null; lowTime: string };
export type SeaObs = { code: string; name: string; time: string; value: number | null };
export type AgencyStatus = { name: string; what: string; ok: boolean; at: string; note?: string };

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
};
const arr = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const nowIso = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16).replace("T", " ");

async function get(url: string, ms = 25_000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r;
}

/** พยากรณ์อากาศ 7 วันรายจังหวัด (เรียงวันจากวันนี้) */
export async function tmdForecast(): Promise<Record<string, TmdDay[]>> {
  const j = (await (await get(`${TMD}/WeatherForecast7Days/v2/?${TMD_KEY}&format=json`)).json()) as any;
  const out: Record<string, TmdDay[]> = {};
  for (const p of arr(j?.Provinces?.Province)) {
    const f = p?.SevenDaysForecast ?? {};
    const dates = arr<string>(f.ForecastDate);
    out[String(p.ProvinceNameThai).trim()] = dates
      .map((d, i) => {
        const [dd, mm, yy] = d.split("/");
        return {
          date: `${yy}-${mm}-${dd}`,
          rainPct: num(arr(f.PercentRainCover)[i]),
          desc: String(arr(f.DescriptionThai)[i] ?? ""),
          tMax: num(arr(f.MaximumTemperature)[i]),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  return out;
}

/** ประกาศเตือนภัยสภาพอากาศ / พายุ
 *  รูปแบบ API มักเป็น { Warnings: {}, Warning: { TitleThai, HeadlineThai, ... } }
 *  (Warning อยู่ระดับราก ไม่ได้อยู่ใน Warnings) — บางรอบอาจเป็นอาร์เรย์ */
export async function tmdWarnings(): Promise<TmdWarning[]> {
  const j = (await (await get(`${TMD}/WeatherWarningNews/v2/?${TMD_KEY}&format=json`)).json()) as any;
  const bag = j?.Warnings;
  const nested =
    bag && typeof bag === "object" && !Array.isArray(bag)
      ? (bag.Warning ?? bag.warning ?? (Object.keys(bag).length ? Object.values(bag) : undefined))
      : Array.isArray(bag)
        ? bag
        : undefined;
  const root = j?.Warning ?? j?.warning;
  const items = arr<any>(nested ?? root).filter((o) => o && typeof o === "object" && !Array.isArray(o));
  const textOf = (v: unknown) => {
    if (v == null) return "";
    if (Array.isArray(v)) return textOf(v.find((x) => typeof x === "string" && x.trim()) ?? v[0]);
    if (typeof v === "string") return v.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return "";
  };
  const pick = (o: Record<string, unknown>, re: RegExp) => {
    const keys = Object.keys(o ?? {});
    const k = keys.find((x) => re.test(x) && /thai|_th$|Th$/i.test(x)) ?? keys.find((x) => re.test(x));
    return k ? textOf(o[k]) : "";
  };
  return items
    .map((o) => {
      const title = pick(o, /^Title|title|subject/i);
      const headline = pick(o, /Headline|headline/i);
      const descRaw = pick(o, /Description|desc|detail|content/i);
      const desc = (descRaw || (headline !== title ? headline : "")).slice(0, 500);
      const at = pick(o, /AnnounceDate|IssueDate|EffectStartDate/i) || pick(o, /date|time/i);
      const url = pick(o, /WebUrlThai|WebUrl|url/i) || undefined;
      return { title: title || headline, desc, at, ...(url ? { url } : {}) };
    })
    .filter((x) => x.title || x.desc);
}

const cells = (row: string) =>
  [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => m[1].replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim());

/** ระดับน้ำทำนายวันนี้ (กรมอุทกศาสตร์) + ระดับน้ำทะเลจริง (สสน.) */
export async function seaLevel(): Promise<{ tide: TideStation[]; obs: SeaObs[] }> {
  const html = await (await get(SEALEVEL)).text();
  const split = html.indexOf('id="table_navy"');
  if (split < 0) throw new Error("sealevel: ไม่พบตารางน้ำทำนาย");
  const rows = (part: string) => [...part.matchAll(/<tr[^>]*rel="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => ({ code: m[1], c: cells(m[2]) }));
  const tide = rows(html.slice(split)).map(({ code, c }) => {
    const pair = (s: string) => {
      const m = s.match(/(-?[\d.]+)\s*\(([\d:]+)\)/);
      return m ? { v: num(m[1]), t: m[2].slice(0, 5) } : { v: null, t: "" };
    };
    const a = pair(c[1] ?? ""), b = pair(c[2] ?? "");
    const [hi, lo] = (a.v ?? -99) >= (b.v ?? -99) ? [a, b] : [b, a];
    return { code, name: c[0] ?? code, high: hi.v, highTime: hi.t, low: lo.v, lowTime: lo.t };
  });
  const obs = rows(html.slice(0, split)).flatMap(({ code, c }) => {
    const m = c.join(" ").match(/\)\s*(.+?)\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s+(-?[\d.]+)/);
    return m ? [{ code, name: m[1].trim(), time: m[2], value: num(m[3]) }] : [];
  });
  return { tide, obs };
}

export type AgencyData = {
  tmd: Record<string, TmdDay[]>;
  warnings: TmdWarning[];
  tide: TideStation[];
  seaObs: SeaObs[];
  status: AgencyStatus[];
};

/** ดึงทุกหน่วยงานพร้อมกัน — หน่วยงานไหนล่มไม่กระทบที่เหลือ และรายงานสถานะไว้ใน status */
export async function agencies(): Promise<AgencyData> {
  const at = nowIso();
  const [f7, warn, sea] = await Promise.allSettled([tmdForecast(), tmdWarnings(), seaLevel()]);
  const err = (r: PromiseSettledResult<unknown>) => (r.status === "rejected" ? String((r.reason as Error)?.message ?? r.reason) : undefined);
  const tide = sea.status === "fulfilled" ? sea.value.tide : [];
  const seaObs = sea.status === "fulfilled" ? sea.value.obs.filter((o) => Date.now() - Date.parse(o.time.replace(" ", "T") + ":00+07:00") < 48 * 3600_000) : [];
  return {
    tmd: f7.status === "fulfilled" ? f7.value : {},
    warnings: warn.status === "fulfilled" ? warn.value : [],
    tide,
    seaObs,
    status: [
      { name: "กรมอุตุนิยมวิทยา", what: "พยากรณ์อากาศ 7 วันรายจังหวัด (โอกาสฝน %)", ok: f7.status === "fulfilled", at, note: err(f7) },
      { name: "กรมอุตุนิยมวิทยา", what: "ประกาศเตือนภัยสภาพอากาศ/พายุ", ok: warn.status === "fulfilled", at, note: err(warn) },
      {
        name: "กรมอุทกศาสตร์ กองทัพเรือ",
        what: "ระดับน้ำทำนาย กองบัญชาการกองทัพเรือ ท่าเรือกรุงเทพ ป้อมพระจุลฯ",
        ok: tide.length > 0,
        at,
        note: err(sea),
      },
      { name: "สสน.", what: "ระดับน้ำทะเลจริง ป้อมพระจุลฯ ปากแม่น้ำท่าจีน", ok: seaObs.length > 0, at, note: err(sea) },
    ],
  };
}
