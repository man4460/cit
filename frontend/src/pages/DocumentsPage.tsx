import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFormJson, apiJson } from "../api/client";
import { CrudNameMasterModal } from "../components/CrudNameMasterModal";
import { Modal, ModalFormActions, ModalFormBody, ModalFormSection } from "../components/Modal";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { PrintA4Table } from "../components/PrintA4Table";
import { rowMatchesFilter } from "../lib/searchNormalize";
import {
  listCardAccentClass,
  listCardClass,
  toolbarMasterBtnClass,
  toolbarMasterGroupClass,
  toolbarPrimaryBtnClass,
} from "../lib/uiTokens";
import type { DocumentType, LibraryDocument } from "../types";

/** ใช้ path /uploads/… บน origin ปัจจุบัน เพื่อให้ Vite proxy ชี้ไป backend ตอน dev */
function fileUrlForEmbed(fileUrl: string): string {
  try {
    const u = new URL(fileUrl);
    if (u.pathname.startsWith("/uploads/")) return `${u.pathname}${u.search}${u.hash}`;
    return fileUrl;
  } catch {
    return fileUrl;
  }
}

type LibraryEmbedKind = "pdf" | "image" | "text" | "none";

function libraryEmbedKind(doc: Pick<LibraryDocument, "mimeType" | "originalName" | "fileUrl">): LibraryEmbedKind {
  if (!doc.fileUrl) return "none";
  const mt = (doc.mimeType || "").toLowerCase();
  const name = (doc.originalName || "").toLowerCase();
  const pathOnly = fileUrlForEmbed(doc.fileUrl).split("?")[0].toLowerCase();
  if (mt === "application/pdf" || name.endsWith(".pdf") || pathOnly.endsWith(".pdf")) return "pdf";
  if (mt.startsWith("image/")) return "image";
  if (mt === "image/svg+xml" || name.endsWith(".svg")) return "image";
  if (mt === "text/plain" || name.endsWith(".txt") || name.endsWith(".csv")) return "text";
  return "none";
}

function emptyDocForm() {
  return { title: "", documentTypeId: "", details: "", file: null as File | null };
}

