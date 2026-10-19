/** จุด [lat, lng] — ใช้กับเส้นทางภารกิจ / GPS มือถือ */

export type LatLng = [number, number];

const toR = Math.PI / 180;

export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = (b[0] - a[0]) * toR;
  const dLng = (b[1] - a[1]) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** ทิศทางจาก a → b เป็นองศา (0 = เหนือ, ตามเข็มนาฬิกา) */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const φ1 = a[0] * toR;
  const φ2 = b[0] * toR;
  const Δλ = (b[1] - a[1]) * toR;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function projectOnSegment(p: LatLng, a: LatLng, b: LatLng): { point: LatLng; t: number; distKm: number } {
  const cos = Math.cos(p[0] * toR);
  const ax = a[1] * cos;
  const ay = a[0];
  const bx = b[1] * cos;
  const by = b[0];
  const px = p[1] * cos;
  const py = p[0];
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const point: LatLng = [ay + t * dy, (ax + t * dx) / cos];
  return { point, t, distKm: distanceKm(p, point) };
}

export type RouteSnap = {
  snapped: LatLng;
  /** ดัชนีจุดต้นของช่วงที่ snap */
  index: number;
  t: number;
  /** ระยะจากต้นทางตามเส้น (กม.) */
  alongKm: number;
  /** ระยะคงเหลือถึงปลายทางตามเส้น (กม.) */
  remainingKm: number;
  /** ทิศทางของช่วงเส้นทาง ณ จุด snap */
  routeHeading: number;
  /** ระยะตั้งฉากจาก GPS ถึงเส้น (กม.) */
  offsetKm: number;
};

/** ฉายตำแหน่งเข้า polyline แล้วคำนวณระยะคงเหลือตามเส้น */
export function snapToRoute(p: LatLng, line: LatLng[]): RouteSnap | null {
  if (line.length < 2) return null;

  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const d = distanceKm(line[i], line[i + 1]);
    segLens.push(d);
    total += d;
  }

  let best = { index: 0, t: 0, distKm: Infinity, point: line[0] as LatLng };
  for (let i = 0; i < line.length - 1; i++) {
    const proj = projectOnSegment(p, line[i], line[i + 1]);
    if (proj.distKm < best.distKm) best = { index: i, t: proj.t, distKm: proj.distKm, point: proj.point };
  }

  let along = 0;
  for (let i = 0; i < best.index; i++) along += segLens[i];
  along += segLens[best.index] * best.t;
  const remainingKm = Math.max(0, total - along);

  const a = line[best.index];
  const b = line[best.index + 1];
  const routeHeading = distanceKm(a, b) > 1e-6 ? bearingDeg(a, b) : 0;

  return {
    snapped: best.point,
    index: best.index,
    t: best.t,
    alongKm: along,
    remainingKm,
    routeHeading,
    offsetKm: best.distKm,
  };
}

/** จุดบนเส้นที่อยู่ข้างหน้าตามทิศทางภารกิจ (เช่น จุดบริการ) */
export function placeAlongRoute(place: LatLng, line: LatLng[]): { alongKm: number; offsetKm: number } | null {
  const snap = snapToRoute(place, line);
  if (!snap) return null;
  return { alongKm: snap.alongKm, offsetKm: snap.offsetKm };
}

export function formatRouteKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} ม.`;
  return `${km.toLocaleString("th-TH", { maximumFractionDigits: 1 })} กม.`;
}
