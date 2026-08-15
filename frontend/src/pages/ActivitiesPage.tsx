import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFormJson, apiJson } from "../api/client";
import { DetailField } from "../components/DetailField";
import { ImageLightbox } from "../components/ImageLightbox";
import { Modal, ModalFormActions, ModalFormBody } from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { PrintA4Table } from "../components/PrintA4Table";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { prepareFilesForUpload } from "../lib/prepareImageFileForUpload";
import { listCardAccentClass, listCardClass, toolbarPrimaryBtnClass } from "../lib/uiTokens";

type WorkTaskStatus = "TODO" | "IN_PROGRESS" | "DONE";

type WorkTaskPhoto = {
  id: string;
  workTaskId: string;
  fileUrl: string;
  mimeType: string;
  originalName: string | null;
  sortOrder: number;
  createdAt: string;
};

type Activity = {
  id: string;
  title: string;
  notionUrl: string | null;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  recordedBy: string | null;
  status: WorkTaskStatus;
  sortOrder: number;
  createdAt: string;
  photos: WorkTaskPhoto[];
};

const statuses: WorkTaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];

const statusLabel: Record<WorkTaskStatus, string> = {
  TODO: "รอดำเนินการ",
  IN_PROGRESS: "กำลังทำ",
  DONE: "เสร็จแล้ว",
};

const activityStatusChip: Record<WorkTaskStatus, string> = {
  TODO: "bg-amber-500/15 text-amber-800",
  IN_PROGRESS: "bg-[#0000BF]/12 text-[#4d47b6]",
  DONE: "bg-emerald-500/15 text-emerald-700",
};

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

