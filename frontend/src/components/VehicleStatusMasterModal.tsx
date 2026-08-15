import { useCallback, useEffect, useState } from "react";
import { apiJson } from "../api/client";
import { Modal, ModalFormBody } from "./Modal";

type MasterRow = { id: string; name: string; sortOrder: number; excludesFromFleetCare?: boolean };

export function VehicleStatusMasterModal({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const apiPath = "/api/vehicle-statuses";
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [newName, setNewName] = useState("");
  const [newExcludesFleetCare, setNewExcludesFleetCare] = useState(false);
  const [editing, setEditing] = useState<MasterRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editExcludesFleetCare, setEditExcludesFleetCare] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await apiJson<MasterRow[]>(apiPath));
  }, []);

  useEffect(() => {
    if (open) {
      setErr(null);
      setEditing(null);
      setNewExcludesFleetCare(false);
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
        body: JSON.stringify({ name: editName.trim(), excludesFromFleetCare: editExcludesFleetCare }),
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
    <Modal open={open} onClose={onClose} title="สถานะรถ (เพิ่ม / แก้ไข / ลบ)">
      <ModalFormBody className="!space-y-4">
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <form onSubmit={add} className="space-y-2">
          <div className="flex gap-2">
            <input
              placeholder="ชื่อสถานะใหม่"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" className="shrink-0 rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] px-3 py-2">
              เพิ่ม
            </button>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              className="rounded border-slate-200 bg-white"
              checked={newExcludesFleetCare}
              onChange={(e) => setNewExcludesFleetCare(e.target.checked)}
            />
            ไม่นับในยอดตรวจ/ดูแล (จำหน่าย ส่งคืน ฯลฯ)
          </label>
        </form>
        {editing ? (
          <form onSubmit={saveEdit} className="rounded-lg border border-[#0000BF]/25 bg-white/80 p-3">
            <p className="text-xs text-slate-600">แก้ไข</p>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <div className="mt-2 flex gap-2">
              <button type="submit" className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] px-3 py-1.5">
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
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white/75 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate text-slate-800">
                {r.name}
                {r.excludesFromFleetCare ? (
                  <span className="ml-1.5 text-[10px] font-normal text-amber-400/90">(นอกยอดตรวจ)</span>
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
