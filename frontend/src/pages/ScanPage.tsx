import { useEffect, useMemo, useState } from "react";
import { PageFilterPrintBar } from "../components/PageFilterPrintBar";
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
      <h1 className="text-2xl font-bold text-white">สแกน QR / ตรวจครุภัณฑ์</h1>
      <p className="mt-1 text-slate-400">
        เปิดกล้องเมื่อกดปุ่ม (มือถือหรือคอมจะขอสิทธิ์กล้อง) — หรือเลือกรูปที่มี QR / วางโทเคนด้วยตนเอง
      </p>

      <PageFilterPrintBar
        value={listFilter}
        onChange={setListFilter}
        printTitle="สแกน QR / ตรวจครุภัณฑ์"
        placeholder="กรองชื่อ / เลขครุภัณฑ์ / ที่ตั้ง (เมื่อโหลดครุภัณฑ์แล้ว)…"
      />

      {/* element สำหรับ scanFile (ซ่อน) */}
      <div id="qr-file-reader" className="pointer-events-none fixed left-0 top-0 -z-10 h-px w-px overflow-hidden opacity-0" aria-hidden />

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          <p className="text-sm font-medium text-slate-400">กล้องสแกน QR</p>
          {!cameraOn ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <p className="text-sm leading-relaxed text-slate-500">
                กดปุ่มด้านล่างเพื่อเชื่อมต่อกล้องของอุปกรณ์นี้ (มือถือ: กล้องหลัง/หน้า — คอม: เว็บแคม) ระบบจะขออนุญาตจากเบราว์เซอร์
              </p>
              <button
                type="button"
                className="mt-4 w-full rounded-lg bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-500 sm:w-auto"
                onClick={() => setCameraOn(true)}
              >
                เปิดกล้องสแกน QR
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div id="qr-reader-region" className="rounded-xl border border-slate-800 bg-slate-900/50 p-2" />
              <button
                type="button"
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                onClick={() => setCameraOn(false)}
              >
                ปิดกล้อง
              </button>
            </div>
          )}

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-sm font-medium text-slate-400">หรือเลือกรูปที่มี QR</p>
            <p className="mt-1 text-xs text-slate-600">มือถือมักเปิดให้ถ่ายหรือเลือกจากแกลเลอรี — คอมเลือกไฟล์รูป</p>
            <label className="mt-3 block">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-600"
                onChange={(e) => void onQrImageFile(e)}
              />
            </label>
          </div>
        </div>

        <div>
          <label className="block">
            <span className="text-xs font-medium text-slate-400">โทเคน (หรือสแกนให้กรอกอัตโนมัติ)</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              placeholder="uuid จาก QR"
            />
          </label>

          {err && <p className="mt-4 text-amber-400">{err}</p>}

          {asset && !assetMatchesFilter && listFilter.trim() ? (
            <p className="mt-6 text-sm text-slate-500">
              ครุภัณฑ์ที่เปิดอยู่ไม่ตรงกับการกรอง — ล้างช่องกรองหรือค้นหาใหม่
            </p>
          ) : null}

          {asset && assetMatchesFilter && (
            <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="font-semibold text-teal-300">{asset.itemName}</h2>
              <p className="text-sm text-slate-400">
                {asset.serialNumber} · {asset.location}
              </p>
              <form onSubmit={(e) => void submitInspection(e)} className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-xs font-medium text-slate-400">สถานะการตรวจ</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
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
                    <span className="text-xs font-medium text-slate-400">ระบุสถานะ (จำเป็น)</span>
                    <input
                      required
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                      value={otherStatusText}
                      onChange={(e) => setOtherStatusText(e.target.value)}
                      placeholder="เช่น รอซ่อม, ส่งซ่อมภายนอก"
                    />
                  </label>
                )}
                <label className="block">
                  <span className="text-xs font-medium text-slate-400">หมายเหตุเพิ่มเติม (ไม่บังคับ)</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-400">รหัสบุคลากร (ไม่บังคับ)</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
                    value={personnelId}
                    onChange={(e) => setPersonnelId(e.target.value)}
                    placeholder="UUID จากระบบบุคลากร"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500"
                >
                  บันทึกการตรวจ
                </button>
                {doneMsg && <p className="text-sm text-teal-400">{doneMsg}</p>}
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
