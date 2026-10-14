import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { apiJson } from "../api/client";
import { routeSegments, type GeoLocationCode } from "../lib/routeSegments";
import type { RouteMaster, RoutePlace, RoutePlaceKind } from "../types";
import { ROUTE_PLACE_KINDS } from "./RoutePlacesPanel";

const KIND_COLOR: Record<RoutePlaceKind, string> = {
  FUEL: "#10b981",
  REPAIR: "#0ea5e9",
  TIRE: "#f59e0b",
  POLICE: "#1d4ed8",
  MILITARY: "#4d7c0f",
  OTHER: "#8b5cf6",
};

const KIND_ICON: Record<RoutePlaceKind, string> = {
  FUEL: "⛽",
  REPAIR: "🔧",
  TIRE: "🛞",
  POLICE: "👮",
  MILITARY: "🎖️",
  OTHER: "📍",
};

/** ไอคอนตามประเภท — «อื่นๆ» แยกโรงพยาบาล / กู้ภัย / จุดพักรถ จากชื่อหรือหมายเหตุ */
function placeIcon(p: RoutePlace): string {
  if (p.kind !== "OTHER") return KIND_ICON[p.kind];
  const text = `${p.name} ${p.note ?? ""}`;
  if (/กู้ภัย|กู้ชีพ/.test(text)) return "🚑";
  if (/โรงพยาบาล|ศูนย์การแพทย์|hospital/i.test(text)) return "🏥";
  if (/จุดพัก|ที่พักริมทาง|rest/i.test(text)) return "🅿️";
  return KIND_ICON.OTHER;
}

type Brand = { label: string; bg: string; fg: string; border?: string };

/** ป้ายแบรนด์ (สีประจำแบรนด์ + ชื่อย่อ) — จับจากชื่อสถานที่ */
const BRANDS: { re: RegExp; brand: Brand }[] = [
  { re: /ปตท|p\s?t\s?t/i, brand: { label: "PTT", bg: "#0b4ea2", fg: "#ffffff" } },
  { re: /พีที|\bPT\b/i, brand: { label: "PT", bg: "#00a651", fg: "#ffde00" } },
  { re: /บางจาก|bangchak/i, brand: { label: "บางจาก", bg: "#00843d", fg: "#ffffff" } },
  { re: /เชลล์|shell/i, brand: { label: "Shell", bg: "#ffd500", fg: "#dd1d21" } },
  { re: /คาลเท็กซ์|caltex/i, brand: { label: "Caltex", bg: "#ffffff", fg: "#e2231a", border: "#e2231a" } },
  { re: /เอสโซ่|esso/i, brand: { label: "Esso", bg: "#ffffff", fg: "#0b4ea2", border: "#e2231a" } },
  { re: /ซัสโก้|susco/i, brand: { label: "Susco", bg: "#e30613", fg: "#ffffff" } },
  { re: /ปิโตรนาส|petronas/i, brand: { label: "Petronas", bg: "#00a19c", fg: "#ffffff" } },
  { re: /คอสโม|cosmo/i, brand: { label: "Cosmo", bg: "#e60012", fg: "#ffffff" } },
  { re: /โตโยต้า|toyota/i, brand: { label: "TOYOTA", bg: "#ffffff", fg: "#eb0a1e", border: "#eb0a1e" } },
  { re: /อีซูซุ|isuzu/i, brand: { label: "ISUZU", bg: "#ffffff", fg: "#c8102e", border: "#c8102e" } },
  { re: /b-?quik|บี-?ควิก/i, brand: { label: "B-Quik", bg: "#ffd200", fg: "#1a1a1a" } },
  { re: /cockpit|ค็อกพิท/i, brand: { label: "Cockpit", bg: "#e4002b", fg: "#ffffff" } },
  { re: /goodyear|กู๊ดเยียร์/i, brand: { label: "Goodyear", bg: "#0b2c7a", fg: "#ffdd00" } },
  { re: /tyre\s?plus|ไทร์พลัส/i, brand: { label: "Tyreplus", bg: "#27509b", fg: "#ffffff" } },
  { re: /michelin|มิชลิน/i, brand: { label: "Michelin", bg: "#27509b", fg: "#fce500" } },
  { re: /bridgestone|บริดจสโตน/i, brand: { label: "Bridgestone", bg: "#111111", fg: "#ffffff" } },
  { re: /dunlop|ดันลอป/i, brand: { label: "Dunlop", bg: "#ffcd00", fg: "#111111" } },
  { re: /ตำรวจทางหลวง|highway police/i, brand: { label: "ตร.ทางหลวง", bg: "#1d4ed8", fg: "#ffffff" } },
  { re: /bangkok hospital|โรงพยาบาลกรุงเทพ/i, brand: { label: "BDMS", bg: "#004b8d", fg: "#ffffff" } },
];

