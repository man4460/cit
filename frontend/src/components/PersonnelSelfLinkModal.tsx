import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { apiJson } from "../api/client";
import { selfServiceUrl } from "../lib/pdpa";
import { Modal, ModalFormActions, ModalFormBody } from "./Modal";

type LinkInfo = { token: string; expiresAt: string | null } | null;

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * person = ลิงก์ให้บุคคลนั้นแก้ข้อมูลตนเอง (ต้องใส่เลขบัตรตรงกับเจ้าของลิงก์)
 * invite = ลิงก์ใช้ร่วมกันหลายคน — ใส่เลขบัตรแล้วเข้าข้อมูลของตน หรือลงทะเบียนใหม่ถ้ายังไม่มี
 */
export function PersonnelSelfLinkModal({
  open,
  onClose,
  person,
}: {
  open: boolean;
  onClose: () => void;
  person: { id: string; fullName: string } | null;
}) {
  const [link, setLink] = useState<LinkInfo>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const base = person ? `/api/personnel/${person.id}/self-link` : "/api/personnel/self-invite";
  const title = person ? `ลิงก์แก้ไขข้อมูลตนเอง — ${person.fullName}` : "ลิงก์ / QR ลงทะเบียนบุคลากรใหม่";

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setLoading(true);
    apiJson<LinkInfo>(base, { skipCache: true })
      .then((r) => setLink(r ? { token: r.token, expiresAt: r.expiresAt } : null))
      .catch((e) => setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [open, base]);

  const generate = useCallback(async () => {
    if (link && !confirm("สร้างลิงก์ใหม่? ลิงก์และ QR เดิมจะใช้ไม่ได้ทันที")) return;
    setErr(null);
    try {
      const r = await apiJson<{ token: string; expiresAt: string | null }>(base, { method: "POST" });
      setLink({ token: r.token, expiresAt: r.expiresAt });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "สร้างลิงก์ไม่สำเร็จ");
    }
  }, [base, link]);

  const revoke = useCallback(async () => {
    if (!confirm("ยกเลิกลิงก์นี้? ผู้ที่ถือลิงก์หรือ QR เดิมจะเข้าไม่ได้อีก")) return;
    try {
      await apiJson(`${base}/revoke`, { method: "POST" });
      setLink(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ยกเลิกไม่สำเร็จ");
    }
  }, [base]);

  const url = link ? selfServiceUrl(link.token) : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      alert("คัดลอกลิงก์แล้ว");
    } catch {
      prompt("คัดลอกลิงก์ด้วยตนเอง:", url);
    }
  };

  const download = () => {
    const c = canvasRef.current;
    if (!c) return;
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = person ? `qr-แก้ข้อมูล-${person.fullName}.png` : "qr-ลงทะเบียนบุคลากร.png";
    a.click();
  };

  const print = () => {
    const c = canvasRef.current;
    if (!c) return;
    const w = window.open("", "_blank");
    if (!w) return alert("เบราว์เซอร์บล็อกป๊อปอัป — อนุญาตป๊อปอัปแล้วลองใหม่");
    const heading = person ? `แก้ไขข้อมูลบุคลากร: ${person.fullName}` : "ลงทะเบียนข้อมูลบุคลากร";
    const note = person
      ? "สแกนเพื่อตรวจสอบและแก้ไขข้อมูลของท่าน (ยืนยันด้วยเลขบัตรประชาชน 13 หลัก)"
      : "สแกนแล้วใส่เลขบัตรประชาชนของท่าน เพื่อกรอกหรือแก้ไขข้อมูลบุคลากรสำหรับภารกิจขนส่งธนบัตร";
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>QR</title>
      <style>body{font-family:system-ui,sans-serif;text-align:center;padding:32px;color:#111}h1{font-size:20px;margin:0 0 6px}
      p{font-size:13px;color:#444;margin:4px 0}img{width:300px;height:300px;margin:18px auto;display:block}
      .u{font-size:9px;word-break:break-all;color:#666;max-width:380px;margin:8px auto}</style></head><body>
      <h1>${escapeHtml(heading)}</h1><p>${escapeHtml(note)}</p>
      <img src="${c.toDataURL("image/png")}" alt="QR"/>
      <p>ข้อมูลใช้ในภารกิจขนส่งธนบัตรเท่านั้น · ทำลายอัตโนมัติเมื่อไม่มีความเคลื่อนไหวครบ 2 ปี</p>
      <p>ลิงก์ใช้ได้ถึง ${escapeHtml(fmtDate(link?.expiresAt ?? null))}</p>
      <p class="u">${escapeHtml(url)}</p></body></html>`);
    w.document.close();
    w.onload = () => {
      w.focus();
      w.print();
    };
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="wide">
      <ModalFormBody className="!space-y-4">
        {err ? <p className="text-sm text-rose-600">{err}</p> : null}
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] leading-relaxed text-slate-600">
          {person
            ? "ส่งลิงก์หรือ QR นี้ให้เจ้าของข้อมูลเท่านั้น — หน้าแรกผู้เปิดต้องยอมรับ PDPA และใส่เลขบัตรประชาชน 13 หลักให้ตรงกับเจ้าของลิงก์ก่อนเห็นข้อมูล ไปหน้าอื่นของระบบไม่ได้"
            : "ใช้ลิงก์เดียวกันได้ทุกคน — หน้าแรกต้องยอมรับ PDPA และใส่เลขบัตรประชาชนของตนเอง ถ้ามีข้อมูลอยู่แล้วจะเข้าไปแก้ไขข้อมูลของตนเอง ถ้ายังไม่มีจะเป็นการลงทะเบียนใหม่"}{" "}
          ลิงก์มีอายุ 30 วัน
        </p>
        {loading ? (
          <p className="py-6 text-center text-sm text-slate-500">กำลังโหลด…</p>
        ) : link ? (
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-center sm:gap-8">
            <div className="rounded-xl bg-white p-4 shadow-inner">
              <QRCodeCanvas ref={canvasRef} value={url} size={220} level="M" />
            </div>
            <div className="max-w-md space-y-2 text-sm text-slate-700">
              <p>
                ใช้ได้ถึง <b className="text-[#1e1b4b]">{fmtDate(link.expiresAt)}</b>
              </p>
              <p className="break-all rounded-lg bg-slate-50 px-2 py-1.5 font-mono text-[11px] text-slate-600">{url}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={() => void copy()} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[12.5px] font-bold text-indigo-700 hover:bg-indigo-100">
                  คัดลอกลิงก์
                </button>
                <button type="button" onClick={download} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-bold text-slate-700 hover:bg-slate-50">
                  ดาวน์โหลด QR
                </button>
                <button type="button" onClick={print} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-bold text-slate-700 hover:bg-slate-50">
                  พิมพ์
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-slate-500">ยังไม่มีลิงก์ที่ใช้งานได้</p>
        )}
      </ModalFormBody>
      <ModalFormActions>
        <button
          type="button"
          onClick={() => void generate()}
          className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25"
        >
          {link ? "สร้างลิงก์ใหม่" : "สร้างลิงก์ / QR"}
        </button>
        {link ? (
          <button type="button" onClick={() => void revoke()} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-100">
            ยกเลิกลิงก์
          </button>
        ) : null}
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700">
          ปิด
        </button>
      </ModalFormActions>
    </Modal>
  );
}
