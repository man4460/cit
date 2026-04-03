import { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson } from "../api/client";
import { Modal, ModalFormActions, ModalFormBody } from "../components/Modal";
import { PageFilterPrintBar } from "../components/PageFilterPrintBar";
import { rowMatchesFilter } from "../lib/searchNormalize";
import type { RouteMaster } from "../types";

export function RouteMasterPage() {
  const [rows, setRows] = useState<RouteMaster[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [km, setKm] = useState("");
  const [listFilter, setListFilter] = useState("");

  const load = useCallback(async () => {
    setRows(await apiJson<RouteMaster[]>("/api/route-master"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openAdd() {
    setEditingId(null);
    setName("");
    setStart("");
    setEnd("");
    setKm("");
    setModalOpen(true);
  }

  function openEdit(r: RouteMaster) {
    setEditingId(r.id);
    setName(r.name ?? "");
    setStart(r.startLocation);
    setEnd(r.endLocation);
    setKm(String(r.distanceKm));
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = JSON.stringify({
      name: name.trim() || null,
      startLocation: start.trim(),
      endLocation: end.trim(),
      distanceKm: km,
    });
    try {
      if (editingId) {
        await apiJson(`/api/route-master/${editingId}`, { method: "PUT", body });
      } else {
        await apiJson("/api/route-master", { method: "POST", body });
      }
      closeModal();
      setName("");
      setStart("");
      setEnd("");
      setKm("");
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function removeRow(r: RouteMaster) {
    const label = r.name ?? `${r.startLocation} → ${r.endLocation}`;
    if (!confirm(`ลบเส้นทาง «${label}» ?`)) return;
    try {
      await apiJson(`/api/route-master/${r.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  const filteredRows = useMemo(
    () =>
      rows.filter((r) =>
        rowMatchesFilter(listFilter, [
          r.name,
          r.startLocation,
          r.endLocation,
          String(r.distanceKm),
        ]),
      ),
    [rows, listFilter],
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">เส้นทางภารกิจ</h1>
          <p className="mt-1 text-slate-400">กำหนดต้นทาง–ปลายทางและระยะทาง เพื่อเลือกในภารกิจได้ทันที</p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="shrink-0 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/25 hover:bg-teal-500"
        >
          เพิ่มเส้นทาง
        </button>
      </div>

      <PageFilterPrintBar
        value={listFilter}
        onChange={setListFilter}
        printTitle="เส้นทางภารกิจ"
        placeholder="กรองชื่อ / ต้นทาง / ปลายทาง / ระยะ…"
      />

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingId ? "แก้ไขเส้นทาง" : "เพิ่มเส้นทาง"}
      >
        <form onSubmit={save}>
          <ModalFormBody className="!grid !space-y-0 gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="text-xs font-medium text-slate-400">ชื่อเส้นทาง (ไม่บังคับ)</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              <span className="text-xs font-medium text-slate-400">ต้นทาง</span>
              <input
                required
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              <span className="text-xs font-medium text-slate-400">ปลายทาง</span>
              <input
                required
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
            <label className="sm:col-span-2">
              <span className="text-xs font-medium text-slate-400">ระยะทาง (กม.)</span>
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
            <button
              type="submit"
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500"
            >
              บันทึก
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              onClick={closeModal}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
            <tr>
              <th className="p-3">ชื่อ / เส้นทาง</th>
              <th className="p-3">ต้นทาง</th>
              <th className="p-3">ปลายทาง</th>
              <th className="w-28 p-3 text-right">ระยะ (กม.)</th>
              <th className="w-36 p-3">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-slate-500">
                  ยังไม่มีเส้นทาง — กด «เพิ่มเส้นทาง»
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-slate-500">
                  ไม่มีรายการที่ตรงกับการกรอง
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => (
                <tr key={r.id} className="border-b border-slate-800/80">
                  <td className="p-3 font-medium text-white">
                    {r.name ?? `${r.startLocation} → ${r.endLocation}`}
                  </td>
                  <td className="p-3 text-slate-300">{r.startLocation}</td>
                  <td className="p-3 text-slate-300">{r.endLocation}</td>
                  <td className="p-3 text-right tabular-nums text-teal-400">{r.distanceKm}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="rounded-md border border-slate-600 px-2 py-1 text-xs text-teal-400 hover:bg-slate-800"
                        onClick={() => openEdit(r)}
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-600 px-2 py-1 text-xs text-rose-400 hover:bg-slate-800"
                        onClick={() => void removeRow(r)}
                      >
                        ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
