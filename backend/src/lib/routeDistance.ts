import { prisma } from "./prisma.js";

export type LatLng = { lat: number; lng: number; label: string };

export type LocationCodeRow = {
  code: string;
  name: string;
  province: string;
  lat: number | null;
  lng: number | null;
};

/** ค่าตั้งต้นเมื่อตารางรหัสพื้นที่ยังว่าง — แก้ไข/เพิ่มได้ที่หน้าเส้นทางภารกิจ */
const DEFAULT_LOCATION_CODES: LocationCodeRow[] = [
  { code: "สพฐ", name: "สำนักพิมพ์ธนบัตร", province: "นครปฐม", lat: 13.904, lng: 100.529 },
  { code: "สอบ", name: "สำนักงานใหญ่ ธปท.", province: "กรุงเทพมหานคร", lat: 13.7635, lng: 100.4978 },
  { code: "ศกท", name: "ศูนย์จัดการธนบัตร กรุงเทพ", province: "กรุงเทพมหานคร", lat: 13.7563, lng: 100.5018 },
  { code: "ศรย", name: "ศูนย์จัดการธนบัตร ระยอง", province: "ระยอง", lat: 12.6833, lng: 101.2372 },
  { code: "ศสร", name: "ศูนย์จัดการธนบัตร สุราษฎร์ธานี", province: "สุราษฎร์ธานี", lat: 9.1382, lng: 99.3217 },
  { code: "ศหญ", name: "ศูนย์จัดการธนบัตร หาดใหญ่", province: "สงขลา", lat: 7.0084, lng: 100.4767 },
  { code: "ศนร", name: "ศูนย์จัดการธนบัตร นครราชสีมา", province: "นครราชสีมา", lat: 14.9799, lng: 102.0977 },
  { code: "ศอบ", name: "ศูนย์จัดการธนบัตร อุบลราชธานี", province: "อุบลราชธานี", lat: 15.2287, lng: 104.8564 },
  { code: "ศขก", name: "ศูนย์จัดการธนบัตร ขอนแก่น", province: "ขอนแก่น", lat: 16.4419, lng: 102.836 },
  { code: "ศพล", name: "ศูนย์จัดการธนบัตร พิษณุโลก", province: "พิษณุโลก", lat: 16.8211, lng: 100.2659 },
  { code: "ศชม", name: "ศูนย์จัดการธนบัตร เชียงใหม่", province: "เชียงใหม่", lat: 18.7883, lng: 98.9853 },
];

export function normalizeLocationCode(raw: unknown): string {
  return String(raw ?? "").replace(/[\s.]+/g, "");
}

let cache: { at: number; rows: LocationCodeRow[] } | null = null;
const CACHE_MS = 60_000;

export function invalidateLocationCodes() {
  cache = null;
}

export async function loadLocationCodes(): Promise<LocationCodeRow[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  if ((await prisma.locationCode.count()) === 0) {
    await prisma.locationCode.createMany({
      data: DEFAULT_LOCATION_CODES.map((r, i) => ({ ...r, sortOrder: i + 1 })),
      skipDuplicates: true,
    });
  }
  const rows = await prisma.locationCode.findMany({
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: { code: true, name: true, province: true, lat: true, lng: true },
  });
  cache = { at: Date.now(), rows };
  return rows;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** ดึงรหัสจุดจากข้อความ เช่น "ศนร.และศขก" → ["ศนร","ศขก"] */
export function matchLocationCodes(raw: string, rows: LocationCodeRow[]): string[] {
  const text = (raw ?? "").trim();
  if (!text || !rows.length) return [];
  const sorted = rows.map((r) => r.code).sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${sorted.map(escapeRegex).join("|")})`, "g");
  const codes: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (!codes.includes(m[1])) codes.push(m[1]);
  }
  return codes;
}

export async function extractLocationCodes(raw: string): Promise<string[]> {
  return matchLocationCodes(raw, await loadLocationCodes());
}

function coordOf(code: string, rows: LocationCodeRow[]): LatLng | null {
  const r = rows.find((x) => x.code === code);
  if (!r || r.lat == null || r.lng == null) return null;
  return { lat: r.lat, lng: r.lng, label: r.name };
}

/** แปลงข้อความที่มีรหัสพื้นที่เป็นชื่อจังหวัด เช่น "ศสร. / ศหญ." → "สุราษฎร์ธานี / สงขลา" */
export function locationTextToProvinces(raw: string, rows: LocationCodeRow[]): string {
  const codes = matchLocationCodes(raw, rows);
  if (!codes.length) return (raw ?? "").trim();
  const provinces = codes
    .map((c) => rows.find((r) => r.code === c)?.province)
    .filter((p): p is string => Boolean(p))
    .filter((p, i, arr) => arr.indexOf(p) === i);
  return provinces.join(" / ");
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** ประมาณระยะทางถนน = เส้นตรง × 1.35 (เมื่อไม่มี OSRM) */
export function estimateRoadKm(a: LatLng, b: LatLng): number {
  return Math.round(haversineKm(a, b) * 1.35 * 10) / 10;
}

async function osrmDrivingKm(a: LatLng, b: LatLng): Promise<number | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code?: string;
      routes?: { distance?: number }[];
    };
    if (data.code !== "Ok" || !data.routes?.[0]?.distance) return null;
    return Math.round((data.routes[0].distance / 1000) * 10) / 10;
  } catch {
    return null;
  }
}

/**
 * ระยะทางระหว่างข้อความต้นทาง–ปลายทาง
 * ถ้ามีหลายจุดในข้อความ จะรวมระยะทีละช่วง (เช่น สพฐ → ศพล → ศชม)
 */
export async function computeRouteDistanceKm(
  startLocation: string,
  endLocation: string,
): Promise<{ km: number; method: "osrm" | "estimate" | "none"; path: string[] }> {
  const rows = await loadLocationCodes();
  const startCodes = matchLocationCodes(startLocation, rows);
  const endCodes = matchLocationCodes(endLocation, rows);
  const path: string[] = [];
  for (const c of startCodes) if (!path.includes(c)) path.push(c);
  for (const c of endCodes) if (!path.includes(c)) path.push(c);

  if (path.length < 2) {
    return { km: 0, method: "none", path };
  }

  let total = 0;
  let usedOsrm = false;
  let usedEstimate = false;

  for (let i = 0; i < path.length - 1; i++) {
    const a = coordOf(path[i], rows);
    const b = coordOf(path[i + 1], rows);
    if (!a || !b) continue;
    const osrm = await osrmDrivingKm(a, b);
    if (osrm != null) {
      total += osrm;
      usedOsrm = true;
    } else {
      total += estimateRoadKm(a, b);
      usedEstimate = true;
    }
  }

  const km = Math.round(total * 10) / 10;
  const method = usedOsrm && !usedEstimate ? "osrm" : usedOsrm || usedEstimate ? (usedOsrm ? "osrm" : "estimate") : "none";
  // if mixed, still report osrm when any segment used it; prefer estimate label only if all estimate
  const finalMethod: "osrm" | "estimate" | "none" =
    method === "none" ? "none" : usedEstimate && !usedOsrm ? "estimate" : usedOsrm ? "osrm" : "estimate";

  return { km, method: finalMethod, path };
}

export async function knownLocationLabels(): Promise<{ code: string; label: string; province: string }[]> {
  return (await loadLocationCodes()).map((r) => ({ code: r.code, label: r.name, province: r.province }));
}
