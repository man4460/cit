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
        <p className="text-slate-700">กำลังโหลด…</p>
      ) : (
        <>
          <ModalFormBody className="!space-y-4">
            {permit ? (
              <div className="rounded-lg border border-slate-200 bg-white/80 p-3">
                <p className="text-xs text-slate-600">ไฟล์แนบปัจจุบัน</p>
                <p className="mt-1 truncate text-sm text-slate-800">{permit.originalName ?? "เอกสาร"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] px-3 py-1.5"
                    onClick={openPermit}
                  >
                    แสดง / เปิดไฟล์
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
                    onClick={() => void removePermit()}
                  >
                    ลบใบอนุญาต
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600">ยังไม่มีใบอนุญาตแนบ</p>
            )}
            <form onSubmit={onUpload} className="space-y-2">
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  {permit ? "แทนที่ด้วยไฟล์ใหม่" : "แนบใบอนุญาต (รูปหรือ PDF)"}
                </span>
                <input
                  id={inputId}
                  type="file"
                  accept="image/*,.pdf,application/pdf"
                  className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-[#0000BF] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#2e2a58]"
                />
              </label>
              <button type="submit" className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] px-4 py-2">
                อัปโหลด
              </button>
            </form>
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
