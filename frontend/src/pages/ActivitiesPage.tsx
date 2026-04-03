import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFormJson, apiJson } from "../api/client";
import { ImageLightbox } from "../components/ImageLightbox";
import { Modal, ModalFormActions, ModalFormBody } from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import { PageFilterPrintBar } from "../components/PageFilterPrintBar";
import { rowMatchesFilter } from "../lib/searchNormalize";

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
        const fd = new FormData();
        for (const f of pendingPhotos) fd.append("photos", f);
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
    await load();
  }

  async function removePhoto(taskId: string, photoId: string) {
    if (!confirm("ลบรูปนี้?")) return;
    await apiJson(`/api/tasks/${taskId}/photos/${photoId}`, { method: "DELETE" });
    await load();
  }

  async function addPhotosToTask(taskId: string, files: FileList | null) {
    if (!files?.length) return;
    const fd = new FormData();
    for (let i = 0; i < files.length; i++) fd.append("photos", files[i]!);
    await apiFormJson(`/api/tasks/${taskId}/photos`, fd);
    await load();
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">กิจกรรม</h1>
          <p className="mt-1 text-slate-400">
            หัวข้อ รายละเอียด เวลา สถานที่ ผู้บันทึก และรูปถ่ายหลายรูป — คลิกรูปเพื่อดูขนาดใหญ่
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="shrink-0 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/25 hover:bg-teal-500"
        >
          เพิ่มกิจกรรม
        </button>
      </div>

      <PageFilterPrintBar
        value={listFilter}
        onChange={setListFilter}
        printTitle="กิจกรรม"
        placeholder="กรองหัวข้อ / รายละเอียด / สถานที่ / ผู้บันทึก / สถานะ…"
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "แก้ไขกิจกรรม" : "เพิ่มกิจกรรม"}
        size="wide"
      >
        <form onSubmit={(e) => void submit(e)}>
          <ModalFormBody>
            {err && <p className="text-sm text-rose-400">{err}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-xs text-slate-400">หัวข้อกิจกรรม</span>
                <input
                  required
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-slate-400">รายละเอียด</span>
                <textarea
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400">ตั้งแต่เวลา</span>
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400">ถึงเวลา</span>
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-slate-400">สถานที่</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-slate-400">ผู้บันทึก</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  value={recordedBy}
                  onChange={(e) => setRecordedBy(e.target.value)}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-slate-400">ลิงก์ Notion (ไม่บังคับ)</span>
                <input
                  type="url"
                  placeholder="https://www.notion.so/..."
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
                  value={notionUrl}
                  onChange={(e) => setNotionUrl(e.target.value)}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-slate-400">สถานะ</span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
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
                <span className="text-xs text-slate-400">
                  {editingId ? "เพิ่มรูปถ่าย (หลายไฟล์)" : "รูปถ่าย (หลายไฟล์ — อัปโหลดหลังบันทึก)"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="mt-1 w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-white"
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
          <ModalFormActions>
            <button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white">
              บันทึก
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300"
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

      <ul className="mt-8 space-y-4">
        {items.length === 0 ? (
          <li className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-500">
            ยังไม่มีกิจกรรม — กด &quot;เพิ่มกิจกรรม&quot;
          </li>
        ) : filteredItems.length === 0 ? (
          <li className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-500">
            ไม่มีรายการที่ตรงกับการกรอง
          </li>
        ) : (
          filteredItems.map((a) => (
            <li
              key={a.id}
              className="rounded-xl border border-slate-800 bg-slate-900/40 p-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-white">{a.title}</h2>
                  <div className="mt-2 grid gap-1 text-sm text-slate-400 sm:grid-cols-2">
                    <p>
                      <span className="text-slate-500">เวลา: </span>
                      {formatWhen(a.startsAt)} → {formatWhen(a.endsAt)}
                    </p>
                    <p>
                      <span className="text-slate-500">สถานที่: </span>
                      {a.location || "—"}
                    </p>
                    <p className="sm:col-span-2">
                      <span className="text-slate-500">ผู้บันทึก: </span>
                      {a.recordedBy || "—"}
                    </p>
                  </div>
                  {a.description && <p className="mt-2 text-sm text-slate-300">{a.description}</p>}
                  {a.notionUrl && (
                    <a
                      href={a.notionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex text-sm text-teal-400 hover:text-teal-300 break-all"
                    >
                      เปิดใน Notion ↗
                    </a>
                  )}
                  {a.photos.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {a.photos.map((p, i) => (
                        <div key={p.id} className="group relative">
                          <button
                            type="button"
                            className="block overflow-hidden rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                            onClick={() => {
                              setLightboxTitle(a.title);
                              setLightboxUrls(a.photos.map((x) => x.fileUrl));
                              setLightboxIndex(i);
                            }}
                          >
                            <img
                              src={p.fileUrl}
                              alt=""
                              className="h-20 w-20 object-cover transition hover:opacity-90 sm:h-24 sm:w-24"
                            />
                          </button>
                          <button
                            type="button"
                            className="absolute -right-1 -top-1 rounded-full bg-rose-600 px-1.5 text-[10px] text-white opacity-0 group-hover:opacity-100"
                            onClick={() => void removePhoto(a.id, p.id)}
                            title="ลบรูป"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <label className="mt-3 inline-block cursor-pointer text-xs text-teal-500 hover:text-teal-400">
                    + เพิ่มรูป
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => void addPhotosToTask(a.id, e.target.files)}
                    />
                  </label>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-800 pt-3 lg:border-t-0 lg:pt-0">
                  <select
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white"
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
                    className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                    onClick={() => openEdit(a)}
                  >
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
                    onClick={() => void removeTask(a.id)}
                  >
                    ลบ
                  </button>
                </div>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
