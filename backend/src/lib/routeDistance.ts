/** พิกัดโดยประมาณของจุดขนส่งธนบัตร / ศูนย์จัดการธนบัตร ธปท. — ใช้คำนวณระยะทาง */

export type LatLng = { lat: number; lng: number; label: string };

const COORDS: Record<string, LatLng> = {
  // ต้นทางกรุงเทพ / โรงพิมพ์·สำนักงาน
  สพฐ: { lat: 13.904, lng: 100.529, label: "สำนักพิมพ์ธนบัตร (นนทบุรี)" },
  สอบ: { lat: 13.7635, lng: 100.4978, label: "สำนักงานใหญ่ ธปท." },
  // ศูนย์จัดการธนบัตร
  ศกท: { lat: 13.7563, lng: 100.5018, label: "ศูนย์จัดการธนบัตร กรุงเทพ" },
  ศชม: { lat: 18.7883, lng: 98.9853, label: "ศูนย์จัดการธนบัตร เชียงใหม่" },
  ศพล: { lat: 16.8211, lng: 100.2659, label: "ศูนย์จัดการธนบัตร พิษณุโลก" },
  ศขก: { lat: 16.4419, lng: 102.836, label: "ศูนย์จัดการธนบัตร ขอนแก่น" },
  ศนร: { lat: 14.9799, lng: 102.0977, label: "ศูนย์จัดการธนบัตร นครราชสีมา" },
  ศอบ: { lat: 15.2287, lng: 104.8564, label: "ศูนย์จัดการธนบัตร อุบลราชธานี" },
  ศรย: { lat: 12.6833, lng: 101.2372, label: "ศูนย์จัดการธนบัตร ระยอง" },
  ศสร: { lat: 9.1382, lng: 99.3217, label: "ศูนย์จัดการธนบัตร สุราษฎร์ธานี" },
  ศหญ: { lat: 7.0084, lng: 100.4767, label: "ศูนย์จัดการธนบัตร หาดใหญ่" },
};

/** ดึงรหัสจุดจากข้อความ เช่น "ศนร.และศขก" → ["ศนร","ศขก"] */
export function extractLocationCodes(raw: string): string[] {
  const text = (raw ?? "").trim();
  if (!text) return [];
  const codes: string[] = [];
  const re = /(สพฐ|สอบ|ศกท|ศชม|ศพล|ศขก|ศนร|ศอบ|ศรย|ศสร|ศหญ)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (!codes.includes(m[1])) codes.push(m[1]);
  }
  if (codes.length) return codes;
  const compact = text.replace(/\s+/g, "").replace(/\./g, "");
  if (COORDS[compact]) return [compact];
  return [];
}

export function resolveCoord(code: string): LatLng | null {
  return COORDS[code] ?? null;
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
  const startCodes = extractLocationCodes(startLocation);
  const endCodes = extractLocationCodes(endLocation);
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
    const a = resolveCoord(path[i]);
    const b = resolveCoord(path[i + 1]);
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

export function knownLocationLabels(): { code: string; label: string }[] {
  return Object.entries(COORDS).map(([code, v]) => ({ code, label: v.label }));
}
