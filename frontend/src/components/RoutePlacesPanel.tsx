import { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson } from "../api/client";
import { googleMapsSearchUrl, routeSegments, segmentAreaLabel } from "../lib/routeSegments";
import type { RouteMaster, RoutePlace, RoutePlaceKind } from "../types";
import { Modal, ModalFormActions, ModalFormBody } from "./Modal";

export const ROUTE_PLACE_KINDS: { id: RoutePlaceKind; label: string; search: string; chip: string; dot: string }[] = [
  { id: "FUEL", label: "ปั๊มน้ำมัน", search: "ปั๊มน้ำมัน", chip: "bg-emerald-500/12 text-emerald-800", dot: "bg-emerald-500" },
  { id: "REPAIR", label: "ร้านซ่อมรถ", search: "อู่ซ่อมรถ", chip: "bg-sky-500/12 text-sky-800", dot: "bg-sky-500" },
  { id: "TIRE", label: "ปะยาง", search: "ร้านปะยาง", chip: "bg-amber-500/15 text-amber-800", dot: "bg-amber-500" },
  { id: "POLICE", label: "สถานีตำรวจ", search: "สถานีตำรวจ", chip: "bg-blue-600/12 text-blue-800", dot: "bg-blue-700" },
  { id: "MILITARY", label: "หน่วยทหาร", search: "หน่วยทหาร ค่ายทหาร", chip: "bg-lime-600/15 text-lime-800", dot: "bg-lime-700" },
  { id: "OTHER", label: "อื่นๆ", search: "", chip: "bg-violet-500/12 text-violet-800", dot: "bg-violet-500" },
];

const kindMeta = (k: RoutePlaceKind) =>
  ROUTE_PLACE_KINDS.find((x) => x.id === k) ?? ROUTE_PLACE_KINDS[ROUTE_PLACE_KINDS.length - 1];

const inputClass = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900";
const smallBtn = "rounded-lg border px-2 py-0.5 text-[11px] font-medium";

type FormState = {
  kind: RoutePlaceKind;
  name: string;
  segmentIndex: string;
  location: string;
  phone: string;
  mapUrl: string;
  note: string;
  isFavorite: boolean;
};

function emptyForm(kind: RoutePlaceKind = "FUEL"): FormState {
  return { kind, name: "", segmentIndex: "", location: "", phone: "", mapUrl: "", note: "", isFavorite: false };
}

