import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiDownload, apiJson } from "../api/client";
import { CommaNumberInput } from "../components/CommaNumberInput";
import { MissionEstimatePreviewModal } from "../components/MissionEstimatePreviewModal";
import { formatBaht, parseLooseNumber } from "../lib/formatNumber";
import {
  applyPreviousAmounts,
  computeEstimateTotals,
  estimateLineKey,
  forceLumpSumEstimateLines,
  formatThaiDateRangeLabel,
  isEstimateItemLine,
  lineCurrentAmount,
  mergeLegacyEnlistedEstimateLines,
  templateToFormLines,
} from "../lib/missionEstimate";
import { toolbarLinkBtnClass } from "../lib/uiTokens";
import { blankEstimateQuantities } from "../lib/trip2569Amounts";
import type {
  MissionEstimatePrevious,
  MissionEstimateRecord,
  MissionEstimateTemplate,
  MissionTrip2569Meta,
  RouteMaster,
} from "../types";

function deltaClass(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "text-slate-600";
  return n > 0 ? "font-semibold text-rose-700" : "font-semibold text-emerald-700";
}

type TemplateApiResponse = {
  template: MissionEstimateTemplate;
  previous: MissionEstimatePrevious | null;
  trip2569?: MissionTrip2569Meta | null;
};

function templateQueryParams(opts: {
  routeId?: string;
  plannedStart?: string;
  missionId?: string | null;
  missionCode?: string | null;
  excludeMissionId?: string | null;
}): URLSearchParams {
  const qs = new URLSearchParams();
  if (opts.routeId) qs.set("routeId", opts.routeId);
  if (opts.plannedStart) qs.set("plannedStart", new Date(opts.plannedStart).toISOString());
  if (opts.missionId) qs.set("missionId", opts.missionId);
  if (opts.missionCode?.trim()) qs.set("missionCode", opts.missionCode.trim());
  if (opts.excludeMissionId) qs.set("excludeMissionId", opts.excludeMissionId);
  return qs;
}

function applyTrip2569MetaOnly(
  trip: MissionTrip2569Meta,
  setters: {
    setCurrentDateRange: (v: string) => void;
    setCurrentLabel: (fn: (cur: string) => string) => void;
  },
): void {
  if (trip.dateRange.trim()) setters.setCurrentDateRange(trip.dateRange.trim());
  if (trip.routeText.trim()) {
    setters.setCurrentLabel((cur) => cur.trim() || trip.routeText.trim());
  }
}

export type MissionEstimateEditorHandle = {
  save: (missionId: string) => Promise<void>;
  reset: () => void;
};

export type MissionEstimateEditorProps = {
  routeId: string;
  plannedStart: string;
  plannedEnd: string;
  missionId: string | null;
  /** รหัสภารกิจ เช่น TRIP-2569-05 — ใช้โหลดยอดจากชีตสรุป 2569 */
  missionCode?: string | null;
  missionTitle: string;
  selectedRoute?: RouteMaster | null;
  /** ส่งยอดรวมขออนุมัติขึ้นฟอร์มภารกิจ (แสดงในแถบเมนู) */
  onApprovalTotalChange?: (total: number) => void;
};

