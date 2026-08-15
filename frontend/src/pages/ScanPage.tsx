import { useEffect, useMemo, useState } from "react";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { useSearchParams } from "react-router-dom";
import { Html5Qrcode, Html5QrcodeScanner } from "html5-qrcode";
import { apiJson } from "../api/client";

type AssetDetail = {
  id: string;
  itemName: string;
  serialNumber: string;
  location: string;
  qrToken: string;
};

type InspectionChoice = "normal" | "damaged" | "other";

/** QR อาจเป็นแค่ token หรือทั้ง URL ?token=... */
function extractTokenFromScan(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  try {
    const u = new URL(t);
    const tok = u.searchParams.get("token");
    if (tok) return tok.trim();
  } catch {
    /* ไม่ใช่ URL */
  }
  return t;
}

function buildInspectionStatus(choice: InspectionChoice, otherText: string): string {
  if (choice === "normal") return "ปกติ";
  if (choice === "damaged") return "ชำรุด";
  const detail = otherText.trim();
  return detail ? `อื่นๆ: ${detail}` : "อื่นๆ";
}

export function ScanPage() {
  const [params] = useSearchParams();
  const tokenFromQuery = params.get("token") ?? "";
  const [manualToken, setManualToken] = useState("");
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [inspectionChoice, setInspectionChoice] = useState<InspectionChoice>("normal");
  const [otherStatusText, setOtherStatusText] = useState("");
  const [notes, setNotes] = useState("");
  const [personnelId, setPersonnelId] = useState("");
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [listFilter, setListFilter] = useState("");

  const effectiveToken = useMemo(() => manualToken.trim() || tokenFromQuery, [manualToken, tokenFromQuery]);

  const assetMatchesFilter = useMemo(
    () =>
      !asset ||
      rowMatchesFilter(listFilter, [asset.itemName, asset.serialNumber, asset.location, effectiveToken]),
    [asset, listFilter, effectiveToken],
  );

  useEffect(() => {
    if (!effectiveToken) {
      setAsset(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setErr(null);
        const a = await apiJson<AssetDetail>(`/api/assets/by-token/${encodeURIComponent(effectiveToken)}`);
        if (!cancelled) setAsset(a);
      } catch {
        if (!cancelled) {
          setAsset(null);
          setErr("ไม่พบครุภัณฑ์จากโทเคนนี้");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveToken]);

  useEffect(() => {
    if (!cameraOn) return;
    const id = "qr-reader-region";
    const scanner = new Html5QrcodeScanner(
      id,
      { fps: 8, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
      /* verbose */ false,
    );
    scanner.render(
      (decoded) => {
        setManualToken(extractTokenFromScan(decoded));
        setDoneMsg(null);
      },
      () => {},
    );
    return () => {
      scanner.clear().catch(() => {});
    };
  }, [cameraOn]);

  function applyDecodedToken(raw: string) {
    setManualToken(extractTokenFromScan(raw));
    setDoneMsg(null);
  }

  async function onQrImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const q = new Html5Qrcode("qr-file-reader");
    try {
      const decoded = await q.scanFile(file, false);
      applyDecodedToken(decoded);
    } catch {
      alert("ไม่พบ QR ในรูป — ลองถ่ายให้ชัด หรือใช้ปุ่มเปิดกล้องสแกน");
    } finally {
      try {
        q.clear();
      } catch {
        /* ignore */
      }
    }
  }

  async function submitInspection(e: React.FormEvent) {
    e.preventDefault();
    if (!asset) return;
    if (inspectionChoice === "other" && !otherStatusText.trim()) {
      alert("เลือก \"อื่นๆ\" กรุณากรอกรายละเอียดสถานะ");
      return;
    }
    setDoneMsg(null);
    const status = buildInspectionStatus(inspectionChoice, otherStatusText);
    try {
      await apiJson(`/api/assets/${asset.id}/inspections`, {
        method: "POST",
        body: JSON.stringify({
          status,
          notes: notes.trim() || null,
          personnelId: personnelId.trim() || null,
        }),
      });
      setNotes("");
      setInspectionChoice("normal");
      setOtherStatusText("");
      setDoneMsg("บันทึกการตรวจแล้ว");
    } catch (err) {
      alert(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    }
  }

  return (
    <div>
      <PageHeaderBar
        title="สแกน QR"
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "สแกน QR / ตรวจครุภัณฑ์",
          placeholder: "กรองชื่อ / เลขครุภัณฑ์ / ที่ตั้ง (เมื่อโหลดครุภัณฑ์แล้ว)…",
        }}
      />

      {/* element สำหรับ scanFile (ซ่อน) */}
      <div id="qr-file-reader" className="pointer-events-none fixed left-0 top-0 -z-10 h-px w-px overflow-hidden opacity-0" aria-hidden />

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#66638c]">กล้องสแกน QR</p>
          {!cameraOn ? (
            <div className="rounded-[1.25rem] border border-[#e8e6fc]/90 bg-gradient-to-br from-white/90 via-[#f5f3ff]/70 to-[#fdf2f8]/55 p-4 shadow-[0_12px_36px_-24px_rgba(30,27,75,0.28)]">
              <p className="text-sm text-slate-600">เปิดกล้องเพื่อสแกน QR บนอุปกรณ์นี้</p>
              <button
                type="button"
                className="mt-4 w-full rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] sm:w-auto"
                onClick={() => setCameraOn(true)}
              >
                เปิดกล้อง
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div id="qr-reader-region" className="rounded-[1.25rem] border border-[#e8e6fc] bg-white/85 p-2 shadow-sm" />
              <button
                type="button"
                className="inline-flex h-9 items-center rounded-xl border border-[#dcd8f0] bg-white px-3 text-xs font-bold text-[#2e2a58] shadow-sm hover:bg-[#0000BF]/5"
                onClick={() => setCameraOn(false)}
              >
                ปิดกล้อง
              </button>
            </div>
          )}

          <div className="rounded-[1.25rem] border border-[#e8e6fc]/90 bg-white/80 p-4 shadow-sm">
            <p className="text-sm font-bold text-[#1e1b4b]">เลือกรูปที่มี QR</p>
            <label className="mt-3 block">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-[#0000BF]/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#2e2a58] hover:file:bg-[#0000BF]/15"
                onChange={(e) => void onQrImageFile(e)}
              />
            </label>
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-[#e8e6fc]/90 bg-white/80 p-4 shadow-[0_12px_36px_-24px_rgba(30,27,75,0.28)]">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-wide text-[#66638c]">โทเคน</span>
            <input
              className="mt-1 w-full rounded-xl border border-[#dcd8f0] bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#0000BF]/20"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              placeholder="uuid จาก QR"
            />
          </label>

          {err && <p className="mt-4 text-sm text-amber-700">{err}</p>}

          {asset && !assetMatchesFilter && listFilter.trim() ? (
            <p className="mt-4 text-sm text-slate-500">ครุภัณฑ์ที่เปิดอยู่ไม่ตรงกับการกรอง</p>
          ) : null}

          {asset && assetMatchesFilter && (
            <div className="mt-4 rounded-[1rem] border border-[#e8e6fc] bg-gradient-to-br from-[#f5f3ff]/80 to-white p-4">
              <h2 className="font-black text-[#1e1b4b]">{asset.itemName}</h2>
              <p className="text-sm text-slate-600">
                {asset.serialNumber} · {asset.location}
              </p>
              <form onSubmit={(e) => void submitInspection(e)} className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">สถานะการตรวจ</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={inspectionChoice}
                    onChange={(e) => setInspectionChoice(e.target.value as InspectionChoice)}
                  >
                    <option value="normal">ปกติ</option>
                    <option value="damaged">ชำรุด</option>
                    <option value="other">อื่นๆ (ระบุ)</option>
                  </select>
                </label>
                {inspectionChoice === "other" && (
                  <label className="block">
                    <span className="text-xs font-medium text-slate-700">ระบุสถานะ (จำเป็น)</span>
                    <input
                      required
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                      value={otherStatusText}
                      onChange={(e) => setOtherStatusText(e.target.value)}
                      placeholder="เช่น รอซ่อม, ส่งซ่อมภายนอก"
                    />
                  </label>
                )}
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">หมายเหตุเพิ่มเติม (ไม่บังคับ)</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">รหัสบุคลากร (ไม่บังคับ)</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900"
                    value={personnelId}
                    onChange={(e) => setPersonnelId(e.target.value)}
                    placeholder="UUID จากระบบบุคลากร"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] px-4 py-2"
                >
                  บันทึกการตรวจ
                </button>
                {doneMsg && <p className="text-sm text-[#5b61ff]">{doneMsg}</p>}
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
