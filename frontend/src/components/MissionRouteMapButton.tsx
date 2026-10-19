import { useCallback, useState } from "react";
import { apiJson } from "../api/client";
import type { GeoLocationCode } from "../lib/routeSegments";
import type { RouteMaster } from "../types";
import { RouteMapViewer } from "./RouteHighwaySegments";

/**
 * ปุ่มเปิดแผนที่เส้นทางของภารกิจ (แผนที่เดียวกับหน้าเส้นทางภารกิจ)
 * นำทาง = GPS มือถือผู้เปิดแผนที่ (snap เข้าเส้นทาง) — ยังไม่ติดตาม GPS รถจริง
 * (fleet telematics รอแหล่งพิกัดชัดเจนก่อน)
 */
export function MissionRouteMapButton({
  routeId,
  className,
  label = "แผนที่",
  autoStartNav = false,
}: {
  routeId: string | null | undefined;
  className: string;
  label?: string;
  /** เปิดแล้วเริ่มโหมดนำทางทันที (เหมาะกับภารกิจกำลังทำ) */
  autoStartNav?: boolean;
}) {
  const [route, setRoute] = useState<RouteMaster | null>(null);
  const [locations, setLocations] = useState<GeoLocationCode[]>([]);
  const [busy, setBusy] = useState(false);
  const [navOnOpen, setNavOnOpen] = useState(false);
  const close = useCallback(() => {
    setRoute(null);
    setNavOnOpen(false);
  }, []);

  if (!routeId) return null;

  async function open(withNav: boolean) {
    if (busy || !routeId) return;
    setBusy(true);
    try {
      const [r, locs] = await Promise.all([
        apiJson<RouteMaster>(`/api/route-master/${routeId}`),
        apiJson<GeoLocationCode[]>("/api/route-master/locations").catch(() => [] as GeoLocationCode[]),
      ]);
      setLocations(locs);
      setNavOnOpen(withNav || autoStartNav);
      setRoute(r);
    } catch (e) {
      alert(e instanceof Error ? e.message : "เปิดแผนที่ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className} disabled={busy} onClick={() => void open(autoStartNav)}>
        {busy ? "กำลังเปิด…" : label}
      </button>
      <RouteMapViewer route={route} locations={locations} onClose={close} autoStartNav={navOnOpen} />
    </>
  );
}