export const MissionEstimateEditor = forwardRef<MissionEstimateEditorHandle, MissionEstimateEditorProps>(
  function MissionEstimateEditor(
    {
      routeId,
      plannedStart,
      plannedEnd,
      missionId,
      missionCode,
      missionTitle,
      selectedRoute,
      onApprovalTotalChange,
    },
    ref,
  ) {
    const [currentLabel, setCurrentLabel] = useState("");
    const [previousLabel, setPreviousLabel] = useState("");
    const [currentDateRange, setCurrentDateRange] = useState("");
    const [previousDateRange, setPreviousDateRange] = useState("");
    const [notes, setNotes] = useState("");
    const [previousMissionId, setPreviousMissionId] = useState<string | null>(null);
    const [previousInfo, setPreviousInfo] = useState<MissionEstimatePrevious | null>(null);
    const [lines, setLines] = useState<MissionEstimateRecord["lines"]>([]);
    const [loading, setLoading] = useState(true);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const loadTokenRef = useRef(0);
    // ส่งข้อมูลจำนวนคนที่เคยบันทึกกลับไปตามเดิม — ไม่ใช้คำนวณแล้ว แต่ไม่ให้ข้อมูลเก่าหาย
    const savedPersonCountsRef = useRef<MissionEstimateRecord["personCounts"] | null>(null);
    const savedCalcMetaRef = useRef<MissionEstimateRecord["calcMeta"] | null>(null);

    const totals = useMemo(() => computeEstimateTotals(lines), [lines]);
    const manualPrevious = !previousInfo;

    useEffect(() => {
      onApprovalTotalChange?.(totals.approvalTotal);
    }, [totals.approvalTotal, onApprovalTotalChange]);

    const applyTemplate = useCallback(
      (
        template: MissionEstimateTemplate,
        previous: MissionEstimatePrevious | null,
        opts?: { copyPreviousIntoCurrent?: boolean; blankQuantities?: boolean },
      ) => {
        let nextLines = applyPreviousAmounts(templateToFormLines(template), previous?.amountsByKey);

        if (opts?.copyPreviousIntoCurrent && previous?.linesByKey) {
          const byKey = previous.linesByKey;
          nextLines = nextLines.map((line) => {
            const prev = byKey[estimateLineKey(line)];
            if (!prev) return line;
            const next = { ...line };
            if (line.qtyEditable && prev.quantity != null) next.quantity = String(prev.quantity);
            if (line.rateEditable && prev.unitPrice != null) next.unitPrice = String(prev.unitPrice);
            if (line.amountEditable || (line.qtyEditable && line.rateEditable) || line.includeInTotal) {
              next.amount = String(prev.amount);
            }
            return next;
          });
        }

        if (opts?.blankQuantities) {
          nextLines = blankEstimateQuantities(nextLines);
        }

        nextLines = forceLumpSumEstimateLines(nextLines, {
          zeroIfEmpty: Boolean(opts?.blankQuantities),
        });

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
        baseLines?: MissionEstimateRecord["lines"],
      ) => {
        const qs = templateQueryParams({
          routeId: nextRouteId,
          plannedStart: start,
          missionId: missionId ?? undefined,
          missionCode,
          excludeMissionId: excludeMission,
        });
        const data = await apiJson<TemplateApiResponse>(
          `/api/mission-estimates/template?${qs.toString()}`,
          { skipCache: true },
        );
        setLines((cur) => {
          const source = baseLines?.length ? baseLines : cur.length ? cur : templateToFormLines(data.template);
          // ไม่มีประมาณการก่อนหน้าในระบบ — คงยอดก่อนหน้าที่ผู้ใช้กรอกเองไว้
          if (!data.previous) return source;
          return applyPreviousAmounts(source, data.previous.amountsByKey);
        });
        setPreviousMissionId(data.previous?.missionId ?? null);
        setPreviousInfo(data.previous);
        if (data.previous) {
          setPreviousLabel(data.previous.label ?? "");
          setPreviousDateRange(data.previous.dateRange ?? "");
        } else if (!baseLines?.length) {
          setPreviousLabel("");
          setPreviousDateRange("");
        }
        if (data.trip2569) {
          applyTrip2569MetaOnly(data.trip2569, { setCurrentDateRange, setCurrentLabel });
        }
        return data;
      },
      [missionId, missionCode],
    );

    const resetState = useCallback(() => {
      setCurrentLabel("");
      setPreviousLabel("");
      setCurrentDateRange("");
      setPreviousDateRange("");
      setNotes("");
      setPreviousMissionId(null);
      setPreviousInfo(null);
      setLines([]);
      savedPersonCountsRef.current = null;
      savedCalcMetaRef.current = null;
      setErr(null);
      // ไม่ set loading=true ค้างไว้ — effect โหลดจะเปิดเองเมื่อมี routeId/missionId
      setLoading(false);
      onApprovalTotalChange?.(0);
    }, [onApprovalTotalChange]);

    useImperativeHandle(ref, () => ({
      reset: resetState,
      save: async (mid: string) => {
        if (!routeId) return;
        const body = JSON.stringify(buildPayload());
        await apiJson(`/api/missions/${mid}/estimate`, { method: "PUT", body });
      },
    }));

    function buildPayload() {
      return {
        currentLabel,
        previousLabel,
        currentDateRange,
        previousDateRange,
        notes,
        previousMissionId,
        ...(savedPersonCountsRef.current
          ? { personCounts: { ...savedPersonCountsRef.current, ...(savedCalcMetaRef.current ?? {}) } }
          : {}),
        lines: lines.map((line, i) => ({
          ...line,
          sortOrder: i,
          amount: lineCurrentAmount(line),
        })),
      };
    }

    useEffect(() => {
      if (!plannedStart) return;
      setCurrentDateRange(formatThaiDateRangeLabel(plannedStart, plannedEnd));
    }, [plannedStart, plannedEnd]);

    useEffect(() => {
      if (selectedRoute && !currentLabel.trim()) {
        setCurrentLabel(selectedRoute.name?.trim() || `${selectedRoute.startLocation} → ${selectedRoute.endLocation}`);
      }
    }, [selectedRoute, currentLabel]);

    useEffect(() => {
      const token = ++loadTokenRef.current;
      let cancelled = false;
      (async () => {
        setLoading(true);
        setErr(null);
        try {
          if (missionId) {
            const saved = await apiJson<MissionEstimateRecord | null>(`/api/missions/${missionId}/estimate`, {
              skipCache: true,
            });
            if (cancelled || token !== loadTokenRef.current) return;
            if (saved) {
              setCurrentLabel(saved.currentLabel ?? "");
              setPreviousLabel(saved.previousLabel ?? "");
              setCurrentDateRange(saved.currentDateRange ?? "");
              setPreviousDateRange(saved.previousDateRange ?? "");
              setNotes(saved.notes ?? "");
              setPreviousMissionId(saved.previousMissionId);
              const savedLines = forceLumpSumEstimateLines(mergeLegacyEnlistedEstimateLines(saved.lines));
              setLines(savedLines);
              savedPersonCountsRef.current = saved.personCounts ?? null;
              savedCalcMetaRef.current = saved.calcMeta ?? null;
              if (routeId) {
                await loadTemplateForRoute(routeId, plannedStart, missionId, savedLines);
              }
              return;
            }
          }
          if (routeId) {
            const qs = templateQueryParams({
              routeId,
              plannedStart,
              missionId,
              missionCode,
              excludeMissionId: missionId ?? undefined,
            });
            const data = await apiJson<TemplateApiResponse>(
              `/api/mission-estimates/template?${qs.toString()}`,
              { skipCache: true },
            );
            if (cancelled || token !== loadTokenRef.current) return;
            applyTemplate(data.template, data.previous, {
              // สร้างใหม่: ไม่ก๊อปยอดรอบก่อนเข้าช่องปัจจุบัน — เริ่ม 0 + คงอัตรา
              copyPreviousIntoCurrent: false,
              blankQuantities: !missionId,
            });
            if (data.trip2569) {
              applyTrip2569MetaOnly(data.trip2569, { setCurrentDateRange, setCurrentLabel });
            }
          } else {
            const qs = templateQueryParams({ missionId, missionCode });
            const data = await apiJson<TemplateApiResponse>(
              qs.size ? `/api/mission-estimates/template?${qs.toString()}` : "/api/mission-estimates/template",
              { skipCache: true },
            );
            if (cancelled || token !== loadTokenRef.current) return;
            applyTemplate(data.template, data.previous, {
              copyPreviousIntoCurrent: false,
              blankQuantities: !missionId,
            });
            if (data.trip2569) {
              applyTrip2569MetaOnly(data.trip2569, { setCurrentDateRange, setCurrentLabel });
            }
          }
        } catch (e) {
          if (!cancelled && token === loadTokenRef.current) {
            setErr(e instanceof Error ? e.message : "โหลดประมาณการไม่สำเร็จ");
          }
        } finally {
          if (!cancelled && token === loadTokenRef.current) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
      // โหลดใหม่เฉพาะเมื่อภารกิจ/เส้นทาง/วันเริ่มเปลี่ยน
    }, [missionId, missionCode, routeId, plannedStart, applyTemplate, loadTemplateForRoute]);

    function patchLine(index: number, patch: Partial<MissionEstimateRecord["lines"][number]>) {
      setLines((cur) => cur.map((line, i) => (i === index ? { ...line, ...patch } : line)));
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

    async function downloadExcel() {
      try {
        await apiDownload(
          "/api/mission-estimates/export",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...buildPayload(),
              currentTitle: missionTitle,
              previousTitle: previousInfo?.title ?? previousLabel,
            }),
          },
          "ประมาณการค่าใช้จ่าย.xlsx",
        );
      } catch (e) {
        alert(e instanceof Error ? e.message : "ดาวน์โหลดไม่สำเร็จ");
      }
    }

    function addQuestion9Line() {
      setLines((cur) => {
        const groupCode = "9";
        const hasGroup = cur.some((l) => l.kind === "GROUP" && l.groupCode === groupCode);
        const itemCount = cur.filter((l) => l.kind === "ITEM" && l.groupCode === groupCode).length;
        const n = itemCount + 1;

        const nextLines = [...cur];
        if (!hasGroup) {
          nextLines.push({
            sortOrder: nextLines.length,
            kind: "GROUP",
            groupCode,
            itemCode: null,
            name: "ข้อ 9 (รายการอื่นๆ)",
            payoutMethod: "บิลเรียกเก็บ",
            quantity: null,
            unitPrice: null,
            amount: "0",
            previousAmount: null,
            qtyEditable: false,
            rateEditable: false,
            amountEditable: false,
            includeInTotal: false,
            isReserve: false,
            expenseTypeName: "ค่าเงินช่วยเหลือ",
          });
        }

        nextLines.push({
          sortOrder: nextLines.length,
          kind: "ITEM",
          groupCode,
          itemCode: `9.${n}`,
          name: `รายการอื่นๆ`,
          payoutMethod: "บิลเรียกเก็บ",
          quantity: null,
          unitPrice: null,
          amount: "0",
          previousAmount: null,
          qtyEditable: false,
          rateEditable: false,
          amountEditable: true,
          includeInTotal: true,
          isReserve: false,
          expenseTypeName: "ค่าเงินช่วยเหลือ",
        });

        return nextLines;
      });
    }

    function deleteQuestion9Line(index: number) {
      setLines((cur) => {
        const target = cur[index];
        if (!target || target.kind !== "ITEM" || target.groupCode !== "9") return cur;

        const next = cur.filter((_, i) => i !== index);
        const hasAnyItem = next.some((l) => l.kind === "ITEM" && l.groupCode === "9");
        if (hasAnyItem) return next;

        // ถ้าลบจนไม่มีรายการข้อ 9 เหลือ ให้ลบหัวข้อ GROUP 9 ออกด้วย
        return next.filter((l) => !(l.kind === "GROUP" && l.groupCode === "9"));
      });
    }

    if (loading) {
      return <p className="text-sm text-slate-600">กำลังโหลดประมาณการ…</p>;
    }

    return (
      <div className="space-y-4">
        {err ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>
        ) : null}

        {!routeId ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            เลือกเส้นทางในแถบ «ข้อมูลทั่วไป» ก่อน เพื่อเทียบกับประมาณการก่อนหน้าในเส้นทางเดียวกัน
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" className={toolbarLinkBtnClass} onClick={() => setPreviewOpen(true)}>
            พรีวิว
          </button>
          <button type="button" className={toolbarLinkBtnClass} onClick={() => void downloadExcel()}>
            ดาวน์โหลด Excel
          </button>
        </div>

        <section className="grid gap-3 rounded-xl border border-slate-200 bg-white/90 p-3 sm:grid-cols-2">
          <label>
            <span className="text-xs font-medium text-slate-700">ป้ายประมาณการครั้งนี้</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              value={currentLabel}
              onChange={(e) => setCurrentLabel(e.target.value)}
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
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2 text-sm text-amber-900">
            <p>
              {routeId ? "ยังไม่มีประมาณการก่อนหน้าบนเส้นทางนี้ — " : ""}
              กรอกยอดเปรียบเทียบเองได้ในคอลัมน์ «ก่อนหน้า» พร้อมป้ายและช่วงวันที่ด้านบน
            </p>
            {lines.some((l) => parseLooseNumber(l.previousAmount) > 0) ? (
              <button
                type="button"
                className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                onClick={() => setLines((cur) => cur.map((l) => ({ ...l, previousAmount: null })))}
              >
                ล้างยอดก่อนหน้า
              </button>
            ) : null}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white/95">
          <table className="w-full table-fixed border-collapse text-left text-xs">
            <colgroup>
              <col className="w-10" />
              <col />
              <col className="w-12" />
              <col className="w-16" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
              <col className="w-[12%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-50 text-[11px] text-slate-600">
                <th className="border-b border-slate-200 px-2 py-2 font-bold">ที่</th>
                <th className="border-b border-slate-200 px-2 py-2 font-bold">รายการ</th>
                <th className="border-b border-slate-200 px-1 py-2 text-right font-bold">คน</th>
                <th className="border-b border-slate-200 px-1 py-2 text-right font-bold">อัตรา</th>
                <th className="border-b border-slate-200 px-2 py-2 text-right font-bold">ประมาณการครั้งนี้</th>
                <th className="border-b border-slate-200 px-2 py-2 text-right font-bold">ก่อนหน้า</th>
                <th className="border-b border-slate-200 px-2 py-2 text-right font-bold">ผลต่าง</th>
                <th className="border-b border-slate-200 px-2 py-2 font-bold">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const current = lineCurrentAmount(line);
                const previous = parseLooseNumber(line.previousAmount);
                const booked = line.includeInTotal !== false;
                const delta = booked && Number.isFinite(current) && Number.isFinite(previous) ? current - previous : NaN;
                const isGroup = line.kind === "GROUP";
                const isItem = isEstimateItemLine(line);
                const groupTotal = totals.groupSubtotals.get(line.groupCode ?? "");
                const isLastGroup8 = line.groupCode === "8" && lines[idx + 1]?.groupCode !== "8";
                return (
                  <Fragment key={`${line.kind}-${line.itemCode ?? line.groupCode}-${idx}`}>
                  <tr className={isGroup ? "bg-[#faf9ff]" : ""}>
                    <td className="border-b border-slate-100 px-2 py-1.5 font-mono text-[11px] text-slate-500">
                      {line.itemCode || line.groupCode}
                    </td>
                    <td
                      className={`border-b border-slate-100 py-1.5 ${
                        isGroup ? "px-2 font-black text-[#1e1b3a]" : isItem ? "pl-8 pr-2" : "px-2"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-1">
                        {line.kind === "ITEM" && line.groupCode === "9" ? (
                          <input
                            aria-label={`ชื่อรายการข้อ 9 ${line.itemCode ?? ""}`}
                            className="w-full min-w-0 rounded border border-slate-200 bg-white/80 px-1 py-0.5 text-[11px] text-slate-800 outline-none focus:border-slate-300"
                            value={line.name}
                            onChange={(e) => patchLine(idx, { name: e.target.value })}
                          />
                        ) : (
                          <span className="truncate">{line.name}</span>
                        )}
                        {line.payoutMethod === "ยืมเงินทดรองจ่าย" ? (
                          <span title="ยืมเงินทดรองจ่าย" className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-amber-400" />
                        ) : line.payoutMethod === "บิลเรียกเก็บ" ? (
                          <span title="บิลเรียกเก็บ" className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-blue-400" />
                        ) : null}
                        {line.kind === "ITEM" && line.groupCode === "9" ? (
                          <button
                            type="button"
                            className="shrink-0 rounded-md px-1 py-0.5 text-[10px] font-semibold text-rose-600 hover:bg-rose-50"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              deleteQuestion9Line(idx);
                            }}
                            aria-label={`ลบรายการข้อ 9 ${line.itemCode ?? ""}`}
                          >
                            ลบ
                          </button>
                        ) : null}
                        {isGroup && line.includeInTotal === false && groupTotal ? (
                          <span className="ml-1 shrink-0 text-[10px] font-semibold tabular-nums text-[#4d47b6]">
                            รวม {formatBaht(groupTotal.current)}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="border-b border-slate-100 px-0.5 py-1">
                      {line.qtyEditable ? (
                        <CommaNumberInput
                          aria-label={`จำนวนคน ${line.name}`}
                          className="w-full max-w-[3.25rem] rounded-md border border-slate-200 px-1 py-1 text-right text-xs tabular-nums"
                          value={line.quantity ?? ""}
                          maxFractionDigits={0}
                          onChange={(raw) => patchLine(idx, { quantity: raw })}
                        />
                      ) : null}
                    </td>
                    <td className="border-b border-slate-100 px-0.5 py-1">
                      {line.rateEditable ? (
                        <CommaNumberInput
                          aria-label={`อัตรา ${line.name}`}
                          className="w-full max-w-[4rem] rounded-md border border-slate-200 px-1 py-1 text-right text-xs tabular-nums"
                          value={line.unitPrice ?? ""}
                          maxFractionDigits={2}
                          onChange={(raw) => patchLine(idx, { unitPrice: raw })}
                        />
                      ) : null}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-1">
                      {line.includeInTotal === false && isItem ? (
                        <p className="py-1 text-right text-xs tabular-nums text-slate-400" title="ยอดอ้างอิงตามอัตรา — ไม่รวมในผลรวม">
                          {formatBaht(current)}
                        </p>
                      ) : line.includeInTotal === false ? null : line.amountEditable &&
                        !(line.qtyEditable && line.rateEditable) ? (
                        <CommaNumberInput
                          aria-label={`จำนวนเงิน ${line.name}`}
                          className="w-full rounded-md border border-slate-200 px-2 py-1 text-right text-sm tabular-nums"
                          value={line.amount}
                          maxFractionDigits={2}
                          onChange={(raw) => patchLine(idx, { amount: raw })}
                        />
                      ) : (
                        <p className="py-1 text-right text-sm font-semibold tabular-nums">{formatBaht(current)}</p>
                      )}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-1 text-right tabular-nums text-slate-600">
                      {!booked ? null : manualPrevious ? (
                        <CommaNumberInput
                          aria-label={`ยอดก่อนหน้า ${line.name}`}
                          className="w-full rounded-md border border-amber-200 bg-amber-50/40 px-2 py-1 text-right text-sm tabular-nums"
                          value={line.previousAmount ?? ""}
                          maxFractionDigits={2}
                          onChange={(raw) => patchLine(idx, { previousAmount: raw.trim() ? raw : null })}
                        />
                      ) : (
                        formatBaht(previous, { empty: "—" })
                      )}
                    </td>
                    <td className={`border-b border-slate-100 px-2 py-1.5 text-right tabular-nums ${deltaClass(delta)}`}>
                      {Number.isFinite(delta) ? formatBaht(delta) : ""}
                    </td>
                    <td className="border-b border-slate-100 px-1 py-1">
                      {isItem ? (
                        <input
                          type="text"
                          aria-label={`หมายเหตุ ${line.name}`}
                          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-slate-600 placeholder:text-slate-300 hover:border-slate-200 focus:border-slate-300 focus:outline-none"
                          placeholder="หมายเหตุ…"
                          value={line.lineNote ?? ""}
                          onChange={(e) => patchLine(idx, { lineNote: e.target.value })}
                        />
                      ) : null}
                    </td>
                  </tr>
                  {isLastGroup8 ? (
                    <tr>
                      <td colSpan={8} className="border-b border-slate-100 px-2 py-2 text-right">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#4d47b6] hover:bg-slate-50"
                          onClick={addQuestion9Line}
                        >
                          + เพิ่มข้อ 9
                        </button>
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <section className="grid gap-3 rounded-xl border border-slate-200 bg-white/90 p-3 sm:grid-cols-3">
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
            className="mt-1 min-h-[72px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <p className="text-[11px] text-slate-500">
          ประมาณการบันทึกแยกจากค่าใช้จ่ายจริง — บันทึกพร้อมภารกิจในขั้นตอนถัดไปหรือปุ่ม «บันทึกข้อมูล»
        </p>

        <MissionEstimatePreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title={missionTitle}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
          currentDateRange={currentDateRange}
          previousDateRange={previousDateRange}
          notes={notes}
          lines={lines}
        />
      </div>
    );
  },
);