export function RoutePlacesPanel({ route, onChanged }: { route: RouteMaster; onChanged?: () => void }) {
  const segments = useMemo(() => routeSegments(route), [route]);
  const [places, setPlaces] = useState<RoutePlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<RoutePlaceKind | "">("");
  const [favOnly, setFavOnly] = useState(false);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [searchSeg, setSearchSeg] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RoutePlace | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setPlaces(await apiJson<RoutePlace[]>(`/api/route-master/${route.id}/places`));
    } finally {
      setLoading(false);
    }
  }, [route.id]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const shown = useMemo(
    () =>
      places.filter(
        (p) => (!kindFilter || p.kind === kindFilter) && (!favOnly || p.isFavorite) && (!pendingOnly || !p.verified),
      ),
    [places, kindFilter, favOnly, pendingOnly],
  );
  const pendingCount = places.filter((p) => !p.verified).length;

  const segmentLabel = (i: number | null) => {
    if (i == null || !segments[i]) return "";
    return `ช่วง ${i + 1} · ${segments[i].highway}`;
  };

  const searchArea = searchSeg !== "" && segments[Number(searchSeg)] ? segmentAreaLabel(segments[Number(searchSeg)]) : "";

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm(kindFilter || "FUEL"), segmentIndex: searchSeg });
    setFormOpen(true);
  }

  function openEdit(p: RoutePlace) {
    setEditing(p);
    setForm({
      kind: p.kind,
      name: p.name,
      segmentIndex: p.segmentIndex != null ? String(p.segmentIndex) : "",
      location: p.location,
      phone: p.phone,
      mapUrl: p.mapUrl ?? "",
      note: p.note ?? "",
      isFavorite: p.isFavorite,
    });
    setFormOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body = JSON.stringify({ ...form, segmentIndex: form.segmentIndex === "" ? null : Number(form.segmentIndex) });
      if (editing) await apiJson(`/api/route-master/places/${editing.id}`, { method: "PUT", body });
      else await apiJson(`/api/route-master/${route.id}/places`, { method: "POST", body });
      setFormOpen(false);
      await load();
      onChanged?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function patchPlace(p: RoutePlace, patch: Partial<Pick<RoutePlace, "isFavorite" | "verified">>) {
    setPlaces((list) => list.map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
    try {
      await apiJson(`/api/route-master/places/${p.id}`, { method: "PUT", body: JSON.stringify(patch) });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      await load();
    }
  }

  async function remove(p: RoutePlace) {
    if (!confirm(`ลบ «${p.name}» ?`)) return;
    try {
      await apiJson(`/api/route-master/places/${p.id}`, { method: "DELETE" });
      await load();
      onChanged?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  function mapLink(p: RoutePlace) {
    if (p.mapUrl) return p.mapUrl;
    if (p.lat != null && p.lng != null) return googleMapsSearchUrl(`${p.lat},${p.lng}`);
    const area = p.location || (p.segmentIndex != null && segments[p.segmentIndex] ? segmentAreaLabel(segments[p.segmentIndex]) : "");
    return googleMapsSearchUrl([p.name, area].filter(Boolean).join(" "));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="mr-1 text-xs font-black text-[#4d47b6]">จุดบริการระหว่างทาง ({places.length})</p>
        {[{ id: "" as const, label: "ทั้งหมด" }, ...ROUTE_PLACE_KINDS].map((k) => {
          const active = kindFilter === k.id;
          const count = k.id ? places.filter((p) => p.kind === k.id).length : places.length;
          return (
            <button
              key={k.id || "all"}
              type="button"
              onClick={() => setKindFilter(k.id)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition ${
                active ? "bg-[#0000BF] text-white shadow" : "bg-white text-[#2e2a58] ring-1 ring-[#dcd8f0] hover:bg-[#0000BF]/5"
              }`}
            >
              {k.label} {count}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setFavOnly((v) => !v)}
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition ${
            favOnly ? "bg-amber-400 text-white shadow" : "bg-white text-amber-700 ring-1 ring-amber-200 hover:bg-amber-50"
          }`}
        >
          ★ ชื่นชอบ {places.filter((p) => p.isFavorite).length}
        </button>
        {pendingCount ? (
          <button
            type="button"
            onClick={() => setPendingOnly((v) => !v)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition ${
              pendingOnly ? "bg-fuchsia-500 text-white shadow" : "bg-white text-fuchsia-700 ring-1 ring-fuchsia-200 hover:bg-fuchsia-50"
            }`}
          >
            AI รอตรวจ {pendingCount}
          </button>
        ) : null}
        <button
          type="button"
          onClick={openAdd}
          className="ml-auto rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-3 py-1 text-xs font-bold text-white shadow"
        >
          + เพิ่มจุดบริการ
        </button>
      </div>

      {segments.length ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#e8e6fc] bg-[#faf9ff] px-2.5 py-2">
          <span className="text-[11px] font-bold text-[#4d47b6]">ค้นหาบน Google Maps ใกล้</span>
          <select
            className="max-w-[16rem] rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800"
            value={searchSeg}
            onChange={(e) => setSearchSeg(e.target.value)}
          >
            <option value="">— เลือกช่วงทางหลวง —</option>
            {segments.map((s, i) => (
              <option key={i} value={i}>
                {i + 1}. {s.highway} ({segmentAreaLabel(s)})
              </option>
            ))}
          </select>
          {ROUTE_PLACE_KINDS.filter((k) => k.search).map((k) => (
            <a
              key={k.id}
              href={searchArea ? googleMapsSearchUrl(`${k.search} ${searchArea}`) : undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!searchArea}
              className={`${smallBtn} border-[#dcd8f0] bg-white text-[#2e2a58] ${
                searchArea ? "hover:bg-[#0000BF]/5" : "pointer-events-none opacity-40"
              }`}
            >
              {k.label}
            </a>
          ))}
        </div>
      ) : null}

      {loading ? (
        <p className="py-4 text-center text-xs text-slate-500">กำลังโหลด…</p>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#dcd8f0] px-3 py-6 text-center text-xs text-slate-500">
          {places.length ? "ไม่มีรายการที่ตรงกับตัวกรอง" : "ยังไม่มีจุดบริการ — กด «+ เพิ่มจุดบริการ»"}
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {shown.map((p) => {
            const meta = kindMeta(p.kind);
            return (
              <li
                key={p.id}
                className={`relative rounded-xl border bg-white p-2.5 pl-3 shadow-sm ${
                  p.isFavorite ? "border-amber-300 ring-1 ring-amber-200" : "border-[#e8e6fc]"
                }`}
              >
                <span className={`absolute inset-y-2 left-0 w-1 rounded-r ${meta.dot}`} aria-hidden />
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${meta.chip}`}>{meta.label}</span>
                      {!p.verified ? (
                        <span className="rounded bg-fuchsia-500/12 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-700">AI · รอตรวจ</span>
                      ) : null}
                      <p className="min-w-0 truncate text-sm font-semibold text-[#1e1b3a]">{p.name}</p>
                    </div>
                    {p.rating != null || p.openingHours ? (
                      <p className="mt-0.5 text-[11px] text-slate-600">
                        {[p.rating != null ? `★ ${p.rating.toFixed(1)}` : "", p.openingHours ?? ""].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                    {segmentLabel(p.segmentIndex) ? (
                      <p className="mt-0.5 truncate text-[11px] text-[#4d47b6]">{segmentLabel(p.segmentIndex)}</p>
                    ) : null}
                    {p.location ? <p className="mt-0.5 text-[11px] text-slate-600">{p.location}</p> : null}
                    {p.phone ? (
                      <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="mt-0.5 inline-block text-[12px] font-semibold text-[#5b61ff] hover:underline">
                        {p.phone}
                      </a>
                    ) : null}
                    {p.note ? <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-amber-800">{p.note}</p> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void patchPlace(p, { isFavorite: !p.isFavorite })}
                    aria-label={p.isFavorite ? "เลิกชื่นชอบ" : "ชื่นชอบ"}
                    title={p.isFavorite ? "เลิกชื่นชอบ" : "ชื่นชอบ"}
                    className={`shrink-0 text-xl leading-none transition hover:scale-110 ${p.isFavorite ? "text-amber-400" : "text-slate-300 hover:text-amber-300"}`}
                  >
                    {p.isFavorite ? "★" : "☆"}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[#ecebff] pt-1.5">
                  {!p.verified ? (
                    <button
                      type="button"
                      className={`${smallBtn} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
                      onClick={() => void patchPlace(p, { verified: true })}
                    >
                      ยืนยันข้อมูล
                    </button>
                  ) : null}
                  <a href={mapLink(p)} target="_blank" rel="noopener noreferrer" className={`${smallBtn} border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100`}>
                    แผนที่
                  </a>
                  <button type="button" className={`${smallBtn} border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100`} onClick={() => openEdit(p)}>
                    แก้ไข
                  </button>
                  <button type="button" className={`${smallBtn} border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100`} onClick={() => void remove(p)}>
                    ลบ
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "แก้ไขจุดบริการ" : "เพิ่มจุดบริการ"}
        overlayZClass="z-[100]"
      >
        <form onSubmit={(e) => void submit(e)}>
          <ModalFormBody className="!grid !space-y-0 gap-3 sm:grid-cols-2">
            <label>
              <span className="text-xs font-medium text-slate-700">ประเภท</span>
              <select className={inputClass} value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as RoutePlaceKind }))}>
                {ROUTE_PLACE_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-end gap-2 pb-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-amber-400"
                checked={form.isFavorite}
                onChange={(e) => setForm((f) => ({ ...f, isFavorite: e.target.checked }))}
              />
              <span className="text-sm text-amber-700">★ ชื่นชอบ</span>
            </label>
            <label className="sm:col-span-2">
              <span className="text-xs font-medium text-slate-700">ชื่อสถานที่</span>
              <input
                required
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="เช่น ปตท. สาขาตาคลี"
              />
            </label>
            {segments.length ? (
              <label className="sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">อยู่ช่วงทางหลวง</span>
                <select className={inputClass} value={form.segmentIndex} onChange={(e) => setForm((f) => ({ ...f, segmentIndex: e.target.value }))}>
                  <option value="">— ไม่ระบุ —</option>
                  {segments.map((s, i) => (
                    <option key={i} value={i}>
                      {i + 1}. {s.highway} ({segmentAreaLabel(s)}) {s.distance}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              <span className="text-xs font-medium text-slate-700">ที่ตั้ง / กม.</span>
              <input
                className={inputClass}
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="เช่น กม.315 ขาขึ้น อ.ตาคลี"
              />
            </label>
            <label>
              <span className="text-xs font-medium text-slate-700">เบอร์โทร</span>
              <input type="tel" className={inputClass} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </label>
            <label className="sm:col-span-2">
              <span className="text-xs font-medium text-slate-700">ลิงก์ Google Maps (ไม่บังคับ)</span>
              <input
                className={inputClass}
                value={form.mapUrl}
                onChange={(e) => setForm((f) => ({ ...f, mapUrl: e.target.value }))}
                placeholder="https://maps.app.goo.gl/…"
              />
            </label>
            <label className="sm:col-span-2">
              <span className="text-xs font-medium text-slate-700">หมายเหตุ</span>
              <textarea
                rows={2}
                className={inputClass}
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="เช่น เปิด 24 ชม. · จอดรถใหญ่ได้ · มีห้องน้ำ"
              />
            </label>
          </ModalFormBody>
          <ModalFormActions>
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => setFormOpen(false)}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>
    </div>
  );
}
