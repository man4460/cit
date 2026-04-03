import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiJson } from "../api/client";
import { PickableDateInput } from "../components/PickableDateInput";
import { useAuth } from "../context/AuthContext";
import { currentUserLabel } from "../lib/currentUserLabel";
import { ARMOR_MONTHLY_TOPICS } from "../lib/armorMonthlyTopics";
import type {
  ArmorMonthlyCheckKey,
  ArmorMonthlyInspection,
  ArmorMonthlyMatrixResponse,
  VehicleWeeklyCheckResult,
} from "../types";

type RowDraft = Record<ArmorMonthlyCheckKey, VehicleWeeklyCheckResult | null> & {
  inspectorName: string;
  remarks: string;
};

function currentMonthYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function emptyDraft(inspectorDefault: string): RowDraft {
  return {
    outerShell: null,
    strapsFasteners: null,
    ballisticLayer: null,
    cleanlinessStorage: null,
    overallReadiness: null,
    inspectorName: inspectorDefault,
    remarks: "",
  };
}

function draftFromInspection(i: ArmorMonthlyInspection, inspectorDefault: string): RowDraft {
  const saved = i.inspectorName?.trim() ?? "";
  return {
    outerShell: i.outerShell,
    strapsFasteners: i.strapsFasteners,
    ballisticLayer: i.ballisticLayer,
    cleanlinessStorage: i.cleanlinessStorage,
    overallReadiness: i.overallReadiness,
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
          title="ผิดปกติ"
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

export function ArmorMonthlyInspectionPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const monthFromUrl = searchParams.get("month")?.trim();

  const defaultMonth = useMemo(() => currentMonthYm(), []);
  const monthYm =
    monthFromUrl && /^\d{4}-\d{2}$/.test(monthFromUrl) ? monthFromUrl : defaultMonth;

  const inspectorDefault = useMemo(() => currentUserLabel(user), [user]);

  const [matrix, setMatrix] = useState<ArmorMonthlyMatrixResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiJson<ArmorMonthlyMatrixResponse>(
        `/api/armor-inspections/monthly/matrix?month=${encodeURIComponent(monthYm)}`,
      );
      setMatrix(data);
      const def = currentUserLabel(user);
      const next: Record<string, RowDraft> = {};
      for (const r of data.rows) {
        next[r.asset.id] = r.inspection ? draftFromInspection(r.inspection, def) : emptyDraft(def);
      }
      setDrafts(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
      setMatrix(null);
    } finally {
      setLoading(false);
    }
  }, [monthYm, user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!matrix || !inspectorDefault) return;
    setDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const r of matrix.rows) {
        const row = next[r.asset.id];
        if (!row) continue;
        const savedInDb = r.inspection?.inspectorName?.trim();
        if (savedInDb) continue;
        if (!row.inspectorName.trim()) {
          next[r.asset.id] = { ...row, inspectorName: inspectorDefault };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [matrix, inspectorDefault]);

  function setMonthYm(ym: string) {
    setSearchParams(ym === defaultMonth ? {} : { month: ym });
  }

  function updateDraft(assetId: string, patch: Partial<RowDraft>) {
    setDrafts((d) => ({
      ...d,
      [assetId]: { ...(d[assetId] ?? emptyDraft(inspectorDefault)), ...patch },
    }));
  }

  async function saveRow(assetId: string) {
    const d = drafts[assetId];
    if (!d) return;
    setSavingId(assetId);
    setErr(null);
    try {
      await apiJson("/api/armor-inspections/monthly", {
        method: "PUT",
        body: JSON.stringify({
          assetId,
          monthYm,
          outerShell: d.outerShell,
          strapsFasteners: d.strapsFasteners,
          ballisticLayer: d.ballisticLayer,
          cleanlinessStorage: d.cleanlinessStorage,
          overallReadiness: d.overallReadiness,
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
    <div className="armor-monthly-print">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-white">ตรวจสภาพเสื้อเกราะประจำเดือน</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            ครอบคลุมครุภัณฑ์ที่มีข้อมูลเสื้อเกราะ / ลำดับทะเบียน / ประเภทชื่อมีคำว่า «เสื้อเกราะ» — เลือกเดือนแล้วทำเครื่องหมายปกติหรือผิดปกติตามหัวข้อ บันทึกทีละแถว
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/reports/monthly"
            className="shrink-0 rounded-lg border border-amber-900/50 px-4 py-2 text-sm text-amber-200/90 hover:bg-slate-800"
          >
            รายงานประจำเดือน
          </Link>
          <Link
            to="/assets"
            className="shrink-0 rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            ← ครุภัณฑ์
          </Link>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4 print:hidden">
        <label className="block">
          <span className="text-xs font-medium text-slate-500">เดือนที่ตรวจ</span>
          <PickableDateInput type="month" className="mt-1" value={monthYm} onChange={setMonthYm} />
        </label>
        <button
          type="button"
          className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          onClick={() => setMonthYm(currentMonthYm())}
        >
          เดือนนี้
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
        ตรวจสภาพเสื้อเกราะประจำเดือน — {monthYm}
      </h2>

      {loading ? (
        <p className="mt-8 text-center text-slate-500 print:hidden">กำลังโหลด…</p>
      ) : !matrix?.rows.length ? (
        <p className="mt-8 text-center text-slate-500 print:hidden">
          ยังไม่มีรายการเสื้อเกราะในระบบ — กำหนดประเภท «เสื้อเกราะ» หรือกรอกฟิลด์ทะเบียนเสื้อเกราะในครุภัณฑ์
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40 print:border-0 print:bg-transparent">
          <table className="w-full min-w-[960px] border-collapse text-left print:text-black">
            <thead>
              <tr>
                <th rowSpan={2} className={`${thGroup} sticky left-0 z-20 min-w-[8rem] bg-slate-800 print:static`}>
                  เลขครุภัณฑ์ / ชื่อ
                </th>
                {ARMOR_MONTHLY_TOPICS.map((t) => (
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
                {ARMOR_MONTHLY_TOPICS.flatMap((t) => [
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
                const d = drafts[r.asset.id] ?? emptyDraft(inspectorDefault);
                const stripe = idx % 2 === 0 ? "bg-violet-950/15" : "bg-slate-900/30";
                return (
                  <tr key={r.asset.id} className={`${stripe} print:bg-white`}>
                    <td
                      className={`${tdCell} sticky left-0 z-10 border-slate-700 bg-slate-900/95 text-[11px] text-slate-200 print:static print:bg-white print:text-black sm:text-xs`}
                    >
                      <span className="font-mono text-teal-300 print:text-black">{r.asset.serialNumber}</span>
                      <span className="mt-0.5 block text-[10px] text-slate-500 print:text-gray-700">{r.asset.itemName}</span>
                      {r.asset.registryLineNo != null ? (
                        <span className="mt-0.5 block text-[10px] text-slate-600">ลำดับทะเบียน {r.asset.registryLineNo}</span>
                      ) : null}
                    </td>
                    {ARMOR_MONTHLY_TOPICS.map((t) => (
                      <CheckPairCells
                        key={t.key}
                        value={d[t.key]}
                        onPick={(v) => updateDraft(r.asset.id, { [t.key]: v })}
                      />
                    ))}
                    <td className={`${tdCell} print:border print:border-gray-400`}>
                      <input
                        type="text"
                        className="w-full min-w-[4rem] rounded border border-slate-700 bg-slate-950 px-1 py-1 text-[11px] text-slate-200 print:border-gray-400 print:bg-white print:text-black"
                        placeholder="ชื่อ"
                        value={d.inspectorName}
                        onChange={(e) => updateDraft(r.asset.id, { inspectorName: e.target.value })}
                      />
                    </td>
                    <td className={`${tdCell} print:border print:border-gray-400`}>
                      <textarea
                        rows={2}
                        className="w-full min-w-[6rem] resize-y rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-[11px] text-slate-200 print:border-gray-400 print:bg-white print:text-black"
                        placeholder="รายละเอียดความชำรุด ฯลฯ"
                        value={d.remarks}
                        onChange={(e) => updateDraft(r.asset.id, { remarks: e.target.value })}
                      />
                    </td>
                    <td className={`${tdCell} print:hidden`}>
                      <button
                        type="button"
                        disabled={savingId === r.asset.id}
                        className="w-full rounded-lg bg-violet-700 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-violet-600 disabled:opacity-50"
                        onClick={() => void saveRow(r.asset.id)}
                      >
                        {savingId === r.asset.id ? "…" : "บันทึก"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
