import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFormJson, apiJson } from "../api/client";
import { Modal, ModalFormActions, ModalFormBody, ModalFormSection } from "../components/Modal";
import { PageFilterPrintBar } from "../components/PageFilterPrintBar";
import { rowMatchesFilter } from "../lib/searchNormalize";
import type { DocumentType, LibraryDocument } from "../types";

type MasterRow = { id: string; name: string; sortOrder: number };

function DocumentTypeMasterModal({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const apiPath = "/api/document-types";
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<MasterRow | null>(null);
  const [editName, setEditName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await apiJson<MasterRow[]>(apiPath));
  }, []);

  useEffect(() => {
    if (open) {
      setErr(null);
      setEditing(null);
      void load();
    }
  }, [open, load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await apiJson(apiPath, { method: "POST", body: JSON.stringify({ name: newName.trim() }) });
      setNewName("");
      onChanged();
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ");
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setErr(null);
    try {
      await apiJson(`${apiPath}/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editName.trim() }),
      });
      setEditing(null);
      onChanged();
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function remove(r: MasterRow) {
    if (!confirm(`ลบประเภท "${r.name}" ?`)) return;
    setErr(null);
    try {
      await apiJson(`${apiPath}/${r.id}`, { method: "DELETE" });
      onChanged();
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="ประเภทเอกสาร (เพิ่ม / แก้ไข / ลบ)">
      <ModalFormBody className="!space-y-4">
        {err && <p className="text-sm text-rose-400">{err}</p>}
        <form onSubmit={add} className="flex gap-2">
          <input
            placeholder="เช่น หนังสือ, คำสั่ง, ระเบียบ"
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" className="shrink-0 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white">
            เพิ่ม
          </button>
        </form>
        {editing ? (
          <form onSubmit={saveEdit} className="rounded-lg border border-teal-900/40 bg-slate-950/50 p-3">
            <p className="text-xs text-slate-500">แก้ไข</p>
            <input
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <div className="mt-2 flex gap-2">
              <button type="submit" className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm text-white">
                บันทึก
              </button>
              <button type="button" className="text-sm text-slate-400" onClick={() => setEditing(null)}>
                ยกเลิก
              </button>
            </div>
          </form>
        ) : null}
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm"
            >
              <span className="truncate text-slate-200">{r.name}</span>
              <span className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className="rounded px-2 py-0.5 text-xs text-teal-400 hover:bg-slate-800"
                  onClick={() => {
                    setEditing(r);
                    setEditName(r.name);
                  }}
                >
                  แก้ไข
                </button>
                <button
                  type="button"
                  className="rounded px-2 py-0.5 text-xs text-rose-400 hover:bg-slate-800"
                  onClick={() => void remove(r)}
                >
                  ลบ
                </button>
              </span>
            </li>
          ))}
        </ul>
      </ModalFormBody>
    </Modal>
  );
}

function emptyDocForm() {
  return { title: "", documentTypeId: "", details: "", file: null as File | null };
}

export function DocumentsPage() {
  const [rows, setRows] = useState<LibraryDocument[]>([]);
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [listFilter, setListFilter] = useState("");
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LibraryDocument | null>(null);
  const [form, setForm] = useState(emptyDocForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [docs, t] = await Promise.all([
        apiJson<LibraryDocument[]>("/api/library-documents"),
        apiJson<DocumentType[]>("/api/document-types"),
      ]);
      setRows(docs);
      setTypes(t);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(
    () =>
      rows.filter((d) =>
        rowMatchesFilter(listFilter, [
          d.title,
          d.details,
          d.documentType?.name,
          d.originalName,
        ]),
      ),
    [rows, listFilter],
  );

  function openAdd() {
    setEditing(null);
    setForm(emptyDocForm());
    setFormOpen(true);
  }

  function openEdit(d: LibraryDocument) {
    setEditing(d);
    setForm({
      title: d.title,
      documentTypeId: d.documentTypeId ?? "",
      details: d.details,
      file: null,
    });
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  async function submitDoc(e: React.FormEvent) {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) {
      alert("กรอกชื่อรายการ");
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("title", title);
      fd.append("details", form.details);
      fd.append("documentTypeId", form.documentTypeId.trim());
      if (form.file) fd.append("file", form.file);

      if (editing) {
        await apiFormJson<LibraryDocument>(`/api/library-documents/${editing.id}`, fd, "PUT");
      } else {
        await apiFormJson<LibraryDocument>("/api/library-documents", fd, "POST");
      }
      closeForm();
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function removeDoc(d: LibraryDocument) {
    if (!confirm(`ลบเอกสาร «${d.title}» ?`)) return;
    try {
      await apiJson(`/api/library-documents/${d.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">คลังเอกสาร</h1>
          <p className="mt-1 text-slate-400">ชื่อรายการ ประเภท รายละเอียด และไฟล์แนบ</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTypeModalOpen(true)}
            className="shrink-0 rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            จัดการประเภทเอกสาร
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="shrink-0 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/25 hover:bg-teal-500"
          >
            เพิ่มเอกสาร
          </button>
        </div>
      </div>

      <PageFilterPrintBar
        value={listFilter}
        onChange={setListFilter}
        printTitle="คลังเอกสาร"
        placeholder="กรองชื่อรายการ / ประเภท / รายละเอียด / ชื่อไฟล์…"
      />

      <DocumentTypeMasterModal
        open={typeModalOpen}
        onClose={() => setTypeModalOpen(false)}
        onChanged={() => void load()}
      />

      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editing ? "แก้ไขเอกสาร" : "เพิ่มเอกสาร"}
        size="wide"
      >
        <form onSubmit={(e) => void submitDoc(e)}>
          <ModalFormBody>
            <ModalFormSection title="ข้อมูลเอกสาร">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-400">ชื่อรายการ</span>
                  <input
                    required
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-400">ประเภท</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    value={form.documentTypeId}
                    onChange={(e) => setForm((f) => ({ ...f, documentTypeId: e.target.value }))}
                  >
                    <option value="">— ไม่ระบุ —</option>
                    {types.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-400">รายละเอียด</span>
                  <textarea
                    rows={10}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    placeholder="ข้อความเต็ม คำอธิบาย อ้างอิง…"
                    value={form.details}
                    onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-400">
                    ไฟล์แนบ {editing?.fileUrl ? "(เว้นว่าง = คงไฟล์เดิม)" : ""}
                  </span>
                  <input
                    type="file"
                    className="mt-1 w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-sm file:text-white"
                    onChange={(e) =>
                      setForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))
                    }
                  />
                  {editing?.originalName ? (
                    <p className="mt-1 text-[11px] text-slate-500">ปัจจุบัน: {editing.originalName}</p>
                  ) : null}
                </label>
              </div>
            </ModalFormSection>
          </ModalFormBody>
          <ModalFormActions>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              onClick={closeForm}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      <div className="mt-6">
        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 py-16 text-center text-slate-500">
            กำลังโหลด…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 py-16 text-center text-slate-500">
            ยังไม่มีเอกสาร — กด «เพิ่มเอกสาร»
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 py-16 text-center text-slate-500">
            ไม่มีรายการที่ตรงกับการกรอง
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3 shadow-inner">
            <div className="max-h-[calc(100vh-16rem)] min-h-[200px] overflow-y-auto overscroll-contain rounded-xl pr-1 [scrollbar-gutter:stable]">
              <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {filteredRows.map((d) => (
                  <li key={d.id}>
                    <div className="flex h-full min-h-[7rem] flex-col rounded-xl border border-slate-800 bg-slate-900/50 p-3 shadow-sm transition hover:border-teal-800/45 hover:bg-slate-900/80">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold leading-snug text-white">{d.title}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {d.documentType?.name ? (
                            <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
                              {d.documentType.name}
                            </span>
                          ) : (
                            <span className="rounded bg-slate-700/40 px-1.5 py-0.5 text-[10px] text-slate-500">
                              ไม่ระบุประเภท
                            </span>
                          )}
                        </div>
                        {d.details?.trim() ? (
                          <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-500">
                            {d.details}
                          </p>
                        ) : null}
                        {d.fileUrl ? (
                          <a
                            href={d.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-block truncate text-[11px] text-teal-400 underline-offset-2 hover:text-teal-300 hover:underline"
                            title={d.originalName ?? undefined}
                          >
                            {d.originalName || "เปิดไฟล์แนบ"}
                          </a>
                        ) : (
                          <p className="mt-2 text-[11px] text-slate-600">ไม่มีไฟล์แนบ</p>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-800/80 pt-2">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-600 px-2.5 py-1 text-xs font-medium text-teal-400 hover:bg-slate-800"
                          onClick={() => openEdit(d)}
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-600 px-2.5 py-1 text-xs font-medium text-rose-400 hover:bg-slate-800"
                          onClick={() => void removeDoc(d)}
                        >
                          ลบ
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
