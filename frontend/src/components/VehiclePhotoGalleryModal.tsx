import { useCallback, useEffect, useState } from "react";
import { apiJson } from "../api/client";
import type { VehicleDetail } from "../types";

export function VehiclePhotoGalleryModal({
  vehicleId,
  licensePlate,
  open,
  onClose,
}: {
  vehicleId: string | null;
  licensePlate: string;
  open: boolean;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<VehicleDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);

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
    if (!open) return;
    setIndex(0);
    setDetail(null);
    void load();
  }, [vehicleId, open, load]);

  const photos = (detail?.documents ?? []).filter((d) => d.kind === "PHOTO");
  const total = photos.length;
  const clampedIdx = total === 0 ? 0 : Math.min(Math.max(0, index), total - 1);
  const current = photos[clampedIdx];

  const goPrev = useCallback(() => {
    setIndex((i) => (total <= 0 ? 0 : Math.max(0, i - 1)));
  }, [total]);

  const goNext = useCallback(() => {
    setIndex((i) => (total <= 0 ? 0 : Math.min(total - 1, i + 1)));
  }, [total]);

  const canPrev = total > 0 && clampedIdx > 0;
  const canNext = total > 0 && clampedIdx < total - 1;

  useEffect(() => {
    if (total === 0) return;
    setIndex((i) => Math.min(Math.max(0, i), total - 1));
  }, [total]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => (total <= 0 ? 0 : Math.max(0, i - 1)));
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setIndex((i) => (total <= 0 ? 0 : Math.min(total - 1, i + 1)));
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, total]);

  if (!open || !vehicleId) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        aria-label="ปิด"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`ดูรูป ${licensePlate}`}
        className="relative flex max-h-[min(92vh,52rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-white">ดูรูป — {licensePlate}</h2>
            {total > 0 && (
              <p className="text-xs text-slate-500">
                {clampedIdx + 1} / {total} · ลูกศร ← → เปลี่ยนรูป
              </p>
            )}
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="ปิด"
            onClick={onClose}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="relative flex min-h-[200px] flex-1 items-center justify-center gap-2 bg-black/40 px-2 py-4 sm:gap-4 sm:px-4">
          {loading ? (
            <p className="text-slate-500">กำลังโหลด…</p>
          ) : total === 0 ? (
            <p className="text-center text-slate-500">ยังไม่มีรูป — ใช้ปุ่ม &quot;รูป (0)&quot; เพื่ออัปโหลด</p>
          ) : (
            <>
              <button
                type="button"
                disabled={!canPrev}
                onClick={goPrev}
                className="shrink-0 rounded-full border border-slate-600 bg-slate-800/90 p-2.5 text-white shadow-lg enabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-35 sm:p-3"
                aria-label="รูปก่อนหน้า"
              >
                <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
                <img
                  src={current.fileUrl}
                  alt=""
                  className="max-h-[min(65vh,28rem)] w-full max-w-full object-contain"
                />
              </div>
              <button
                type="button"
                disabled={!canNext}
                onClick={goNext}
                className="shrink-0 rounded-full border border-slate-600 bg-slate-800/90 p-2.5 text-white shadow-lg enabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-35 sm:p-3"
                aria-label="รูปถัดไป"
              >
                <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}
        </div>

        {total > 0 && (
          <footer className="shrink-0 border-t border-slate-800 px-4 py-3 text-center sm:px-5">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                disabled={!canPrev}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={goPrev}
              >
                ← ก่อนหน้า
              </button>
              <button
                type="button"
                disabled={!canNext}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={goNext}
              >
                ถัดไป →
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
