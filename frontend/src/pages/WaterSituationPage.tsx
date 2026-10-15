import { useCallback, useRef, useState } from "react";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { apiJson, apiUrl } from "../api/client";
import { toolbarLinkBtnClass } from "../lib/uiTokens";

const MONITOR_SRC = "/water-monitor/index.html";

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
