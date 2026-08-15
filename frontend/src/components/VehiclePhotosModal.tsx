import { useCallback, useEffect, useState } from "react";
import { apiFormJson, apiJson } from "../api/client";
import { prepareFilesForUpload } from "../lib/prepareImageFileForUpload";
import { Modal, ModalFormActions, ModalFormBody } from "./Modal";
import type { VehicleDetail, VehicleDocument } from "../types";

export function VehiclePhotosModal({
  vehicleId,
  licensePlate,
  open,
  onClose,
  onUpdated,
}: {
  vehicleId: string | null;
  licensePlate: string;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [detail, setDetail] = useState<VehicleDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const inputId = vehicleId ? `vehicle-photos-${vehicleId}` : "vehicle-photos-none";

  const load = useCallback(async () => {
    if (!vehicleId || !open) return;
    setLoading(true);
    try {
      const v = await apiJson<VehicleDetail>(`/api/vehicles/${vehicleId}`);
      setDetail(v);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [vehicleId, open]);

  useEffect(() => {
    setDetail(null);
  }, [vehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const photos = (detail?.documents ?? [])
    .filter((d) => d.kind === "PHOTO")
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  const cardFrontId = photos[0]?.id ?? null;

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicleId) return;
    const el = document.getElementById(inputId) as HTMLInputElement | null;
    const files = el?.files;
    if (!files?.length) {
      alert("เลือกรูปอย่างน้อย 1 ไฟล์");
      return;
    }
    try {
      const prepared = await prepareFilesForUpload(files);
      const fd = new FormData();
      for (const f of prepared) fd.append("photos", f);
      await apiFormJson<unknown[]>(`/api/vehicles/${vehicleId}/photos`, fd);
      if (el) el.value = "";
      await load();
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    }
  }

  async function removePhoto(docId: string) {
    if (!vehicleId || !confirm("ลบรูปนี้?")) return;
    try {
      await apiJson(`/api/vehicles/${vehicleId}/documents/${docId}`, { method: "DELETE" });
      await load();
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  async function setCardFront(doc: VehicleDocument) {
    if (!vehicleId || doc.id === cardFrontId) return;
    setBusyId(doc.id);
    try {
      await apiJson(`/api/vehicles/${vehicleId}/documents/${doc.id}/card-front`, { method: "POST" });
      await load();
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "ตั้งรูปหน้าการ์ดไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  if (!vehicleId) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`รูปยานพาหนะ — ${licensePlate}`}
      size="wide"
      overlayZClass="z-[100]"
    >
      {loading && !detail ? (
        <p className="text-slate-700">กำลังโหลด…</p>
      ) : (
        <>
          <ModalFormBody>
            <p className="text-xs text-slate-600">
              อัปโหลดได้หลายไฟล์พร้อมกัน · กด «ตั้งเป็นรูปหน้าการ์ด» เพื่อเลือกรูปที่แสดงบนการ์ดรายการ
            </p>
            <form onSubmit={onUpload} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="block min-w-[200px] flex-1">
                <span className="text-xs text-slate-600">เลือกรูป</span>
                <input
                  id={inputId}
                  type="file"
                  accept="image/*"
                  multiple
                  className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-[#0000BF] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#2e2a58]"
                />
              </label>
              <button
                type="submit"
                className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] px-4 py-2"
              >
                อัปโหลด
              </button>
            </form>
            <div className="mt-6">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-700">รูปที่มีอยู่ ({photos.length})</p>
              {photos.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">ยังไม่มีรูป</p>
              ) : (
                <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {photos.map((p) => {
                    const isFront = p.id === cardFrontId;
                    return (
                      <li key={p.id} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <img src={p.fileUrl} alt="" className="aspect-square w-full object-cover" />
                        {isFront ? (
                          <span className="absolute left-2 top-2 rounded-md bg-[#0000BF] px-2 py-0.5 text-[10px] font-black text-white shadow">
                            รูปหน้าการ์ด
                          </span>
                        ) : null}
                        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/70 to-transparent p-2 pt-8">
                          {!isFront ? (
                            <button
                              type="button"
                              disabled={busyId === p.id}
                              className="rounded-lg bg-white/95 px-2 py-1 text-[11px] font-bold text-[#4d47b6] hover:bg-white disabled:opacity-60"
                              onClick={() => void setCardFront(p)}
                            >
                              {busyId === p.id ? "กำลังตั้ง…" : "ตั้งเป็นรูปหน้าการ์ด"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="rounded-lg bg-rose-600/90 px-2 py-1 text-[11px] font-medium text-white hover:bg-rose-500"
                            onClick={() => void removePhoto(p.id)}
                          >
                            ลบ
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
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
        </>
      )}
    </Modal>
  );
}
