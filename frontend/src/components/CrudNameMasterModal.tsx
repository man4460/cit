import { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson } from "../api/client";
import type { NameMasterRow } from "../types";
import { Modal, ModalFormBody } from "./Modal";

export function CrudNameMasterModal({
  title,
  apiPath,
  open,
  onClose,
  onChanged,
  fleetCareExcludeField,
  kindField,
  descriptionField,
  ownerOptions,
  ownerLabel = "ทีมเจ้าของ",
}: {
  title: string;
  apiPath: string;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  /** เปิดช่อง «ไม่นับในยอดตรวจ/ดูแล» (จำหน่าย/ส่งคืน) — ใช้กับสถานะครุภัณฑ์ */
  fleetCareExcludeField?: boolean;
  /** เปิดเลือกชนิด Strategic / BAU — ใช้กับหมวดคดีสืบสวน */
  kindField?: boolean;
  /** เปิดช่องขอบเขต/คำอธิบาย — ใช้กับแฟ้มคดีสืบสวน */
  descriptionField?: boolean;
  /** เปิดเลือกทีมเจ้าของ (ส่งเป็น teamId) — ใช้กับแฟ้มคดีสืบสวน */
  ownerOptions?: { id: string; name: string }[];
  ownerLabel?: string;
}) {
  const [rows, setRows] = useState<NameMasterRow[]>([]);
  const [newName, setNewName] = useState("");
  const [newExcludesFleetCare, setNewExcludesFleetCare] = useState(false);
  const [newKind, setNewKind] = useState<"STRATEGIC" | "BAU">("BAU");
  const [newDescription, setNewDescription] = useState("");
  const [newTeamId, setNewTeamId] = useState("");
  const [editing, setEditing] = useState<NameMasterRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editExcludesFleetCare, setEditExcludesFleetCare] = useState(false);
  const [editKind, setEditKind] = useState<"STRATEGIC" | "BAU">("BAU");
  const [editDescription, setEditDescription] = useState("");
  const [editTeamId, setEditTeamId] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const ownerField = Boolean(ownerOptions?.length);
  const teamNameById = useMemo(
    () => new Map((ownerOptions ?? []).map((t) => [t.id, t.name])),
    [ownerOptions],
  );

  const load = useCallback(async () => {
    setRows(await apiJson<NameMasterRow[]>(apiPath));
  }, [apiPath]);

  useEffect(() => {
    if (open) {
      setErr(null);
      setEditing(null);
      setNewExcludesFleetCare(false);
      setNewKind("BAU");
      setNewDescription("");
      setNewTeamId("");
      void load();
    }
  }, [open, load]);

  function extraPayload(kind: "STRATEGIC" | "BAU", description: string, teamId: string) {
    return {
      ...(kindField ? { kind } : {}),
      ...(descriptionField ? { description: description.trim() || null } : {}),
      ...(ownerField ? { teamId: teamId || null } : {}),
    };
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await apiJson(apiPath, {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          ...(fleetCareExcludeField ? { excludesFromFleetCare: newExcludesFleetCare } : {}),
          ...extraPayload(newKind, newDescription, newTeamId),
        }),
      });
      setNewName("");
      setNewExcludesFleetCare(false);
      setNewKind("BAU");
      setNewDescription("");
      setNewTeamId("");
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
        body: JSON.stringify({
          name: editName.trim(),
          ...(fleetCareExcludeField ? { excludesFromFleetCare: editExcludesFleetCare } : {}),
          ...extraPayload(editKind, editDescription, editTeamId),
        }),
      });
      setEditing(null);
      onChanged();
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function remove(r: NameMasterRow) {
    if (!confirm(`ลบ "${r.name}" ?`)) return;
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
    <Modal open={open} onClose={onClose} title={title} overlayZClass="z-[100]">
      <ModalFormBody className="!space-y-4">
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <form onSubmit={add} className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              placeholder="ชื่อใหม่"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            {kindField ? (
              <select
                className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-800"
                value={newKind}
                onChange={(e) => setNewKind(e.target.value as "STRATEGIC" | "BAU")}
                aria-label="ชนิดหมวด"
              >
                <option value="STRATEGIC">Strategic</option>
                <option value="BAU">BAU</option>
              </select>
            ) : null}
            <button
              type="submit"
              className="shrink-0 rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-3 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777]"
            >
              เพิ่ม
            </button>
          </div>
          {ownerField ? (
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-800"
              value={newTeamId}
              onChange={(e) => setNewTeamId(e.target.value)}
              aria-label={ownerLabel}
            >
              <option value="">— ยังไม่ระบุ{ownerLabel} —</option>
              {(ownerOptions ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          ) : null}
          {descriptionField ? (
            <textarea
              rows={2}
              placeholder="ขอบเขต / เก็บเอกสารอะไรบ้าง"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
          ) : null}
          {fleetCareExcludeField ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                className="rounded border-slate-200 bg-white"
                checked={newExcludesFleetCare}
                onChange={(e) => setNewExcludesFleetCare(e.target.checked)}
              />
              ไม่นับในยอดตรวจ/ดูแล (จำหน่าย ส่งคืน ฯลฯ)
            </label>
          ) : null}
        </form>
        {editing ? (
          <form onSubmit={saveEdit} className="rounded-lg border border-[#0000BF]/25 bg-white/80 p-3">
            <p className="text-xs text-slate-600">แก้ไข</p>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            {kindField ? (
              <select
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-800"
                value={editKind}
                onChange={(e) => setEditKind(e.target.value as "STRATEGIC" | "BAU")}
                aria-label="ชนิดหมวด"
              >
                <option value="STRATEGIC">Strategic</option>
                <option value="BAU">BAU</option>
              </select>
            ) : null}
            {ownerField ? (
              <select
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-800"
                value={editTeamId}
                onChange={(e) => setEditTeamId(e.target.value)}
                aria-label={ownerLabel}
              >
                <option value="">— ยังไม่ระบุ{ownerLabel} —</option>
                {(ownerOptions ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : null}
            {descriptionField ? (
              <textarea
                rows={3}
                placeholder="ขอบเขต / เก็บเอกสารอะไรบ้าง"
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            ) : null}
            {fleetCareExcludeField ? (
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  className="rounded border-slate-200 bg-white"
                  checked={editExcludesFleetCare}
                  onChange={(e) => setEditExcludesFleetCare(e.target.checked)}
                />
                ไม่นับในยอดตรวจ/ดูแล
              </label>
            ) : null}
            <div className="mt-2 flex gap-2">
              <button
                type="submit"
                className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-3 py-1.5 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777]"
              >
                บันทึก
              </button>
              <button type="button" className="text-sm text-slate-600" onClick={() => setEditing(null)}>
                ยกเลิก
              </button>
            </div>
          </form>
        ) : null}
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white/75 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-slate-800">
                  {r.code ? <span className="mr-1 font-mono text-[10px] text-slate-400">{r.code}</span> : null}
                  {r.name}
                  {kindField && r.kind ? (
                    <span
                      className={`ml-1.5 text-[10px] font-bold ${
                        r.kind === "STRATEGIC" ? "text-[#0000BF]" : "text-cyan-800"
                      }`}
                    >
                      ({r.kind === "STRATEGIC" ? "Strategic" : "BAU"})
                    </span>
                  ) : null}
                  {fleetCareExcludeField && r.excludesFromFleetCare ? (
                    <span className="ml-1.5 text-[10px] font-normal text-amber-400/90">(นอกยอดตรวจ)</span>
                  ) : null}
                </span>
                {ownerField ? (
                  <span className="mt-0.5 block text-[10px] font-semibold text-[#4d47b6]">
                    {r.teamId ? (teamNameById.get(r.teamId) ?? r.team?.name ?? "—") : `ยังไม่ระบุ${ownerLabel}`}
                  </span>
                ) : null}
                {descriptionField && r.description ? (
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-600">{r.description}</span>
                ) : null}
              </span>
              <span className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className="rounded px-2 py-0.5 text-xs text-[#5b61ff] hover:bg-slate-100"
                  onClick={() => {
                    setEditing(r);
                    setEditName(r.name);
                    setEditExcludesFleetCare(Boolean(r.excludesFromFleetCare));
                    setEditKind(r.kind === "STRATEGIC" ? "STRATEGIC" : "BAU");
                    setEditDescription(r.description ?? "");
                    setEditTeamId(r.teamId ?? "");
                  }}
                >
                  แก้ไข
                </button>
                <button
                  type="button"
                  className="rounded px-2 py-0.5 text-xs text-rose-600 hover:bg-slate-100"
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
