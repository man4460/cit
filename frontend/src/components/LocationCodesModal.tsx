import { useCallback, useEffect, useState } from "react";
import { apiJson } from "../api/client";
import { Modal, ModalFormActions, ModalFormBody } from "./Modal";

export type LocationCode = {
  id: string;
  code: string;
  name: string;
  province: string;
  lat: number | null;
  lng: number | null;
  sortOrder: number;
};

type Draft = { code: string; name: string; province: string; lat: string; lng: string };

const EMPTY: Draft = { code: "", name: "", province: "", lat: "", lng: "" };
const API = "/api/route-master/locations";
const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-[#0000BF]/50 focus:outline-none";

function toDraft(r: LocationCode): Draft {
  return {
    code: r.code,
    name: r.name,
    province: r.province,
    lat: r.lat != null ? String(r.lat) : "",
    lng: r.lng != null ? String(r.lng) : "",
  };
}

export function LocationCodesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<LocationCode[]>([]);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRows(await apiJson<LocationCode[]>(API));
  }, []);

  useEffect(() => {
    if (open) void load();
    else setEditingId(null);
  }, [open, load]);

  function startEdit(r: LocationCode | null) {
    setEditingId(r ? r.id : "new");
    setDraft(r ? toDraft(r) : EMPTY);
  }

  async function save() {
    setBusy(true);
    try {
      const body = JSON.stringify({
        code: draft.code,
        name: draft.name,
        province: draft.province,
        lat: draft.lat.trim() === "" ? null : draft.lat.trim(),
        lng: draft.lng.trim() === "" ? null : draft.lng.trim(),
      });
      if (editingId === "new") await apiJson(API, { method: "POST", body });
      else if (editingId) await apiJson(`${API}/${editingId}`, { method: "PATCH", body });
      setEditingId(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: LocationCode) {
    if (!confirm(`ลบรหัส «${r.code}» (${r.province}) ?`)) return;
    try {
      await apiJson(`${API}/${r.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  const renderEditor = (key: string) => (
    <tr key={key} className="bg-[#f5f4ff]">
      <td className="px-2 py-2 align-top">
        <input className={inputClass} value={draft.code} onChange={set("code")} placeholder="ศสร" autoFocus />
      </td>
      <td className="px-2 py-2 align-top">
        <input className={inputClass} value={draft.province} onChange={set("province")} placeholder="สุราษฎร์ธานี" />
      </td>
      <td className="px-2 py-2 align-top">
        <input className={inputClass} value={draft.name} onChange={set("name")} placeholder="ศูนย์จัดการธนบัตร …" />
      </td>
      <td className="px-2 py-2 align-top">
        <div className="flex gap-1">
          <input className={inputClass} value={draft.lat} onChange={set("lat")} placeholder="ละติจูด" inputMode="decimal" />
          <input className={inputClass} value={draft.lng} onChange={set("lng")} placeholder="ลองจิจูด" inputMode="decimal" />
        </div>
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-right align-top">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-lg bg-[#0000BF] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0000a3] disabled:opacity-50"
        >
          บันทึก
        </button>
        <button
          type="button"
          onClick={() => setEditingId(null)}
          className="ml-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
        >
          ยกเลิก
        </button>
      </td>
    </tr>
  );

  return (
    <Modal open={open} onClose={onClose} title="รหัสพื้นที่ / ศูนย์จัดการธนบัตร" size="wide">
      <ModalFormBody>
        <p className="text-xs text-slate-600">
          ระบบใช้ตารางนี้แปลงรหัสย่อในเส้นทางและที่อยู่ปลายทาง (เช่น «ศสร.») เป็นชื่อจังหวัดในไฟล์ประกัน
          และใช้พิกัดคำนวณระยะทาง — พิมพ์รหัสโดยไม่ต้องใส่จุด
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-[#ecebff]">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-[#f8f8ff] text-left text-xs font-bold text-[#4d47b6]">
              <tr>
                <th className="w-24 px-3 py-2">รหัส</th>
                <th className="w-40 px-3 py-2">จังหวัด</th>
                <th className="px-3 py-2">ชื่อหน่วยงาน/สถานที่</th>
                <th className="w-56 px-3 py-2">พิกัด</th>
                <th className="w-36 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0efff]">
              {rows.map((r) =>
                editingId === r.id ? (
                  renderEditor(r.id)
                ) : (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 font-bold text-[#1e1b4b]">{r.code}.</td>
                    <td className="px-3 py-2 text-slate-800">{r.province}</td>
                    <td className="px-3 py-2 text-slate-600">{r.name}</td>
                    <td className="px-3 py-2 text-xs tabular-nums text-slate-500">
                      {r.lat != null && r.lng != null ? `${r.lat}, ${r.lng}` : "— ไม่มีพิกัด"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => startEdit(r)}
                        className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(r)}
                        className="ml-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100"
                      >
                        ลบ
                      </button>
                    </td>
                  </tr>
                ),
              )}
              {editingId === "new" ? renderEditor("new") : null}
            </tbody>
          </table>
        </div>
      </ModalFormBody>
      <ModalFormActions>
        {editingId === null ? (
          <button
            type="button"
            onClick={() => startEdit(null)}
            className="rounded-lg border border-[#0000BF]/25 bg-[#0000BF]/5 px-3 py-2 text-sm font-bold text-[#0000BF] hover:bg-[#0000BF]/10"
          >
            + เพิ่มรหัส
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
        >
          ปิด
        </button>
      </ModalFormActions>
    </Modal>
  );
}
