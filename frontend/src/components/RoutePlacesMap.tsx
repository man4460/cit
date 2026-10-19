import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createPortal } from "react-dom";
import { apiFormJson, apiJson } from "../api/client";
import {
  bearingDeg,
  distanceKm,
  formatRouteKm,
  placeAlongRoute,
  snapToRoute,
  type LatLng,
  type RouteSnap,
} from "../lib/routeNavigate";
import { routeSegments, type GeoLocationCode } from "../lib/routeSegments";
import type { RouteMaster, RoutePlace, RoutePlaceKind, RoutePlacePhoto } from "../types";
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

type Brand = { label: string; bg: string; fg: string; border?: string; logo?: string };

/** แบรนด์ — จับจากชื่อสถานที่ · logo = ไฟล์ใน public/brands (ใช้ภายในหน่วยงาน) · ไม่มี logo = ป้ายสีแบรนด์ */
const BRANDS: { re: RegExp; brand: Brand }[] = [
  { re: /ปตท|p\s?t\s?t/i, brand: { label: "PTT", bg: "#0b4ea2", fg: "#ffffff", logo: "/brands/ptt.png" } },
  { re: /พีที|\bPT\b/i, brand: { label: "PT", bg: "#00a651", fg: "#ffde00", logo: "/brands/pt.png" } },
  { re: /บางจาก|bangchak/i, brand: { label: "บางจาก", bg: "#00843d", fg: "#ffffff", logo: "/brands/bangchak.png" } },
  { re: /เชลล์|shell/i, brand: { label: "Shell", bg: "#ffd500", fg: "#dd1d21", logo: "/brands/shell.png" } },
  { re: /คาลเท็กซ์|caltex/i, brand: { label: "Caltex", bg: "#ffffff", fg: "#e2231a", border: "#e2231a", logo: "/brands/caltex.png" } },
  { re: /เอสโซ่|esso/i, brand: { label: "Esso", bg: "#ffffff", fg: "#0b4ea2", border: "#e2231a", logo: "/brands/esso.png" } },
  { re: /ซัสโก้|susco/i, brand: { label: "Susco", bg: "#e30613", fg: "#ffffff", logo: "/brands/susco.png" } },
  { re: /ปิโตรนาส|petronas/i, brand: { label: "Petronas", bg: "#00a19c", fg: "#ffffff", logo: "/brands/petronas.png" } },
  { re: /คอสโม|cosmo/i, brand: { label: "Cosmo", bg: "#e60012", fg: "#ffffff", logo: "/brands/cosmo.png" } },
  { re: /โตโยต้า|toyota/i, brand: { label: "TOYOTA", bg: "#ffffff", fg: "#eb0a1e", border: "#eb0a1e", logo: "/brands/toyota.png" } },
  { re: /อีซูซุ|isuzu/i, brand: { label: "ISUZU", bg: "#ffffff", fg: "#c8102e", border: "#c8102e", logo: "/brands/isuzu.png" } },
  { re: /b-?quik|บี-?ควิก/i, brand: { label: "B-Quik", bg: "#ffd200", fg: "#1a1a1a", logo: "/brands/bquik.png" } },
  { re: /cockpit|ค็อกพิท/i, brand: { label: "Cockpit", bg: "#e4002b", fg: "#ffffff" } },
  { re: /goodyear|กู๊ดเยียร์/i, brand: { label: "Goodyear", bg: "#0b2c7a", fg: "#ffdd00", logo: "/brands/goodyear.png" } },
  { re: /tyre\s?plus|ไทร์พลัส/i, brand: { label: "Tyreplus", bg: "#27509b", fg: "#ffffff" } },
  { re: /michelin|มิชลิน/i, brand: { label: "Michelin", bg: "#27509b", fg: "#fce500", logo: "/brands/michelin.png" } },
  { re: /bridgestone|บริดจสโตน/i, brand: { label: "Bridgestone", bg: "#111111", fg: "#ffffff", logo: "/brands/bridgestone.png" } },
  { re: /dunlop|ดันลอป/i, brand: { label: "Dunlop", bg: "#ffcd00", fg: "#111111", logo: "/brands/dunlop.png" } },
  { re: /ตำรวจทางหลวง|highway police/i, brand: { label: "ตร.ทางหลวง", bg: "#1d4ed8", fg: "#ffffff" } },
  { re: /bangkok hospital|โรงพยาบาลกรุงเทพ/i, brand: { label: "BDMS", bg: "#004b8d", fg: "#ffffff", logo: "/brands/bdms.png" } },
];

