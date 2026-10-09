import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFormJson, apiJson } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { prepareImageFileForUpload } from "../lib/prepareImageFileForUpload";
import { mediaUrl } from "../lib/uiTokens";
import {
  INCIDENT_CATEGORIES,
  INCIDENT_GROUPS,
  INCIDENT_OTHER,
  OTHER_GROUP,
  SEVERITY_OPTIONS,
  incidentGroupOf,
  formatDelay,
  formatIncidentTime,
  severityMeta,
  type MissionIncident,
  type MissionIncidentSeverity,
} from "../lib/missionIncidents";
import { DateTimeField } from "./DateTimeField";
import { Modal, ModalFormActions, ModalFormBody } from "./Modal";

type Props = {
  missionId: string;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  onCountChange?: (count: number) => void;
};

type FormState = {
  occurredAt: string;
  category: string;
  otherCategory: string;
  severity: MissionIncidentSeverity;
  location: string;
  description: string;
  actionTaken: string;
  delayMinutes: string;
  cargoAffected: boolean;
  resolved: boolean;
  reportedBy: string;
};

const inputCls =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-[#0000BF] focus:ring-2 focus:ring-[#0000BF]/20";

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultOccurredAt(start?: string | null, end?: string | null): string {
  const now = new Date();
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (s && !Number.isNaN(s.getTime()) && (now < s || (e && !Number.isNaN(e.getTime()) && now > e))) return toLocalInput(s);
  return toLocalInput(now);
}

function isPresetCategory(c: string): boolean {
  return (INCIDENT_CATEGORIES as readonly string[]).includes(c);
}

async function uploadIncidentPhotos(missionId: string, incidentId: string, files: File[]) {
  if (!files.length) return;
  const fd = new FormData();
  for (const f of files) fd.append("files", await prepareImageFileForUpload(f));
  await apiFormJson(`/api/missions/${missionId}/incidents/${incidentId}/photos`, fd);
}

function PendingPreviews({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  if (!files.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {urls.map((u, i) => (
        <span key={u} className="relative">
          <img src={u} alt={files[i].name} className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[11px] font-bold text-white shadow"
            aria-label="เอารูปออก"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

export function MissionIncidentsPanel({ missionId, plannedStart, plannedEnd, onCountChange }: Props) {
  const { user } = useAuth();
  const reporterDefault = user?.fullName?.trim() || user?.username || "";
  const [rows, setRows] = useState<MissionIncident[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<MissionIncident | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await apiJson<MissionIncident[]>(`/api/missions/${missionId}/incidents`, { skipCache: true });
      setRows(list);
      onCountChange?.(list.length);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดบันทึกเหตุการณ์ไม่สำเร็จ");
    }
  }, [missionId, onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  function patch(p: Partial<FormState>) {
    setForm((f) => (f ? { ...f, ...p } : f));
  }

  function openAdd() {
    setEditing(null);
    setForm({
      occurredAt: defaultOccurredAt(plannedStart, plannedEnd),
      category: INCIDENT_CATEGORIES[0],
      otherCategory: "",
      severity: "MEDIUM",
      location: "",
      description: "",
      actionTaken: "",
      delayMinutes: "",
      cargoAffected: false,
      resolved: true,
      reportedBy: reporterDefault,
    });
    setPendingFiles([]);
    setFormOpen(true);
  }

  function openEdit(r: MissionIncident) {
    setEditing(r);
    const preset = isPresetCategory(r.category);
    setForm({
      occurredAt: toLocalInput(new Date(r.occurredAt)),
      category: preset ? r.category : INCIDENT_OTHER,
      otherCategory: preset ? "" : r.category,
      severity: r.severity,
      location: r.location ?? "",
      description: r.description,
      actionTaken: r.actionTaken ?? "",
      delayMinutes: r.delayMinutes ? String(r.delayMinutes) : "",
      cargoAffected: r.cargoAffected,
      resolved: r.resolved,
      reportedBy: r.reportedBy ?? "",
    });
    setPendingFiles([]);
    setFormOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const category = form.category === INCIDENT_OTHER ? form.otherCategory.trim() : form.category;
    if (!category) {
      alert("กรุณาระบุประเภทเหตุการณ์");
      return;
    }
    const occurred = new Date(form.occurredAt);
    if (Number.isNaN(occurred.getTime())) {
      alert("กรุณาระบุวันเวลาที่เกิดเหตุ");
      return;
    }
    const body = JSON.stringify({
      occurredAt: occurred.toISOString(),
      category,
      severity: form.severity,
      location: form.location,
      description: form.description,
      actionTaken: form.actionTaken,
      delayMinutes: form.delayMinutes.trim() === "" ? null : Number(form.delayMinutes),
      cargoAffected: form.cargoAffected,
      resolved: form.resolved,
      reportedBy: form.reportedBy,
    });
    setSaving(true);
    try {
      const saved = editing
        ? await apiJson<MissionIncident>(`/api/missions/${missionId}/incidents/${editing.id}`, { method: "PUT", body })
        : await apiJson<MissionIncident>(`/api/missions/${missionId}/incidents`, { method: "POST", body });
      if (pendingFiles.length) {
        try {
          await uploadIncidentPhotos(missionId, saved.id, pendingFiles);
        } catch (e3) {
          alert(`บันทึกเหตุการณ์แล้ว แต่แนบรูปไม่สำเร็จ: ${e3 instanceof Error ? e3.message : ""}`);
        }
      }
      setPendingFiles([]);
      setFormOpen(false);
      await load();
    } catch (e2) {
      alert(e2 instanceof Error ? e2.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function addPhotos(r: MissionIncident, files: File[]) {
    if (!files.length) return;
    setUploadingId(r.id);
    try {
      await uploadIncidentPhotos(missionId, r.id, files);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "แนบรูปไม่สำเร็จ");
    } finally {
      setUploadingId(null);
    }
  }

  async function removePhoto(r: MissionIncident, photoId: string) {
    if (!confirm("ลบรูปนี้?")) return;
    try {
      await apiJson(`/api/missions/${missionId}/incidents/${r.id}/photos/${photoId}`, { method: "DELETE" });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบรูปไม่สำเร็จ");
    }
  }

  async function remove(r: MissionIncident) {
    if (!confirm(`ลบบันทึกเหตุการณ์ «${r.category}» เวลา ${formatIncidentTime(r.occurredAt)} ?`)) return;
    try {
      await apiJson(`/api/missions/${missionId}/incidents/${r.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  const list = rows ?? [];
  const highCount = list.filter((r) => r.severity === "HIGH").length;
  const openCount = list.filter((r) => !r.resolved).length;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          เหตุการณ์ไม่ปกติระหว่างทริป
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{list.length}</span>
        </h2>
        {highCount ? (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">
            รุนแรง {highCount}
          </span>
        ) : null}
        {openCount ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200">
            ยังไม่ยุติ {openCount}
          </span>
        ) : null}
        <button
          type="button"
          onClick={openAdd}
          className="ml-auto rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-3.5 py-1.5 text-xs font-bold text-white shadow-md hover:opacity-95"
        >
          + บันทึกเหตุการณ์
        </button>
      </div>

      {err ? <p className="px-4 py-3 text-sm text-rose-600">{err}</p> : null}
      {rows === null && !err ? <p className="px-4 py-6 text-center text-sm text-slate-400">กำลังโหลด…</p> : null}
      {rows !== null && list.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-400">
          ไม่มีเหตุการณ์ผิดปกติ — รายงานผลการปฏิบัติจะระบุว่า «ไม่มีเหตุการณ์ผิดปกติ»
        </p>
      ) : null}

      {list.length ? (
        <ol className="relative space-y-0 px-4 py-3">
          {list.map((r, idx) => {
            const sev = severityMeta(r.severity);
            const delay = formatDelay(r.delayMinutes);
            return (
              <li key={r.id} className="relative flex gap-3 pb-4 last:pb-0">
                {idx < list.length - 1 ? (
                  <span className="absolute left-[5px] top-4 h-full w-px bg-slate-200" aria-hidden />
                ) : null}
                <span className={`relative mt-1.5 h-3 w-3 shrink-0 rounded-full ring-4 ring-white ${sev.dot}`} aria-hidden />
                <div className="min-w-0 flex-1 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-bold tabular-nums text-slate-500">{formatIncidentTime(r.occurredAt)}</span>
                    <span className="text-sm font-bold text-slate-900">{r.category}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${incidentGroupOf(r.category).chip}`}>
                      {incidentGroupOf(r.category).label}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${sev.chip}`}>{sev.label}</span>
                    {!r.resolved ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">ยังไม่ยุติ</span>
                    ) : null}
                    {r.cargoAffected ? (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                        ทรัพย์สินได้รับผลกระทบ
                      </span>
                    ) : null}
                  </div>
                  {r.location ? <p className="mt-0.5 text-xs text-slate-500">สถานที่: {r.location}</p> : null}
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{r.description}</p>
                  {r.actionTaken ? (
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-600">
                      <span className="font-semibold text-slate-700">การแก้ไข: </span>
                      {r.actionTaken}
                    </p>
                  ) : null}
                  {r.photos?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.photos.map((p) => {
                        const url = mediaUrl(p.fileUrl);
                        return (
                          <span key={p.id} className="group relative">
                            <a href={url ?? undefined} target="_blank" rel="noreferrer" title={p.originalName ?? "ดูรูป"}>
                              <img
                                src={url ?? undefined}
                                alt={p.originalName ?? "รูปเหตุการณ์"}
                                loading="lazy"
                                className="h-20 w-20 rounded-lg border border-slate-200 bg-white object-cover transition hover:opacity-90"
                              />
                            </a>
                            <button
                              type="button"
                              onClick={() => void removePhoto(r, p.id)}
                              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[11px] font-bold text-white shadow sm:hidden sm:group-hover:flex"
                              aria-label="ลบรูป"
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    {delay ? <span>ล่าช้า {delay}</span> : null}
                    {r.reportedBy ? <span>ผู้บันทึก: {r.reportedBy}</span> : null}
                    <span className="ml-auto flex gap-1">
                      <label
                        className={`cursor-pointer rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700 hover:bg-indigo-100 ${
                          uploadingId === r.id ? "pointer-events-none opacity-60" : ""
                        }`}
                      >
                        {uploadingId === r.id ? "กำลังอัปโหลด…" : "แนบรูป"}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files ?? []);
                            e.target.value = "";
                            void addPhotos(r, files);
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-800 hover:bg-amber-100"
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(r)}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 font-medium text-rose-600 hover:bg-rose-100"
                      >
                        ลบ
                      </button>
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}

      <Modal
        open={formOpen && form != null}
        onClose={() => setFormOpen(false)}
        title={editing ? "แก้ไขบันทึกเหตุการณ์ไม่ปกติ" : "บันทึกเหตุการณ์ไม่ปกติ"}
        size="form"
      >
        {form ? (
          <form onSubmit={(e) => void save(e)}>
            <ModalFormBody className="!space-y-0 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <DateTimeField
                  id="incident-occurred-at"
                  label="วันเวลาที่เกิดเหตุ"
                  value={form.occurredAt}
                  onChange={(v) => patch({ occurredAt: v })}
                />
              </div>
              <label className={form.category === INCIDENT_OTHER ? "" : "sm:col-span-2"}>
                <span className="text-xs font-semibold text-slate-600">ประเภทเหตุการณ์</span>
                <select className={inputCls} value={form.category} onChange={(e) => patch({ category: e.target.value })}>
                  {INCIDENT_GROUPS.map((g) => (
                    <optgroup key={g.key} label={g.label}>
                      {g.categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <optgroup label={OTHER_GROUP.label}>
                    <option value={INCIDENT_OTHER}>{INCIDENT_OTHER} (ระบุเอง)</option>
                  </optgroup>
                </select>
              </label>
              {form.category === INCIDENT_OTHER ? (
                <label>
                  <span className="text-xs font-semibold text-slate-600">ระบุประเภท</span>
                  <input
                    required
                    className={inputCls}
                    value={form.otherCategory}
                    onChange={(e) => patch({ otherCategory: e.target.value })}
                  />
                </label>
              ) : null}
              <div className="sm:col-span-2">
                <span className="text-xs font-semibold text-slate-600">ระดับความรุนแรง</span>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {SEVERITY_OPTIONS.map((o) => {
                    const active = form.severity === o.key;
                    return (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() => patch({ severity: o.key })}
                        className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-sm font-semibold transition ${
                          active ? `${o.chip} ring-2` : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <span className={`h-2.5 w-2.5 rounded-full ${o.dot}`} />
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="sm:col-span-2">
                <span className="text-xs font-semibold text-slate-600">สถานที่ / จุดที่เกิดเหตุ</span>
                <input
                  className={inputCls}
                  value={form.location}
                  onChange={(e) => patch({ location: e.target.value })}
                  placeholder="เช่น ถ.มิตรภาพ กม.152 ขาเข้า"
                />
              </label>
              <label className="sm:col-span-2">
                <span className="text-xs font-semibold text-slate-600">รายละเอียดเหตุการณ์</span>
                <textarea
                  required
                  className={`${inputCls} min-h-[5rem]`}
                  value={form.description}
                  onChange={(e) => patch({ description: e.target.value })}
                />
              </label>
              <label className="sm:col-span-2">
                <span className="text-xs font-semibold text-slate-600">การแก้ไข / การดำเนินการ</span>
                <textarea
                  className={`${inputCls} min-h-[4rem]`}
                  value={form.actionTaken}
                  onChange={(e) => patch({ actionTaken: e.target.value })}
                  placeholder="ไม่บังคับ"
                />
              </label>
              <label>
                <span className="text-xs font-semibold text-slate-600">ความล่าช้า (นาที)</span>
                <input
                  type="number"
                  min={0}
                  step={5}
                  className={inputCls}
                  value={form.delayMinutes}
                  onChange={(e) => patch({ delayMinutes: e.target.value })}
                  placeholder="0"
                />
              </label>
              <label>
                <span className="text-xs font-semibold text-slate-600">ผู้บันทึก</span>
                <input className={inputCls} value={form.reportedBy} onChange={(e) => patch({ reportedBy: e.target.value })} />
              </label>
              <div className="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-rose-600"
                    checked={form.cargoAffected}
                    onChange={(e) => patch({ cargoAffected: e.target.checked })}
                  />
                  ทรัพย์สิน / ตู้สินค้าได้รับผลกระทบ
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                    checked={form.resolved}
                    onChange={(e) => patch({ resolved: e.target.checked })}
                  />
                  แก้ไขเรียบร้อยแล้ว
                </label>
              </div>
              <div className="sm:col-span-2">
                <span className="text-xs font-semibold text-slate-600">
                  รูปประกอบ{editing?.photos?.length ? ` (มีแล้ว ${editing.photos.length} รูป — เพิ่มได้อีก)` : ""}
                </span>
                <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-600 hover:border-[#0000BF]/40 hover:bg-[#0000BF]/5">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 7h3l2-3h8l2 3h3v13H3z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  ถ่าย / เลือกรูป
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      e.target.value = "";
                      setPendingFiles((prev) => [...prev, ...files]);
                    }}
                  />
                </label>
                <PendingPreviews
                  files={pendingFiles}
                  onRemove={(i) => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                />
              </div>
            </ModalFormBody>
            <ModalFormActions>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 disabled:opacity-60"
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
        ) : null}
      </Modal>
    </section>
  );
}
