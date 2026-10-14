import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiFormJson, apiJson } from "../api/client";
import { Modal, ModalFormActions, ModalFormBody, ModalFormSection } from "../components/Modal";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { PrintA4Table } from "../components/PrintA4Table";
import type { LoadOptions } from "../lib/loadOptions";
import { setLoadBusy } from "../lib/loadOptions";
import { rowMatchesFilter } from "../lib/searchNormalize";
import {
  listCardAccentClass,
  listCardClass,
  toolbarMasterBtnClass,
  toolbarMasterGroupClass,
  toolbarPrimaryBtnClass,
} from "../lib/uiTokens";
import type { CoordinationCategory, CoordinationContact } from "../types";

const inputClass = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900";
const fileInputClass =
  "mt-1 w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-[#0000BF]/10 file:px-3 file:py-2 file:text-sm file:text-[#2e2a58]";
const primaryBtnClass =
  "rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] disabled:opacity-50";
const secondaryBtnClass = "rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100";

function errMsg(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function Thumb({ src, alt, className }: { src: string | null; alt: string; className: string }) {
  if (!src) {
    return (
      <div className={`${className} flex items-center justify-center bg-[#f4f3fb] text-lg font-bold text-[#8b84d6]`}>
        {alt.trim().charAt(0) || "?"}
      </div>
    );
  }
  return <img src={src} alt={alt} className={`${className} object-cover`} />;
}

/** เลือกรูปใหม่ / ลบรูปเดิม — ใช้ทั้งหมวดหมู่และหน่วยงาน */
function ImagePicker({
  label,
  currentUrl,
  file,
  remove,
  onFile,
  onRemove,
  onRestore,
}: {
  label: string;
  currentUrl: string | null;
  file: File | null;
  remove: boolean;
  onFile: (f: File | null) => void;
  onRemove: () => void;
  onRestore: () => void;
}) {
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);
  const shown = preview ?? (remove ? null : currentUrl);

  return (
    <div>
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <div className="mt-1 flex items-center gap-3">
        <Thumb src={shown} alt={label} className="h-16 w-16 shrink-0 rounded-xl border border-[#e8e6fc]" />
        <div className="min-w-0 flex-1">
          <input
            type="file"
            accept="image/*"
            className={fileInputClass}
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          {currentUrl && !file && !remove ? (
            <button type="button" className="mt-1 text-[11px] font-medium text-rose-600 hover:underline" onClick={onRemove}>
              ลบรูปเดิม
            </button>
          ) : null}
          {currentUrl && (file || remove) ? (
            <button type="button" className="mt-1 text-[11px] font-medium text-[#5b61ff] hover:underline" onClick={onRestore}>
              คืนรูปเดิม
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CategoryManagerModal({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<CoordinationCategory[]>([]);
  const [editing, setEditing] = useState<CoordinationCategory | null>(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await apiJson<CoordinationCategory[]>("/api/coordination-categories"));
  }, []);

  function resetForm(row: CoordinationCategory | null = null) {
    setEditing(row);
    setName(row?.name ?? "");
    setFile(null);
    setRemoveImage(false);
    setPickerKey((k) => k + 1);
  }

  useEffect(() => {
    if (!open) return;
    setErr(null);
    resetForm();
    void load();
  }, [open, load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setSaving(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("name", n);
      if (file) fd.append("image", file);
      else if (editing && removeImage) fd.append("removeImage", "1");
      if (editing) await apiFormJson(`/api/coordination-categories/${editing.id}`, fd, "PUT");
      else await apiFormJson("/api/coordination-categories", fd, "POST");
      resetForm();
      onChanged();
      await load();
    } catch (e2) {
      setErr(errMsg(e2, "บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: CoordinationCategory) {
    if (!confirm(`ลบหมวด «${r.name}» ?`)) return;
    setErr(null);
    try {
      await apiJson(`/api/coordination-categories/${r.id}`, { method: "DELETE" });
      if (editing?.id === r.id) resetForm();
      onChanged();
      await load();
    } catch (e2) {
      setErr(errMsg(e2, "ลบไม่สำเร็จ"));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="จัดการหมวดหมู่หน่วยงาน" overlayZClass="z-[100]">
      <ModalFormBody className="!space-y-4">
        {err ? <p className="text-sm text-rose-600">{err}</p> : null}
        <form
          onSubmit={(e) => void submit(e)}
          className={`space-y-3 rounded-xl border p-3 ${editing ? "border-[#0000BF]/25 bg-white/80" : "border-[#e8e6fc] bg-[#faf9ff]"}`}
        >
          <p className="text-xs font-semibold text-[#4d47b6]">{editing ? `แก้ไข «${editing.name}»` : "เพิ่มหมวดหมู่"}</p>
          <input
            placeholder="ชื่อหมวดหมู่ เช่น กรมทางหลวง"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <ImagePicker
            key={pickerKey}
            label="รูป / โลโก้หมวด"
            currentUrl={editing?.imageUrl ?? null}
            file={file}
            remove={removeImage}
            onFile={(f) => {
              setFile(f);
              setRemoveImage(false);
            }}
            onRemove={() => setRemoveImage(true)}
            onRestore={() => {
              setFile(null);
              setRemoveImage(false);
              setPickerKey((k) => k + 1);
            }}
          />
          <div className="flex gap-2">
            <button type="submit" disabled={saving || !name.trim()} className={primaryBtnClass}>
              {saving ? "กำลังบันทึก…" : editing ? "บันทึก" : "เพิ่ม"}
            </button>
            {editing ? (
              <button type="button" className="text-sm text-slate-600" onClick={() => resetForm()}>
                ยกเลิก
              </button>
            ) : null}
          </div>
        </form>
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white/75 px-3 py-2 text-sm">
              <Thumb src={r.imageUrl} alt={r.name} className="h-10 w-10 shrink-0 rounded-lg border border-[#e8e6fc]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-slate-800">{r.name}</span>
                <span className="text-[11px] text-slate-500">{r._count?.contacts ?? 0} หน่วยงาน</span>
              </span>
              <button type="button" className="rounded px-2 py-0.5 text-xs text-[#5b61ff] hover:bg-slate-100" onClick={() => resetForm(r)}>
                แก้ไข
              </button>
              <button type="button" className="rounded px-2 py-0.5 text-xs text-rose-600 hover:bg-slate-100" onClick={() => void remove(r)}>
                ลบ
              </button>
            </li>
          ))}
          {rows.length === 0 ? <li className="py-4 text-center text-xs text-slate-500">ยังไม่มีหมวดหมู่</li> : null}
        </ul>
      </ModalFormBody>
    </Modal>
  );
}

function emptyForm() {
  return {
    agency: "",
    contactName: "",
    phone: "",
    address: "",
    note: "",
    categoryId: "",
    photo: null as File | null,
    removePhoto: false,
  };
}

export function CoordinationPage() {
  const [rows, setRows] = useState<CoordinationContact[]>([]);
  const [categories, setCategories] = useState<CoordinationCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [listFilter, setListFilter] = useState("");
  /** "" = ทั้งหมด, "none" = ไม่ระบุหมวด, อื่นๆ = id หมวด */
  const [categoryFilter, setCategoryFilter] = useState("");
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CoordinationContact | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [pickerKey, setPickerKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);

  const load = useCallback(async (opts?: LoadOptions) => {
    setLoadBusy(setLoading, opts, true);
    try {
      const [contacts, cats] = await Promise.all([
        apiJson<CoordinationContact[]>("/api/coordination-contacts"),
        apiJson<CoordinationCategory[]>("/api/coordination-categories"),
      ]);
      setRows(contacts);
      setCategories(cats);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!categoryFilter || categoryFilter === "none") return;
    if (!categories.some((c) => c.id === categoryFilter)) setCategoryFilter("");
  }, [categories, categoryFilter]);

  useEffect(() => {
    if (!zoomSrc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomSrc(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomSrc]);

  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        if (categoryFilter === "none") {
          if (r.categoryId) return false;
        } else if (categoryFilter && r.categoryId !== categoryFilter) {
          return false;
        }
        return rowMatchesFilter(listFilter, [r.agency, r.contactName, r.phone, r.address, r.note, r.category?.name]);
      }),
    [rows, listFilter, categoryFilter],
  );

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm(), categoryId: categoryFilter && categoryFilter !== "none" ? categoryFilter : "" });
    setPickerKey((k) => k + 1);
    setFormOpen(true);
  }

  function openEdit(r: CoordinationContact) {
    setEditing(r);
    setForm({
      agency: r.agency,
      contactName: r.contactName,
      phone: r.phone,
      address: r.address,
      note: r.note,
      categoryId: r.categoryId ?? "",
      photo: null,
      removePhoto: false,
    });
    setPickerKey((k) => k + 1);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.agency.trim()) {
      alert("กรอกชื่อหน่วยงาน");
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("agency", form.agency.trim());
      fd.append("contactName", form.contactName);
      fd.append("phone", form.phone);
      fd.append("address", form.address);
      fd.append("note", form.note);
      fd.append("categoryId", form.categoryId);
      if (form.photo) fd.append("photo", form.photo);
      else if (editing && form.removePhoto) fd.append("removeImage", "1");
      if (editing) await apiFormJson(`/api/coordination-contacts/${editing.id}`, fd, "PUT");
      else await apiFormJson("/api/coordination-contacts", fd, "POST");
      closeForm();
      await load({ silent: true });
    } catch (err) {
      alert(errMsg(err, "บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: CoordinationContact) {
    if (!confirm(`ลบหน่วยงาน «${r.agency}» ?`)) return;
    try {
      await apiJson(`/api/coordination-contacts/${r.id}`, { method: "DELETE" });
      await load({ silent: true });
    } catch (err) {
      alert(errMsg(err, "ลบไม่สำเร็จ"));
    }
  }

  return (
    <div>
      <PageHeaderBar
        title="ประสานงาน"
        count={filteredRows.length}
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "ทะเบียนหน่วยงานประสานงาน",
          placeholder: "กรองหน่วยงาน / ผู้ติดต่อ / เบอร์โทร / ที่อยู่…",
        }}
        segments={
          <label className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#e8e6fc] bg-[#faf9ff]/90 px-2 shadow-sm sm:px-2.5">
            <span className="hidden text-[11px] font-bold text-[#4d47b6] sm:inline sm:text-xs">หมวด</span>
            <select
              aria-label="กรองตามหมวดหมู่"
              className="max-w-[9.5rem] cursor-pointer border-0 bg-transparent py-0.5 text-[11px] font-semibold text-[#2e2a58] outline-none sm:max-w-[12rem] sm:text-xs"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">ทั้งหมด ({rows.length})</option>
              <option value="none">ไม่ระบุ ({rows.filter((r) => !r.categoryId).length})</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({rows.filter((r) => r.categoryId === c.id).length})
                </option>
              ))}
            </select>
          </label>
        }
        masters={
          <div className={toolbarMasterGroupClass}>
            <button type="button" onClick={() => setCategoryModalOpen(true)} className={toolbarMasterBtnClass}>
              หมวดหมู่
            </button>
          </div>
        }
        primary={
          <button type="button" onClick={openAdd} className={toolbarPrimaryBtnClass}>
            เพิ่มหน่วยงาน
          </button>
        }
      />

      <CategoryManagerModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        onChanged={() => void load({ silent: true })}
      />

      <Modal open={formOpen} onClose={closeForm} title={editing ? "แก้ไขหน่วยงาน" : "เพิ่มหน่วยงาน"} size="wide">
        <form onSubmit={(e) => void submit(e)}>
          <ModalFormBody>
            <ModalFormSection title="ข้อมูลหน่วยงาน">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">หน่วยงาน</span>
                  <input
                    required
                    className={inputClass}
                    value={form.agency}
                    onChange={(e) => setForm((f) => ({ ...f, agency: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">ชื่อผู้ประสานงาน</span>
                  <input
                    className={inputClass}
                    value={form.contactName}
                    onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">เบอร์โทร</span>
                  <input
                    type="tel"
                    className={inputClass}
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">หมวดหมู่</span>
                  <select
                    className={inputClass}
                    value={form.categoryId}
                    onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
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
                  <span className="text-xs font-medium text-slate-700">ที่อยู่</span>
                  <textarea
                    rows={3}
                    className={inputClass}
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">หมายเหตุ</span>
                  <textarea
                    rows={3}
                    className={inputClass}
                    value={form.note}
                    onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  />
                </label>
                <div className="sm:col-span-2">
                  <ImagePicker
                    key={pickerKey}
                    label="รูป"
                    currentUrl={editing?.photoUrl ?? null}
                    file={form.photo}
                    remove={form.removePhoto}
                    onFile={(f) => setForm((s) => ({ ...s, photo: f, removePhoto: false }))}
                    onRemove={() => setForm((s) => ({ ...s, removePhoto: true }))}
                    onRestore={() => {
                      setForm((s) => ({ ...s, photo: null, removePhoto: false }));
                      setPickerKey((k) => k + 1);
                    }}
                  />
                </div>
              </div>
            </ModalFormSection>
          </ModalFormBody>
          <ModalFormActions>
            <button type="submit" disabled={saving} className={primaryBtnClass}>
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            <button type="button" className={secondaryBtnClass} onClick={closeForm}>
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      {zoomSrc
        ? createPortal(
            <div
              className="print:hidden fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
              onClick={() => setZoomSrc(null)}
              role="dialog"
              aria-modal="true"
            >
              <img src={zoomSrc} alt="" className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
            </div>,
            document.body,
          )
        : null}

      <div className="mt-6 print:hidden">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white/75 py-16 text-center text-slate-600">กำลังโหลด…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/90 py-16 text-center text-slate-600">
            ยังไม่มีหน่วยงาน — กด «เพิ่มหน่วยงาน»
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white/75 py-16 text-center text-slate-600">
            ไม่มีรายการที่ตรงกับการกรอง
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-inner">
            <div className="max-h-[calc(100vh-16rem)] min-h-[200px] overflow-y-auto overscroll-contain rounded-xl pr-1 [scrollbar-gutter:stable]">
              <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {filteredRows.map((r, idx) => {
                  const img = r.photoUrl ?? r.category?.imageUrl ?? null;
                  return (
                    <li key={r.id}>
                      <div className={`${listCardClass} min-h-[7rem] p-3`}>
                        <span className={`absolute inset-y-0 left-0 w-1 ${listCardAccentClass(idx)}`} aria-hidden />
                        <div className="flex min-w-0 flex-1 gap-3 pl-2">
                          <button
                            type="button"
                            className="shrink-0 disabled:cursor-default"
                            disabled={!img}
                            onClick={() => img && setZoomSrc(img)}
                            aria-label="ดูรูป"
                          >
                            <Thumb src={img} alt={r.agency} className="h-14 w-14 rounded-xl border border-[#e8e6fc]" />
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm font-semibold leading-snug text-[#1e1b3a]">{r.agency}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {r.category ? (
                                <span className="rounded bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">
                                  {r.category.name}
                                </span>
                              ) : (
                                <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[10px] text-slate-600">ไม่ระบุหมวดหมู่</span>
                              )}
                            </div>
                            {r.contactName ? <p className="mt-1.5 text-[12px] text-slate-700">ผู้ประสาน: {r.contactName}</p> : null}
                            {r.phone ? (
                              <a
                                href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}
                                className="mt-0.5 inline-block text-[12px] font-semibold text-[#5b61ff] hover:underline"
                              >
                                {r.phone}
                              </a>
                            ) : null}
                            {r.address ? (
                              <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-600">{r.address}</p>
                            ) : null}
                            {r.note ? (
                              <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[11px] leading-relaxed text-amber-800">
                                หมายเหตุ: {r.note}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 border-t border-[#ecebff] pt-2 pl-2">
                          <button
                            type="button"
                            className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                            onClick={() => openEdit(r)}
                          >
                            แก้ไข
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100"
                            onClick={() => void remove(r)}
                          >
                            ลบ
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </div>

      <PrintA4Table
        columns={[{ label: "หน่วยงาน" }, { label: "หมวด" }, { label: "ผู้ประสาน" }, { label: "เบอร์โทร" }, { label: "ที่อยู่" }, { label: "หมายเหตุ" }]}
        rows={filteredRows.map((r) => [
          r.agency,
          r.category?.name || "—",
          r.contactName || "—",
          r.phone || "—",
          (r.address || "—").replace(/\s+/g, " "),
          (r.note || "—").replace(/\s+/g, " "),
        ])}
      />
    </div>
  );
}
