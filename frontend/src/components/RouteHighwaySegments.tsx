import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  emptySegment,
  googleMapsDirectionsUrl,
  googleMapsEmbedUrl,
  parseSegmentsFromText,
  routeMapStops,
  type GeoLocationCode,
} from "../lib/routeSegments";
import type { HighwaySegment, RouteMaster, RoutePlace } from "../types";
import { apiJson } from "../api/client";
import { RoutePlacesMap } from "./RoutePlacesMap";

const thClass = "border-b border-[#dcd8f0] px-2.5 py-2 text-left text-[11px] font-black text-[#2e2a58]";
const tdClass = "border-b border-[#ecebff] px-2.5 py-2 align-top text-[12px] leading-relaxed text-slate-700";

const listLines = (s: string) =>
  s
    .split(/\s*\/\s*/)
    .map((x) => x.trim())
    .filter(Boolean);

/** ตารางช่วงทางหลวง (อ่านอย่างเดียว) */
export function RouteSegmentsTable({ segments }: { segments: HighwaySegment[] }) {
  if (!segments.length) {
    return <p className="rounded-xl border border-dashed border-[#dcd8f0] px-3 py-6 text-center text-xs text-slate-500">ยังไม่มีรายละเอียดช่วงทางหลวง</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-[#e8e6fc] bg-white">
      <table className="w-full min-w-[42rem] border-collapse">
        <thead className="bg-gradient-to-r from-[#eef2ff] via-[#f5f3ff] to-[#fdf2f8]">
          <tr>
            <th className={`${thClass} w-10 text-center`}>ลำดับ</th>
            <th className={thClass}>หมายเลขทางหลวง</th>
            <th className={thClass}>อำเภอ</th>
            <th className={thClass}>จังหวัด</th>
            <th className={`${thClass} whitespace-nowrap`}>ระยะทาง</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((s, i) => (
            <tr key={i} className="hover:bg-[#0000BF]/[0.04]">
              <td className={`${tdClass} text-center font-bold tabular-nums text-[#4d47b6]`}>{i + 1}</td>
              <td className={`${tdClass} font-semibold text-[#1e1b4b]`}>{s.highway || "—"}</td>
              <td className={tdClass}>
                <div className="flex flex-wrap gap-1">
                  {listLines(s.districts).map((d, j) => (
                    <span key={j} className="rounded bg-[#0000BF]/[0.06] px-1.5 py-0.5 text-[11px] text-[#2e2a58]">
                      {d}
                    </span>
                  ))}
                </div>
              </td>
              <td className={tdClass}>{listLines(s.provinces).join(" · ") || "—"}</td>
              <td className={`${tdClass} whitespace-nowrap font-semibold tabular-nums text-[#4d47b6]`}>{s.distance || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** แก้ไขช่วงทางหลวง — พิมพ์ทีละแถว หรือวางตารางจาก Excel */
export function RouteSegmentsEditor({
  value,
  onChange,
}: {
  value: HighwaySegment[];
  onChange: (next: HighwaySegment[]) => void;
}) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const parsed = useMemo(() => parseSegmentsFromText(pasteText), [pasteText]);

  const patch = (i: number, k: keyof HighwaySegment, v: string) =>
    onChange(value.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const inputClass = "w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-700">ช่วงทางหลวง ({value.length})</span>
        <button
          type="button"
          className="rounded-lg border border-[#dcd8f0] bg-white px-2.5 py-1 text-xs font-semibold text-[#4d47b6] hover:bg-[#0000BF]/5"
          onClick={() => setPasteOpen((o) => !o)}
        >
          วางจาก Excel
        </button>
        <button
          type="button"
          className="rounded-lg border border-[#dcd8f0] bg-white px-2.5 py-1 text-xs font-semibold text-[#4d47b6] hover:bg-[#0000BF]/5"
          onClick={() => onChange([...value, emptySegment()])}
        >
          + เพิ่มแถว
        </button>
        {value.length ? (
          <button
            type="button"
            className="ml-auto text-[11px] font-medium text-rose-600 hover:underline"
            onClick={() => confirm("ล้างช่วงทางหลวงทั้งหมด?") && onChange([])}
          >
            ล้างทั้งหมด
          </button>
        ) : null}
      </div>

      {pasteOpen ? (
        <div className="rounded-xl border border-[#e8e6fc] bg-[#faf9ff] p-2.5">
          <textarea
            rows={5}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-[11px] text-slate-800"
            placeholder="คัดลอกตาราง (ลำดับ · หมายเลขทางหลวง · อำเภอ · จังหวัด · ระยะทาง) จาก Excel แล้ววางที่นี่"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-slate-600">อ่านได้ {parsed.length} แถว</span>
            <button
              type="button"
              disabled={!parsed.length}
              className="rounded-lg bg-[#0000BF] px-2.5 py-1 text-xs font-bold text-white disabled:opacity-40"
              onClick={() => {
                onChange(parsed);
                setPasteText("");
                setPasteOpen(false);
              }}
            >
              แทนที่ทั้งหมด
            </button>
            <button
              type="button"
              disabled={!parsed.length}
              className="rounded-lg border border-[#dcd8f0] bg-white px-2.5 py-1 text-xs font-semibold text-[#4d47b6] disabled:opacity-40"
              onClick={() => {
                onChange([...value, ...parsed]);
                setPasteText("");
                setPasteOpen(false);
              }}
            >
              ต่อท้าย
            </button>
          </div>
        </div>
      ) : null}

      {value.length ? (
        <div className="max-h-80 overflow-auto rounded-xl border border-[#e8e6fc]">
          <table className="w-full min-w-[40rem] border-collapse">
            <thead className="sticky top-0 bg-[#f5f3ff]">
              <tr>
                <th className={`${thClass} w-8 text-center`}>#</th>
                <th className={thClass}>หมายเลขทางหลวง</th>
                <th className={thClass}>อำเภอ (คั่นด้วย /)</th>
                <th className={thClass}>จังหวัด</th>
                <th className={`${thClass} w-32`}>ระยะทาง</th>
                <th className={`${thClass} w-20`} />
              </tr>
            </thead>
            <tbody>
              {value.map((s, i) => (
                <tr key={i}>
                  <td className="border-b border-[#ecebff] px-1 py-1 text-center text-[11px] font-bold text-[#4d47b6]">{i + 1}</td>
                  {(["highway", "districts", "provinces", "distance"] as const).map((k) => (
                    <td key={k} className="border-b border-[#ecebff] px-1 py-1">
                      <input className={inputClass} value={s[k]} onChange={(e) => patch(i, k, e.target.value)} />
                    </td>
                  ))}
                  <td className="whitespace-nowrap border-b border-[#ecebff] px-1 py-1 text-center">
                    <button type="button" className="px-1 text-xs text-slate-500 hover:text-[#0000BF]" onClick={() => move(i, -1)} aria-label="เลื่อนขึ้น">
                      ↑
                    </button>
                    <button type="button" className="px-1 text-xs text-slate-500 hover:text-[#0000BF]" onClick={() => move(i, 1)} aria-label="เลื่อนลง">
                      ↓
                    </button>
                    <button
                      type="button"
                      className="px-1 text-xs text-rose-500 hover:text-rose-700"
                      onClick={() => onChange(value.filter((_, j) => j !== i))}
                      aria-label="ลบแถว"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

/** แผนที่เส้นทางแบบเต็มจอ (จุดบริการ / Google Maps) */
export function RouteMapViewer({
  route,
  locations,
  onClose,
  autoStartNav = false,
}: {
  route: RouteMaster | null;
  locations: GeoLocationCode[];
  onClose: () => void;
  /** เปิดโหมดนำทาง GPS มือถือทันที */
  autoStartNav?: boolean;
}) {
  const stops = useMemo(() => (route ? routeMapStops(route, locations) : null), [route, locations]);
  const [tab, setTab] = useState<"route" | "places">("places");
  const [places, setPlaces] = useState<RoutePlace[]>([]);

  useEffect(() => {
    if (!route) return;
    let alive = true;
    setPlaces([]);
    setTab("places");
    apiJson<RoutePlace[]>(`/api/route-master/${route.id}/places`)
      .then((rows) => alive && setPlaces(rows))
      .catch(() => alive && setPlaces([]));
    return () => {
      alive = false;
    };
  }, [route]);

  useEffect(() => {
    if (!route) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [route, onClose]);

  if (!route || !stops) return null;
  const title = route.name ?? `${route.startLocation} → ${route.endLocation}`;

  return createPortal(
    <div className="print:hidden fixed inset-0 z-[200] flex h-[100dvh] w-screen flex-col bg-[#1e1b3a]" role="dialog" aria-modal="true">
      <div className="flex h-12 shrink-0 items-center gap-3 bg-[#2e2a58] px-3 text-white shadow-md sm:px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">แผนที่เส้นทาง · {title}</p>
          <p className="truncate text-[11px] text-white/60">
            {Number(route.distanceKm).toLocaleString("th-TH", { maximumFractionDigits: 1 })} กม. · จุดผ่าน {stops.waypoints.length} จุด
          </p>
        </div>
        <div className="flex shrink-0 rounded-lg bg-white/10 p-0.5 text-xs font-semibold">
          {(
            [
              ["places", `เส้นทาง + จุดบริการ (${places.length})`],
              ["route", "Google Maps"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-md px-2.5 py-1 transition ${tab === id ? "bg-white text-[#2e2a58]" : "text-white/80 hover:bg-white/10"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <a
          href={googleMapsDirectionsUrl(stops)}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/90 hover:bg-white/10 sm:block"
        >
          เปิดใน Google Maps
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-white/90 hover:bg-white/15"
        >
          ✕
        </button>
      </div>
      {tab === "places" ? (
        <RoutePlacesMap route={route} places={places} locations={locations} autoStartNav={autoStartNav} />
      ) : (
        <iframe title={`แผนที่ ${title}`} src={googleMapsEmbedUrl(stops)} className="min-h-0 w-full flex-1 border-0 bg-white" loading="lazy" />
      )}
    </div>,
    document.body,
  );
}
