import { useCallback, useEffect, useState } from "react";
import { apiJson } from "../api/client";
import { KIND_LABEL_TH } from "../lib/investigationLabels";
import type { InvestigationCategory, InvestigationCategoryKind, InvestigationTeam } from "../types";
import { Modal, ModalFormBody } from "./Modal";

type FileForm = {
  name: string;
  nameEn: string;
  description: string;
  kind: InvestigationCategoryKind;
  teamId: string;
};

type SubForm = { name: string; nameEn: string };

const emptyFile = (): FileForm => ({
  name: "",
  nameEn: "",
  description: "",
  kind: "BAU",
  teamId: "",
});

/** จัดการแฟ้มคดีหลัก (ไทย/อังกฤษ) และหมวดย่อยภายใต้แต่ละแฟ้ม */
export function InvestigationFilesModal({
  open,
  onClose,
  onChanged,
  teams,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  teams: InvestigationTeam[];
}) {
  const [rows, setRows] = useState<InvestigationCategory[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newFile, setNewFile] = useState<FileForm>(emptyFile);
  const [editing, setEditing] = useState<InvestigationCategory | null>(null);
  const [editForm, setEditForm] = useState<FileForm>(emptyFile);
  const [subParentId, setSubParentId] = useState<string | null>(null);
  const [subForm, setSubForm] = useState<SubForm>({ name: "", nameEn: "" });
  const [editingSub, setEditingSub] = useState<InvestigationCategory | null>(null);

  const load = useCallback(async () => {
    setRows(await apiJson<InvestigationCategory[]>("/api/investigation/categories"));
  }, []);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setEditing(null);
    setSubParentId(null);
    setEditingSub(null);
    setNewFile(emptyFile());
    void load();
  }, [open, load]);

  async function addFile(e: React.FormEvent) {
    e.preventDefault();
    if (!newFile.name.trim()) {
      setErr("กรอกชื่อแฟ้มภาษาไทย");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await apiJson("/api/investigation/categories", {
        method: "POST",
        body: JSON.stringify({
          name: newFile.name.trim(),
          nameEn: newFile.nameEn.trim() || null,
          description: newFile.description.trim() || null,
          kind: newFile.kind,
          teamId: newFile.teamId || null,
        }),
      });
      setNewFile(emptyFile());
      onChanged();
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "เพิ่มแฟ้มไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (!editForm.name.trim()) {
      setErr("กรอกชื่อแฟ้มภาษาไทย");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await apiJson(`/api/investigation/categories/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name.trim(),
          nameEn: editForm.nameEn.trim() || null,
          description: editForm.description.trim() || null,
          kind: editForm.kind,
          teamId: editForm.teamId || null,
        }),
      });
      setEditing(null);
      onChanged();
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function removeFile(row: InvestigationCategory) {
    if (!confirm(`ลบแฟ้ม «${row.name}» ?`)) return;
    setErr(null);
    try {
      await apiJson(`/api/investigation/categories/${row.id}`, { method: "DELETE" });
      onChanged();
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "ลบไม่สำเร็จ");
    }
  }

  async function addSub(e: React.FormEvent) {
    e.preventDefault();
    if (!subParentId || !subForm.name.trim()) {
      setErr("กรอกชื่อหมวดย่อย");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await apiJson("/api/investigation/categories", {
        method: "POST",
        body: JSON.stringify({
          parentId: subParentId,
          name: subForm.name.trim(),
          nameEn: subForm.nameEn.trim() || null,
        }),
      });
      setSubForm({ name: "", nameEn: "" });
      setSubParentId(null);
      onChanged();
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "เพิ่มหมวดย่อยไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function saveSub(e: React.FormEvent) {
    e.preventDefault();
    if (!editingSub || !subForm.name.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await apiJson(`/api/investigation/categories/${editingSub.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: subForm.name.trim(),
          nameEn: subForm.nameEn.trim() || null,
        }),
      });
      setEditingSub(null);
      setSubForm({ name: "", nameEn: "" });
      onChanged();
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "บันทึกหมวดย่อยไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function removeSub(row: InvestigationCategory) {
    if (!confirm(`ลบหมวดย่อย «${row.name}» ?`)) return;
    setErr(null);
    try {
      await apiJson(`/api/investigation/categories/${row.id}`, { method: "DELETE" });
      onChanged();
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "ลบหมวดย่อยไม่สำเร็จ");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="จัดการแฟ้มคดี" size="wide" overlayZClass="z-[100]">
      <ModalFormBody className="!space-y-4">
        {err ? <p className="text-sm text-rose-600">{err}</p> : null}

        <form onSubmit={(e) => void addFile(e)} className="space-y-2 rounded-xl border border-[#e8e6fc] bg-[#faf9ff] p-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">เพิ่มแฟ้มหลัก</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              placeholder="ชื่อไทย *"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              value={newFile.name}
              onChange={(e) => setNewFile((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              placeholder="English subtitle"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              value={newFile.nameEn}
              onChange={(e) => setNewFile((f) => ({ ...f, nameEn: e.target.value }))}
            />
            <select
              className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-800"
              value={newFile.kind}
              onChange={(e) => setNewFile((f) => ({ ...f, kind: e.target.value as InvestigationCategoryKind }))}
            >
              <option value="STRATEGIC">Strategic</option>
              <option value="BAU">BAU</option>
            </select>
            <select
              className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-800"
              value={newFile.teamId}
              onChange={(e) => setNewFile((f) => ({ ...f, teamId: e.target.value }))}
            >
              <option value="">— ทีมแนะนำ (ไม่บังคับ) —</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <textarea
              rows={2}
              placeholder="ขอบเขต / เก็บอะไรบ้าง"
              className="sm:col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
              value={newFile.description}
              onChange={(e) => setNewFile((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
          >
            เพิ่มแฟ้ม
          </button>
        </form>

        {editing ? (
          <form onSubmit={(e) => void saveEdit(e)} className="space-y-2 rounded-xl border border-[#0000BF]/25 bg-white p-3">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">แก้ไขแฟ้ม</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
              <input
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={editForm.nameEn}
                onChange={(e) => setEditForm((f) => ({ ...f, nameEn: e.target.value }))}
                placeholder="English"
              />
              <select
                className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold"
                value={editForm.kind}
                onChange={(e) => setEditForm((f) => ({ ...f, kind: e.target.value as InvestigationCategoryKind }))}
              >
                <option value="STRATEGIC">Strategic</option>
                <option value="BAU">BAU</option>
              </select>
              <select
                className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold"
                value={editForm.teamId}
                onChange={(e) => setEditForm((f) => ({ ...f, teamId: e.target.value }))}
              >
                <option value="">— ทีมแนะนำ (ไม่บังคับ) —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <textarea
                rows={2}
                className="sm:col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="rounded-full bg-[#0000BF] px-3 py-1.5 text-sm font-bold text-white">
                บันทึก
              </button>
              <button type="button" className="text-sm text-slate-600" onClick={() => setEditing(null)}>
                ยกเลิก
              </button>
            </div>
          </form>
        ) : null}

        {(subParentId || editingSub) && (
          <form
            onSubmit={(e) => void (editingSub ? saveSub(e) : addSub(e))}
            className="space-y-2 rounded-xl border border-cyan-200 bg-cyan-50/50 p-3"
          >
            <p className="text-[11px] font-black uppercase tracking-wide text-cyan-800">
              {editingSub ? "แก้ไขหมวดย่อย" : "เพิ่มหมวดย่อย"}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                placeholder="ชื่อไทย *"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={subForm.name}
                onChange={(e) => setSubForm((f) => ({ ...f, name: e.target.value }))}
              />
              <input
                placeholder="English (optional)"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={subForm.nameEn}
                onChange={(e) => setSubForm((f) => ({ ...f, nameEn: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="rounded-full bg-cyan-700 px-3 py-1.5 text-sm font-bold text-white">
                {editingSub ? "บันทึก" : "เพิ่มหมวดย่อย"}
              </button>
              <button
                type="button"
                className="text-sm text-slate-600"
                onClick={() => {
                  setSubParentId(null);
                  setEditingSub(null);
                  setSubForm({ name: "", nameEn: "" });
                }}
              >
                ยกเลิก
              </button>
            </div>
          </form>
        )}

        <ul className="max-h-[28rem] space-y-3 overflow-y-auto">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-slate-200 bg-white/80 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {r.code ? <span className="mr-1 font-mono text-[10px] text-slate-400">{r.code}</span> : null}
                  <span className="font-semibold text-[#1e1b4b]">{r.name}</span>
                  <span
                    className={`ml-1.5 text-[10px] font-bold ${
                      r.kind === "STRATEGIC" ? "text-[#0000BF]" : "text-cyan-800"
                    }`}
                  >
                    ({KIND_LABEL_TH[r.kind]})
                  </span>
                  {r.nameEn ? <p className="text-[11px] text-slate-500">{r.nameEn}</p> : null}
                  {r.description ? <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{r.description}</p> : null}
                </div>
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    className="rounded px-2 py-0.5 text-xs text-cyan-700 hover:bg-cyan-50"
                    onClick={() => {
                      setSubParentId(r.id);
                      setEditingSub(null);
                      setSubForm({ name: "", nameEn: "" });
                      setEditing(null);
                    }}
                  >
                    + หมวดย่อย
                  </button>
                  <button
                    type="button"
                    className="rounded px-2 py-0.5 text-xs text-[#5b61ff] hover:bg-slate-100"
                    onClick={() => {
                      setEditing(r);
                      setEditForm({
                        name: r.name,
                        nameEn: r.nameEn ?? "",
                        description: r.description ?? "",
                        kind: r.kind,
                        teamId: r.teamId ?? "",
                      });
                      setSubParentId(null);
                      setEditingSub(null);
                    }}
                  >
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    className="rounded px-2 py-0.5 text-xs text-rose-600 hover:bg-slate-100"
                    onClick={() => void removeFile(r)}
                  >
                    ลบ
                  </button>
                </span>
              </div>
              {(r.children?.length ?? 0) > 0 ? (
                <ul className="mt-2 space-y-1 border-t border-[#ecebff] pt-2">
                  {r.children!.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-[#faf9ff] px-2 py-1.5">
                      <span className="min-w-0">
                        <span className="text-[12px] font-semibold text-[#2e2a58]">{s.name}</span>
                        {s.nameEn ? <span className="ml-1.5 text-[10px] text-slate-500">{s.nameEn}</span> : null}
                      </span>
                      <span className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          className="text-[10px] font-bold text-[#4d47b6] hover:underline"
                          onClick={() => {
                            setEditingSub(s);
                            setSubParentId(null);
                            setSubForm({ name: s.name, nameEn: s.nameEn ?? "" });
                            setEditing(null);
                          }}
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          className="text-[10px] font-bold text-rose-600 hover:underline"
                          onClick={() => void removeSub(s)}
                        >
                          ลบ
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[11px] text-slate-400">ยังไม่มีหมวดย่อย</p>
              )}
            </li>
          ))}
        </ul>
      </ModalFormBody>
    </Modal>
  );
}
