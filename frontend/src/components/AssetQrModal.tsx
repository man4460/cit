import { useCallback, useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Modal, ModalFormActions, ModalFormBody } from "./Modal";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function AssetQrModal({
  open,
  onClose,
  scanUrl,
  itemName,
  serialNumber,
}: {
  open: boolean;
  onClose: () => void;
  scanUrl: string;
  itemName: string;
  serialNumber: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const downloadPng = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    const safe = serialNumber.replace(/[^\w\-]+/g, "_").slice(0, 40) || "qr";
    a.download = `qr-${safe}.png`;
    a.click();
  }, [serialNumber]);

  const printLabel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) {
      alert("เบราว์เซอร์บล็อกป๊อปอัป — อนุญาตป๊อปอัปแล้วลองพิมพ์อีกครั้ง");
      return;
    }
    w.document.open();
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>QR ครุภัณฑ์</title>
      <style>
        body { font-family: system-ui, sans-serif; text-align: center; padding: 24px; color: #111; }
        h1 { font-size: 18px; margin: 0 0 8px; }
        p.meta { margin: 4px 0; font-size: 14px; color: #333; }
        img { display: block; margin: 16px auto; width: 280px; height: 280px; }
        .url { font-size: 9px; word-break: break-all; color: #555; max-width: 360px; margin: 12px auto; }
        @media print { body { padding: 8px; } }
      </style></head><body>
      <h1>${escapeHtml(itemName)}</h1>
      <p class="meta">เลขครุภัณฑ์: ${escapeHtml(serialNumber)}</p>
      <img src="${dataUrl}" alt="QR" width="280" height="280" />
      <p class="url">${escapeHtml(scanUrl)}</p>
      </body></html>`);
    w.document.close();
    w.onload = () => {
      w.focus();
      w.print();
    };
  }, [itemName, scanUrl, serialNumber]);

  const copyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(scanUrl);
      alert("คัดลอกลิงก์แล้ว");
    } catch {
      prompt("คัดลอกลิงก์ด้วยตนเอง:", scanUrl);
    }
  }, [scanUrl]);

  return (
    <Modal open={open} onClose={onClose} title="QR สำหรับสติกเกอร์ / สแกน" size="wide" overlayZClass="z-[100]">
      <ModalFormBody className="!space-y-4">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-center sm:gap-8">
          <div className="rounded-xl bg-white p-4 shadow-inner">
            <QRCodeCanvas ref={canvasRef} value={scanUrl} size={240} level="M" />
          </div>
          <div className="max-w-md space-y-3 text-sm text-slate-700">
            <p>
              <span className="text-slate-700">รายการ:</span> <span className="font-medium text-[#1e1b3a]">{itemName}</span>
            </p>
            <p>
              <span className="text-slate-700">เลขครุภัณฑ์:</span> {serialNumber}
            </p>
            <p className="break-all font-mono text-xs text-slate-600">{scanUrl}</p>
            <p className="text-xs leading-relaxed text-slate-700">
              สแกนด้วยมือถือจะเปิดหน้า &quot;สแกน QR&quot; พร้อมโทเคนของครุภัณฑ์นี้ — ต้องเข้าเว็บจากที่อยู่เดียวกับที่อยู่ใน QR (เช่น IP ใน LAN หรือโดเมนจริง)
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] px-4 py-2"
            onClick={downloadPng}
          >
            ดาวน์โหลด PNG
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
            onClick={printLabel}
          >
            พิมพ์
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
            onClick={() => void copyUrl()}
          >
            คัดลอกลิงก์
          </button>
        </div>
      </ModalFormBody>
      <ModalFormActions>
        <button type="button" className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100" onClick={onClose}>
          ปิด
        </button>
      </ModalFormActions>
    </Modal>
  );
}
