import { useCallback, useEffect, useState } from "react";
import { apiFormJson, apiJson } from "../api/client";
import { prepareFilesForUpload } from "../lib/prepareImageFileForUpload";
import { Modal, ModalFormActions, ModalFormBody } from "./Modal";
import type { AssetDetail } from "../types";
import type { LoadOptions } from "../lib/loadOptions";
import { setLoadBusy } from "../lib/loadOptions";

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

  const load = useCallback(async (opts?: LoadOptions) => {
    if (!assetId || !open) return;
    setLoadBusy(setLoading, opts, true);
    try {
      const a = await apiJson<AssetDetail>(`/api/assets/${assetId}`);
      setDetail(a);
    } catch {
      setDetail(null);
    } finally {
      setLoadBusy(setLoading, opts, false);
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
      const prepared = await prepareFilesForUpload(files);
      const fd = new FormData();
      for (const f of prepared) fd.append("photos", f);
      await apiFormJson<unknown[]>(`/api/assets/${assetId}/photos`, fd);
      if (el) el.value = "";
      await load({ silent: true });
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    }
  }

  async function removePhoto(docId: string) {
    if (!assetId || !confirm("ลบรูปนี้?")) return;
    try {
      await apiJson(`/api/assets/${assetId}/documents/${docId}`, { method: "DELETE" });
      await load({ silent: true });
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
        <p className="text-slate-700">กำลังโหลด…</p>
      ) : (
        <>
          <ModalFormBody>
            <p className="text-xs text-slate-600">อัปโหลดได้หลายไฟล์พร้อมกัน (เฉพาะรูปภาพ สูงสุด 24 ไฟล์ต่อครั้ง)</p>
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
                  {photos.map((p) => (
                    <li key={p.id} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <img src={p.fileUrl} alt="" className="aspect-square w-full object-cover" />
                      <button
                        type="button"
                        className="absolute right-2 top-2 rounded-lg bg-rose-600/90 px-2 py-1 text-xs font-medium text-[#1e1b3a] opacity-90 hover:bg-rose-500"
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
