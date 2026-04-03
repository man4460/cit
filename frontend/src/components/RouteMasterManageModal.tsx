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
          {err && !formOpen && <p className="text-sm text-rose-400">{err}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-500">เพิ่ม แก้ไข ลบ เส้นทางเพื่อใช้ในฟอร์มภารกิจ</p>
            <button
              type="button"
              className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-500"
              onClick={openAdd}
            >
              + เพิ่มเส้นทาง
            </button>
          </div>
          {loading ? (
            <p className="text-slate-500">กำลังโหลด…</p>
          ) : (
            <ul className="max-h-[min(50vh,24rem)] space-y-2 overflow-y-auto">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-white">{r.name ?? `${r.startLocation} → ${r.endLocation}`}</p>
                    <p className="text-xs text-slate-500">
                      {r.startLocation} → {r.endLocation} · {r.distanceKm} กม.
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className="rounded px-2 py-1 text-xs text-teal-400 hover:bg-slate-800"
                      onClick={() => openEdit(r)}
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      className="rounded px-2 py-1 text-xs text-rose-400 hover:bg-slate-800"
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
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
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
            {err && <p className="sm:col-span-2 text-sm text-rose-400">{err}</p>}
            <label className="sm:col-span-2">
              <span className="text-xs font-medium text-slate-300">ชื่อเส้นทาง (ไม่บังคับ)</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              <span className="text-xs font-medium text-slate-300">ต้นทาง</span>
              <input
                required
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              <span className="text-xs font-medium text-slate-300">ปลายทาง</span>
              <input
                required
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
            <label className="sm:col-span-2">
              <span className="text-xs font-medium text-slate-300">ระยะทาง (กิโลเมตร)</span>
              <input
                required
                type="number"
                step="0.1"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={km}
                onChange={(e) => setKm(e.target.value)}
              />
            </label>
          </ModalFormBody>
          <ModalFormActions>
            <button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500">
              บันทึก
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
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
