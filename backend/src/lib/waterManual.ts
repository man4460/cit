import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { dataFile } from "./waterReport.js";

/**
 * ค่าวัดจริงหน้างานที่เจ้าหน้าที่กรอก — ใช้เป็นหลักแทนค่าจากสถานีแทน
 * validH = ใช้เป็นหลักได้นานกี่ชั่วโมงนับจากเวลาที่วัด
 */
/** เกณฑ์ฝนรายชั่วโมง — ชุดเดียวกับ สนญ. (50 / 80 / 120 มม./ชม.) */
const RAIN_BANDS = [50, 80, 120] as [number, number, number];
const rainManual = (site: string, label: string) =>
  ({ site, label, unit: "มม./ชม.", min: 0, max: 300, validH: 3, bands: RAIN_BANDS }) as const;

export const MANUAL_KEYS = {
  samkhok_q: { site: "hq", label: "ปริมาณน้ำไหลผ่านสถานีสามโคก", unit: "ลบ.ม./วิ.", min: 0, max: 10000, validH: 24, bands: [2500, 3000, 3500] as [number, number, number] },
  /* ฝนรายชั่วโมง — ทริกเกอร์เฉพาะ สนญ. (กรณีน้ำขังในพื้นที่) */
  phranakhon_rain: rainManual("hq", "ปริมาณน้ำฝนที่ตกในเขตพระนคร"),
  navy_msl: { site: "hq", label: "ระดับน้ำขึ้นสูงสุด ณ บก.ทร.", unit: "ม.รทก.", min: -1, max: 5, validH: 24, bands: [2.0, 2.2, 2.5] as [number, number, number] },
  nakhonchaisi_msl: { site: "ipd", label: "ระดับน้ำท่าจีน จุดวัดที่ว่าการอ.นครชัยศรี (T.1)", unit: "ม.รทก.", min: 0, max: 6, validH: 24, bands: [1.8, 2.0, 2.5] as [number, number, number] },
  ipd_rain: rainManual("ipd", "ปริมาณน้ำฝนที่ตกในอ.นครชัยศรี"),
  urt_rain: rainManual("urt", "ปริมาณน้ำฝนที่ตกในอ.เมืองสุราษฎร์ธานี"),
  /* local % ความจุลำน้ำ — ศูนย์/สำนักงานภาค */
  cnx_pct: { site: "cnx", label: "% ปริมาณน้ำท่าใกล้ที่ตั้ง (Q/Qmax)", unit: "%", min: 0, max: 200, validH: 6, bands: [30, 70, 100] as [number, number, number], gt: true },
  kkn_pct: { site: "kkn", label: "% ปริมาณน้ำท่าใกล้ที่ตั้ง (Q/Qmax)", unit: "%", min: 0, max: 200, validH: 6, bands: [30, 70, 100] as [number, number, number], gt: true },
  hdy_pct: { site: "hdy", label: "% ปริมาณน้ำท่าใกล้ที่ตั้ง (Q/Qmax)", unit: "%", min: 0, max: 200, validH: 6, bands: [30, 70, 100] as [number, number, number], gt: true },
  ryg_pct: { site: "ryg", label: "% ปริมาณน้ำท่าใกล้ที่ตั้ง (Q/Qmax)", unit: "%", min: 0, max: 200, validH: 6, bands: [30, 70, 100] as [number, number, number], gt: true },
  phs_pct: { site: "phs", label: "% ปริมาณน้ำท่าใกล้ที่ตั้ง (Q/Qmax)", unit: "%", min: 0, max: 200, validH: 6, bands: [30, 70, 100] as [number, number, number], gt: true },
  ubn_pct: { site: "ubn", label: "% ปริมาณน้ำท่าใกล้ที่ตั้ง (Q/Qmax)", unit: "%", min: 0, max: 200, validH: 6, bands: [30, 70, 100] as [number, number, number], gt: true },
  nrm_pct: { site: "nrm", label: "% ปริมาณน้ำท่าใกล้ที่ตั้ง (Q/Qmax)", unit: "%", min: 0, max: 200, validH: 6, bands: [30, 70, 100] as [number, number, number], gt: true },
  urt_pct: { site: "urt", label: "% ปริมาณน้ำท่าใกล้ที่ตั้ง (Q/Qmax)", unit: "%", min: 0, max: 200, validH: 6, bands: [30, 70, 100] as [number, number, number], gt: true },
} as const;

export type ManualKey = keyof typeof MANUAL_KEYS;
export type ManualEntry = {
  id: string;
  key: ManualKey;
  value: number;
  time: string;
  note: string;
  by: string;
  at: string;
  photoUrl?: string | null;
};

