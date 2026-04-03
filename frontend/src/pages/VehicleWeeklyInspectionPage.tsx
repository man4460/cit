import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiJson } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { currentUserLabel } from "../lib/currentUserLabel";
import { mondayOfWeekContaining } from "../lib/inspectionWeek";
import { VEHICLE_WEEKLY_TOPICS } from "../lib/vehicleWeeklyTopics";
import { vehicleDisplayLabel, type VehicleWeeklyCheckResult, type VehicleWeeklyInspectionMatrixResponse } from "../types";

type RowDraft = {
  airConditioning: VehicleWeeklyCheckResult | null;
  engineOperation: VehicleWeeklyCheckResult | null;
  tireCondition: VehicleWeeklyCheckResult | null;
  cctvAnalog: VehicleWeeklyCheckResult | null;
  cctvThinkware: VehicleWeeklyCheckResult | null;
  engineStart5Min: VehicleWeeklyCheckResult | null;
  inspectorName: string;
  remarks: string;
};

function emptyDraft(inspectorDefault: string): RowDraft {
  return {
    airConditioning: null,
    engineOperation: null,
    tireCondition: null,
    cctvAnalog: null,
    cctvThinkware: null,
    engineStart5Min: null,
    inspectorName: inspectorDefault,
    remarks: "",
  };
}

function draftFromInspection(
  i: NonNullable<VehicleWeeklyInspectionMatrixResponse["rows"][0]["inspection"]>,
  inspectorDefault: string,
): RowDraft {
  const saved = i.inspectorName?.trim() ?? "";
  return {
    airConditioning: i.airConditioning,
    engineOperation: i.engineOperation,
    tireCondition: i.tireCondition,
    cctvAnalog: i.cctvAnalog,
    cctvThinkware: i.cctvThinkware,
    engineStart5Min: i.engineStart5Min,
    inspectorName: saved || inspectorDefault,
    remarks: i.remarks ?? "",
  };
}

function CheckPairCells({
  value,
  onPick,
}: {
  value: VehicleWeeklyCheckResult | null;
  onPick: (v: VehicleWeeklyCheckResult | null) => void;
}) {
  const td = "border border-slate-700 p-0.5 text-center align-middle print:border-gray-400";
  return (
    <>
      <td className={td}>
        <button
          type="button"
          title="ปกติ"
          className={`flex h-9 w-full min-w-[2rem] items-center justify-center rounded text-base sm:min-w-[2.25rem] ${
            value === "NORMAL" ? "bg-emerald-900/55 font-semibold text-emerald-200" : "text-slate-600 hover:bg-slate-800"
          }`}
          onClick={() => onPick(value === "NORMAL" ? null : "NORMAL")}
        >
          {value === "NORMAL" ? "✓" : ""}
        </button>
      </td>
      <td className={td}>
        <button
          type="button"
          title="ผิดปกติ / ไม่ปกติ"
          className={`flex h-9 w-full min-w-[2rem] items-center justify-center rounded text-base sm:min-w-[2.25rem] ${
            value === "ABNORMAL" ? "bg-rose-900/45 font-semibold text-rose-200" : "text-slate-600 hover:bg-slate-800"
          }`}
          onClick={() => onPick(value === "ABNORMAL" ? null : "ABNORMAL")}
        >
          {value === "ABNORMAL" ? "✓" : ""}
        </button>
      </td>
    </>
  );
}

export function VehicleWeeklyInspectionPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const weekFromUrl = searchParams.get("week")?.trim();

  const defaultWeek = useMemo(() => mondayOfWeekContaining(new Date()), []);
  const weekStart = weekFromUrl && /^\d{4}-\d{2}-\d{2}$/.test(weekFromUrl) ? weekFromUrl : defaultWeek;

  const inspectorDefault = useMemo(() => currentUserLabel(user), [user]);

  const [matrix, setMatrix] = useState<VehicleWeeklyInspectionMatrixResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiJson<VehicleWeeklyInspectionMatrixResponse>(
        `/api/vehicles/weekly-inspection-matrix?weekStart=${encodeURIComponent(weekStart)}`,
      );
      setMatrix(data);
      const def = currentUserLabel(user);
      const next: Record<string, RowDraft> = {};
      for (const r of data.rows) {
        next[r.vehicle.id] = r.inspection ? draftFromInspection(r.inspection, def) : emptyDraft(def);
      }
      setDrafts(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
      setMatrix(null);
    } finally {
      setLoading(false);
    }
  }, [weekStart, user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!matrix || !inspectorDefault) return;
    setDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const r of matrix.rows) {
        const row = next[r.vehicle.id];
        if (!row) continue;
        const savedInDb = r.inspection?.inspectorName?.trim();
        if (savedInDb) continue;
        if (!row.inspectorName.trim()) {
          next[r.vehicle.id] = { ...row, inspectorName: inspectorDefault };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [matrix, inspectorDefault]);

  function setWeek(w: string) {
    setSearchParams(w === defaultWeek ? {} : { week: w });
  }

  function updateDraft(vehicleId: string, patch: Partial<RowDraft>) {
    setDrafts((d) => ({
      ...d,
      [vehicleId]: { ...(d[vehicleId] ?? emptyDraft(inspectorDefault)), ...patch },
    }));
  }

  async function saveRow(vehicleId: string) {
    const d = drafts[vehicleId];
    if (!d) return;
    setSavingId(vehicleId);
    setErr(null);
    try {
      await apiJson(`/api/vehicles/${vehicleId}/weekly-inspection`, {
        method: "PUT",
        body: JSON.stringify({
          weekStart,
          airConditioning: d.airConditioning,
          engineOperation: d.engineOperation,
          tireCondition: d.tireCondition,
          cctvAnalog: d.cctvAnalog,
          cctvThinkware: d.cctvThinkware,
          engineStart5Min: d.engineStart5Min,
          inspectorName: d.inspectorName.trim() || inspectorDefault || null,
          remarks: d.remarks.trim() || null,
        }),
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSavingId(null);
    }
  }

  const thGroup =
    "border border-slate-600 bg-slate-800/90 px-1 py-2 text-center align-bottom text-[10px] font-semibold leading-tight text-slate-100 sm:text-xs";
  const thSub = "border border-slate-600 bg-slate-800/60 px-0.5 py-1.5 text-[9px] font-medium text-slate-400 sm:text-[10px]";
  const tdCell = "border border-slate-700 px-0.5 py-1 align-middle sm:px-1";

  return (
    <div className="weekly-inspection-print">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-white">ตรวจยานพาหนะประจำสัปดาห์</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            ตารางตรวจตามหัวข้อหลัก — เลือกวันจันทร์ของสัปดาห์ (หรือวันอ้างอิง) แล้วทำเครื่องหมายปกติ / ผิดปกติ คอลัมน์สตาร์ท 5 นาที ใช้ความหมายเดียวกับ &quot;ไม่ปกติ&quot; ที่ผิดปกติ
          </p>
        </div>
        <Link
          to="/vehicles"
          className="shrink-0 rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          ← รายการยานพาหนะ
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4 print:hidden">
        <label className="block">
          <span className="text-xs font-medium text-slate-500">สัปดาห์อ้างอิง (แนะนำวันจันทร์)</span>
          <input
            type="date"
            className="mt-1 block rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            value={weekStart}
            onChange={(e) => setWeek(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          onClick={() => setWeek(mondayOfWeekContaining(new Date()))}
        >
          สัปดาห์นี้
        </button>
      </div>

      {err ? <p className="mt-3 text-sm text-rose-400 print:hidden">{err}</p> : null}

      <div className="no-print mb-4 mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
        >
          พิมพ์ตาราง
        </button>
      </div>
      <h2 className="mb-3 hidden text-center text-lg font-bold text-black print:block">
        ตรวจยานพาหนะประจำสัปดาห์ — วันอ้างอิง {weekStart}
      </h2>

      {loading ? (
        <p className="mt-8 text-center text-slate-500 print:hidden">กำลังโหลด…</p>
      ) : !matrix?.rows.length ? (
        <p className="mt-8 text-center text-slate-500 print:hidden">ยังไม่มียานพาหนะในระบบ</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40 print:border-0 print:bg-transparent">
          <table className="w-full min-w-[920px] border-collapse text-left print:text-black">
            <thead>
              <tr>
                <th rowSpan={2} className={`${thGroup} sticky left-0 z-20 min-w-[7rem] bg-slate-800 print:static`}>
                  ทะเบียน
                </th>
                {VEHICLE_WEEKLY_TOPICS.map((t) => (
                  <th key={t.key} colSpan={2} className={thGroup}>
                    <div>{t.title}</div>
                    {t.subtitle ? <div className="mt-0.5 font-normal text-slate-400">{t.subtitle}</div> : null}
                  </th>
                ))}
                <th rowSpan={2} className={`${thGroup} min-w-[5rem]`}>
                  ผู้ตรวจ
                </th>
                <th rowSpan={2} className={`${thGroup} min-w-[6rem]`}>
                  หมายเหตุ
                </th>
                <th rowSpan={2} className={`${thGroup} print:hidden min-w-[4.5rem]`}>
                  บันทึก
                </th>
              </tr>
              <tr>
                {VEHICLE_WEEKLY_TOPICS.flatMap((t) => [
                  <th key={`${t.key}-n`} className={thSub}>
                    ปกติ
                  </th>,
                  <th key={`${t.key}-a`} className={thSub}>
                    ผิดปกติ
                  </th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((r, idx) => {
                const d = drafts[r.vehicle.id] ?? emptyDraft(inspectorDefault);
                const label = vehicleDisplayLabel(r.vehicle);
                const stripe = idx % 2 === 0 ? "bg-emerald-950/15" : "bg-slate-900/30";
                return (
                  <tr key={r.vehicle.id} className={`${stripe} print:bg-white`}>
                    <td
                      className={`${tdCell} sticky left-0 z-10 border-slate-700 bg-slate-900/95 text-[11px] text-slate-200 print:static print:bg-white print:text-black sm:text-xs`}
                    >
                      <span className="font-mono text-teal-300 print:text-black">{r.vehicle.licensePlate}</span>
                      <span className="mt-0.5 block text-[10px] text-slate-500 print:text-gray-700">{label}</span>
                    </td>
                    {VEHICLE_WEEKLY_TOPICS.map((t) => (
                      <CheckPairCells
                        key={t.key}
                        value={d[t.key]}
                        onPick={(v) => updateDraft(r.vehicle.id, { [t.key]: v })}
                      />
                    ))}
                    <td className={`${tdCell} print:border print:border-gray-400`}>
                      <input
                        type="text"
                        className="w-full min-w-[4rem] rounded border border-slate-700 bg-slate-950 px-1 py-1 text-[11px] text-slate-200 print:border-gray-400 print:bg-white print:text-black"
                        placeholder="ชื่อ"
                        value={d.inspectorName}
                        onChange={(e) => updateDraft(r.vehicle.id, { inspectorName: e.target.value })}
                      />
                    </td>
                    <td className={`${tdCell} print:border print:border-gray-400`}>
                      <textarea
                        rows={2}
                        className="w-full min-w-[6rem] resize-y rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-[11px] text-slate-200 print:border-gray-400 print:bg-white print:text-black"
                        placeholder="เช่น ไม่ได้นำไปปฏิบัติภารกิจ"
                        value={d.remarks}
                        onChange={(e) => updateDraft(r.vehicle.id, { remarks: e.target.value })}
                      />
                    </td>
                    <td className={`${tdCell} print:hidden`}>
                      <button
                        type="button"
                        disabled={savingId === r.vehicle.id}
                        className="w-full rounded-lg bg-teal-700 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-teal-600 disabled:opacity-50"
                        onClick={() => void saveRow(r.vehicle.id)}
                      >
                        {savingId === r.vehicle.id ? "…" : "บันทึก"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-[11px] text-slate-600 print:hidden">
        * ระบบ Analog กับ Thinkware มักใช้คนละคัน — ทำเครื่องหมายเฉพาะระบบที่ติดตั้งบนรถคันนั้น
      </p>
    </div>
  );
}
