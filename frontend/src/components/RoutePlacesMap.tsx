import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { googleMapsSearchUrl, routeSegments, type GeoLocationCode } from "../lib/routeSegments";
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

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function popupHtml(p: RoutePlace, segmentLabel: string): string {
  const kind = ROUTE_PLACE_KINDS.find((k) => k.id === p.kind)?.label ?? "อื่นๆ";
  const nav = p.lat != null && p.lng != null ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}` : p.mapUrl ?? "";
  const tel = p.phone ? p.phone.replace(/[^\d+]/g, "") : "";
  return `<div style="min-width:14rem;max-width:18rem;font-size:12px;line-height:1.45">
    <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-bottom:2px">
      <span style="background:${KIND_COLOR[p.kind]};color:#fff;border-radius:4px;padding:0 5px;font-size:10px;font-weight:700">${esc(kind)}</span>
      ${p.verified ? "" : '<span style="background:#fae8ff;color:#a21caf;border-radius:4px;padding:0 5px;font-size:10px;font-weight:700">AI · รอตรวจ</span>'}
      ${p.isFavorite ? '<span style="color:#f59e0b">★</span>' : ""}
    </div>
    <div style="font-weight:700;font-size:13px;color:#1e1b3a">${esc(p.name)}</div>
    ${segmentLabel ? `<div style="color:#4d47b6">${esc(segmentLabel)}</div>` : ""}
    ${p.location ? `<div style="color:#475569">${esc(p.location)}</div>` : ""}
    ${p.openingHours ? `<div style="color:#475569">เวลา: ${esc(p.openingHours)}</div>` : ""}
    ${tel ? `<div><a href="tel:${esc(tel)}" style="font-weight:600">${esc(p.phone)}</a></div>` : ""}
    ${p.note ? `<div style="color:#92400e;margin-top:2px">${esc(p.note)}</div>` : ""}
    ${nav ? `<div style="margin-top:4px"><a href="${esc(nav)}" target="_blank" rel="noopener noreferrer" style="font-weight:700">นำทางด้วย Google Maps ↗</a></div>` : ""}
  </div>`;
}

/** แผนที่จุดบริการระหว่างทาง (Leaflet + OpenStreetMap) */
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
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const located = useMemo(() => places.filter((p) => p.lat != null && p.lng != null), [places]);
  const shown = useMemo(
    () => located.filter((p) => kinds.has(p.kind) && (seg === "" || p.segmentIndex === Number(seg)) && (!favOnly || p.isFavorite)),
    [located, kinds, seg, favOnly],
  );

  const centers = useMemo(() => {
    const text = `${route.startLocation} ${route.endLocation}`.replace(/\./g, "");
    return locations.filter((l) => l.lat != null && l.lng != null && text.includes(l.code));
  }, [route, locations]);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { zoomControl: true }).setView([15.5, 100.3], 6);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const pts: L.LatLngExpression[] = [];
    for (const c of centers) {
      const ll: L.LatLngExpression = [c.lat!, c.lng!];
      pts.push(ll);
      L.marker(ll, {
        icon: L.divIcon({
          className: "",
          html: `<div style="background:#0000BF;color:#fff;font-weight:800;font-size:11px;padding:2px 6px;border-radius:9999px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);white-space:nowrap;transform:translate(-50%,-50%)">${esc(c.code)}</div>`,
        }),
        zIndexOffset: 1000,
      })
        .bindTooltip(`${c.code} · ${c.name}`)
        .addTo(layer);
    }
    for (const p of shown) {
      const ll: L.LatLngExpression = [p.lat!, p.lng!];
      pts.push(ll);
      const segLabel = p.segmentIndex != null && segments[p.segmentIndex] ? `ช่วง ${p.segmentIndex + 1} · ${segments[p.segmentIndex].highway}` : "";
      L.circleMarker(ll, {
        radius: p.isFavorite ? 8 : 6,
        color: p.isFavorite ? "#f59e0b" : "#ffffff",
        weight: 2,
        fillColor: KIND_COLOR[p.kind],
        fillOpacity: p.verified ? 0.95 : 0.7,
      })
        .bindTooltip(p.name)
        .bindPopup(popupHtml(p, segLabel))
        .addTo(layer);
    }
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15 });
  }, [shown, centers, segments]);

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
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOR[k.id] }} />
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
            className="max-w-[18rem] rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800"
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
          {places.length > located.length ? ` · ไม่มีพิกัด ${places.length - located.length}` : ""}
        </span>
      </div>
      <div ref={elRef} className="min-h-0 flex-1" />
      {!places.length ? (
        <div className="pointer-events-none absolute inset-0 top-10 flex items-center justify-center">
          <p className="rounded-xl bg-white/90 px-4 py-2 text-xs text-slate-600 shadow">
            ยังไม่มีจุดบริการในเส้นทางนี้ —{" "}
            <a className="pointer-events-auto text-[#5b61ff] underline" href={googleMapsSearchUrl(route.endLocation)} target="_blank" rel="noopener noreferrer">
              ค้นหาบน Google Maps
            </a>
          </p>
        </div>
      ) : null}
    </div>
  );
}