const KEEP = 400;

const file = () => path.join(path.dirname(dataFile()), "water-manual.json");
const bkkNow = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
const parseT = (s: string) => Date.parse(s.replace(" ", "T") + ":00+07:00");

async function readAll(): Promise<ManualEntry[]> {
  try {
    const j = JSON.parse(await fs.readFile(file(), "utf8"));
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}
async function writeAll(list: ManualEntry[]) {
  const f = file();
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f + ".tmp", JSON.stringify(list.slice(0, KEEP), null, 1));
  await fs.rename(f + ".tmp", f);
}

/** ค่าล่าสุด (ตามเวลาวัด) ที่ยังอยู่ในช่วงใช้งานของแต่ละรายการ */
export async function activeManual(): Promise<Partial<Record<ManualKey, ManualEntry>>> {
  const out: Partial<Record<ManualKey, ManualEntry>> = {};
  const now = Date.now();
  for (const e of await readAll()) {
    const spec = MANUAL_KEYS[e.key];
    const t = parseT(e.time);
    if (!spec || !Number.isFinite(t) || now - t > spec.validH * 3600_000 || t - now > 3600_000) continue;
    const cur = out[e.key];
    if (!cur || e.time > cur.time || (e.time === cur.time && e.at > cur.at)) out[e.key] = e;
  }
  return out;
}

export async function manualState() {
  const all = await readAll();
  return { active: await activeManual(), recent: all.slice(0, 40), keys: MANUAL_KEYS };
}

export function validateManual(body: unknown): Omit<ManualEntry, "id" | "by" | "at"> | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const key = String(b.key ?? "") as ManualKey;
  const spec = MANUAL_KEYS[key];
  if (!spec) return "ไม่รู้จักรายการที่กรอก";
  const value = typeof b.value === "number" ? b.value : parseFloat(String(b.value ?? ""));
  if (!Number.isFinite(value) || value < spec.min || value > spec.max) return `ค่าต้องอยู่ระหว่าง ${spec.min} ถึง ${spec.max} ${spec.unit}`;
  const time = String(b.time ?? "").trim().replace("T", " ").slice(0, 16) || bkkNow();
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(time) || !Number.isFinite(parseT(time))) return "รูปแบบเวลาไม่ถูกต้อง";
  if (parseT(time) - Date.now() > 3600_000) return "เวลาวัดต้องไม่เกินเวลาปัจจุบัน";
  const note = String(b.note ?? "").trim().slice(0, 200);
  const photoUrl = b.photoUrl != null && String(b.photoUrl).trim() ? String(b.photoUrl).trim().slice(0, 500) : null;
  return { key, value: Math.round(value * 1000) / 1000, time, note, photoUrl };
}

export async function addManual(entry: Omit<ManualEntry, "id" | "at"> & { photoUrl?: string | null }): Promise<ManualEntry> {
  const e: ManualEntry = { ...entry, photoUrl: entry.photoUrl ?? null, id: randomUUID(), at: bkkNow() };
  await writeAll([e, ...(await readAll())]);
  return e;
}

/** ค่าที่เจ้าหน้าที่กรอกของพื้นที่หนึ่ง (ใช้แนบใน sites[id].bot) */
export function manualBotForSite(
  active: Partial<Record<ManualKey, ManualEntry>>,
  siteId: string,
): Record<string, { value: number; time: string; manual: true; by: string; note: string; at: string; photoUrl?: string | null }> | undefined {
  const out: Record<string, { value: number; time: string; manual: true; by: string; note: string; at: string; photoUrl?: string | null }> = {};
  for (const [k, m] of Object.entries(active) as [ManualKey, ManualEntry | undefined][]) {
    if (!m || MANUAL_KEYS[k]?.site !== siteId) continue;
    out[k] = { value: m.value, time: m.time, manual: true, by: m.by, note: m.note, at: m.at, photoUrl: m.photoUrl ?? null };
  }
  return Object.keys(out).length ? out : undefined;
}

export async function removeManual(id: string): Promise<boolean> {
  const all = await readAll();
  const rest = all.filter((e) => e.id !== id);
  if (rest.length === all.length) return false;
  await writeAll(rest);
  return true;
}

/** สถานะสีจากค่าตาม bands ของ key (0–3) */
export function manualBandStatus(key: ManualKey, value: number): number {
  const spec = MANUAL_KEYS[key];
  if (!spec) return -1;
  const [a, b, c] = spec.bands;
  const gt = "gt" in spec && spec.gt;
  const ge = (x: number, y: number) => (gt ? x > y : x >= y);
  return ge(value, c) ? 3 : ge(value, b) ? 2 : ge(value, a) ? 1 : 0;
}