function placeBrand(p: RoutePlace): Brand | null {
  return BRANDS.find((b) => b.re.test(p.name))?.brand ?? null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const navUrl = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

const fmtKm = formatRouteKm;

/** หมุดนำทาง — ลูกศรหมุนตาม heading (องศาจากเหนือ) */
function headingIcon(heading: number) {
  return L.divIcon({
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;transform:rotate(${heading}deg)"><div style="width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:26px solid #0284c7;filter:drop-shadow(0 1px 3px rgba(0,0,0,.45));position:relative"><div style="position:absolute;left:-6px;top:8px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:14px solid #fff"></div></div></div>`,
  });
}

function pinIcon(p: RoutePlace) {
  const ring = p.isFavorite ? "#f59e0b" : "#ffffff";
  const brand = placeBrand(p);
  if (brand?.logo) {
    return L.divIcon({
      className: "",
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -16],
      html: `<div style="position:relative;width:34px;height:34px;border-radius:9999px;background:#fff;border:3px solid ${p.isFavorite ? "#f59e0b" : KIND_COLOR[p.kind]};box-shadow:0 1px 5px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;opacity:${p.verified ? 1 : 0.9}"><img src="${brand.logo}" alt="${esc(brand.label)}" style="width:22px;height:22px;object-fit:contain" /><span style="position:absolute;right:-5px;bottom:-5px;width:16px;height:16px;border-radius:9999px;background:${KIND_COLOR[p.kind]};border:1.5px solid #fff;display:flex;align-items:center;justify-content:center;font-size:9px">${placeIcon(p)}</span></div>`,
    });
  }
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

const googlePlaceUrl = (p: RoutePlace) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.name, p.location].filter(Boolean).join(" "))}`;

const streetViewUrl = (lat: number, lng: number) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;

/** เนื้อหา popup จุดบริการ — ข้อมูล · โทร · นำทาง · รูปจากเจ้าหน้าที่ · ลิงก์ภาพ Google Maps / Street View */
function PlacePopup({
  place: p,
  segmentLabel,
  fromMe,
  onResize,
  onViewPhoto,
  isFavorite,
  onToggleFavorite,
}: {
  place: RoutePlace;
  segmentLabel: string;
  fromMe: number | null;
  onResize: () => void;
  onViewPhoto: (photos: RoutePlacePhoto[], index: number) => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  const [photos, setPhotos] = useState<RoutePlacePhoto[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const kind = ROUTE_PLACE_KINDS.find((k) => k.id === p.kind)?.label ?? "อื่นๆ";
  const brand = placeBrand(p);
  const tel = p.phone ? p.phone.replace(/[^\d+]/g, "") : "";
  const hasPos = p.lat != null && p.lng != null;

  useEffect(() => {
    let alive = true;
    apiJson<RoutePlacePhoto[]>(`/api/route-master/places/${p.id}/photos`, { skipCache: true })
      .then((rows) => alive && setPhotos(rows))
      .catch(() => alive && setPhotos([]));
    return () => {
      alive = false;
    };
  }, [p.id]);

  useEffect(() => {
    onResize();
  }, [photos, onResize]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    setUploading(true);
    try {
      setPhotos(await apiFormJson<RoutePlacePhoto[]>(`/api/route-master/places/${p.id}/photos`, fd));
    } catch (err) {
      alert(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const btn = "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-bold no-underline";

  return (
    <div className="w-[17rem] text-[12px] leading-snug sm:w-[19rem]">
      <div className="mb-1 flex flex-wrap items-center gap-1">
        {brand?.logo ? <img src={brand.logo} alt={brand.label} className="h-6 w-6 rounded object-contain" /> : null}
        <span className="rounded px-1.5 text-[10px] font-bold text-white" style={{ background: KIND_COLOR[p.kind] }}>
          {placeIcon(p)} {kind}
        </span>
        {brand ? (
          <span
            className="rounded px-1.5 text-[10px] font-black"
            style={{ background: brand.bg, color: brand.fg, border: `1px solid ${brand.border ?? brand.bg}` }}
          >
            {brand.label}
          </span>
        ) : null}
        {!p.verified ? <span className="rounded bg-fuchsia-100 px-1.5 text-[10px] font-bold text-fuchsia-700">AI · รอตรวจ</span> : null}
      </div>
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[14px] font-extrabold text-[#1e1b3a]">{p.name}</p>
        <button
          type="button"
          onClick={onToggleFavorite}
          title={isFavorite ? "เลิกชื่นชอบ" : "เพิ่มในรายการชื่นชอบ"}
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 transition ${
            isFavorite ? "bg-amber-400 text-white ring-amber-400" : "bg-white text-amber-700 ring-amber-300 hover:bg-amber-50"
          }`}
        >
          {isFavorite ? "★ ชื่นชอบแล้ว" : "☆ เพิ่มชื่นชอบ"}
        </button>
      </div>
      {fromMe != null ? <p className="font-bold text-sky-700">ห่างจากคุณ ~{fmtKm(fromMe)} (เส้นตรง)</p> : null}
      {segmentLabel ? <p className="text-[#4d47b6]">{segmentLabel}</p> : null}
      {p.location ? <p className="text-slate-600">{p.location}</p> : null}
      {p.openingHours ? <p className="text-slate-600">เวลาเปิด: {p.openingHours}</p> : null}
      {p.note ? <p className="mt-0.5 text-amber-800">{p.note}</p> : null}

      <div className="mt-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-black text-[#2e2a58]">📷 รูปถ่าย {photos ? `(${photos.length})` : ""}</span>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="rounded-full bg-[#f5f3ff] px-2 py-0.5 text-[11px] font-bold text-[#4d47b6] ring-1 ring-[#dcd8f0] hover:bg-[#ede9fe] disabled:opacity-50"
          >
            {uploading ? "กำลังอัปโหลด…" : "+ เพิ่มรูป"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void uploadFiles(e.target.files)} />
        </div>
        {photos === null ? (
          <p className="text-[11px] text-slate-400">กำลังโหลดรูป…</p>
        ) : photos.length ? (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {photos.map((ph, i) => (
              <button
                key={ph.id}
                type="button"
                onClick={() => onViewPhoto(photos, i)}
                className="h-16 w-20 shrink-0 overflow-hidden rounded-lg ring-1 ring-slate-200 hover:ring-[#5b61ff]"
              >
                <img src={ph.fileUrl} alt={ph.originalName ?? p.name} className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-400">ยังไม่มีรูป — กด «+ เพิ่มรูป» เช่น ทางเข้า ที่จอดรถใหญ่ หน้าร้าน</p>
        )}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
          <a href={googlePlaceUrl(p)} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#5b61ff] hover:underline">
            🖼️ ภาพใน Google Maps ↗
          </a>
          {hasPos ? (
            <a href={streetViewUrl(p.lat!, p.lng!)} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#5b61ff] hover:underline">
              🚶 Street View ↗
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {tel ? (
          <a href={`tel:${tel}`} className={`${btn} bg-emerald-600 !text-white`}>
            📞 โทร {p.phone}
          </a>
        ) : (
          <span className="self-center text-[11px] text-slate-400">ไม่มีเบอร์โทร</span>
        )}
        {hasPos ? (
          <a href={navUrl(p.lat!, p.lng!)} target="_blank" rel="noopener noreferrer" className={`${btn} bg-[#0000BF] !text-white`}>
            🧭 นำทาง
          </a>
        ) : null}
      </div>
    </div>
  );
}

/** ดูรูปขนาดเต็ม เลื่อนซ้าย/ขวาได้ */
function PhotoLightbox({ photos, index, onClose }: { photos: RoutePlacePhoto[]; index: number; onClose: () => void }) {
  const [i, setI] = useState(index);
  const go = useCallback((d: number) => setI((x) => (x + d + photos.length) % photos.length), [photos.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [go, onClose]);
  const ph = photos[i];
  if (!ph) return null;
  return (
    <div className="absolute inset-0 z-[3000] flex flex-col bg-black/90" onClick={onClose} role="dialog" aria-modal="true">
      <div className="flex items-center justify-between px-4 py-2 text-white">
        <span className="text-xs text-white/70">
          {i + 1} / {photos.length}
        </span>
        <div className="flex items-center gap-2">
          <a
            href={ph.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg px-2 py-1 text-xs text-white/80 hover:bg-white/10"
          >
            เปิดไฟล์เต็ม ↗
          </a>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-lg hover:bg-white/15" aria-label="ปิด">
            ✕
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-12 pb-6">
        <img src={ph.fileUrl} alt={ph.originalName ?? ""} className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
        {photos.length > 1 ? (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
              className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-2xl text-white hover:bg-white/25"
              aria-label="รูปก่อนหน้า"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-2xl text-white hover:bg-white/25"
              aria-label="รูปถัดไป"
            >
              ›
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

type MyPos = { lat: number; lng: number; accuracy: number; heading: number | null; speed: number | null };

/** แผนที่เส้นทาง + จุดบริการระหว่างทาง + นำทางด้วย GPS มือถือ (snap เข้าเส้นทาง) */
export function RoutePlacesMap({
  route,
  places,
  locations,
  autoStartNav = false,
}: {
  route: RouteMaster;
  places: RoutePlace[];
  locations: GeoLocationCode[];
  /** เปิดโหมดนำทางและเริ่มติดตามตำแหน่งทันที (จากภารกิจที่กำลังทำ) */
  autoStartNav?: boolean;
}) {
  const segments = useMemo(() => routeSegments(route), [route]);
  const [kinds, setKinds] = useState<Set<RoutePlaceKind>>(() => new Set(ROUTE_PLACE_KINDS.map((k) => k.id)));
  const [seg, setSeg] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [line, setLine] = useState<LatLng[]>([]);
  const [tracking, setTracking] = useState(false);
  const [navMode, setNavMode] = useState(autoStartNav);
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
  const fittedRef = useRef(false);
  const prevPosRef = useRef<LatLng | null>(null);
  const autoStartedRef = useRef(false);
  const [openPopup, setOpenPopup] = useState<{ place: RoutePlace; el: HTMLElement; popup: L.Popup } | null>(null);
  const [lightbox, setLightbox] = useState<{ photos: RoutePlacePhoto[]; index: number } | null>(null);
  const resizePopup = useCallback(() => openPopup?.popup.update(), [openPopup]);

  useEffect(() => {
    let alive = true;
    apiJson<{ points: [number, number][] }>(`/api/route-master/${route.id}/geometry`)
      .then((r) => alive && setLine(Array.isArray(r.points) ? r.points : []))
      .catch(() => alive && setLine([]));
    return () => {
      alive = false;
    };
  }, [route.id]);

  const [fav, setFav] = useState<Set<string>>(() => new Set(places.filter((p) => p.isFavorite).map((p) => p.id)));
  const favRef = useRef(fav);
  favRef.current = fav;
  useEffect(() => setFav(new Set(places.filter((p) => p.isFavorite).map((p) => p.id))), [places]);

  const located = useMemo(() => places.filter((p) => p.lat != null && p.lng != null), [places]);
  /** fav เป็น dependency เฉพาะตอนกรอง «ชื่นชอบ» — ไม่งั้นการกดดาวจะสร้างหมุดใหม่และปิด popup */
  const favFilter = favOnly ? fav : null;
  const shown = useMemo(
    () => located.filter((p) => kinds.has(p.kind) && (seg === "" || p.segmentIndex === Number(seg)) && (!favFilter || favFilter.has(p.id))),
    [located, kinds, seg, favFilter],
  );

  async function toggleFavorite(p: RoutePlace) {
    const next = !favRef.current.has(p.id);
    const apply = (on: boolean) =>
      setFav((s) => {
        const n = new Set(s);
        if (on) n.add(p.id);
        else n.delete(p.id);
        return n;
      });
    apply(next);
    try {
      await apiJson(`/api/route-master/places/${p.id}`, { method: "PUT", body: JSON.stringify({ isFavorite: next }) });
    } catch (err) {
      apply(!next);
      alert(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    }
  }

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
      const el = document.createElement("div");
      const m = L.marker([p.lat!, p.lng!], { icon: pinIcon({ ...p, isFavorite: favRef.current.has(p.id) }), title: p.name })
        .bindPopup(el, { maxWidth: 340, minWidth: 260, autoPanPaddingTopLeft: [10, 60] })
        .addTo(layer);
      m.on("popupopen", (e) => setOpenPopup({ place: p, el, popup: (e as L.PopupEvent).popup }));
      m.on("popupclose", () => setOpenPopup((cur) => (cur?.place.id === p.id ? null : cur)));
      markersRef.current.set(p.id, m);
    }
  }, [shown]);

  useEffect(() => {
    for (const p of shown) markersRef.current.get(p.id)?.setIcon(pinIcon({ ...p, isFavorite: fav.has(p.id) }));
  }, [fav, shown]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || fittedRef.current) return;
    const pts: L.LatLngExpression[] = [...line, ...shown.map((p) => [p.lat!, p.lng!] as [number, number])];
    if (!pts.length) return;
    map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15 });
    if (line.length) fittedRef.current = true;
  }, [line, shown]);

  const routeSnap: RouteSnap | null = useMemo(() => {
    if (!me || line.length < 2) return null;
    return snapToRoute([me.lat, me.lng], line);
  }, [me, line]);

  const displayPos: LatLng | null = useMemo(() => {
    if (!me) return null;
    if (navMode && routeSnap && routeSnap.offsetKm < 0.8) return routeSnap.snapped;
    return [me.lat, me.lng];
  }, [me, navMode, routeSnap]);

  const displayHeading = useMemo(() => {
    if (!me) return 0;
    if (me.heading != null && Number.isFinite(me.heading)) return me.heading;
    if (navMode && routeSnap) return routeSnap.routeHeading;
    if (prevPosRef.current && displayPos) {
      const d = distanceKm(prevPosRef.current, displayPos);
      if (d > 0.008) return bearingDeg(prevPosRef.current, displayPos);
    }
    return routeSnap?.routeHeading ?? 0;
  }, [me, navMode, routeSnap, displayPos]);

  const nextAlongPlace = useMemo(() => {
    if (!routeSnap || line.length < 2) return null;
    let best: { p: RoutePlace; aheadKm: number } | null = null;
    for (const p of shown) {
      const along = placeAlongRoute([p.lat!, p.lng!], line);
      if (!along || along.offsetKm > 2) continue;
      const aheadKm = along.alongKm - routeSnap.alongKm;
      if (aheadKm < 0.05) continue;
      if (!best || aheadKm < best.aheadKm) best = { p, aheadKm };
    }
    return best;
  }, [routeSnap, line, shown]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = meLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (!me || !displayPos) return;
    L.circle([me.lat, me.lng], { radius: me.accuracy, color: "#0284c7", weight: 1, fillColor: "#38bdf8", fillOpacity: 0.12 }).addTo(layer);
    if (navMode && routeSnap && routeSnap.offsetKm < 0.8) {
      L.polyline(
        [
          [me.lat, me.lng],
          routeSnap.snapped,
        ],
        { color: "#38bdf8", weight: 2, dashArray: "4 6", opacity: 0.7 },
      ).addTo(layer);
    }
    const tip =
      navMode && routeSnap
        ? `นำทาง · คงเหลือ ${fmtKm(routeSnap.remainingKm)} (±${Math.round(me.accuracy)} ม.)`
        : `ตำแหน่งของคุณ (±${Math.round(me.accuracy)} ม.)`;
    L.marker(displayPos, {
      icon: navMode || me.heading != null ? headingIcon(displayHeading) : L.divIcon({
        className: "",
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        html: '<div style="width:22px;height:22px;border-radius:9999px;background:#0284c7;border:4px solid #fff;box-shadow:0 0 0 2px #0284c7,0 2px 6px rgba(0,0,0,.4)"></div>',
      }),
      zIndexOffset: 2000,
    })
      .bindTooltip(tip)
      .addTo(layer);
    if (!centeredRef.current) {
      centeredRef.current = true;
      map.setView(displayPos, Math.max(map.getZoom(), navMode ? 15 : 13));
    } else if (navMode) {
      map.panTo(displayPos, { animate: true, duration: 0.4 });
    }
  }, [me, displayPos, displayHeading, navMode, routeSnap]);

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
      (pos) => {
        const next: MyPos = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading != null && Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
          speed: pos.coords.speed != null && Number.isFinite(pos.coords.speed) ? pos.coords.speed : null,
        };
        setMe((prev) => {
          if (prev) prevPosRef.current = [prev.lat, prev.lng];
          return next;
        });
      },
      (err) => {
        setGeoError(err.code === err.PERMISSION_DENIED ? "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ตำแหน่งในเบราว์เซอร์แล้วลองใหม่" : "หาตำแหน่งไม่ได้ ลองใหม่อีกครั้ง");
        stopTracking();
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }

  function stopTracking() {
    if (watchRef.current != null) navigator.geolocation?.clearWatch(watchRef.current);
    watchRef.current = null;
    setTracking(false);
  }

  function startNav() {
    setNavMode(true);
    if (!tracking) startTracking();
  }

  function stopNav() {
    setNavMode(false);
  }

  useEffect(() => {
    if (!autoStartNav || autoStartedRef.current) return;
    autoStartedRef.current = true;
    startNav();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartNav]);

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
          ★ ชื่นชอบ {fav.size}
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
        {openPopup
          ? createPortal(
              <PlacePopup
                key={openPopup.place.id}
                place={openPopup.place}
                segmentLabel={segLabel(openPopup.place)}
                fromMe={me ? distanceKm([me.lat, me.lng], [openPopup.place.lat!, openPopup.place.lng!]) : null}
                onResize={resizePopup}
                onViewPhoto={(photos, index) => setLightbox({ photos, index })}
                isFavorite={fav.has(openPopup.place.id)}
                onToggleFavorite={() => void toggleFavorite(openPopup.place)}
              />,
              openPopup.el,
            )
          : null}

        {navMode && routeSnap ? (
          <div className="absolute left-3 right-3 top-3 z-[1000] mx-auto max-w-md rounded-xl bg-[#0f172a]/92 px-3.5 py-2.5 text-white shadow-xl backdrop-blur sm:left-auto sm:right-3 sm:mx-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-sky-300">นำทางตามเส้นทางภารกิจ</p>
                <p className="text-lg font-black tabular-nums leading-tight">
                  คงเหลือ {fmtKm(routeSnap.remainingKm)}
                </p>
                {nextAlongPlace ? (
                  <p className="mt-0.5 truncate text-[12px] text-white/85">
                    ถัดไป · {placeIcon(nextAlongPlace.p)} {nextAlongPlace.p.name} · {fmtKm(nextAlongPlace.aheadKm)}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[12px] text-white/70">ปลายทาง · {route.endLocation || "จุดหมาย"}</p>
                )}
                {routeSnap.offsetKm >= 0.15 ? (
                  <p className="mt-0.5 text-[11px] text-amber-300">ห่างจากเส้นทาง ~{fmtKm(routeSnap.offsetKm)} — แสดงจุดฉายเข้าเส้น</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={stopNav}
                className="shrink-0 rounded-lg bg-white/10 px-2 py-1 text-[11px] font-semibold hover:bg-white/20"
              >
                ปิดนำทาง
              </button>
            </div>
          </div>
        ) : null}

        <div className={`absolute right-3 z-[1000] flex flex-col items-end gap-2 ${navMode && routeSnap ? "top-[7.5rem]" : "top-3"}`}>
          <button
            type="button"
            onClick={() => (navMode ? stopNav() : startNav())}
            className={`rounded-full px-3.5 py-2 text-xs font-bold shadow-lg transition ${
              navMode ? "bg-emerald-600 text-white" : "bg-white text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50"
            }`}
          >
            {navMode ? "🧭 กำลังนำทาง" : "🧭 เริ่มนำทาง"}
          </button>
          <button
            type="button"
            onClick={() => (tracking ? stopTracking() : startTracking())}
            className={`rounded-full px-3.5 py-2 text-xs font-bold shadow-lg transition ${
              tracking ? "bg-sky-600 text-white" : "bg-white text-sky-700 ring-1 ring-sky-200 hover:bg-sky-50"
            }`}
          >
            {tracking ? (me ? "📍 กำลังติดตาม · หยุด" : "📍 กำลังหาตำแหน่ง…") : "📍 ตำแหน่งของฉัน"}
          </button>
          {displayPos ? (
            <button
              type="button"
              onClick={() => {
                centeredRef.current = false;
                mapRef.current?.setView(displayPos, Math.max(mapRef.current.getZoom(), 15));
                centeredRef.current = true;
              }}
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
                      <button
                        type="button"
                        onClick={() => void toggleFavorite(p)}
                        title={fav.has(p.id) ? "เลิกชื่นชอบ" : "เพิ่มในรายการชื่นชอบ"}
                        className={`shrink-0 text-lg leading-none transition hover:scale-110 ${fav.has(p.id) ? "text-amber-400" : "text-slate-300 hover:text-amber-300"}`}
                      >
                        {fav.has(p.id) ? "★" : "☆"}
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
      {lightbox ? <PhotoLightbox photos={lightbox.photos} index={lightbox.index} onClose={() => setLightbox(null)} /> : null}
    </div>
  );
}