export function ActivitiesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Activity[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [recordedBy, setRecordedBy] = useState("");
  const [notionUrl, setNotionUrl] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [status, setStatus] = useState<WorkTaskStatus>("TODO");
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [lightboxUrls, setLightboxUrls] = useState<string[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxTitle, setLightboxTitle] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState("");
  const [detail, setDetail] = useState<Activity | null>(null);

  const filteredItems = useMemo(
    () =>
      items.filter((a) =>
        rowMatchesFilter(listFilter, [
          a.title,
          a.description,
          a.location,
          a.recordedBy,
          statusLabel[a.status],
          a.notionUrl,
        ]),
      ),
    [items, listFilter],
  );

  const load = useCallback(async () => {
    setItems(await apiJson<Activity[]>("/api/tasks"));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setLocation("");
    setRecordedBy(user?.fullName || user?.username || "");
    setNotionUrl("");
    setStartsAt("");
    setEndsAt("");
    setStatus("TODO");
    setPendingPhotos([]);
    setErr(null);
    setModalOpen(true);
  }

  function openEdit(a: Activity) {
    setDetail(null);
    setEditingId(a.id);
    setTitle(a.title);
    setDescription(a.description ?? "");
    setLocation(a.location ?? "");
    setRecordedBy(a.recordedBy ?? "");
    setNotionUrl(a.notionUrl ?? "");
    setStartsAt(toDatetimeLocalValue(a.startsAt));
    setEndsAt(toDatetimeLocalValue(a.endsAt));
    setStatus(a.status);
    setPendingPhotos([]);
    setErr(null);
    setModalOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const body = {
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      recordedBy: recordedBy.trim() || null,
      notionUrl: notionUrl.trim() || null,
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      status,
    };

    try {
      let id = editingId;
      if (editingId) {
        await apiJson(`/api/tasks/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        const created = await apiJson<Activity>("/api/tasks", {
          method: "POST",
          body: JSON.stringify(body),
        });
        id = created.id;
      }

      if (pendingPhotos.length && id) {
        const prepared = await prepareFilesForUpload(pendingPhotos);
        const fd = new FormData();
        for (const f of prepared) fd.append("photos", f);
        await apiFormJson<WorkTaskPhoto[]>(`/api/tasks/${id}/photos`, fd);
      }

      setModalOpen(false);
      setPendingPhotos([]);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function setTaskStatus(id: string, s: WorkTaskStatus) {
    await apiJson(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ status: s }) });
    await load();
  }

  async function removeTask(id: string) {
    if (!confirm("ลบกิจกรรมนี้?")) return;
    await apiJson(`/api/tasks/${id}`, { method: "DELETE" });
    setDetail(null);
    await load();
  }

  async function removePhoto(taskId: string, photoId: string) {
    if (!confirm("ลบรูปนี้?")) return;
    await apiJson(`/api/tasks/${taskId}/photos/${photoId}`, { method: "DELETE" });
    await load();
    setDetail((cur) => {
      if (!cur || cur.id !== taskId) return cur;
      return { ...cur, photos: cur.photos.filter((p) => p.id !== photoId) };
    });
  }

  async function addPhotosToTask(taskId: string, files: FileList | null) {
    if (!files?.length) return;
    const prepared = await prepareFilesForUpload(files);
    const fd = new FormData();
    for (const f of prepared) fd.append("photos", f);
    await apiFormJson(`/api/tasks/${taskId}/photos`, fd);
    await load();
  }

  return (
    <div>
      <PageHeaderBar
        title="กิจกรรม"
        count={filteredItems.length}
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "กิจกรรม",
          placeholder: "กรองหัวข้อ / รายละเอียด / สถานที่ / ผู้บันทึก / สถานะ…",
        }}
        primary={
          <button type="button" onClick={openCreate} className={toolbarPrimaryBtnClass}>
            เพิ่มกิจกรรม
          </button>
        }
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "แก้ไขกิจกรรม" : "เพิ่มกิจกรรม"}
        size="form"
      >
        <form onSubmit={(e) => void submit(e)}>
          <ModalFormBody>
            {err && <p className="text-sm text-rose-600">{err}</p>}
            <div className="mx-auto grid w-full gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-xs text-slate-600">หัวข้อกิจกรรม</span>
                <input
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-slate-600">รายละเอียด</span>
                <textarea
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-600">ตั้งแต่เวลา</span>
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-600">ถึงเวลา</span>
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-slate-600">สถานที่</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-slate-600">ผู้บันทึก</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                  value={recordedBy}
                  onChange={(e) => setRecordedBy(e.target.value)}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-slate-600">ลิงก์ Notion (ไม่บังคับ)</span>
                <input
                  type="url"
                  placeholder="https://www.notion.so/..."
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900"
                  value={notionUrl}
                  onChange={(e) => setNotionUrl(e.target.value)}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-slate-600">สถานะ</span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as WorkTaskStatus)}
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-slate-600">
                  {editingId ? "เพิ่มรูปถ่าย (หลายไฟล์)" : "รูปถ่าย (หลายไฟล์ — อัปโหลดหลังบันทึก)"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="mt-1 w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-[#0000BF]/10 file:px-3 file:py-2 file:text-[#2e2a58]"
                  onChange={(e) => {
                    const fl = e.target.files;
                    if (!fl?.length) {
                      setPendingPhotos([]);
                      return;
                    }
                    setPendingPhotos(Array.from(fl));
                  }}
                />
              </label>
            </div>
          </ModalFormBody>
          <ModalFormActions className="justify-center">
            <button type="submit" className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] px-4 py-2">
              บันทึก
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
              onClick={() => setModalOpen(false)}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      <ImageLightbox
        open={!!lightboxUrls?.length}
        urls={lightboxUrls ?? []}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        title={lightboxTitle}
        onClose={() => setLightboxUrls(null)}
      />

      <div className="mt-6 print:hidden">
        {items.length === 0 ? (
          <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">
            ยังไม่มีกิจกรรม — กด «เพิ่มกิจกรรม»
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">
            ไม่มีรายการที่ตรงกับการกรอง
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((a, idx) => (
              <li key={a.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetail(a)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setDetail(a);
                    }
                  }}
                  className={`${listCardClass} cursor-pointer transition hover:border-[#0000BF]/35`}
                >
                  <span className={`absolute inset-y-0 left-0 w-1 ${listCardAccentClass(idx)}`} aria-hidden />
                  <div className="min-w-0 flex-1 pl-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h2 className="line-clamp-2 text-sm font-bold text-[#1e1b4b]">{a.title}</h2>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${activityStatusChip[a.status]}`}>
                        {statusLabel[a.status]}
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-600">
                      <span className="font-medium text-[#4d47b6]">เวลา</span> {formatWhen(a.startsAt)} → {formatWhen(a.endsAt)}
                    </p>
                    <p className="mt-1 truncate text-xs text-[#2e2a58]">
                      <span className="text-slate-500">สถานที่:</span> {a.location || "—"}
                    </p>
                    {a.description ? (
                      <p className="mt-2 line-clamp-2 text-xs text-slate-700">{a.description}</p>
                    ) : null}
                  </div>
                  <div
                    className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[#ecebff] pt-2.5 pl-2"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <select
                      className="rounded-lg border border-[#dcd8f0] bg-white px-2 py-1 text-xs text-slate-900"
                      value={a.status}
                      onChange={(e) => void setTaskStatus(a.id, e.target.value as WorkTaskStatus)}
                    >
                      {statuses.map((s) => (
                        <option key={s} value={s}>
                          {statusLabel[s]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                      onClick={() => openEdit(a)}
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100"
                      onClick={() => void removeTask(a.id)}
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.title ?? "รายละเอียดกิจกรรม"}
        size="wide"
      >
        {detail ? (
          <>
            <ModalFormBody>
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailField label="สถานะ" value={statusLabel[detail.status]} />
                <DetailField label="ผู้บันทึก" value={detail.recordedBy || "—"} />
                <DetailField label="เริ่ม" value={formatWhen(detail.startsAt)} />
                <DetailField label="สิ้นสุด" value={formatWhen(detail.endsAt)} />
                <DetailField label="สถานที่" value={detail.location || "—"} className="sm:col-span-2" />
                <DetailField
                  label="รายละเอียด"
                  value={detail.description ? <span className="whitespace-pre-wrap">{detail.description}</span> : "—"}
                  className="sm:col-span-2"
                />
                {detail.notionUrl ? (
                  <DetailField
                    label="Notion"
                    value={
                      <a href={detail.notionUrl} target="_blank" rel="noopener noreferrer" className="text-[#0000BF] underline">
                        เปิดลิงก์ ↗
                      </a>
                    }
                    className="sm:col-span-2"
                  />
                ) : null}
              </div>
              {detail.photos.length > 0 ? (
                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">รูปภาพ</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {detail.photos.map((p, i) => (
                      <div key={p.id} className="group relative">
                        <button
                          type="button"
                          className="overflow-hidden rounded-lg border border-[#e8e6fc]"
                          onClick={() => {
                            setLightboxTitle(detail.title);
                            setLightboxUrls(detail.photos.map((x) => x.fileUrl));
                            setLightboxIndex(i);
                          }}
                        >
                          <img src={p.fileUrl} alt="" className="h-20 w-20 object-cover" />
                        </button>
                        <button
                          type="button"
                          className="absolute -right-1 -top-1 rounded-full bg-rose-600 px-1.5 text-[10px] text-white opacity-0 group-hover:opacity-100"
                          onClick={() => void removePhoto(detail.id, p.id)}
                          title="ลบรูป"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <label className="mt-3 inline-block cursor-pointer text-[11px] font-medium text-[#0000BF] hover:underline">
                + เพิ่มรูป
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void addPhotosToTask(detail.id, e.target.files).then(async () => {
                      const next = await apiJson<Activity[]>("/api/tasks");
                      setItems(next);
                      setDetail(next.find((x) => x.id === detail.id) ?? null);
                    });
                  }}
                />
              </label>
            </ModalFormBody>
            <ModalFormActions>
              <button
                type="button"
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
                onClick={() => openEdit(detail)}
              >
                แก้ไข
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => setDetail(null)}
              >
                ปิด
              </button>
            </ModalFormActions>
          </>
        ) : null}
      </Modal>

      <PrintA4Table
        columns={[
          { label: "กิจกรรม" },
          { label: "สถานะ" },
          { label: "เริ่ม" },
          { label: "สิ้นสุด" },
          { label: "สถานที่" },
          { label: "ผู้บันทึก" },
        ]}
        rows={filteredItems.map((a) => [
          a.title,
          statusLabel[a.status],
          formatWhen(a.startsAt),
          formatWhen(a.endsAt),
          a.location || "—",
          a.recordedBy || "—",
        ])}
      />
    </div>
  );
}
