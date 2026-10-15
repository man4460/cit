import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { apiJson, apiUrl } from "../api/client";
import { toolbarLinkBtnClass } from "../lib/uiTokens";

const MONITOR_SRC = "/water-monitor/index.html";
const AUTO_REFRESH_MS = 10 * 60_000;

/** ศูนย์เฝ้าระวังน้ำ ธปท. — หน้าเดิมของผู้พัฒนาฝังเป็น iframe รับข้อมูลจาก API ผ่าน postMessage */
export function WaterSituationPage() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(false);

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
      const m = e.data as { type?: string; key?: string; value?: unknown; time?: unknown; note?: unknown; id?: string };
      if (m?.type !== "water-manual-save" && m?.type !== "water-manual-delete") return;
      try {
        if (m.type === "water-manual-save")
          await apiJson("/api/water-situation/manual", { method: "POST", body: JSON.stringify({ key: m.key, value: m.value, time: m.time, note: m.note }) });
        else await apiJson(`/api/water-situation/manual/${encodeURIComponent(String(m.id ?? ""))}`, { method: "DELETE" });
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

  return (
    <div className="space-y-3">
      <PageHeaderBar
        title="สถานการณ์น้ำ"
        extras={
          <button type="button" onClick={() => void load()} disabled={loading} className={toolbarLinkBtnClass}>
            {loading ? "กำลังโหลด…" : "รีเฟรชข้อมูล"}
          </button>
        }
      />
      <iframe
        ref={frameRef}
        src={MONITOR_SRC}
        title="ศูนย์เฝ้าระวังน้ำ ธปท."
        allow="clipboard-write"
        className="block h-[calc(100dvh-9rem)] min-h-[560px] w-full rounded-xl border border-slate-200 bg-white"
        onLoad={() => void load()}
      />
    </div>
  );
}
