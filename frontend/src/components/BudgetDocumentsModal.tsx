import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFormJson, apiJson } from "../api/client";
import { rowMatchesFilter } from "../lib/searchNormalize";
import {
  mediaUrl,
  toolbarLinkBtnClass,
  toolbarMasterBtnClass,
  toolbarMasterGroupClass,
  toolbarPrimaryBtnClass,
} from "../lib/uiTokens";
import type { NameMasterRow } from "../types";
import { CrudNameMasterModal } from "./CrudNameMasterModal";
import { Modal, ModalFormActions, ModalFormBody, ModalFormSection } from "./Modal";

export type BudgetDocumentBucket = string;

export type BudgetDocumentRow = {
  id: string;
  bucketKey: string;
  title: string;
  notes: string | null;
  categoryId: string | null;
  categoryName: string | null;
  fileUrl: string;
  mimeType: string | null;
  originalName: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

const OFFICE_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation";

function fileBadge(doc: Pick<BudgetDocumentRow, "mimeType" | "originalName" | "fileUrl">): {
  label: string;
  className: string;
} {
  const name = (doc.originalName || doc.fileUrl || "").toLowerCase();
  const mt = (doc.mimeType || "").toLowerCase();
  if (mt.includes("pdf") || name.endsWith(".pdf")) {
    return { label: "PDF", className: "bg-red-50 text-red-800 ring-red-200" };
  }
  if (mt.includes("word") || name.endsWith(".doc") || name.endsWith(".docx")) {
    return { label: "Word", className: "bg-blue-50 text-blue-800 ring-blue-200" };
  }
  if (mt.includes("sheet") || mt.includes("excel") || name.endsWith(".xls") || name.endsWith(".xlsx")) {
    return { label: "Excel", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" };
  }
  if (mt.includes("presentation") || mt.includes("powerpoint") || name.endsWith(".ppt") || name.endsWith(".pptx")) {
    return { label: "PPT", className: "bg-orange-50 text-orange-800 ring-orange-200" };
  }
  return { label: "ไฟล์", className: "bg-slate-50 text-slate-700 ring-slate-200" };
}

function openFile(url: string) {
  const href = mediaUrl(url) || url;
  window.open(href, "_blank", "noopener,noreferrer");
}

type FormState = {
  mode: "create" | "edit";
  id: string | null;
  title: string;
  categoryId: string;
  notes: string;
  file: File | null;
  existingUrl: string | null;
  existingName: string | null;
};

type Props = {
  open: boolean;
  bucket: BudgetDocumentBucket;
  isAdmin: boolean;
  onClose: () => void;
};

export function BudgetDocumentsModal({ open, bucket, isAdmin, onClose }: Props) {
  const [items, setItems] = useState<BudgetDocumentRow[]>([]);
  const [categories, setCategories] = useState<NameMasterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [catMgrOpen, setCatMgrOpen] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [docsRes, cats] = await Promise.all([
        apiJson<{ items: BudgetDocumentRow[] }>(`/api/budget/documents?bucket=${bucket}`),
        apiJson<NameMasterRow[]>("/api/budget/document-categories").catch(() => [] as NameMasterRow[]),
      ]);
      setItems(docsRes.items ?? []);
      setCategories(cats);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดเอกสารไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [bucket]);

  useEffect(() => {
    if (!open) {
      setForm(null);
      setFilter("");
      setCategoryFilter("");
      setCatMgrOpen(false);
      setErr(null);
      return;
    }
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!categoryFilter || categoryFilter === "none") return;
    if (!categories.some((c) => c.id === categoryFilter)) setCategoryFilter("");
  }, [categories, categoryFilter]);

  const filtered = useMemo(
    () =>
      items.filter((d) => {
        if (categoryFilter === "none") {
          if (d.categoryId) return false;
        } else if (categoryFilter) {
          if (d.categoryId !== categoryFilter) return false;
        }
        return rowMatchesFilter(filter, [d.title, d.notes, d.categoryName, d.originalName]);
      }),
    [items, filter, categoryFilter],
  );

  function openCreate() {
    setErr(null);
    setForm({
      mode: "create",
      id: null,
      title: "",
      categoryId: categoryFilter && categoryFilter !== "none" ? categoryFilter : "",
      notes: "",
      file: null,
      existingUrl: null,
      existingName: null,
    });
  }

  function openEdit(doc: BudgetDocumentRow) {
    setErr(null);
    setForm({
      mode: "edit",
      id: doc.id,
      title: doc.title,
      categoryId: doc.categoryId ?? "",
      notes: doc.notes ?? "",
      file: null,
      existingUrl: doc.fileUrl,
      existingName: doc.originalName,
    });
  }

  function backToList() {
    if (saving) return;
    setForm(null);
    setErr(null);
  }

  function handleClose() {
    if (saving) return;
    if (form) {
      backToList();
      return;
    }
    onClose();
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const title = form.title.trim();
    if (!title) {
      setErr("กรุณากรอกชื่อหัวข้อเอกสาร");
      return;
    }
    if (form.mode === "create" && !form.file) {
      setErr("กรุณาแนบไฟล์ Word / Excel / PowerPoint / PDF");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("bucket", bucket);
      fd.append("title", title);
      fd.append("notes", form.notes.trim());
      fd.append("categoryId", form.categoryId.trim());
      if (form.file) fd.append("file", form.file);

      if (form.mode === "edit" && form.id) {
        await apiFormJson<BudgetDocumentRow>(`/api/budget/documents/${form.id}`, fd, "PATCH");
      } else {
        await apiFormJson<BudgetDocumentRow>("/api/budget/documents", fd, "POST");
      }
      setForm(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function removeDoc(doc: BudgetDocumentRow) {
    if (!confirm(`ลบเอกสาร «${doc.title}» ?`)) return;
    setErr(null);
    try {
      await apiJson(`/api/budget/documents/${doc.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  const modalTitle = form
    ? form.mode === "create"
      ? "เพิ่มเอกสาร"
      : "แก้ไขเอกสาร"
    : `เอกสารปี ${bucket}`;

  return (
    <>
      <Modal open={open} onClose={handleClose} title={modalTitle} size="wide">
        {form ? (
          <form onSubmit={(e) => void submitForm(e)}>
            <ModalFormBody>
              {err ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {err}
                </p>
              ) : null}
              <ModalFormSection title="ข้อมูลเอกสาร">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-slate-700">
                      ชื่อหัวข้อเอกสาร <span className="text-rose-500">*</span>
                    </span>
                    <input
                      required
                      autoFocus
                      maxLength={160}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="เช่น แผนคำของบปี 2570"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-slate-700">หมวดหมู่</span>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                      value={form.categoryId}
                      onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                    >
                      <option value="">— ไม่ระบุ —</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-slate-700">
                      ไฟล์แนบ {form.mode === "edit" ? "(เว้นว่าง = คงไฟล์เดิม)" : ""}{" "}
                      {form.mode === "create" ? <span className="text-rose-500">*</span> : null}
                    </span>
                    <input
                      type="file"
                      accept={OFFICE_ACCEPT}
                      className="mt-1 w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-[#0000BF]/10 file:px-3 file:py-2 file:text-sm file:text-[#2e2a58]"
                      onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })}
                    />
                    {form.file ? (
                      <p className="mt-1 text-[11px] font-semibold text-[#2e2a58]">{form.file.name}</p>
                    ) : form.existingName || form.existingUrl ? (
                      <p className="mt-1 text-[11px] text-slate-600">
                        ปัจจุบัน: {form.existingName || "ไฟล์แนบ"}
                        {form.existingUrl ? (
                          <>
                            {" · "}
                            <button
                              type="button"
                              className="font-bold text-[#4d47b6] hover:underline"
                              onClick={() => openFile(form.existingUrl!)}
                            >
                              เปิด
                            </button>
                          </>
                        ) : null}
                      </p>
                    ) : (
                      <p className="mt-1 text-[11px] text-slate-500">.doc .docx .xls .xlsx .ppt .pptx .pdf</p>
                    )}
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-slate-700">หมายเหตุ</span>
                    <textarea
                      rows={4}
                      maxLength={600}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    />
                  </label>
                </div>
              </ModalFormSection>
            </ModalFormBody>
            <ModalFormActions>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] disabled:opacity-50"
              >
                {saving ? "กำลังบันทึก…" : "บันทึก"}
              </button>
              <button
                type="button"
                disabled={saving}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                onClick={backToList}
              >
                ยกเลิก
              </button>
            </ModalFormActions>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="กรองชื่อ / หมวด / หมายเหตุ / ชื่อไฟล์…"
                className="h-9 min-w-[12rem] flex-1 rounded-xl border border-[#e8e6fc] bg-[#faf9ff]/90 px-3 text-xs font-semibold text-[#2e2a58] outline-none focus:border-[#0000BF]/40 sm:text-sm"
              />
              <label className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#e8e6fc] bg-[#faf9ff]/90 px-2.5 shadow-sm">
                <span className="hidden text-[11px] font-bold text-[#4d47b6] sm:inline sm:text-xs">หมวด</span>
                <select
                  aria-label="กรองตามหมวดหมู่"
                  className="max-w-[9.5rem] cursor-pointer border-0 bg-transparent py-0.5 text-[11px] font-semibold text-[#2e2a58] outline-none sm:max-w-[12rem] sm:text-xs"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="">ทั้งหมด</option>
                  <option value="none">ไม่ระบุ</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {isAdmin ? (
                <div className={toolbarMasterGroupClass}>
                  <button type="button" className={toolbarMasterBtnClass} onClick={() => setCatMgrOpen(true)}>
                    หมวดหมู่
                  </button>
                  <button type="button" className={toolbarPrimaryBtnClass} onClick={openCreate}>
                    เพิ่มเอกสาร
                  </button>
                </div>
              ) : null}
            </div>

            {err ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {err}
              </p>
            ) : null}

            {loading ? (
              <p className="py-10 text-center text-sm text-slate-500">กำลังโหลด…</p>
            ) : items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#e8e6fc] py-12 text-center text-sm text-slate-500">
                ยังไม่มีเอกสาร{isAdmin ? " — กด «เพิ่มเอกสาร»" : ""}
              </p>
            ) : filtered.length === 0 ? (
              <p className="rounded-xl border border-[#e8e6fc] py-12 text-center text-sm text-slate-500">
                ไม่มีรายการที่ตรงกับการกรอง
              </p>
            ) : (
              <ul className="divide-y divide-[#ecebff] overflow-hidden rounded-xl border border-[#e8e6fc]">
                {filtered.map((doc) => {
                  const badge = fileBadge(doc);
                  return (
                    <li key={doc.id} className="flex items-start gap-3 px-3 py-2.5 hover:bg-[#0000BF]/[0.03]">
                      <button
                        type="button"
                        onClick={() => openFile(doc.fileUrl)}
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[10px] font-black ring-1 ${badge.className}`}
                        title="เปิดไฟล์"
                      >
                        {badge.label}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-[#1e1b4b]">{doc.title}</p>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {doc.categoryName ? (
                            <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                              {doc.categoryName}
                            </span>
                          ) : null}
                        </div>
                        {doc.notes?.trim() ? (
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-600">{doc.notes}</p>
                        ) : null}
                        <p className="mt-0.5 truncate text-[10px] text-slate-400">
                          {doc.originalName || "ไฟล์แนบ"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        <button
                          type="button"
                          className="text-[11px] font-bold text-[#4d47b6] hover:underline"
                          onClick={() => openFile(doc.fileUrl)}
                        >
                          เปิด
                        </button>
                        {isAdmin ? (
                          <>
                            <button
                              type="button"
                              className="text-[11px] font-bold text-[#4d47b6] hover:underline"
                              onClick={() => openEdit(doc)}
                            >
                              แก้ไข
                            </button>
                            <button
                              type="button"
                              className="text-[11px] font-bold text-rose-600 hover:underline"
                              onClick={() => void removeDoc(doc)}
                            >
                              ลบ
                            </button>
                          </>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {!isAdmin ? (
              <div className="flex justify-end">
                <button type="button" className={toolbarLinkBtnClass} onClick={onClose}>
                  ปิด
                </button>
              </div>
            ) : null}
          </div>
        )}
      </Modal>

      <CrudNameMasterModal
        title="จัดการหมวดหมู่เอกสารงบ"
        apiPath="/api/budget/document-categories"
        open={catMgrOpen}
        onClose={() => setCatMgrOpen(false)}
        onChanged={() => void load()}
      />
    </>
  );
}
