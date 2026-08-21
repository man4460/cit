import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../api/client";
import { MissionsSubNav } from "../components/MissionsSubNav";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { formatBaht } from "../lib/formatNumber";
import {
  listCardAccentClass,
  listCardClass,
  toolbarPrimaryBtnClass,
} from "../lib/uiTokens";
import type { MissionEstimateRecord } from "../types";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

export function MissionEstimatesPage() {
  const [rows, setRows] = useState<MissionEstimateRecord[]>([]);
  const [filter, setFilter] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setRows(await apiJson<MissionEstimateRecord[]>("/api/mission-estimates", { skipCache: true }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        rowMatchesFilter(filter, [
          r.mission?.title,
          r.mission?.code,
          r.currentLabel,
          r.previousLabel,
          r.mission?.route?.startLocation,
          r.mission?.route?.endLocation,
          r.mission?.route?.name,
        ]),
      ),
    [rows, filter],
  );

  return (
    <div>
      <PageHeaderBar
        title="ประมาณการค่าใช้จ่าย"
        count={filtered.length}
        filter={{
          value: filter,
          onChange: setFilter,
          printTitle: "ประมาณการค่าใช้จ่ายภารกิจ",
          placeholder: "กรองชื่อ / รหัส / เส้นทาง…",
        }}
        extras={
          <Link to="/missions/estimates/new" className={toolbarPrimaryBtnClass}>
            สร้างประมาณการ
          </Link>
        }
        primary={<MissionsSubNav />}
      />

      {err ? (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>
      ) : null}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-slate-600">กำลังโหลด…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">
            ยังไม่มีประมาณการ — กด «สร้างประมาณการ»
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">
            ไม่มีรายการที่ตรงกับการกรอง
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((r, idx) => {
              const label = r.mission?.title ?? r.currentLabel ?? r.mission?.code ?? r.id.slice(0, 8);
              return (
                <li key={r.id}>
                  <Link to={`/missions/estimates/${r.id}`} className={`${listCardClass} block`}>
                    <span className={`absolute inset-y-0 left-0 w-1 ${listCardAccentClass(idx)}`} aria-hidden />
                    <div className="min-w-0 pl-2">
                      <p className="line-clamp-2 text-sm font-bold text-[#1e1b4b]">{label}</p>
                      {r.mission?.code ? (
                        <p className="mt-1 font-mono text-[11px] text-[#66638c]">{r.mission.code}</p>
                      ) : null}
                      {r.mission?.route ? (
                        <p className="mt-1.5 truncate text-xs font-medium text-[#2e2a58]">
                          {r.mission.route.startLocation}
                          <span className="mx-1 text-[#8b5cf6]">→</span>
                          {r.mission.route.endLocation}
                        </p>
                      ) : null}
                      <p className="mt-2 text-[11px] text-slate-600">
                        ไป {formatWhen(r.mission?.plannedStart)}
                        <span className="mx-1.5 text-slate-400">·</span>
                        กลับ {formatWhen(r.mission?.plannedEnd)}
                      </p>
                      <p className="mt-2 text-sm font-black tabular-nums text-[#0000BF]">
                        {formatBaht(r.approvalTotal)}
                      </p>
                      {r.previousLabel || r.previousMission?.title ? (
                        <p className="mt-1 truncate text-[11px] text-slate-500">
                          เทียบประมาณการ {r.previousLabel || r.previousMission?.title || r.previousMission?.code}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
