import { useCallback, useEffect, useState } from "react";
import { apiJson } from "../api/client";
import { Modal, ModalFormActions, ModalFormBody } from "./Modal";
import type { RouteMaster } from "../types";

export function RouteMasterManageModal({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<RouteMaster[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RouteMaster | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [km, setKm] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setRows(await apiJson<RouteMaster[]>("/api/route-master"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
    else setFormOpen(false);
  }, [open, load]);

  function openAdd() {
    setEditing(null);
    setName("");
    setStart("");
    setEnd("");
    setKm("");
    setFormOpen(true);
    setErr(null);
  }

  function openEdit(r: RouteMaster) {
    setEditing(r);
    setName(r.name ?? "");
    setStart(r.startLocation);
    setEnd(r.endLocation);
    setKm(r.distanceKm);
    setFormOpen(true);
    setErr(null);
  }

  async function saveRoute(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      if (editing) {
        await apiJson(`/api/route-master/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: name.trim() || null,
            startLocation: start.trim(),
            endLocation: end.trim(),
            distanceKm: km,
          }),
        });
      } else {
        await apiJson("/api/route-master", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim() || null,
            startLocation: start.trim(),
            endLocation: end.trim(),
            distanceKm: km,
          }),
        });
      }
      setFormOpen(false);
      onChanged();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function removeRoute(r: RouteMaster) {
    if (!confirm(`ลบเส้นทาง "${r.name ?? r.startLocation + " → " + r.endLocation}" ?`)) return;
    setErr(null);
    try {
      await apiJson(`/api/route-master/${r.id}`, { method: "DELETE" });
      onChanged();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  return (
    <>
      <Modal open={open && !formOpen} onClose={onClose} title="จัดการเส้นทาง (Master)" size="wide">
        <ModalFormBody className="!space-y-4">
          {err && !formOpen && <p className="text-sm text-rose-600">{err}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">เพิ่ม แก้ไข ลบ เส้นทางเพื่อใช้ในฟอร์มภารกิจ</p>
            <button
              type="button"
              className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] px-3 py-2"
              onClick={openAdd}
            >
              + เพิ่มเส้นทาง
            </button>
          </div>
          {loading ? (
            <p className="text-slate-700">กำลังโหลด…</p>
          ) : (
            <ul className="max-h-[min(50vh,24rem)] space-y-2 overflow-y-auto">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[#1e1b3a]">{r.name ?? `${r.startLocation} → ${r.endLocation}`}</p>
                    <p className="text-xs text-slate-600">
                      {r.startLocation} → {r.endLocation} · {r.distanceKm} กม.
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className="rounded px-2 py-1 text-xs text-[#5b61ff] hover:bg-slate-100"
                      onClick={() => openEdit(r)}
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      className="rounded px-2 py-1 text-xs text-rose-600 hover:bg-slate-100"
                      onClick={() => void removeRoute(r)}
                    >
                      ลบ
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ModalFormBody>
        <ModalFormActions>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            onClick={onClose}
          >
            ปิด
          </button>
        </ModalFormActions>
      </Modal>

      <Modal
        open={open && formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "แก้ไขเส้นทาง" : "เพิ่มเส้นทาง"}
        size="form"
      >
        <form onSubmit={(e) => void saveRoute(e)}>
          <ModalFormBody className="!space-y-0 grid gap-4 sm:grid-cols-2">
            {err && <p className="sm:col-span-2 text-sm text-rose-600">{err}</p>}
            <label className="sm:col-span-2">
              <span className="text-xs font-medium text-slate-700">ชื่อเส้นทาง (ไม่บังคับ)</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              <span className="text-xs font-medium text-slate-700">ต้นทาง</span>
              <input
                required
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              <span className="text-xs font-medium text-slate-700">ปลายทาง</span>
              <input
                required
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
            <label className="sm:col-span-2">
              <span className="text-xs font-medium text-slate-700">ระยะทาง (กิโลเมตร)</span>
              <input
                required
                type="number"
                step="0.1"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={km}
                onChange={(e) => setKm(e.target.value)}
              />
            </label>
          </ModalFormBody>
          <ModalFormActions>
            <button type="submit" className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] px-4 py-2">
              บันทึก
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => setFormOpen(false)}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>
    </>
  );
}
