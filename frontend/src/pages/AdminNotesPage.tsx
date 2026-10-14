import { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson } from "../api/client";
import { Modal, ModalFormActions, ModalFormBody, ModalFormSection } from "../components/Modal";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { PrintA4Table } from "../components/PrintA4Table";
import type { LoadOptions } from "../lib/loadOptions";
import { setLoadBusy } from "../lib/loadOptions";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { listCardAccentClass, listCardClass, toolbarPrimaryBtnClass } from "../lib/uiTokens";
import type { AdminNote } from "../types";

const inputClass = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900";

function formatThaiDateTime(iso: string) {
  return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

export function AdminNotesPage() {
  const [rows, setRows] = useState<AdminNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [listFilter, setListFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminNote | null>(null);
  const [form, setForm] = useState({ title: "", content: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (opts?: LoadOptions) => {
    setLoadBusy(setLoading, opts, true);
    try {
      setRows(await apiJson<AdminNote[]>("/api/admin-notes"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(
    () => rows.filter((r) => rowMatchesFilter(listFilter, [r.title, r.content])),
    [rows, listFilter],
  );

  function openAdd() {
    setEditing(null);
    setForm({ title: "", content: "" });
    setFormOpen(true);
  }

  function openEdit(r: AdminNote) {
    setEditing(r);
    setForm({ title: r.title, content: r.content });
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) {
      alert("กรอกชื่อโน้ต");
      return;
    }
    setSaving(true);
    try {
      const body = JSON.stringify({ title, content: form.content });
      if (editing) await apiJson(`/api/admin-notes/${editing.id}`, { method: "PUT", body });
      else await apiJson("/api/admin-notes", { method: "POST", body });
      closeForm();
      await load({ silent: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: AdminNote) {
    if (!confirm(`ลบโน้ต «${r.title}» ?`)) return;
    try {
      await apiJson(`/api/admin-notes/${r.id}`, { method: "DELETE" });
      await load({ silent: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  return (
    <div>
      <PageHeaderBar
        title="บันทึกโน้ต"
        count={filteredRows.length}
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "บันทึกโน้ต",
          placeholder: "กรองชื่อ / รายละเอียดโน้ต…",
        }}
        primary={
          <button type="button" onClick={openAdd} className={toolbarPrimaryBtnClass}>
            เพิ่มโน้ต
          </button>
        }
      />

      <Modal open={formOpen} onClose={closeForm} title={editing ? "แก้ไขโน้ต" : "เพิ่มโน้ต"} size="wide">
        <form onSubmit={(e) => void submit(e)}>
          <ModalFormBody>
            <ModalFormSection title="โน้ต">
              <label className="block">
                <span className="text-xs font-medium text-slate-700">ชื่อโน้ต</span>
                <input
                  required
                  className={inputClass}
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </label>
              <label className="mt-4 block">
                <span className="text-xs font-medium text-slate-700">รายละเอียด</span>
                <textarea
                  rows={12}
                  className={inputClass}
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                />
              </label>
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
          <div className="rounded-2xl border border-slate-200 bg-white/75 py-16 text-center text-slate-600">กำลังโหลด…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/90 py-16 text-center text-slate-600">
            ยังไม่มีโน้ต — กด «เพิ่มโน้ต»
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white/75 py-16 text-center text-slate-600">
            ไม่มีรายการที่ตรงกับการกรอง
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-inner">
            <div className="max-h-[calc(100vh-16rem)] min-h-[200px] overflow-y-auto overscroll-contain rounded-xl pr-1 [scrollbar-gutter:stable]">
              <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {filteredRows.map((r, idx) => (
                  <li key={r.id}>
                    <div className={`${listCardClass} min-h-[7rem] p-3`}>
                      <span className={`absolute inset-y-0 left-0 w-1 ${listCardAccentClass(idx)}`} aria-hidden />
                      <div className="min-w-0 flex-1 pl-2">
                        <p className="line-clamp-2 text-sm font-semibold leading-snug text-[#1e1b3a]">{r.title}</p>
                        <p className="mt-0.5 text-[10px] text-slate-500">แก้ไขล่าสุด {formatThaiDateTime(r.updatedAt)}</p>
                        {r.content.trim() ? (
                          <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-700">
                            {r.content}
                          </p>
                        ) : null}
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
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <PrintA4Table
        columns={[{ label: "ชื่อโน้ต" }, { label: "รายละเอียด" }, { label: "แก้ไขล่าสุด" }]}
        rows={filteredRows.map((r) => [r.title, (r.content || "—").replace(/\s+/g, " "), formatThaiDateTime(r.updatedAt)])}
      />
    </div>
  );
}
