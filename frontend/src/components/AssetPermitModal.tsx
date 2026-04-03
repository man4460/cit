import { useCallback, useEffect, useState } from "react";
import { apiFormJson, apiJson } from "../api/client";
import { Modal, ModalFormActions, ModalFormBody } from "./Modal";
import type { AssetDetail } from "../types";

export function AssetPermitModal({
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
  const inputId = assetId ? `asset-permit-${assetId}` : "asset-permit-none";

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
    void load();
  }, [load]);

  const permit = (detail?.documents ?? []).find((d) => d.kind === "PERMIT");

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!assetId) return;
    const el = document.getElementById(inputId) as HTMLInputElement | null;
    const file = el?.files?.[0];
    if (!file) {
      alert("เลือกไฟล์");
      return;
    }
    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiFormJson(`/api/assets/${assetId}/permit`, fd);
      if (el) el.value = "";
      await load();
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    }
  }

  async function removePermit() {
    if (!assetId || !permit || !confirm("ลบใบอนุญาต?")) return;
    try {
      await apiJson(`/api/assets/${assetId}/documents/${permit.id}`, { method: "DELETE" });
      await load();
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  function openPermit() {
    if (!permit) return;
    window.open(permit.fileUrl, "_blank", "noopener,noreferrer");
  }

  if (!assetId) return null;

  return (
    <Modal open={open} onClose={onClose} title={`ส่วนการขออนุญาต — ${itemLabel}`} overlayZClass="z-[100]">
      {loading && !detail ? (
        <p className="text-slate-500">กำลังโหลด…</p>
      ) : (
        <>
          <ModalFormBody className="!space-y-4">
            {permit ? (
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
                <p className="text-xs text-slate-500">ไฟล์แนบปัจจุบัน</p>
                <p className="mt-1 truncate text-sm text-slate-200">{permit.originalName ?? "เอกสาร"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-500"
                    onClick={openPermit}
                  >
                    แสดง / เปิดไฟล์
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                    onClick={() => void removePermit()}
                  >
                    ลบใบอนุญาต
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">ยังไม่มีใบอนุญาตแนบ</p>
            )}
            <form onSubmit={onUpload} className="space-y-2">
              <label className="block">
                <span className="text-xs font-medium text-slate-400">
                  {permit ? "แทนที่ด้วยไฟล์ใหม่" : "แนบใบอนุญาต (รูปหรือ PDF)"}
                </span>
                <input
                  id={inputId}
                  type="file"
                  accept="image/*,.pdf,application/pdf"
                  className="mt-1 block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
                />
              </label>
              <button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500">
                อัปโหลด
              </button>
            </form>
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
