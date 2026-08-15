import { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson } from "../api/client";
import { DetailField } from "../components/DetailField";
import { Modal, ModalFormActions, ModalFormBody } from "../components/Modal";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { MissionsSubNav } from "../components/MissionsSubNav";
import { PrintA4Table } from "../components/PrintA4Table";
import { rowMatchesFilter } from "../lib/searchNormalize";
import {
  listCardAccentClass,
  listCardClass,
  toolbarLinkBtnClass,
  toolbarMasterBtnClass,
  toolbarMasterGroupClass,
  toolbarPrimaryBtnClass,
} from "../lib/uiTokens";
import type { RouteMaster } from "../types";

export function RouteMasterPage() {
  const [rows, setRows] = useState<RouteMaster[]>([]);
  const [detail, setDetail] = useState<RouteMaster | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [km, setKm] = useState("");
  const [listFilter, setListFilter] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [recalcBusy, setRecalcBusy] = useState(false);

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
    setDetail(null);
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

  async function estimateKm() {
    if (!start.trim() || !end.trim()) {
      alert("กรอกต้นทางและปลายทางก่อน");
      return;
    }
    setEstimating(true);
    try {
      const r = await apiJson<{ km: number; method: string; path: string[] }>(
        "/api/route-master/estimate-distance",
        {
          method: "POST",
          body: JSON.stringify({ startLocation: start.trim(), endLocation: end.trim() }),
        },
      );
      setKm(String(r.km));
    } catch (err) {
      alert(err instanceof Error ? err.message : "คำนวณระยะทางไม่สำเร็จ");
    } finally {
      setEstimating(false);
    }
  }

  async function recalculateAll() {
    if (!confirm("คำนวณระยะทางใหม่ทุกเส้นทางจากพิกัดศูนย์ธนบัตร?")) return;
    setRecalcBusy(true);
    try {
      const r = await apiJson<{ updated: number; skipped: number }>(
        "/api/route-master/recalculate-distances",
        { method: "POST", body: JSON.stringify({}) },
      );
      await load();
      alert(`อัปเดต ${r.updated} เส้นทาง${r.skipped ? ` · ข้าม ${r.skipped}` : ""}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "คำนวณไม่สำเร็จ");
    } finally {
      setRecalcBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    let distanceKm = km.trim();
    if (!distanceKm || Number(distanceKm) <= 0) {
      try {
        const r = await apiJson<{ km: number }>("/api/route-master/estimate-distance", {
          method: "POST",
          body: JSON.stringify({ startLocation: start.trim(), endLocation: end.trim() }),
        });
        distanceKm = String(r.km);
        setKm(distanceKm);
      } catch {
        alert("กรุณาระบุระยะทาง หรือใช้รหัสจุดที่ระบบรู้จัก (เช่น สพฐ ศขก)");
        return;
      }
    }
    const body = JSON.stringify({
      name: name.trim() || null,
      startLocation: start.trim(),
      endLocation: end.trim(),
      distanceKm,
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
      setDetail(null);
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
      <PageHeaderBar
        title="เส้นทางภารกิจ"
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "เส้นทางภารกิจ",
          placeholder: "กรองชื่อ / ต้นทาง / ปลายทาง / ระยะ…",
        }}
        extras={
          <>
            <div className={toolbarMasterGroupClass}>
              <button
                type="button"
                className={toolbarMasterBtnClass}
                disabled={recalcBusy}
                onClick={() => void recalculateAll()}
              >
                {recalcBusy ? "กำลังคำนวณ…" : "คำนวณระยะทางทั้งหมด"}
              </button>
            </div>
            <button type="button" onClick={openAdd} className={toolbarPrimaryBtnClass}>
              เพิ่มเส้นทาง
            </button>
          </>
        }
        primary={<MissionsSubNav />}
      />

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingId ? "แก้ไขเส้นทาง" : "เพิ่มเส้นทาง"}
      >
        <form onSubmit={(e) => void save(e)}>
          <ModalFormBody className="!grid !space-y-0 gap-4 sm:grid-cols-2">
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
                placeholder="เช่น สพฐ"
              />
            </label>
            <label>
              <span className="text-xs font-medium text-slate-700">ปลายทาง</span>
              <input
                required
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                placeholder="เช่น ศขก"
              />
            </label>
            <label className="sm:col-span-2">
              <span className="text-xs font-medium text-slate-700">ระยะทาง (กม.)</span>
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                  value={km}
                  onChange={(e) => setKm(e.target.value)}
                  placeholder="ว่างไว้แล้วกดคำนวณ"
                />
                <button
                  type="button"
                  className={`${toolbarLinkBtnClass} shrink-0`}
                  disabled={estimating}
                  onClick={() => void estimateKm()}
                >
                  {estimating ? "…" : "คำนวณ"}
                </button>
              </div>
            </label>
          </ModalFormBody>
          <ModalFormActions>
            <button
              type="submit"
              className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777]"
            >
              บันทึก
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              onClick={closeModal}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      <div className="mt-6 print:hidden">
        {rows.length === 0 ? (
          <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">
            ยังไม่มีเส้นทาง — กด «เพิ่มเส้นทาง»
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">
            ไม่มีรายการที่ตรงกับการกรอง
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredRows.map((r, idx) => (
              <li key={r.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetail(r)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setDetail(r);
                    }
                  }}
                  className={`${listCardClass} cursor-pointer transition hover:border-[#0000BF]/35`}
                >
                  <span className={`absolute inset-y-0 left-0 w-1 ${listCardAccentClass(idx)}`} aria-hidden />
                  <div className="min-w-0 flex-1 pl-2">
                    <p className="line-clamp-2 text-sm font-bold text-[#1e1b4b]">
                      {r.name ?? `${r.startLocation} → ${r.endLocation}`}
                    </p>
                    <p className="mt-2 text-xs font-medium text-[#2e2a58]">
                      <span className="text-[#4d47b6]">{r.startLocation}</span>
                      <span className="mx-1.5 text-[#8b5cf6]">→</span>
                      <span className="text-[#ec4899]">{r.endLocation}</span>
                    </p>
                    <p className="mt-2 inline-flex rounded-full bg-[#0000BF]/10 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-[#4d47b6]">
                      {Number(r.distanceKm).toLocaleString("th-TH", { maximumFractionDigits: 1 })} กม.
                    </p>
                  </div>
                  <div
                    className="mt-3 flex flex-wrap gap-1.5 border-t border-[#ecebff] pt-2.5 pl-2"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
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
                      onClick={() => void removeRow(r)}
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? detail.name ?? `${detail.startLocation} → ${detail.endLocation}` : "รายละเอียดเส้นทาง"}
        size="form"
      >
        {detail ? (
          <>
            <ModalFormBody>
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailField label="ชื่อเส้นทาง" value={detail.name || "—"} className="sm:col-span-2" />
                <DetailField label="ต้นทาง" value={detail.startLocation} />
                <DetailField label="ปลายทาง" value={detail.endLocation} />
                <DetailField
                  label="ระยะทาง (กม.)"
                  value={Number(detail.distanceKm).toLocaleString("th-TH", { maximumFractionDigits: 1 })}
                />
              </div>
            </ModalFormBody>
            <ModalFormActions>
              <button type="button" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100" onClick={() => openEdit(detail)}>แก้ไข</button>
              <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100" onClick={() => setDetail(null)}>ปิด</button>
            </ModalFormActions>
          </>
        ) : null}
      </Modal>

      <PrintA4Table
        columns={[
          { label: "ชื่อ" },
          { label: "ต้นทาง" },
          { label: "ปลายทาง" },
          { label: "ระยะทาง (กม.)" },
        ]}
        rows={filteredRows.map((r) => [
          r.name ?? "—",
          r.startLocation,
          r.endLocation,
          String(r.distanceKm),
        ])}
      />
    </div>
  );
}
