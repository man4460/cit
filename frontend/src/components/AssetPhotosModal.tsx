import { useCallback, useEffect, useState } from "react";
import { apiFormJson, apiJson } from "../api/client";
import { Modal, ModalFormActions, ModalFormBody } from "./Modal";
import type { AssetDetail } from "../types";

export function AssetPhotosModal({
  assetId,
  itemLabel,
  open,
  onClose,
  onUpdated,
}: {
  assetId: string | null;
  itemLabel: string;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const inputId = assetId ? `asset-photos-${assetId}` : "asset-photos-none";

  const load = useCallback(async () => {
    if (!assetId || !open) return;
    setLoading(true);
    try {
      const a = await apiJson<AssetDetail>(`/api/assets/${assetId}`);
      setDetail(a);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [assetId, open]);

  useEffect(() => {
    setDetail(null);
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  const photos = (detail?.documents ?? []).filter((d) => d.kind === "PHOTO");

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!assetId) return;
    const el = document.getElementById(inputId) as HTMLInputElement | null;
    const files = el?.files;
    if (!files?.length) {
      alert("เลือกรูปอย่างน้อย 1 ไฟล์");
      return;
    }
    try {
      const fd = new FormData();
      for (let i = 0; i < files.length; i++) fd.append("photos", files[i]);
      await apiFormJson<unknown[]>(`/api/assets/${assetId}/photos`, fd);
      if (el) el.value = "";
      await load();
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    }
  }

  async function removePhoto(docId: string) {
    if (!assetId || !confirm("ลบรูปนี้?")) return;
    try {
      await apiJson(`/api/assets/${assetId}/documents/${docId}`, { method: "DELETE" });
      await load();
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  if (!assetId) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`รูปครุภัณฑ์ — ${itemLabel}`}
      size="wide"
      overlayZClass="z-[100]"
    >
      {loading && !detail ? (
        <p className="text-slate-500">กำลังโหลด…</p>
      ) : (
        <>
          <ModalFormBody>
            <p className="text-xs text-slate-500">อัปโหลดได้หลายไฟล์พร้อมกัน (เฉพาะรูปภาพ สูงสุด 24 ไฟล์ต่อครั้ง)</p>
            <form onSubmit={onUpload} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="block min-w-[200px] flex-1">
                <span className="text-xs text-slate-400">เลือกรูป</span>
                <input
                  id={inputId}
                  type="file"
                  accept="image/*"
                  multiple
                  className="mt-1 block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500"
              >
                อัปโหลด
              </button>
            </form>
            <div className="mt-6">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">รูปที่มีอยู่ ({photos.length})</p>
              {photos.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">ยังไม่มีรูป</p>
              ) : (
                <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {photos.map((p) => (
                    <li key={p.id} className="group relative overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
                      <img src={p.fileUrl} alt="" className="aspect-square w-full object-cover" />
                      <button
                        type="button"
                        className="absolute right-2 top-2 rounded-lg bg-rose-600/90 px-2 py-1 text-xs font-medium text-white opacity-90 hover:bg-rose-500"
                        onClick={() => void removePhoto(p.id)}
                      >
                        ลบ
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
        </>
      )}
    </Modal>
  );
}
