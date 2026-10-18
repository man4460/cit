import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { BotWaterTriggersModal } from "../components/BotWaterTriggersModal";
import { apiFormJson, apiJson, apiUrl } from "../api/client";
import { NavGlyph } from "../lib/navVisuals";
import { toolbarLinkBtnClass, toolbarPrimaryBtnClass } from "../lib/uiTokens";

function RefreshGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
    </svg>
  );
}

function CriteriaGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M6 12h12M10 18h4" />
    </svg>
  );
}

function ExpandGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
    </svg>
  );
}

function CompressGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
    </svg>
  );
}

const MONITOR_SRC = "/water-monitor/index.html";
const AUTO_REFRESH_MS = 10 * 60_000;

/** ศูนย์เฝ้าระวังน้ำ ธปท. — หน้าเดิมของผู้พัฒนา ค่าฝังเป็น iframe รับข้อมูลจาก API ผ่าน postMessage */
export function WaterSituationPage() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [triggersOpen, setTriggersOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const send = useCallback((message: Record<string, unknown>) => {
    frameRef.current?.contentWindow?.postMessage({ ...message, apiBase: apiUrl("") }, window.location.origin);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const live = apiJson<unknown>("/api/water-onwr", { skipCache: true })
      .then((payload) => send({ type: "water-onwr", payload }))
      .catch((e) => send({ type: "water-onwr-error", message: e instanceof Error ? e.message : String(e) }));
    try {
      const data = await apiJson<unknown>("/api/water-situation", { skipCache: true });
      send({ type: "water-data", payload: data });
    } catch (e) {
      send({ type: "water-error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      await live;
      setLoading(false);
    }
  }, [send]);

  /* ฟอร์มกรอกค่าวัดจริงใน iframe ส่งมาให้หน้าแม่บันทึก เพราะ iframe ไม่มี token */
  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      const m = e.data as {
        type?: string;
        key?: string;
        value?: unknown;
        time?: unknown;
        note?: unknown;
        id?: string;
        photo?: File | null;
      };
      if (m?.type !== "water-manual-save" && m?.type !== "water-manual-delete") return;
      try {
        if (m.type === "water-manual-save") {
          const fd = new FormData();
          fd.append("key", String(m.key ?? ""));
          fd.append("value", String(m.value ?? ""));
          fd.append("time", String(m.time ?? ""));
          fd.append("note", String(m.note ?? ""));
          if (m.photo instanceof File) fd.append("photo", m.photo);
          await apiFormJson("/api/water-situation/manual", fd);
        } else {
          await apiJson(`/api/water-situation/manual/${encodeURIComponent(String(m.id ?? ""))}`, { method: "DELETE" });
        }
        await load();
        send({ type: "water-manual-result", ok: true });
      } catch (err) {
        send({ type: "water-manual-result", ok: false, message: err instanceof Error ? err.message : String(err) });
      }
    };
    const handler = (e: MessageEvent) => void onMessage(e);
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [load, send]);

  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = stageRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch (e) {
      alert(e instanceof Error ? e.message : "เปิดเต็มจอไม่สำเร็จ");
    }
  }, []);

  const tools = (
    <>
      <button type="button" onClick={() => void load()} disabled={loading} className={toolbarLinkBtnClass}>
        {loading ? "กำลังโหลด…" : "รีเฟรชข้อมูล"}
      </button>
      <button
        type="button"
        onClick={() => void toggleFullscreen()}
        className={toolbarLinkBtnClass}
        title={fullscreen ? "ออกจากเต็มจอ (Esc)" : "ขยายแสดงเต็มจอ"}
      >
        {fullscreen ? "ออกจากเต็มจอ" : "เต็มจอ"}
      </button>
      <button
        type="button"
        onClick={() => setTriggersOpen(true)}
        className={toolbarPrimaryBtnClass}
        title="ดูเกณฑ์ทริกเกอร์ติดตามสถานการณ์น้ำของ ธปท."
      >
        เกณฑ์ทริกเกอร์
      </button>
    </>
  );

  return (
    <div className="space-y-3 max-md:flex max-md:min-h-0 max-md:flex-1 max-md:flex-col max-md:space-y-0">
      {/* เดสก์ท็อป — หัวหน้ามาตรฐาน */}
      <div className="hidden md:block">
        <PageHeaderBar title="สถานการณ์น้ำ" extras={tools} />
      </div>

      {/* มือถือ — แถบเดียวกระชับ: ชื่อซ้าย · ปุ่มไอคอนขวา */}
      <div className="no-print md:hidden shrink-0 border-b border-slate-200/80 bg-white/90 px-3 py-2 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/12 text-sky-600 ring-1 ring-sky-500/25">
            <NavGlyph name="water" className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-black leading-tight tracking-tight text-sky-700">สถานการณ์น้ำ</h1>
            <p className="truncate text-[11px] font-semibold text-slate-500">ศูนย์เฝ้าระวัง ธปท.</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition active:scale-95 disabled:opacity-50"
              title={loading ? "กำลังโหลด…" : "รีเฟรชข้อมูล"}
              aria-label={loading ? "กำลังโหลด" : "รีเฟรชข้อมูล"}
            >
              <RefreshGlyph className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition active:scale-95"
              title={fullscreen ? "ออกจากเต็มจอ (Esc)" : "ขยายแสดงเต็มจอ"}
              aria-label={fullscreen ? "ออกจากเต็มจอ" : "เต็มจอ"}
            >
              {fullscreen ? <CompressGlyph className="h-4 w-4" /> : <ExpandGlyph className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setTriggersOpen(true)}
              className={`${toolbarPrimaryBtnClass} !h-9 !rounded-xl !px-3 !text-[12px]`}
              title="ดูเกณฑ์ทริกเกอร์ติดตามสถานการณ์น้ำของ ธปท."
            >
              <CriteriaGlyph className="h-3.5 w-3.5" />
              เกณฑ์
            </button>
          </div>
        </div>
      </div>

      <BotWaterTriggersModal open={triggersOpen} onClose={() => setTriggersOpen(false)} />
      <div
        ref={stageRef}
        className={`relative min-h-0 flex-1 bg-white max-md:flex max-md:flex-1 max-md:flex-col ${
          fullscreen ? "flex h-full w-full flex-col" : ""
        }`}
      >
        {fullscreen ? (
          <div className="absolute right-3 top-3 z-10 flex gap-2">
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-md backdrop-blur"
              title="ออกจากเต็มจอ (Esc)"
            >
              <CompressGlyph className="h-3.5 w-3.5" />
              ออกจากเต็มจอ
            </button>
          </div>
        ) : null}
        <iframe
          ref={frameRef}
          src={MONITOR_SRC}
          title="ศูนย์เฝ้าระวังน้ำ ธปท."
          allow="clipboard-write; fullscreen"
          className={`block w-full bg-white ${
            fullscreen
              ? "h-full min-h-0 flex-1 rounded-none border-0"
              : "h-[calc(100dvh-9rem)] min-h-[560px] rounded-xl border border-slate-200 max-md:h-[calc(100dvh-6.5rem)] max-md:min-h-0 max-md:flex-1 max-md:rounded-none max-md:border-x-0 max-md:border-b-0 max-md:border-t border-slate-200/70 max-md:shadow-none"
          }`}
          onLoad={() => void load()}
        />
      </div>
    </div>
  );
}
