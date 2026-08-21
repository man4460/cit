import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiDownload, apiJson } from "../api/client";
import { CommaNumberInput } from "../components/CommaNumberInput";
import { DateTimeField } from "../components/DateTimeField";
import { MissionEstimatePreviewModal } from "../components/MissionEstimatePreviewModal";
import { MissionsSubNav } from "../components/MissionsSubNav";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { SearchableSelect } from "../components/SearchableSelect";
import { formatBaht, parseLooseNumber } from "../lib/formatNumber";
import {
  applyPreviousAmounts,
  computeEstimateTotals,
  estimateLineKey,
  formatThaiDateRangeLabel,
  isoToLocalDatetimeValue,
  lineCurrentAmount,
  templateToFormLines,
} from "../lib/missionEstimate";
import {
  toolbarLinkBtnClass,
  toolbarPrimaryBtnClass,
} from "../lib/uiTokens";
import type {
  MissionEstimatePrevious,
  MissionEstimateRecord,
  MissionEstimateTemplate,
  RouteMaster,
} from "../types";

function deltaClass(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "text-slate-600";
  return n > 0 ? "font-semibold text-rose-700" : "font-semibold text-emerald-700";
}

export function MissionEstimateFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editingId = id && id !== "new" ? id : null;

  const [routes, setRoutes] = useState<RouteMaster[]>([]);
  const [title, setTitle] = useState("");
  const [routeId, setRouteId] = useState("");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");
  const [currentLabel, setCurrentLabel] = useState("");
  const [previousLabel, setPreviousLabel] = useState("");
  const [currentDateRange, setCurrentDateRange] = useState("");
  const [previousDateRange, setPreviousDateRange] = useState("");
  const [notes, setNotes] = useState("");
  const [previousMissionId, setPreviousMissionId] = useState<string | null>(null);
  const [missionId, setMissionId] = useState<string | null>(null);
  const [previousInfo, setPreviousInfo] = useState<MissionEstimatePrevious | null>(null);
  const [lines, setLines] = useState<MissionEstimateRecord["lines"]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const selectedRoute = useMemo(() => routes.find((r) => r.id === routeId), [routes, routeId]);
  const totals = useMemo(() => computeEstimateTotals(lines), [lines]);

  const routeOptions = useMemo(
    () =>
      routes
        .filter((r) => r.status !== "INACTIVE" || r.id === routeId)
        .map((r) => ({
          value: r.id,
          label: r.name?.trim() || `${r.startLocation} → ${r.endLocation}`,
          keywords: `${r.startLocation} ${r.endLocation}`,
        })),
    [routes, routeId],
  );

  const applyTemplate = useCallback(
    (template: MissionEstimateTemplate, previous: MissionEstimatePrevious | null) => {
      const nextLines = applyPreviousAmounts(templateToFormLines(template), previous?.amountsByKey);
      setLines(nextLines);
      setPreviousMissionId(previous?.missionId ?? null);
      setPreviousInfo(previous);
      setNotes((cur) => cur.trim());
      if (previous) {
        setPreviousLabel(previous.label ?? "");
        setPreviousDateRange(previous.dateRange ?? "");
      }
      setCurrentLabel((cur) => cur.trim() || template.currentLabel);
    },
    [],
  );

  const loadTemplateForRoute = useCallback(
    async (
      nextRouteId: string,
      start: string,
      excludeMission?: string | null,
      replaceLines = false,
      baseLines?: MissionEstimateRecord["lines"],
    ) => {
      const qs = new URLSearchParams();
      if (nextRouteId) qs.set("routeId", nextRouteId);
      if (start) qs.set("plannedStart", new Date(start).toISOString());
      if (excludeMission) qs.set("excludeMissionId", excludeMission);
      const data = await apiJson<{
        template: MissionEstimateTemplate;
        previous: MissionEstimatePrevious | null;
      }>(`/api/mission-estimates/template?${qs.toString()}`, { skipCache: true });
      if (replaceLines) {
        applyTemplate(data.template, data.previous);
        return data.previous;
      }
      setLines((cur) => {
        const source = baseLines ?? cur;
        if (!source.length) {
          return applyPreviousAmounts(templateToFormLines(data.template), data.previous?.amountsByKey);
        }
        return applyPreviousAmounts(source, data.previous?.amountsByKey);
      });
      setPreviousMissionId(data.previous?.missionId ?? null);
      setPreviousInfo(data.previous);
      if (data.previous) {
        setPreviousLabel(data.previous.label ?? "");
        setPreviousDateRange(data.previous.dateRange ?? "");
      } else {
        setPreviousLabel("");
        setPreviousDateRange("");
      }
      return data.previous;
    },
    [applyTemplate],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const routeRows = await apiJson<RouteMaster[]>("/api/route-master");
        if (cancelled) return;
        setRoutes(routeRows);
        if (editingId) {
          const row = await apiJson<MissionEstimateRecord>(`/api/mission-estimates/${editingId}`, {
            skipCache: true,
          });
          if (cancelled) return;
          setTitle(row.mission?.title ?? "");
          setRouteId(row.mission?.routeId ?? "");
          setPlannedStart(isoToLocalDatetimeValue(row.mission?.plannedStart));
          setPlannedEnd(isoToLocalDatetimeValue(row.mission?.plannedEnd));
          setCurrentLabel(row.currentLabel ?? "");
          setPreviousLabel(row.previousLabel ?? "");
          setCurrentDateRange(row.currentDateRange ?? "");
          setPreviousDateRange(row.previousDateRange ?? "");
          setNotes(row.notes ?? "");
          setPreviousMissionId(row.previousMissionId);
          setMissionId(row.missionId);
          setLines(row.lines);
          if (row.mission?.routeId) {
            await loadTemplateForRoute(
              row.mission.routeId,
              isoToLocalDatetimeValue(row.mission.plannedStart),
              row.missionId,
              false,
              row.lines,
            );
            if (cancelled) return;
          }
        } else {
          const data = await apiJson<{
            template: MissionEstimateTemplate;
            previous: MissionEstimatePrevious | null;
          }>("/api/mission-estimates/template", { skipCache: true });
          if (cancelled) return;
          applyTemplate(data.template, data.previous);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingId, applyTemplate, loadTemplateForRoute]);

  useEffect(() => {
    if (!plannedStart) return;
    setCurrentDateRange(formatThaiDateRangeLabel(plannedStart, plannedEnd));
  }, [plannedStart, plannedEnd]);

  function patchLine(index: number, patch: Partial<MissionEstimateRecord["lines"][number]>) {
    setLines((cur) => cur.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function onRouteChange(nextId: string) {
    setRouteId(nextId);
    const route = routes.find((r) => r.id === nextId);
    if (route && !title.trim()) {
      setTitle(`ประมาณการค่าใช้จ่าย ${route.startLocation} → ${route.endLocation}`);
    }
    if (route && !currentLabel.trim()) {
      setCurrentLabel(route.name?.trim() || `${route.startLocation} → ${route.endLocation}`);
    }
    try {
      await loadTemplateForRoute(nextId, plannedStart, missionId, false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดประมาณการก่อนหน้าไม่สำเร็จ");
    }
  }

  function copyPreviousIntoCurrent() {
    const byKey = previousInfo?.linesByKey;
    setLines((cur) =>
      cur.map((line) => {
        const prev = byKey?.[estimateLineKey(line)];
        if (!prev) return line;
        const next = { ...line };
        if (line.qtyEditable && prev.quantity != null) next.quantity = String(prev.quantity);
        if (line.rateEditable && prev.unitPrice != null) next.unitPrice = String(prev.unitPrice);
        if (line.amountEditable || (line.qtyEditable && line.rateEditable) || line.includeInTotal) {
          next.amount = String(prev.amount);
        }
        return next;
      }),
    );
  }

  function payload() {
    return {
      title: title.trim() || null,
      routeId: routeId || null,
      plannedStart: plannedStart || null,
      plannedEnd: plannedEnd || null,
      status: "DRAFT",
      currentLabel,
      previousLabel,
      currentDateRange,
      previousDateRange,
      notes,
      previousMissionId,
      lines: lines.map((line, i) => ({
        ...line,
        sortOrder: i,
        amount: lineCurrentAmount(line),
      })),
    };
  }

  async function save() {
    if (!routeId) {
      alert("เลือกเส้นทางก่อน เพื่อเทียบกับประมาณการก่อนหน้าในเส้นทางเดียวกัน");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const body = JSON.stringify(payload());
      if (editingId) {
        await apiJson(`/api/mission-estimates/${editingId}`, { method: "PUT", body });
        setFlash("บันทึกแล้ว");
      } else {
        const created = await apiJson<MissionEstimateRecord>("/api/mission-estimates", {
          method: "POST",
          body,
        });
        setFlash("สร้างประมาณการแล้ว");
        navigate(`/missions/estimates/${created.id}`, { replace: true });
      }
      window.setTimeout(() => setFlash(null), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function downloadExcel() {
    try {
      await apiDownload(
        "/api/mission-estimates/export",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload(),
            currentTitle: title,
            previousTitle: previousInfo?.title ?? previousLabel,
          }),
        },
        "ประมาณการค่าใช้จ่าย.xlsx",
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "ดาวน์โหลดไม่สำเร็จ");
    }
  }

  return (
    <div>
      <PageHeaderBar
        title={editingId ? "แก้ไขประมาณการค่าใช้จ่าย" : "สร้างประมาณการค่าใช้จ่าย"}
        extras={
          <>
            <Link to="/missions/estimates" className={toolbarLinkBtnClass}>
              กลับรายการ
            </Link>
            <button type="button" className={toolbarLinkBtnClass} onClick={() => setPreviewOpen(true)}>
              พรีวิว
            </button>
            <button type="button" className={toolbarLinkBtnClass} onClick={() => void downloadExcel()}>
              ดาวน์โหลด Excel
            </button>
            <button type="button" className={toolbarPrimaryBtnClass} disabled={saving} onClick={() => void save()}>
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </>
        }
        primary={<MissionsSubNav />}
      />

      {err ? (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>
      ) : null}
      {flash ? <p className="mt-3 text-sm font-medium text-emerald-700">{flash}</p> : null}

      {loading ? (
        <p className="mt-6 text-sm text-slate-600">กำลังโหลดแบบฟอร์ม…</p>
      ) : (
        <div className="mt-6 space-y-5">
          <section className="grid gap-4 rounded-2xl border border-[#e8e6fc] bg-white/90 p-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="text-xs font-medium text-slate-700">ชื่อภารกิจ</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="เช่น ประมาณการค่าใช้จ่าย ศสร. / ศหญ."
              />
            </label>
            <label className="sm:col-span-2">
              <span className="text-xs font-medium text-slate-700">เส้นทาง</span>
              <SearchableSelect
                value={routeId}
                onChange={(v) => void onRouteChange(v)}
                options={routeOptions}
                emptyLabel="— เลือกเส้นทาง —"
                allowEmpty
              />
              <p className="mt-1 text-[11px] text-slate-600">
                เมื่อเลือกเส้นทาง ระบบจะดึงประมาณการล่าสุดบนเส้นทางเดียวกันมาเทียบ — ไม่ใช้ค่าใช้จ่ายจริงของภารกิจ
              </p>
            </label>
            <DateTimeField
              id="estimate-start"
              label="วันเวลาเริ่มต้นตามแผน"
              value={plannedStart}
              onChange={setPlannedStart}
            />
            <DateTimeField
              id="estimate-end"
              label="วันเวลาสิ้นสุดตามแผน"
              value={plannedEnd}
              onChange={setPlannedEnd}
            />
            <label>
              <span className="text-xs font-medium text-slate-700">ป้ายประมาณการครั้งนี้</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                value={currentLabel}
                onChange={(e) => setCurrentLabel(e.target.value)}
                placeholder="เช่น สพฐ.-ศสร. (1 ตู้) / ศหญ. (4 ตู้)"
              />
            </label>
            <label>
              <span className="text-xs font-medium text-slate-700">ป้ายประมาณการก่อนหน้า</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                value={previousLabel}
                onChange={(e) => setPreviousLabel(e.target.value)}
              />
            </label>
            <label>
              <span className="text-xs font-medium text-slate-700">ช่วงวันที่ครั้งนี้</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                value={currentDateRange}
                onChange={(e) => setCurrentDateRange(e.target.value)}
              />
            </label>
            <label>
              <span className="text-xs font-medium text-slate-700">ช่วงวันที่ประมาณการก่อนหน้า</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                value={previousDateRange}
                onChange={(e) => setPreviousDateRange(e.target.value)}
              />
            </label>
          </section>

          {previousInfo ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#0000BF]/20 bg-[#0000BF]/5 px-3 py-2.5 text-sm">
              <p className="text-[#2e2a58]">
                เทียบกับประมาณการก่อนหน้า{" "}
                <span className="font-bold">
                  {previousInfo.title || previousInfo.code} · {previousInfo.dateRange || "ไม่ระบุวันที่"}
                </span>
                {previousInfo.approvalTotal != null ? (
                  <span className="ml-2 tabular-nums text-slate-600">
                    ยอดประมาณการก่อนหน้า {formatBaht(previousInfo.approvalTotal)}
                  </span>
                ) : null}
              </p>
              <button
                type="button"
                className="rounded-lg border border-[#0000BF]/25 bg-white px-2.5 py-1 text-xs font-semibold text-[#4d47b6] hover:bg-white"
                onClick={copyPreviousIntoCurrent}
              >
                ใช้ยอดประมาณการก่อนหน้า
              </button>
            </div>
          ) : routeId ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
              ยังไม่มีประมาณการก่อนหน้าบนเส้นทางนี้ — คอลัมน์ประมาณการก่อนหน้าจะว่าง จนกว่าจะมีประมาณการที่บันทึกแล้ว
            </p>
          ) : null}

          <div className="overflow-x-auto rounded-2xl border border-[#e8e6fc] bg-white/95">
            <table className="min-w-[980px] w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-[11px] text-slate-600">
                  <th className="border-b border-slate-200 px-2 py-2 font-bold">ที่</th>
                  <th className="border-b border-slate-200 px-2 py-2 font-bold">รายการ</th>
                  <th className="border-b border-slate-200 px-2 py-2 text-right font-bold">จำนวนคน</th>
                  <th className="border-b border-slate-200 px-2 py-2 text-right font-bold">อัตรา (บาท)</th>
                  <th className="border-b border-slate-200 px-2 py-2 text-right font-bold">ประมาณการครั้งนี้</th>
                  <th className="border-b border-slate-200 px-2 py-2 text-right font-bold">ประมาณการก่อนหน้า</th>
                  <th className="border-b border-slate-200 px-2 py-2 text-right font-bold">ผลต่าง</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => {
                  const current = line.includeInTotal === false ? NaN : lineCurrentAmount(line);
                  const previous = parseLooseNumber(line.previousAmount);
                  const delta =
                    Number.isFinite(current) && Number.isFinite(previous) ? current - previous : NaN;
                  const isGroup = line.kind === "GROUP";
                  const groupTotal = totals.groupSubtotals.get(line.groupCode ?? "");
                  return (
                    <tr key={`${line.kind}-${line.itemCode ?? line.groupCode}-${idx}`} className={isGroup ? "bg-[#faf9ff]" : ""}>
                      <td className="border-b border-slate-100 px-2 py-1.5 font-mono text-[11px] text-slate-500">
                        {line.itemCode || line.groupCode}
                      </td>
                      <td className={`border-b border-slate-100 px-2 py-1.5 ${isGroup ? "font-black text-[#1e1b3a]" : ""}`}>
                        {line.name}
                        {line.payoutMethod ? (
                          <span className="ml-2 text-[10px] font-medium text-slate-500">{line.payoutMethod}</span>
                        ) : null}
                        {isGroup && line.includeInTotal === false && groupTotal ? (
                          <span className="ml-2 text-[10px] font-semibold tabular-nums text-[#4d47b6]">
                            รวม {formatBaht(groupTotal.current)}
                          </span>
                        ) : null}
                      </td>
                      <td className="border-b border-slate-100 px-1 py-1">
                        {line.qtyEditable ? (
                          <CommaNumberInput
                            aria-label={`จำนวนคน ${line.name}`}
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-right text-sm tabular-nums"
                            value={line.quantity ?? ""}
                            maxFractionDigits={0}
                            onChange={(raw) => patchLine(idx, { quantity: raw })}
                          />
                        ) : null}
                      </td>
                      <td className="border-b border-slate-100 px-1 py-1">
                        {line.rateEditable ? (
                          <CommaNumberInput
                            aria-label={`อัตรา ${line.name}`}
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-right text-sm tabular-nums"
                            value={line.unitPrice ?? ""}
                            maxFractionDigits={2}
                            onChange={(raw) => patchLine(idx, { unitPrice: raw })}
                          />
                        ) : null}
                      </td>
                      <td className="border-b border-slate-100 px-1 py-1">
                        {line.includeInTotal === false ? null : line.amountEditable &&
                          !(line.qtyEditable && line.rateEditable) ? (
                          <CommaNumberInput
                            aria-label={`จำนวนเงิน ${line.name}`}
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-right text-sm tabular-nums"
                            value={line.amount}
                            maxFractionDigits={2}
                            onChange={(raw) => patchLine(idx, { amount: raw })}
                          />
                        ) : (
                          <p className="px-2 py-1 text-right text-sm font-semibold tabular-nums">
                            {formatBaht(current)}
                          </p>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-2 py-1.5 text-right tabular-nums text-slate-600">
                        {line.includeInTotal === false ? "" : formatBaht(previous, { empty: "—" })}
                      </td>
                      <td className={`border-b border-slate-100 px-2 py-1.5 text-right tabular-nums ${deltaClass(delta)}`}>
                        {Number.isFinite(delta) ? formatBaht(delta) : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <section className="grid gap-3 rounded-2xl border border-[#e8e6fc] bg-white/90 p-4 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-bold text-slate-500">ยอดใช้จ่าย (ปัดกลมพันบาท)</p>
              <p className="mt-1 text-lg font-black tabular-nums text-[#1e1b3a]">{formatBaht(totals.roundedSpend)}</p>
              <p className="text-[11px] text-slate-500">ก่อนปัด {formatBaht(totals.spend)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500">สำรองค่าใช้จ่าย</p>
              <p className="mt-1 text-lg font-black tabular-nums text-[#1e1b3a]">{formatBaht(totals.reserveAmount)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500">รวมขออนุมัติครั้งนี้</p>
              <p className="mt-1 text-lg font-black tabular-nums text-[#0000BF]">{formatBaht(totals.approvalTotal)}</p>
              <p className="text-[11px] text-slate-500">ประมาณการก่อนหน้า {formatBaht(totals.previousApproval)}</p>
            </div>
          </section>

          <label className="block">
            <span className="text-xs font-medium text-slate-700">หมายเหตุ</span>
            <textarea
              className="mt-1 min-h-[96px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          {selectedRoute?.missionDays ? (
            <p className="text-[11px] text-slate-500">เส้นทางนี้กำหนด {selectedRoute.missionDays} วันภารกิจ</p>
          ) : null}
        </div>
      )}

      <MissionEstimatePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={title}
        currentLabel={currentLabel}
        previousLabel={previousLabel}
        currentDateRange={currentDateRange}
        previousDateRange={previousDateRange}
        notes={notes}
        lines={lines}
      />
    </div>
  );
}
