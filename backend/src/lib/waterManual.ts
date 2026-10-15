import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { dataFile } from "./waterReport.js";

/**
 * ค่าวัดจริงหน้างานที่เจ้าหน้าที่กรอก (จุดวัดตามเกณฑ์ ธปท. สนญ.) — ใช้เป็นหลักแทนค่าจากสถานีแทน
 * validH = ใช้เป็นหลักได้นานกี่ชั่วโมงนับจากเวลาที่วัด (ตามรอบของเกณฑ์: ระดับน้ำ/ปริมาณน้ำรายวัน 24 ชม. · ฝนรายชั่วโมง 3 ชม.)
 */
export const MANUAL_KEYS = {
  samkhok_q: { site: "hq", label: "ปริมาณน้ำไหลผ่านสถานีสามโคก", unit: "ลบ.ม./วิ.", min: 0, max: 10000, validH: 24 },
  phranakhon_rain: { site: "hq", label: "ปริมาณน้ำฝนที่ตกในเขตพระนคร", unit: "มม./ชม.", min: 0, max: 300, validH: 3 },
  navy_msl: { site: "hq", label: "ระดับน้ำขึ้นสูงสุด ณ บก.ทร.", unit: "ม.รทก.", min: -1, max: 5, validH: 24 },
} as const;
export type ManualKey = keyof typeof MANUAL_KEYS;
export type ManualEntry = { id: string; key: ManualKey; value: number; time: string; note: string; by: string; at: string };

const KEEP = 300;

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
  return { active: await activeManual(), recent: all.slice(0, 20), keys: MANUAL_KEYS };
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
  return { key, value: Math.round(value * 1000) / 1000, time, note };
}

export async function addManual(entry: Omit<ManualEntry, "id" | "at">): Promise<ManualEntry> {
  const e: ManualEntry = { ...entry, id: randomUUID(), at: bkkNow() };
  await writeAll([e, ...(await readAll())]);
  return e;
}

export async function removeManual(id: string): Promise<boolean> {
  const all = await readAll();
  const rest = all.filter((e) => e.id !== id);
  if (rest.length === all.length) return false;
  await writeAll(rest);
  return true;
}