function placeBrand(p: RoutePlace): Brand | null {
  return BRANDS.find((b) => b.re.test(p.name))?.brand ?? null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const navUrl = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

function distanceKm(a: [number, number], b: [number, number]) {
  const toR = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toR;
  const dLng = (b[1] - a[1]) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const fmtKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} ม.` : `${km.toLocaleString("th-TH", { maximumFractionDigits: 1 })} กม.`);

function pinIcon(p: RoutePlace) {
  const ring = p.isFavorite ? "#f59e0b" : "#ffffff";
  const brand = placeBrand(p);
  if (brand) {
    return L.divIcon({
      className: "",
      iconSize: [0, 0],
      popupAnchor: [0, -14],
      html: `<div style="position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;gap:3px;white-space:nowrap;border-radius:9999px;background:${brand.bg};color:${brand.fg};border:2px solid ${p.isFavorite ? "#f59e0b" : brand.border ?? "#ffffff"};box-shadow:0 1px 5px rgba(0,0,0,.45);padding:2px 7px 2px 3px;font-weight:900;font-size:11px;line-height:18px;opacity:${p.verified ? 1 : 0.9}"><span style="display:inline-flex;width:18px;height:18px;border-radius:9999px;background:${KIND_COLOR[p.kind]};align-items:center;justify-content:center;font-size:11px">${placeIcon(p)}</span>${esc(brand.label)}</div>`,
    });
  }
  return L.divIcon({
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
    html: `<div style="width:30px;height:30px;border-radius:9999px;background:${KIND_COLOR[p.kind]};border:3px solid ${ring};box-shadow:0 1px 5px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1;opacity:${p.verified ? 1 : 0.85}">${placeIcon(p)}</div>`,
  });
}

function popupHtml(p: RoutePlace, segmentLabel: string, fromMe: number | null): string {
  const kind = ROUTE_PLACE_KINDS.find((k) => k.id === p.kind)?.label ?? "อื่นๆ";
  const brand = placeBrand(p);
  const tel = p.phone ? p.phone.replace(/[^\d+]/g, "") : "";
  const nav = p.lat != null && p.lng != null ? navUrl(p.lat, p.lng) : p.mapUrl ?? "";
  const btn = "display:inline-flex;align-items:center;gap:4px;border-radius:9999px;padding:6px 12px;font-weight:700;font-size:12px;text-decoration:none";
  return `<div style="min-width:15rem;max-width:19rem;font-size:12px;line-height:1.45">
    <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-bottom:2px">
      <span style="background:${KIND_COLOR[p.kind]};color:#fff;border-radius:4px;padding:0 6px;font-size:10px;font-weight:700">${placeIcon(p)} ${esc(kind)}</span>
      ${brand ? `<span style="background:${brand.bg};color:${brand.fg};border:1px solid ${brand.border ?? brand.bg};border-radius:4px;padding:0 6px;font-size:10px;font-weight:900">${esc(brand.label)}</span>` : ""}
      ${p.verified ? "" : '<span style="background:#fae8ff;color:#a21caf;border-radius:4px;padding:0 5px;font-size:10px;font-weight:700">AI · รอตรวจ</span>'}
      ${p.isFavorite ? '<span style="color:#f59e0b">★</span>' : ""}
    </div>
    <div style="font-weight:800;font-size:14px;color:#1e1b3a">${esc(p.name)}</div>
    ${fromMe != null ? `<div style="color:#0369a1;font-weight:700">ห่างจากคุณ ~${fmtKm(fromMe)} (เส้นตรง)</div>` : ""}
    ${segmentLabel ? `<div style="color:#4d47b6">${esc(segmentLabel)}</div>` : ""}
    ${p.location ? `<div style="color:#475569">${esc(p.location)}</div>` : ""}
    ${p.openingHours ? `<div style="color:#475569">เวลาเปิด: ${esc(p.openingHours)}</div>` : ""}
    ${p.note ? `<div style="color:#92400e;margin-top:2px">${esc(p.note)}</div>` : ""}
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
      ${tel ? `<a href="tel:${esc(tel)}" style="${btn};background:#059669;color:#fff">📞 โทร ${esc(p.phone)}</a>` : '<span style="color:#94a3b8;font-size:11px;align-self:center">ไม่มีเบอร์โทร</span>'}
      ${nav ? `<a href="${esc(nav)}" target="_blank" rel="noopener noreferrer" style="${btn};background:#0000BF;color:#fff">🧭 นำทาง</a>` : ""}
    </div>
  </div>`;
}

