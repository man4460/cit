import type { HighwaySegment, RouteMaster } from "../types";

export type GeoLocationCode = { code: string; name: string; province: string; lat?: number | null; lng?: number | null };

export function emptySegment(): HighwaySegment {
  return { highway: "", districts: "", provinces: "", distance: "" };
}

/** แยกข้อความที่คัดลอกจาก Excel (TSV) — รองรับเซลล์ที่ขึ้นบรรทัดใหม่ในเครื่องหมายคำพูด */
function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * แปลงตารางที่วางจาก Excel: [ลำดับ] หมายเลขทางหลวง · อำเภอ · จังหวัด · ระยะทาง
 * ข้ามแถวหัวตาราง / แถวหัวข้อที่มีคอลัมน์ไม่ครบ
 */
export function parseSegmentsFromText(text: string): HighwaySegment[] {
  const out: HighwaySegment[] = [];
  for (const raw of parseTsv(text)) {
    let cells = raw.map(clean);
    if (cells.length >= 5 && /^\d+\.?$/.test(cells[0])) cells = cells.slice(1);
    if (cells.filter(Boolean).length < 3) continue;
    if (/หมายเลขทางหลวง|^ลำดับ$/.test(cells[0]) || cells.includes("หมายเลขทางหลวง")) continue;
    const [highway = "", districts = "", provinces = "", distance = ""] = cells;
    out.push({ highway, districts, provinces, distance });
  }
  return out;
}

export function routeSegments(r: Pick<RouteMaster, "highwaySegments">): HighwaySegment[] {
  return Array.isArray(r.highwaySegments) ? r.highwaySegments : [];
}

const splitList = (s: string) =>
  s
    .split(/\s*\/\s*/)
    .map((x) => x.trim())
    .filter(Boolean);

/** รหัสศูนย์ในข้อความ เช่น "ศพล-ศชม", "ศพล. และศชม" → ["ศพล", "ศชม"] */
function codesIn(text: string, locations: GeoLocationCode[]): GeoLocationCode[] {
  const norm = text.replace(/\./g, "");
  return locations
    .map((l) => ({ l, at: norm.indexOf(l.code) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.l);
}

/** ชื่อพื้นที่ของช่วง สำหรับค้นหาบนแผนที่ เช่น "เมืองนครสวรรค์ นครสวรรค์" */
export function segmentAreaLabel(s: HighwaySegment): string {
  const district = splitList(s.districts)
    .filter((d) => !/^ถึง|^ออกจาก/.test(d))
    .pop();
  const province = splitList(s.provinces).pop();
  return [district, province].filter(Boolean).join(" ");
}

export function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function pointOf(l: GeoLocationCode): string {
  return l.lat != null && l.lng != null ? `${l.lat},${l.lng}` : `${l.name} ${l.province}`;
}

/** จุดผ่านจากแต่ละช่วง: อำเภอสุดท้าย + จังหวัดสุดท้าย หรือพิกัดศูนย์ถ้าช่วงนั้นระบุศูนย์ */
function segmentWaypoints(segments: HighwaySegment[], locations: GeoLocationCode[]) {
  const pts: { point: string; pinned: boolean }[] = [];
  for (const s of segments) {
    const items = splitList(s.districts);
    const center = codesIn(items[items.length - 1] ?? "", locations)[0];
    if (center) {
      pts.push({ point: pointOf(center), pinned: true });
      continue;
    }
    const district = items.filter((d) => !/^ถึง|^ออกจาก/.test(d)).pop();
    const province = splitList(s.provinces).pop();
    if (!district && !province) continue;
    const d = district ? (/^อ\.|^อำเภอ|^เมือง/.test(district) ? district : `อำเภอ${district}`) : "";
    pts.push({ point: [d, province ? `จังหวัด${province}` : ""].filter(Boolean).join(" "), pinned: false });
  }
  return pts.filter((p, i) => i === 0 || p.point !== pts[i - 1].point);
}

/** ลดจุดผ่านให้ไม่เกิน max โดยคงจุดศูนย์ไว้ และสุ่มแบบเว้นระยะเท่ากันสำหรับจุดอื่น */
function limitWaypoints(pts: { point: string; pinned: boolean }[], max: number): string[] {
  if (pts.length <= max) return pts.map((p) => p.point);
  const pinnedIdx = pts.map((p, i) => (p.pinned ? i : -1)).filter((i) => i >= 0);
  const free = pts.map((_, i) => i).filter((i) => !pts[i].pinned);
  const slots = Math.max(0, max - pinnedIdx.length);
  const picked = new Set(pinnedIdx.slice(0, max));
  for (let k = 0; k < slots; k++) picked.add(free[Math.round(((k + 0.5) * free.length) / slots - 0.5)]);
  return [...picked].sort((a, b) => a - b).map((i) => pts[i].point);
}

/** ต้นทาง / จุดผ่าน / ปลายทาง สำหรับเปิดแผนที่ */
export function routeMapStops(route: RouteMaster, locations: GeoLocationCode[]) {
  const starts = codesIn(route.startLocation, locations);
  const ends = codesIn(route.endLocation, locations);
  const origin = starts[0] ? pointOf(starts[0]) : route.startLocation;
  const destination = ends.length ? pointOf(ends[ends.length - 1]) : route.endLocation;
  const segments = routeSegments(route);
  const pts = segments.length
    ? segmentWaypoints(segments, locations)
    : ends.slice(0, -1).map((l) => ({ point: pointOf(l), pinned: true }));
  const waypoints = limitWaypoints(
    pts.filter((p) => p.point !== origin && p.point !== destination),
    8,
  );
  return { origin, destination, waypoints };
}

export function googleMapsDirectionsUrl(stops: ReturnType<typeof routeMapStops>): string {
  const q = new URLSearchParams({ api: "1", origin: stops.origin, destination: stops.destination, travelmode: "driving" });
  if (stops.waypoints.length) q.set("waypoints", stops.waypoints.join("|"));
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

export function googleMapsEmbedUrl(stops: ReturnType<typeof routeMapStops>): string {
  const daddr = [...stops.waypoints, stops.destination].join(" to:");
  const q = new URLSearchParams({ saddr: stops.origin, daddr, output: "embed", hl: "th" });
  return `https://maps.google.com/maps?${q.toString()}`;
}
