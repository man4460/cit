import { useCallback, useEffect, useState } from "react";
import { apiJson } from "../api/client";
import { Modal, ModalFormBody } from "./Modal";

type MasterRow = { id: string; name: string; sortOrder: number };

export function VehicleTypeMasterModal({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const apiPath = "/api/vehicle-types";
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
    <Modal open={open} onClose={onClose} title="ประเภทรถ (เพิ่ม / แก้ไข / ลบ)">
      <ModalFormBody className="!space-y-4">
        {err && <p className="text-sm text-rose-400">{err}</p>}
        <form onSubmit={add} className="flex gap-2">
          <input
            placeholder="ชื่อประเภทใหม่"
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