type MyPos = { lat: number; lng: number; accuracy: number };

/** แผนที่เส้นทาง + จุดบริการระหว่างทาง + ตำแหน่งปัจจุบัน (Leaflet + OpenStreetMap) */
export function RoutePlacesMap({
  route,
  places,
  locations,
}: {
  route: RouteMaster;
  places: RoutePlace[];
  locations: GeoLocationCode[];
}) {
  const segments = useMemo(() => routeSegments(route), [route]);
  const [kinds, setKinds] = useState<Set<RoutePlaceKind>>(() => new Set(ROUTE_PLACE_KINDS.map((k) => k.id)));
  const [seg, setSeg] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [line, setLine] = useState<[number, number][]>([]);
  const [tracking, setTracking] = useState(false);
  const [me, setMe] = useState<MyPos | null>(null);
  const [geoError, setGeoError] = useState("");
  const [nearOpen, setNearOpen] = useState(true);
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const placeLayerRef = useRef<L.LayerGroup | null>(null);
  const meLayerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const watchRef = useRef<number | null>(null);
  const centeredRef = useRef(false);
  const meRef = useRef<MyPos | null>(null);
  meRef.current = me;
  const fittedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    apiJson<{ points: [number, number][] }>(`/api/route-master/${route.id}/geometry`)
      .then((r) => alive && setLine(Array.isArray(r.points) ? r.points : []))
      .catch(() => alive && setLine([]));
    return () => {
      alive = false;
    };
  }, [route.id]);

  const located = useMemo(() => places.filter((p) => p.lat != null && p.lng != null), [places]);
  const shown = useMemo(
    () => located.filter((p) => kinds.has(p.kind) && (seg === "" || p.segmentIndex === Number(seg)) && (!favOnly || p.isFavorite)),
    [located, kinds, seg, favOnly],
  );

  /** ศูนย์ต้นทาง/ปลายทาง — ถ้ามีแนวเส้นทาง ใช้ปลายเส้นเป็นต้นทาง/ปลายทาง และดึงศูนย์ระหว่างทางเข้าหาเส้นที่ใกล้สุด */
  const stops = useMemo(() => {
    const text = `${route.startLocation} ${route.endLocation}`.replace(/\./g, "");
    const codes = locations
      .map((l) => ({ l, at: text.indexOf(l.code) }))
      .filter((x) => x.at >= 0 && x.l.lat != null && x.l.lng != null)
      .sort((a, b) => a.at - b.at)
      .map((x) => x.l);
    return codes.map((c, i) => {
      let pos: [number, number] = [c.lat!, c.lng!];
      if (line.length > 1) {
        if (i === 0) pos = line[0];
        else if (i === codes.length - 1) pos = line[line.length - 1];
        else {
          const nearest = line.reduce((best, p) => (distanceKm(p, pos) < distanceKm(best, pos) ? p : best), line[0]);
          if (distanceKm(nearest, pos) < 15) pos = nearest;
        }
      }
      return { code: c.code, name: c.name, pos };
    });
  }, [route, locations, line]);

  const segLabel = useCallback(
    (p: RoutePlace) => (p.segmentIndex != null && segments[p.segmentIndex] ? `ช่วง ${p.segmentIndex + 1} · ${segments[p.segmentIndex].highway}` : ""),
    [segments],
  );

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { zoomControl: true }).setView([15.5, 100.3], 6);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    placeLayerRef.current = L.layerGroup().addTo(map);
    meLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      if (watchRef.current != null) navigator.geolocation?.clearWatch(watchRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = routeLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (line.length > 1) {
      L.polyline(line, { color: "#ffffff", weight: 9, opacity: 0.9 }).addTo(layer);
      L.polyline(line, { color: "#0000BF", weight: 5, opacity: 0.85 }).addTo(layer);
    }
    for (const s of stops) {
      L.marker(s.pos, {
        icon: L.divIcon({
          className: "",
          iconSize: [0, 0],
          html: `<div style="background:#0000BF;color:#fff;font-weight:800;font-size:12px;padding:3px 8px;border-radius:9999px;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45);white-space:nowrap;transform:translate(-50%,-50%)">🏦 ${esc(s.code)}</div>`,
        }),
        zIndexOffset: 1000,
      })
        .bindTooltip(`${s.code} · ${s.name}`)
        .addTo(layer);
    }
  }, [line, stops]);

  useEffect(() => {
    const layer = placeLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    markersRef.current.clear();
    for (const p of shown) {
      const m = L.marker([p.lat!, p.lng!], { icon: pinIcon(p), title: p.name })
        .bindPopup(
          () => {
            const cur = meRef.current;
            return popupHtml(p, segLabel(p), cur ? distanceKm([cur.lat, cur.lng], [p.lat!, p.lng!]) : null);
          },
          { maxWidth: 320 },
        )
        .addTo(layer);
      markersRef.current.set(p.id, m);
    }
  }, [shown, segLabel]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || fittedRef.current) return;
    const pts: L.LatLngExpression[] = [...line, ...shown.map((p) => [p.lat!, p.lng!] as [number, number])];
    if (!pts.length) return;
    map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15 });
    if (line.length) fittedRef.current = true;
  }, [line, shown]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = meLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (!me) return;
    L.circle([me.lat, me.lng], { radius: me.accuracy, color: "#0284c7", weight: 1, fillColor: "#38bdf8", fillOpacity: 0.15 }).addTo(layer);
    L.marker([me.lat, me.lng], {
      icon: L.divIcon({
        className: "",
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        html: '<div style="width:22px;height:22px;border-radius:9999px;background:#0284c7;border:4px solid #fff;box-shadow:0 0 0 2px #0284c7,0 2px 6px rgba(0,0,0,.4)"></div>',
      }),
      zIndexOffset: 2000,
    })
      .bindTooltip(`ตำแหน่งของคุณ (±${Math.round(me.accuracy)} ม.)`)
      .addTo(layer);
    if (!centeredRef.current) {
      centeredRef.current = true;
      map.setView([me.lat, me.lng], Math.max(map.getZoom(), 13));
    }
  }, [me]);

  function startTracking() {
    setGeoError("");
    if (!window.isSecureContext) {
      setGeoError("ระบุตำแหน่งได้เฉพาะเมื่อเปิดระบบผ่าน https:// (เช่น allforone.ma-well.com)");
      return;
    }
    if (!navigator.geolocation) {
      setGeoError("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง");
      return;
    }
    centeredRef.current = false;
    setTracking(true);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => {
        setGeoError(err.code === err.PERMISSION_DENIED ? "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ตำแหน่งในเบราว์เซอร์แล้วลองใหม่" : "หาตำแหน่งไม่ได้ ลองใหม่อีกครั้ง");
        stopTracking();
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
  }

  function stopTracking() {
    if (watchRef.current != null) navigator.geolocation?.clearWatch(watchRef.current);
    watchRef.current = null;
    setTracking(false);
  }

  const nearest = useMemo(() => {
    if (!me) return [];
    return shown
      .map((p) => ({ p, km: distanceKm([me.lat, me.lng], [p.lat!, p.lng!]) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 6);
  }, [me, shown]);

  function focusPlace(p: RoutePlace) {
    const map = mapRef.current;
    const m = markersRef.current.get(p.id);
    if (!map || !m) return;
    map.setView(m.getLatLng(), Math.max(map.getZoom(), 15));
    m.openPopup();
  }

  const toggleKind = (k: RoutePlaceKind) =>
    setKinds((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#e8e6fc] bg-[#faf9ff] px-3 py-2">
        {ROUTE_PLACE_KINDS.map((k) => {
          const on = kinds.has(k.id);
          const n = located.filter((p) => p.kind === k.id).length;
          return (
            <button
              key={k.id}
              type="button"
              onClick={() => toggleKind(k.id)}
              className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 transition ${
                on ? "bg-white text-[#1e1b3a] ring-[#c7c2f0]" : "bg-slate-100 text-slate-400 ring-slate-200 line-through"
              }`}
            >
              <span
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px]"
                style={{ background: KIND_COLOR[k.id] }}
                aria-hidden
              >
                {KIND_ICON[k.id]}
              </span>
              {k.label} {n}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setFavOnly((v) => !v)}
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition ${
            favOnly ? "bg-amber-400 text-white shadow" : "bg-white text-amber-700 ring-1 ring-amber-200"
          }`}
        >
          ★ ชื่นชอบ
        </button>
        {segments.length ? (
          <select
            className="max-w-[16rem] rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800"
            value={seg}
            onChange={(e) => setSeg(e.target.value)}
          >
            <option value="">ทุกช่วงทางหลวง</option>
            {segments.map((s, i) => (
              <option key={i} value={i}>
                {i + 1}. {s.highway}
              </option>
            ))}
          </select>
        ) : null}
        <span className="ml-auto text-[11px] text-slate-500">
          แสดง {shown.length} / {places.length} จุด
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={elRef} className="absolute inset-0" />

        <div className="absolute right-3 top-3 z-[1000] flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => (tracking ? stopTracking() : startTracking())}
            className={`rounded-full px-3.5 py-2 text-xs font-bold shadow-lg transition ${
              tracking ? "bg-sky-600 text-white" : "bg-white text-sky-700 ring-1 ring-sky-200 hover:bg-sky-50"
            }`}
          >
            {tracking ? (me ? "📍 กำลังติดตามตำแหน่ง · หยุด" : "📍 กำลังหาตำแหน่ง…") : "📍 ตำแหน่งของฉัน"}
          </button>
          {me ? (
            <button
              type="button"
              onClick={() => mapRef.current?.setView([me.lat, me.lng], Math.max(mapRef.current.getZoom(), 14))}
              className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-sky-700 shadow ring-1 ring-sky-200 hover:bg-sky-50"
            >
              กลับมาที่ตำแหน่งฉัน
            </button>
          ) : null}
          {geoError ? <p className="max-w-[16rem] rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-700 shadow ring-1 ring-rose-200">{geoError}</p> : null}
        </div>

        {me && nearest.length ? (
          <div className="absolute bottom-3 left-3 z-[1000] w-[min(22rem,calc(100%-1.5rem))] rounded-xl bg-white/95 shadow-xl ring-1 ring-[#dcd8f0] backdrop-blur">
            <button
              type="button"
              onClick={() => setNearOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-black text-[#2e2a58]"
            >
              จุดบริการใกล้คุณ (ตามตัวกรอง)
              <span className="text-slate-400">{nearOpen ? "▾" : "▸"}</span>
            </button>
            {nearOpen ? (
              <ul className="max-h-[40vh] overflow-auto border-t border-[#ecebff]">
                {nearest.map(({ p, km }) => {
                  const tel = p.phone ? p.phone.replace(/[^\d+]/g, "") : "";
                  const brand = placeBrand(p);
                  return (
                    <li key={p.id} className="flex items-center gap-2 border-b border-[#f1f0fb] px-3 py-1.5 last:border-0">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
                        style={{ background: KIND_COLOR[p.kind] }}
                        aria-hidden
                      >
                        {placeIcon(p)}
                      </span>
                      <button type="button" onClick={() => focusPlace(p)} className="min-w-0 flex-1 text-left">
                        <p className="flex items-center gap-1 truncate text-[12px] font-semibold text-[#1e1b3a]">
                          {brand ? (
                            <span
                              className="shrink-0 rounded px-1 text-[10px] font-black"
                              style={{ background: brand.bg, color: brand.fg, border: `1px solid ${brand.border ?? brand.bg}` }}
                            >
                              {brand.label}
                            </span>
                          ) : null}
                          <span className="truncate">{p.name}</span>
                        </p>
                        <p className="text-[11px] text-sky-700">~{fmtKm(km)}</p>
                      </button>
                      {tel ? (
                        <a href={`tel:${tel}`} className="shrink-0 rounded-full bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white" title={p.phone}>
                          📞
                        </a>
                      ) : null}
                      <a
                        href={navUrl(p.lat!, p.lng!)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-full bg-[#0000BF] px-2 py-1 text-[11px] font-bold text-white"
                      >
                        🧭 นำทาง
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : null}

        {!line.length && !places.length ? (
          <div className="pointer-events-none absolute inset-0 z-[999] flex items-center justify-center">
            <p className="rounded-xl bg-white/90 px-4 py-2 text-xs text-slate-600 shadow">ยังไม่มีแนวเส้นทางและจุดบริการ — ดูเส้นทางที่แท็บ «Google Maps»</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