export function DocumentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<LibraryDocument[]>([]);
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [listFilter, setListFilter] = useState("");
  /** "" = ทั้งหมด, "none" = ไม่ระบุหมวด, อื่นๆ = id หมวด */
  const [categoryFilter, setCategoryFilter] = useState("");
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LibraryDocument | null>(null);
  const [form, setForm] = useState(emptyDocForm);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<LibraryDocument | null>(null);

  const viewFileSrc = useMemo(
    () => (viewing?.fileUrl ? fileUrlForEmbed(viewing.fileUrl) : ""),
    [viewing?.fileUrl],
  );
  const viewEmbedKind = useMemo(() => (viewing ? libraryEmbedKind(viewing) : "none"), [viewing]);

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

  useEffect(() => {
    const raw = searchParams.get("category")?.trim() ?? "";
    if (!raw || !types.length) return;
    if (raw === "none") {
      setCategoryFilter("none");
      return;
    }
    const byName = types.find((t) => t.name === raw);
    if (byName) setCategoryFilter(byName.id);
  }, [searchParams, types]);

  useEffect(() => {
    if (!categoryFilter || categoryFilter === "none") return;
    if (!types.some((t) => t.id === categoryFilter)) setCategoryFilter("");
  }, [types, categoryFilter]);

  const filteredRows = useMemo(
    () =>
      rows.filter((d) => {
        if (categoryFilter === "none") {
          if (d.documentTypeId) return false;
        } else if (categoryFilter) {
          if (d.documentTypeId !== categoryFilter) return false;
        }
        return rowMatchesFilter(listFilter, [
          d.title,
          d.details,
          d.documentType?.name,
          d.originalName,
          d.extractedText,
        ]);
      }),
    [rows, listFilter, categoryFilter],
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

  function closeView() {
    setViewing(null);
    void load();
  }

  async function openView(d: LibraryDocument) {
    setViewing(d);
    try {
      const fresh = await apiJson<LibraryDocument>(`/api/library-documents/${d.id}`);
      setViewing((v) => (v?.id === d.id ? fresh : v));
    } catch {
      /* ใช้ข้อมูลจากรายการถ้าโหลดรายละเอียดไม่ได้ */
    }
  }

  return (
    <div>
      <PageHeaderBar
        title="คลังเอกสาร"
        count={filteredRows.length}
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "คลังเอกสาร",
          placeholder: "กรองชื่อรายการ / หมวดหมู่ / รายละเอียด / ชื่อไฟล์…",
        }}
        segments={
          <label className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#e8e6fc] bg-[#faf9ff]/90 px-2 shadow-sm sm:h-9 sm:px-2.5">
            <span className="hidden text-[11px] font-bold text-[#4d47b6] sm:inline sm:text-xs">หมวด</span>
            <select
              aria-label="กรองตามหมวดหมู่"
              className="max-w-[9.5rem] cursor-pointer border-0 bg-transparent py-0.5 text-[11px] font-semibold text-[#2e2a58] outline-none sm:max-w-[12rem] sm:text-xs"
              value={categoryFilter}
              onChange={(e) => {
                const v = e.target.value;
                setCategoryFilter(v);
                const next = new URLSearchParams(searchParams);
                if (!v) next.delete("category");
                else if (v === "none") next.set("category", "none");
                else {
                  const name = types.find((t) => t.id === v)?.name;
                  if (name) next.set("category", name);
                  else next.delete("category");
                }
                setSearchParams(next, { replace: true });
              }}
            >
              <option value="">ทั้งหมด ({rows.length})</option>
              <option value="none">ไม่ระบุ ({rows.filter((d) => !d.documentTypeId).length})</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({rows.filter((d) => d.documentTypeId === t.id).length})
                </option>
              ))}
            </select>
          </label>
        }
        masters={
          <div className={toolbarMasterGroupClass}>
            <button type="button" onClick={() => setTypeModalOpen(true)} className={toolbarMasterBtnClass}>
              หมวดหมู่
            </button>
          </div>
        }
        primary={
          <button type="button" onClick={openAdd} className={toolbarPrimaryBtnClass}>
            เพิ่มเอกสาร
          </button>
        }
      />

      <CrudNameMasterModal
        title="จัดการหมวดหมู่เอกสาร"
        apiPath="/api/document-types"
        open={typeModalOpen}
        onClose={() => setTypeModalOpen(false)}
        onChanged={() => void load()}
      />

      <Modal open={!!viewing} onClose={closeView} title="ดูเอกสาร" size="viewer">
        {viewing ? (
          <ModalFormBody className="!space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#1e1b3a]">{viewing.title}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {viewing.documentType?.name ? (
                    <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                      {viewing.documentType.name}
                    </span>
                  ) : null}
                </div>
              </div>
              {viewing.fileUrl ? (
                <a
                  href={viewFileSrc || viewing.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-[#5b61ff] hover:bg-slate-100"
                >
                  เปิดในแท็บใหม่
                </a>
              ) : null}
            </div>

            {viewing.fileUrl ? (
              viewEmbedKind !== "none" ? (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-inner">
                  {viewEmbedKind === "image" ? (
                    <img
                      src={viewFileSrc}
                      alt={viewing.originalName || viewing.title}
                      className="mx-auto max-h-[min(72vh,880px)] w-full object-contain"
                    />
                  ) : (
                    <iframe
                      title={viewing.title}
                      src={viewFileSrc}
                      className="h-[min(72vh,880px)] w-full border-0 bg-white/90"
                    />
                  )}
                </div>
              ) : (
                <p className="rounded-xl border border-amber-900/40 bg-amber-50 p-4 text-sm text-amber-800">
                  รูปแบบไฟล์นี้ไม่สามารถแสดงในหน้าต่างนี้ได้ — กด «เปิดในแท็บใหม่» หรือลิงก์ด้านล่าง
                </p>
              )
            ) : (
              <p className="text-sm text-slate-600">ไม่มีไฟล์แนบ</p>
            )}

            {viewing.fileUrl ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                <span>ไฟล์:</span>
                <a
                  href={viewFileSrc || viewing.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#5b61ff] underline-offset-2 hover:underline"
                >
                  {viewing.originalName || "ดาวน์โหลด / เปิดไฟล์"}
                </a>
              </div>
            ) : null}

            {viewing.details?.trim() ? (
              <div>
                <p className="text-xs font-medium text-slate-700">รายละเอียด</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{viewing.details}</p>
              </div>
            ) : null}
            <div className="flex justify-end border-t border-slate-200 pt-3">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                onClick={closeView}
              >
                ปิด
              </button>
            </div>
          </ModalFormBody>
        ) : null}
      </Modal>

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
                  <span className="text-xs font-medium text-slate-700">ชื่อรายการ</span>
                  <input
                    required
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">หมวดหมู่</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
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
                  <span className="text-xs font-medium text-slate-700">รายละเอียด</span>
                  <textarea
                    rows={10}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    placeholder="ข้อความเต็ม คำอธิบาย อ้างอิง…"
                    value={form.details}
                    onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">
                    ไฟล์แนบ {editing?.fileUrl ? "(เว้นว่าง = คงไฟล์เดิม)" : ""}
                  </span>
                  <input
                    type="file"
                    className="mt-1 w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-[#0000BF]/10 file:px-3 file:py-2 file:text-sm file:text-[#2e2a58]"
                    onChange={(e) =>
                      setForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))
                    }
                  />
                  {editing?.originalName ? (
                    <p className="mt-1 text-[11px] text-slate-600">ปัจจุบัน: {editing.originalName}</p>
                  ) : null}
                </label>
              </div>
            </ModalFormSection>
          </ModalFormBody>
          <ModalFormActions>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] px-4 py-2 disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              onClick={closeForm}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      <div className="mt-6 print:hidden">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white/75 py-16 text-center text-slate-600">
            กำลังโหลด…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/90/30 py-16 text-center text-slate-600">
            ยังไม่มีเอกสาร — กด «เพิ่มเอกสาร»
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white/75 py-16 text-center text-slate-600">
            ไม่มีรายการที่ตรงกับการกรอง
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-inner">
            <div className="max-h-[calc(100vh-16rem)] min-h-[200px] overflow-y-auto overscroll-contain rounded-xl pr-1 [scrollbar-gutter:stable]">
              <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {filteredRows.map((d, idx) => (
                  <li key={d.id}>
                    <div className={`${listCardClass} min-h-[7rem] p-3`}>
                      <span className={`absolute inset-y-0 left-0 w-1 ${listCardAccentClass(idx)}`} aria-hidden />
                      <div className="min-w-0 flex-1 pl-2">
                        <p className="line-clamp-2 text-sm font-semibold leading-snug text-[#1e1b3a]">{d.title}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {d.documentType?.name ? (
                            <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                              {d.documentType.name}
                            </span>
                          ) : (
                            <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[10px] text-slate-600">
                              ไม่ระบุหมวดหมู่
                            </span>
                          )}
                        </div>
                        {d.details?.trim() ? (
                          <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-700">
                            {d.details}
                          </p>
                        ) : null}
                        {d.fileUrl ? (
                          <a
                            href={d.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-block truncate text-[11px] text-[#5b61ff] underline-offset-2 hover:text-[#4d47b6] hover:underline"
                            title={d.originalName ?? undefined}
                          >
                            {d.originalName || "เปิดไฟล์แนบ"}
                          </a>
                        ) : (
                          <p className="mt-2 text-[11px] text-slate-600">ไม่มีไฟล์แนบ</p>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-[#ecebff] pt-2 pl-2">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-sky-600 hover:bg-slate-100"
                          onClick={() => void openView(d)}
                        >
                          ดูเอกสาร
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                          onClick={() => openEdit(d)}
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100"
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

      <PrintA4Table
        columns={[
          { label: "ชื่อเรื่อง" },
          { label: "หมวด" },
          { label: "รายละเอียด" },
          { label: "ไฟล์" },
        ]}
        rows={filteredRows.map((d) => [
          d.title,
          d.documentType?.name || "ไม่ระบุหมวดหมู่",
          (d.details || "—").replace(/\s+/g, " "),
          d.originalName || (d.fileUrl ? "มีไฟล์แนบ" : "—"),
        ])}
      />
    </div>
  );
}
