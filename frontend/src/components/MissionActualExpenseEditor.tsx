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
import { formatBaht, parseLooseNumber } from "../lib/formatNumber";
import {
  computeEstimateTotals,
  finalizeActualExpenseLines,
  formatThaiDateRangeLabel,
  isCargoTruckExpenseLine,
  isEstimateItemLine,
  lineCurrentAmount,
  mergeLegacyEnlistedEstimateLines,
  ensureCargoTruckExpenseLine,
  sumAdvancePayoutAmount,
  templateToFormLines,
  zeroActualExpenseAmounts,
} from "../lib/missionEstimate";
import {
  applyTrip2569ActualLumpSums,
  hasTrip2569Amounts,
  trip2569ActualSkipCodes,
} from "../lib/trip2569Amounts";
import {
  ACTUAL_EXPENSE_LINKED_ITEM_CODE_SET,
  SPECIAL_OPS_REFERENCE_ITEM_CODES,
} from "../lib/personnelExpenseLinks";
import {
  applyBotLineAmountsToLines,
  EMPTY_BOT_LINE_AMOUNTS,
  type BotLineAmounts,
} from "../lib/estimatePersonCounts";
import {
  applyPolicePersonnelAmountsToLines,
  applyStationTotalsToLines,
  EMPTY_POLICE_PERSONNEL_LINE_AMOUNTS,
  EMPTY_STATION_ITEM_TOTALS,
  type PolicePersonnelLineAmounts,
  type StationItemTotals,
} from "../lib/policeCompensationRates";
import type {
  MissionActualExpenseRecord,
  MissionEstimateLine,
  MissionEstimateRecord,
  MissionEstimateTemplate,
  MissionSummary,
  MissionTrip2569Meta,
  NameMasterRow,
  RouteMaster,
} from "../types";

function deltaClass(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "text-slate-600";
  return n > 0 ? "font-semibold text-rose-700" : "font-semibold text-emerald-700";
}

type MissionExpensePayloadRow = {
  expenseTypeId: string;
  amount: number;
  description: string;
};

export type MissionActualExpenseEditorHandle = {
  save: (missionId: string) => Promise<void>;
  reset: () => void;
  buildMissionExpensePayload: (expenseTypeMasters: NameMasterRow[]) => MissionExpensePayloadRow[];
  setVehicleFuelTotal: (total: number) => void;
};

type MissionActualExpenseEditorProps = {
  routeId: string;
  plannedStart: string;
  plannedEnd: string;
  missionId: string | null;
  missionCode?: string | null;
  missionTitle: string;
  selectedRoute?: RouteMaster | null;
  vehicleFuelTotal?: number;
  stationItemTotals?: StationItemTotals;
  /** ยอดรวมค่าตอบแทนตำรวจจากเมนูบุคลากร → ข้อ 2.1/2.2/2.3 */
  policePersonnelAmounts?: PolicePersonnelLineAmounts;
  botLineAmounts?: BotLineAmounts;
  botAmountsLinked?: boolean;
  /** ส่งยอดรวมค่าใช้จ่ายจริงขึ้นฟอร์มภารกิจ (แสดงในแถบเมนู) */
  onApprovalTotalChange?: (total: number) => void;
};

function applyVehicleFuelTotal(
  lines: MissionEstimateLine[],
  total: number,
  opts?: { onlyWhenPresent?: boolean },
): MissionEstimateLine[] {
  if (!lines.some((line) => line.kind === "GROUP" && line.groupCode === "6")) return lines;
  if (opts?.onlyWhenPresent && !(total > 0)) return lines;
  const amount = String(Math.max(0, total));
  return lines.map((line) =>
    line.kind === "GROUP" && line.groupCode === "6" ? { ...line, amount } : line,
  );
}

/** ลิงก์บุคลากร/สถานี/น้ำมัน — ทับยอดเดิมเฉพาะเมื่อมีข้อมูลลิงก์ (TRIP-2569: ไม่มีลิงก์ → คง Excel) */
function applyLinkedActualValues(
  lines: MissionEstimateLine[],
  vehicleFuelTotal: number,
  stationItemTotals: StationItemTotals,
  policePersonnelAmounts: PolicePersonnelLineAmounts,
  botLineAmounts: BotLineAmounts,
  botAmountsLinked: boolean,
  opts?: { preferLinkOverExcel?: boolean },
): MissionEstimateLine[] {
  const onlyWhenPresent = Boolean(opts?.preferLinkOverExcel);
  let next = lines;
  // ตร. 2.1/2.2/2.3 = รวมค่าตอบแทนจากเมนูบุคลากร (ไม่ใช่คน×อัตราตาราง)
  next = applyPolicePersonnelAmountsToLines(next, policePersonnelAmounts);
  next = applyStationTotalsToLines(next, stationItemTotals);
  next = applyBotLineAmountsToLines(next, botLineAmounts, botAmountsLinked);
  next = applyVehicleFuelTotal(next, vehicleFuelTotal, { onlyWhenPresent });
  return finalizeActualExpenseLines(next, ACTUAL_EXPENSE_LINKED_ITEM_CODE_SET, SPECIAL_OPS_REFERENCE_ITEM_CODES);
}

/** TRIP-2569: Excel เป็นยอดรวมตรง ๆ (ไม่คูณ) สำหรับช่องที่ไม่ลิงก์ → ลิงก์ทับเฉพาะที่มีข้อมูล */
function applyTrip2569PreferLinks(
  lines: MissionEstimateLine[],
  tripAmounts: Record<string, number> | null | undefined,
  links: {
    stationItemTotals: StationItemTotals;
    policePersonnelAmounts: PolicePersonnelLineAmounts;
    botLineAmounts: BotLineAmounts;
    botAmountsLinked: boolean;
    vehicleFuelTotal: number;
  },
): MissionEstimateLine[] {
  const skip = trip2569ActualSkipCodes();
  // มีลิงก์น้ำมันจากรถแล้วค่อยข้ามข้อ 6 จาก Excel — ไม่มีให้ใช้ Excel
  if (!(links.vehicleFuelTotal > 0)) skip.delete("6");
  // ไม่มีคนในแท็บตำรวจ → ให้ Excel เติม 2.1/2.2/2.3
  if (!links.policePersonnelAmounts.linked["2.1"]) skip.delete("2.1");
  if (!links.policePersonnelAmounts.linked["2.2"]) skip.delete("2.2");
  if (!links.policePersonnelAmounts.linked["2.3"]) skip.delete("2.3");
  // สถานี
  for (const code of ["2.4", "2.5", "2.6", "2.7"] as const) {
    if (!links.stationItemTotals.linked[code]) skip.delete(code);
  }
  // ค่าที่พัก/พาหนะ/เบี้ย จนท.ธปท. (5.1/5.2/5.3/8.1) ใน trip 69 = ยอดรวมจาก Excel
  // ห้ามคูณจำนวนคน × อัตราที่พัก (เช่น 11×30800)
  skip.delete("5.1");
  skip.delete("5.2");
  skip.delete("5.3");
  skip.delete("8.1");

  let next = applyTrip2569ActualLumpSums(lines, tripAmounts, {
    botAmountsLinked: false,
    skipCodes: skip,
  });
  return applyLinkedActualValues(
    next,
    links.vehicleFuelTotal,
    links.stationItemTotals,
    links.policePersonnelAmounts,
    links.botLineAmounts,
    // ไม่ทับ 5.1–8.1 ด้วยการคูณจากบุคลากร — คงยอด Excel
    false,
    { preferLinkOverExcel: true },
  );
}

async function fetchCargoTruckSeedAmount(missionId: string | null | undefined): Promise<number | null> {
  if (!missionId) return null;
  try {
    const summary = await apiJson<MissionSummary>(`/api/missions/${missionId}/summary`, { skipCache: true });
    const raw = summary.expensesByType?.["ค่าจ้างรถบรรทุก"];
    const n = Number(raw ?? 0);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

async function fetchTrip2569FromTemplate(opts: {
  routeId: string;
  missionId: string | null;
  missionCode?: string | null;
  plannedStart: string;
}): Promise<MissionTrip2569Meta | null> {
  const query = new URLSearchParams();
  if (opts.routeId) query.set("routeId", opts.routeId);
  if (opts.plannedStart) query.set("plannedStart", new Date(opts.plannedStart).toISOString());
  if (opts.missionId) query.set("missionId", opts.missionId);
  if (opts.missionCode?.trim()) query.set("missionCode", opts.missionCode.trim());
  if (!query.size) return null;
  const data = await apiJson<{ trip2569?: MissionTrip2569Meta | null }>(
    `/api/mission-estimates/template?${query.toString()}`,
    { skipCache: true },
  );
  return data.trip2569 ?? null;
}

function applyLoadedActualLines(
  source: MissionEstimateLine[],
  vehicleFuelTotal: number,
  trip2569: MissionTrip2569Meta | null,
  links?: {
    stationItemTotals: StationItemTotals;
    policePersonnelAmounts: PolicePersonnelLineAmounts;
    botLineAmounts: BotLineAmounts;
    botAmountsLinked: boolean;
  },
  opts?: { startFromZero?: boolean },
): MissionEstimateLine[] {
  let next = source.map((line, index) => ({
    ...line,
    sortOrder: line.sortOrder ?? index,
  }));
  next = mergeLegacyEnlistedEstimateLines(next);

  // สร้างภารกิจใหม่: ยอด 0 ทั้งแผ่น แล้วให้ลิงก์ทับเฉพาะที่มีข้อมูลกรอกแล้ว
  if (opts?.startFromZero) {
    next = zeroActualExpenseAmounts(next);
    if (links) {
      return applyLinkedActualValues(
        next,
        vehicleFuelTotal,
        links.stationItemTotals,
        links.policePersonnelAmounts,
        links.botLineAmounts,
        links.botAmountsLinked,
        { preferLinkOverExcel: true },
      );
    }
    return finalizeActualExpenseLines(
      next,
      ACTUAL_EXPENSE_LINKED_ITEM_CODE_SET,
      SPECIAL_OPS_REFERENCE_ITEM_CODES,
    );
  }

  if (trip2569?.amountsByKey && links) {
    return applyTrip2569PreferLinks(next, trip2569.amountsByKey, {
      ...links,
      vehicleFuelTotal,
    });
  }
  if (trip2569?.amountsByKey) {
    next = applyTrip2569ActualLumpSums(next, trip2569.amountsByKey);
    return finalizeActualExpenseLines(next, ACTUAL_EXPENSE_LINKED_ITEM_CODE_SET, SPECIAL_OPS_REFERENCE_ITEM_CODES);
  }
  if (links) {
    return applyLinkedActualValues(
      next,
      vehicleFuelTotal,
      links.stationItemTotals,
      links.policePersonnelAmounts,
      links.botLineAmounts,
      links.botAmountsLinked,
    );
  }
  next = applyVehicleFuelTotal(next, vehicleFuelTotal);
  return finalizeActualExpenseLines(
    next,
    ACTUAL_EXPENSE_LINKED_ITEM_CODE_SET,
    SPECIAL_OPS_REFERENCE_ITEM_CODES,
  );
}

function mapExpenseSummaries(lines: MissionEstimateLine[], expenseTypeMasters: NameMasterRow[]): MissionExpensePayloadRow[] {
  const expenseTypeIdByName = new Map(
    expenseTypeMasters.map((row) => [row.name.trim(), row.id] as const),
  );
  const totals = new Map<string, number>();

  for (const line of lines) {
    if (line.includeInTotal === false || line.isReserve || !line.expenseTypeName) continue;
    const amount = lineCurrentAmount(line);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const name = line.expenseTypeName.trim();
    totals.set(name, (totals.get(name) ?? 0) + amount);
  }

  return [...totals.entries()]
    .map(([name, amount]) => {
      const expenseTypeId = expenseTypeIdByName.get(name);
      if (!expenseTypeId) return null;
      return {
        expenseTypeId,
        amount,
        description: "Summarized from actual expense lines",
      };
    })
    .filter((row): row is MissionExpensePayloadRow => row != null);
}

export const MissionActualExpenseEditor = forwardRef<
  MissionActualExpenseEditorHandle,
  MissionActualExpenseEditorProps
>(function MissionActualExpenseEditor(
  {
    routeId,
    plannedStart,
    plannedEnd,
    missionId,
    missionCode,
    missionTitle,
    selectedRoute,
    vehicleFuelTotal = 0,
    stationItemTotals = EMPTY_STATION_ITEM_TOTALS,
    policePersonnelAmounts = EMPTY_POLICE_PERSONNEL_LINE_AMOUNTS,
    botLineAmounts = EMPTY_BOT_LINE_AMOUNTS,
    botAmountsLinked = false,
    onApprovalTotalChange,
  },
  ref,
) {
  const [currentLabel, setCurrentLabel] = useState("");
  const [currentDateRange, setCurrentDateRange] = useState("");
  const [notes, setNotes] = useState("");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [lines, setLines] = useState<MissionActualExpenseRecord["lines"]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportingReturn, setExportingReturn] = useState(false);
  const loadTokenRef = useRef(0);
  const receivedTouchedRef = useRef(false);
  const trip2569AmountsRef = useRef<Record<string, number> | null>(null);
  /** ผู้ใช้แก้ยอดเองแล้ว — หยุดไม่ให้ลิงก์/Excel ทับกลับ */
  const amountsUserEditedRef = useRef(false);

  const totals = useMemo(() => computeEstimateTotals(lines), [lines]);
  const advanceSpend = useMemo(() => sumAdvancePayoutAmount(lines), [lines]);
  const mainLineRows = useMemo(
    () => lines.map((line, index) => ({ line, index })).filter(({ line }) => !isCargoTruckExpenseLine(line)),
    [lines],
  );
  const truckLineRows = useMemo(
    () => lines.map((line, index) => ({ line, index })).filter(({ line }) => isCargoTruckExpenseLine(line)),
    [lines],
  );
  const truckSpend = useMemo(
    () =>
      truckLineRows.reduce((sum, { line }) => {
        if (line.includeInTotal === false || line.isReserve) return sum;
        const amt = lineCurrentAmount(line);
        return sum + (Number.isFinite(amt) ? amt : 0);
      }, 0),
    [truckLineRows],
  );
  const missionTotals = useMemo(
    () => computeEstimateTotals(mainLineRows.map(({ line }) => line)),
    [mainLineRows],
  );
  /** ค่าใช้จ่ายภารกิจ = รายการหลัก (ไม่รวมรถบรรทุก) รวมสำรอง */
  const missionSpend = missionTotals.spend + missionTotals.reserveAmount;
  const grandTotal = missionSpend + truckSpend;
  const received = parseLooseNumber(receivedAmount);
  const receivedSafe = Number.isFinite(received) ? received : 0;
  /** คงเหลือส่งคืน = รับเงิน − ยอดยืมเงินทดรองจ่าย */
  const returnAmount = receivedSafe - advanceSpend;

  useEffect(() => {
    onApprovalTotalChange?.(grandTotal);
  }, [grandTotal, onApprovalTotalChange]);

  const resetState = useCallback(() => {
    setCurrentLabel("");
    setCurrentDateRange("");
    setNotes("");
    setReceivedAmount("");
    receivedTouchedRef.current = false;
    setLines([]);
    setLoading(true);
    setErr(null);
    trip2569AmountsRef.current = null;
    amountsUserEditedRef.current = false;
    onApprovalTotalChange?.(0);
  }, [onApprovalTotalChange]);

  const buildPayload = useCallback(() => {
    return {
      currentLabel,
      currentDateRange,
      notes,
      lines: lines.map((line, i) => ({
        ...line,
        sortOrder: i,
        amount: lineCurrentAmount(line),
      })),
    };
  }, [currentDateRange, currentLabel, lines, notes]);

  useImperativeHandle(ref, () => ({
    reset: resetState,
    save: async (mid: string) => {
      if (!lines.length) return;
      await apiJson(`/api/missions/${mid}/actual-expense`, {
        method: "PUT",
        body: JSON.stringify(buildPayload()),
      });
    },
    buildMissionExpensePayload: (expenseTypeMasters) => mapExpenseSummaries(lines, expenseTypeMasters),
    setVehicleFuelTotal: (total: number) => {
      setLines((cur) => applyVehicleFuelTotal(cur, total));
    },
  }));

  useEffect(() => {
    if (loading) return;
    // หลังผู้ใช้แก้ยอดแล้ว — ไม่ทับด้วยลิงก์/Excel อีก
    if (amountsUserEditedRef.current) return;

    setLines((cur) => {
      const linkBundle = {
        stationItemTotals,
        policePersonnelAmounts,
        botLineAmounts,
        botAmountsLinked,
        vehicleFuelTotal,
      };

      // สร้างใหม่: ไม่ดึง Excel — ยอด 0 + ลิงก์เฉพาะที่มีข้อมูล
      if (!missionId) {
        return applyLinkedActualValues(
          cur,
          vehicleFuelTotal,
          stationItemTotals,
          policePersonnelAmounts,
          botLineAmounts,
          botAmountsLinked,
          { preferLinkOverExcel: true },
        );
      }

      // แก้ไขภารกิจเดิม + TRIP-2569: Excel เป็นฐาน → ลิงก์ทับเฉพาะที่มีข้อมูล
      if (hasTrip2569Amounts(trip2569AmountsRef.current)) {
        return applyTrip2569PreferLinks(cur, trip2569AmountsRef.current, linkBundle);
      }

      return applyLinkedActualValues(
        cur,
        vehicleFuelTotal,
        stationItemTotals,
        policePersonnelAmounts,
        botLineAmounts,
        botAmountsLinked,
      );
    });
  }, [
    missionId,
    vehicleFuelTotal,
    stationItemTotals,
    policePersonnelAmounts,
    botLineAmounts,
    botAmountsLinked,
    loading,
  ]);

  useEffect(() => {
    if (!plannedStart) return;
    setCurrentDateRange(formatThaiDateRangeLabel(plannedStart, plannedEnd));
  }, [plannedStart, plannedEnd]);

  useEffect(() => {
    if (currentLabel.trim()) return;
    if (selectedRoute) {
      setCurrentLabel(selectedRoute.name?.trim() || `${selectedRoute.startLocation} → ${selectedRoute.endLocation}`);
      return;
    }
    if (missionTitle.trim()) setCurrentLabel(missionTitle.trim());
  }, [selectedRoute, missionTitle, currentLabel]);

  useEffect(() => {
    const token = ++loadTokenRef.current;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        amountsUserEditedRef.current = false;
        const trip2569 = await fetchTrip2569FromTemplate({
          routeId,
          missionId,
          missionCode,
          plannedStart,
        });
        // สร้างใหม่ไม่เก็บยอด Excel — ใช้แค่ป้ายวันที่/เส้นทางจาก meta
        trip2569AmountsRef.current = missionId ? trip2569?.amountsByKey ?? null : null;

        const linkOpts = {
          stationItemTotals,
          policePersonnelAmounts,
          botLineAmounts,
          botAmountsLinked,
        };

        if (missionId) {
          const savedActual = await apiJson<MissionActualExpenseRecord | null>(
            `/api/missions/${missionId}/actual-expense`,
            { skipCache: true },
          );
          if (cancelled || token !== loadTokenRef.current) return;
          if (savedActual) {
            setCurrentLabel(savedActual.currentLabel ?? "");
            setCurrentDateRange(savedActual.currentDateRange ?? "");
            setNotes(savedActual.notes ?? "");
            receivedTouchedRef.current = false;
            setReceivedAmount("");
            if (trip2569?.dateRange) setCurrentDateRange(trip2569.dateRange);
            if (trip2569?.routeText) {
              setCurrentLabel((cur) => cur.trim() || trip2569.routeText);
            }
            const truckSeed = await fetchCargoTruckSeedAmount(missionId);
            if (cancelled || token !== loadTokenRef.current) return;
            let savedLines = mergeLegacyEnlistedEstimateLines(
              savedActual.lines.map((line, index) => ({
                ...line,
                sortOrder: line.sortOrder ?? index,
                amountEditable: true,
                qtyEditable: false,
                rateEditable: false,
              })),
            );
            if (truckSeed != null) {
              savedLines = ensureCargoTruckExpenseLine(savedLines, { seedAmount: truckSeed });
            }
            if (trip2569?.amountsByKey) {
              setLines(
                applyTrip2569PreferLinks(savedLines, trip2569.amountsByKey, {
                  ...linkOpts,
                  vehicleFuelTotal,
                }),
              );
            } else {
              setLines(
                applyLinkedActualValues(
                  savedLines,
                  vehicleFuelTotal,
                  linkOpts.stationItemTotals,
                  linkOpts.policePersonnelAmounts,
                  linkOpts.botLineAmounts,
                  linkOpts.botAmountsLinked,
                ),
              );
            }
            return;
          }

          const savedEstimate = await apiJson<MissionEstimateRecord | null>(
            `/api/missions/${missionId}/estimate`,
            { skipCache: true },
          );
          if (cancelled || token !== loadTokenRef.current) return;
          if (savedEstimate?.lines?.length) {
            setCurrentLabel(savedEstimate.currentLabel ?? "");
            setCurrentDateRange(savedEstimate.currentDateRange ?? "");
            setNotes("");
            receivedTouchedRef.current = false;
            setReceivedAmount(
              Number.isFinite(parseLooseNumber(savedEstimate.approvalTotal))
                ? String(savedEstimate.approvalTotal)
                : "",
            );
            if (trip2569?.dateRange) setCurrentDateRange(trip2569.dateRange);
            if (trip2569?.routeText) {
              setCurrentLabel((cur) => cur.trim() || trip2569.routeText);
            }
            const truckSeed = await fetchCargoTruckSeedAmount(missionId);
            if (cancelled || token !== loadTokenRef.current) return;
            let fromEstimate = applyLoadedActualLines(
              savedEstimate.lines,
              vehicleFuelTotal,
              trip2569,
              linkOpts,
            );
            if (truckSeed != null) {
              fromEstimate = ensureCargoTruckExpenseLine(fromEstimate, { seedAmount: truckSeed });
            }
            setLines(fromEstimate);
            return;
          }
        }

        const query = new URLSearchParams();
        if (routeId) query.set("routeId", routeId);
        if (plannedStart) query.set("plannedStart", new Date(plannedStart).toISOString());
        if (missionId) query.set("excludeMissionId", missionId);
        if (missionId) query.set("missionId", missionId);
        if (missionCode?.trim()) query.set("missionCode", missionCode.trim());
        const url = query.size ? `/api/mission-estimates/template?${query.toString()}` : "/api/mission-estimates/template";
        const templateData = await apiJson<{
          template: MissionEstimateTemplate;
          trip2569?: MissionTrip2569Meta | null;
        }>(url, { skipCache: true });
        if (cancelled || token !== loadTokenRef.current) return;
        const meta = templateData.trip2569 ?? trip2569;
        trip2569AmountsRef.current = missionId
          ? templateData.trip2569?.amountsByKey ?? trip2569?.amountsByKey ?? null
          : null;
        if (meta?.dateRange) setCurrentDateRange(meta.dateRange);
        if (meta?.routeText) setCurrentLabel((cur) => cur.trim() || meta.routeText);
        const truckSeed = await fetchCargoTruckSeedAmount(missionId);
        if (cancelled || token !== loadTokenRef.current) return;
        let fromTemplate = applyLoadedActualLines(
          templateToFormLines(templateData.template),
          vehicleFuelTotal,
          missionId ? meta : null,
          linkOpts,
          { startFromZero: !missionId },
        );
        if (truckSeed != null) {
          fromTemplate = ensureCargoTruckExpenseLine(fromTemplate, { seedAmount: truckSeed });
        }
        setLines(fromTemplate);
        setNotes("");
        receivedTouchedRef.current = false;
        setReceivedAmount("");
      } catch (e) {
        if (!cancelled && token === loadTokenRef.current) {
          setErr(e instanceof Error ? e.message : "โหลดค่าใช้จ่ายจริงไม่สำเร็จ");
        }
      } finally {
        if (!cancelled && token === loadTokenRef.current) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [missionId, missionCode, routeId, plannedStart]);

  useEffect(() => {
    if (loading || receivedTouchedRef.current || receivedAmount) return;
    if (totals.previousApproval > 0) setReceivedAmount(String(totals.previousApproval));
  }, [loading, receivedAmount, totals.previousApproval]);

  function patchLine(index: number, patch: Partial<MissionEstimateLine>) {
    if (patch.amount !== undefined || patch.quantity !== undefined || patch.unitPrice !== undefined) {
      amountsUserEditedRef.current = true;
    }
    setLines((cur) => cur.map((line, i) => (i === index ? { ...line, ...patch } : line)));
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
        name: "รายการอื่นๆ",
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
      return next.filter((l) => !(l.kind === "GROUP" && l.groupCode === "9"));
    });
  }

  async function downloadExcel() {
    if (!lines.length) {
      alert("ยังไม่มีรายการค่าใช้จ่ายให้ส่งออก");
      return;
    }
    setExporting(true);
    try {
      const codePart = (missionCode ?? "").trim() || "draft";
      await apiDownload(
        "/api/missions/actual-expense/export",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentLabel,
            currentDateRange,
            notes,
            currentTitle: missionTitle,
            missionCode,
            receivedAmount: receivedSafe,
            lines: lines.map((line, i) => ({
              ...line,
              sortOrder: i,
              amount: lineCurrentAmount(line),
            })),
          }),
        },
        `ค่าใช้จ่ายจริง_${codePart}.xlsx`,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "ดาวน์โหลดไม่สำเร็จ");
    } finally {
      setExporting(false);
    }
  }

  async function downloadReturnExcel() {
    if (!lines.length) {
      alert("ยังไม่มีรายการค่าใช้จ่ายให้ส่งออก");
      return;
    }
    setExportingReturn(true);
    try {
      const codePart = (missionCode ?? "").trim() || "draft";
      await apiDownload(
        "/api/missions/actual-expense/export-return",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentLabel,
            currentDateRange,
            notes,
            currentTitle: missionTitle,
            missionCode,
            receivedAmount: receivedSafe,
            lines: lines.map((line, i) => ({
              ...line,
              sortOrder: i,
              amount: lineCurrentAmount(line),
            })),
          }),
        },
        `สรุปยอดส่งคืน_${codePart}.xlsx`,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "ดาวน์โหลดไม่สำเร็จ");
    } finally {
      setExportingReturn(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-600">กำลังโหลดค่าใช้จ่ายจริง…</p>;
  }

  return (
    <div className="space-y-4">
      {err ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>
      ) : null}

      {!routeId ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          เลือกเส้นทางก่อน ระบบจะใช้โครงรายการจากประมาณการเดิมหรือแม่แบบมาตรฐาน
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-emerald-50/40 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-black text-[#1e1b3a]">รายงานค่าใช้จ่ายจริง</p>
          <p className="text-[11px] text-slate-500">
            ส่งออกไฟล์ Excel แยกค่าใช้จ่ายภารกิจ · รถบรรทุกสินค้า
          </p>
        </div>
        <button
          type="button"
          disabled={exporting || !lines.length}
          onClick={() => void downloadExcel()}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-700/20 bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm1 7V3.5L18.5 9H15zM8.5 11h2.2l1.1 2.6 1.2-2.6h2l-2.1 4.2L15 19.5h-2.1l-1.3-2.8-1.3 2.8H8.2l2.1-4.3L8.5 11z" />
          </svg>
          {exporting ? "กำลังสร้างไฟล์…" : "ดาวน์โหลด Excel"}
        </button>
      </div>

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white/90 p-3 sm:grid-cols-2">
        <label>
          <span className="text-xs font-medium text-slate-700">ป้ายค่าใช้จ่ายจริง</span>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            value={currentLabel}
            onChange={(e) => setCurrentLabel(e.target.value)}
          />
        </label>
        <label>
          <span className="text-xs font-medium text-slate-700">ช่วงวันที่ใช้จริง</span>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            value={currentDateRange}
            onChange={(e) => setCurrentDateRange(e.target.value)}
          />
        </label>
      </section>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white/95">
        <table className="w-full table-fixed border-collapse text-left text-xs">
          <colgroup>
            <col className="w-10" />
            <col />
            <col className="w-[22%]" />
            <col className="w-[22%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead>
            <tr className="bg-slate-50 text-[11px] text-slate-600">
              <th className="border-b border-slate-200 px-2 py-2 font-bold">ที่</th>
              <th className="border-b border-slate-200 px-2 py-2 font-bold">รายการ</th>
              <th className="border-b border-slate-200 px-2 py-2 text-right font-bold">ค่าใช้จ่ายจริง</th>
              <th className="border-b border-slate-200 px-2 py-2 text-right font-bold">อ้างอิงประมาณการ</th>
              <th className="border-b border-slate-200 px-2 py-2 text-right font-bold">ผลต่าง</th>
            </tr>
          </thead>
          <tbody>
            {mainLineRows.map(({ line, index: idx }, rowPos) => {
              const current = lineCurrentAmount(line);
              const previous = parseLooseNumber(line.previousAmount);
              const booked = line.includeInTotal !== false;
              const delta = booked && Number.isFinite(current) && Number.isFinite(previous) ? current - previous : NaN;
              const isGroup = line.kind === "GROUP";
              const isItem = isEstimateItemLine(line);
              const groupTotal = totals.groupSubtotals.get(line.groupCode ?? "");
              const nextMain = mainLineRows[rowPos + 1]?.line;
              const isLastGroup8 = line.groupCode === "8" && nextMain?.groupCode !== "8";

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
                  <td className="border-b border-slate-100 px-2 py-1">
                    {isItem || (isGroup && line.includeInTotal) || line.amountEditable ? (
                      <CommaNumberInput
                        aria-label={`จำนวนเงิน ${line.name}`}
                        className={`w-full rounded-md border px-2 py-1 text-right text-sm tabular-nums ${
                          !booked
                            ? "border-slate-200 bg-slate-50 text-slate-600"
                            : "border-amber-300 bg-amber-50/40"
                        }`}
                        value={line.amount}
                        maxFractionDigits={2}
                        onChange={(raw) =>
                          patchLine(idx, {
                            amount: raw,
                            amountEditable: true,
                            qtyEditable: false,
                            rateEditable: false,
                          })
                        }
                      />
                    ) : isGroup && line.includeInTotal === false && groupTotal ? (
                      <p className="py-1 text-right text-xs font-semibold tabular-nums text-[#4d47b6]">
                        {formatBaht(groupTotal.current)}
                      </p>
                    ) : null}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-1.5 text-right tabular-nums text-slate-600">
                    {formatBaht(previous, { empty: "—" })}
                  </td>
                  <td className={`border-b border-slate-100 px-2 py-1.5 text-right tabular-nums ${deltaClass(delta)}`}>
                    {Number.isFinite(delta) ? formatBaht(delta) : ""}
                  </td>
                </tr>
                {isLastGroup8 ? (
                  <tr>
                    <td colSpan={5} className="border-b border-slate-100 px-2 py-2 text-right">
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

      {truckLineRows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white/95">
          <p className="border-b border-slate-200 bg-emerald-50 px-3 py-2 text-sm font-black text-[#1e1b3a]">
            ค่าใช้จ่ายรถบรรทุกสินค้า
          </p>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-left text-xs">
              <colgroup>
                <col className="w-10" />
                <col />
                <col className="w-[22%]" />
                <col className="w-[22%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 text-[11px] text-slate-600">
                  <th className="border-b border-slate-200 px-2 py-2 font-bold">ที่</th>
                  <th className="border-b border-slate-200 px-2 py-2 font-bold">รายการ</th>
                  <th className="border-b border-slate-200 px-2 py-2 text-right font-bold">ค่าใช้จ่ายจริง</th>
                  <th className="border-b border-slate-200 px-2 py-2 text-right font-bold">อ้างอิงประมาณการ</th>
                  <th className="border-b border-slate-200 px-2 py-2 text-right font-bold">ผลต่าง</th>
                </tr>
              </thead>
              <tbody>
                {truckLineRows.map(({ line, index: idx }) => {
                  const current = lineCurrentAmount(line);
                  const previous = parseLooseNumber(line.previousAmount);
                  const booked = line.includeInTotal !== false;
                  const delta =
                    booked && Number.isFinite(current) && Number.isFinite(previous) ? current - previous : NaN;
                  return (
                    <tr key={`truck-${line.groupCode}-${idx}`}>
                      <td className="border-b border-slate-100 px-2 py-1.5 font-mono text-[11px] text-slate-500">
                        {line.itemCode || line.groupCode}
                      </td>
                      <td className="border-b border-slate-100 px-2 py-1.5 font-semibold text-[#1e1b3a]">
                        <span className="flex min-w-0 items-center gap-1">
                          <span className="truncate">{line.name}</span>
                          {line.payoutMethod === "ยืมเงินทดรองจ่าย" ? (
                            <span
                              title="ยืมเงินทดรองจ่าย"
                              className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-amber-400"
                            />
                          ) : line.payoutMethod === "บิลเรียกเก็บ" ? (
                            <span
                              title="บิลเรียกเก็บ"
                              className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-blue-400"
                            />
                          ) : null}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-2 py-1">
                        <CommaNumberInput
                          aria-label={`จำนวนเงิน ${line.name}`}
                          className={`w-full rounded-md border px-2 py-1 text-right text-sm tabular-nums ${
                            !booked
                              ? "border-slate-200 bg-slate-50 text-slate-600"
                              : "border-amber-300 bg-amber-50/40"
                          }`}
                          value={line.amount}
                          maxFractionDigits={2}
                          onChange={(raw) =>
                            patchLine(idx, {
                              amount: raw,
                              amountEditable: true,
                              qtyEditable: false,
                              rateEditable: false,
                            })
                          }
                        />
                      </td>
                      <td className="border-b border-slate-100 px-2 py-1.5 text-right tabular-nums text-slate-600">
                        {formatBaht(previous, { empty: "—" })}
                      </td>
                      <td className={`border-b border-slate-100 px-2 py-1.5 text-right tabular-nums ${deltaClass(delta)}`}>
                        {Number.isFinite(delta) ? formatBaht(delta) : ""}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-emerald-50/60">
                  <td className="px-2 py-2" colSpan={2}>
                    <span className="font-black text-[#1e1b3a]">รวมรถบรรทุกสินค้า</span>
                  </td>
                  <td className="px-2 py-2 text-right text-sm font-black tabular-nums text-[#0000BF]">
                    {formatBaht(truckSpend)}
                  </td>
                  <td className="px-2 py-2" colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white/90 p-3 sm:grid-cols-3">
        <div>
          <p className="text-[11px] font-bold text-slate-500">ค่าใช้จ่ายภารกิจ</p>
          <p className="mt-1 text-lg font-black tabular-nums text-[#1e1b3a]">{formatBaht(missionSpend)}</p>
          {missionTotals.reserveAmount > 0 ? (
            <p className="text-[11px] text-slate-500">รวมสำรอง {formatBaht(missionTotals.reserveAmount)}</p>
          ) : null}
        </div>
        <div>
          <p className="text-[11px] font-bold text-slate-500">ค่าจ้างรถบรรทุกสินค้า</p>
          <p className="mt-1 text-lg font-black tabular-nums text-[#1e1b3a]">{formatBaht(truckSpend)}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold text-slate-500">รวมค่าใช้จ่ายจริง</p>
          <p className="mt-1 text-lg font-black tabular-nums text-[#0000BF]">{formatBaht(grandTotal)}</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white/95">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-sky-50 px-3 py-2">
          <p className="text-sm font-black text-[#1e1b3a]">สรุปยอดเงินส่งคืน</p>
          <button
            type="button"
            disabled={exportingReturn || !lines.length}
            onClick={() => void downloadReturnExcel()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-700/20 bg-sky-700 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm1 7V3.5L18.5 9H15zM8.5 11h2.2l1.1 2.6 1.2-2.6h2l-2.1 4.2L15 19.5h-2.1l-1.3-2.8-1.3 2.8H8.2l2.1-4.3L8.5 11z" />
            </svg>
            {exportingReturn ? "กำลังสร้างไฟล์…" : "ดาวน์โหลด Excel"}
          </button>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-sky-100 text-[11px] font-bold text-slate-700">
              <th className="w-16 border-b border-slate-200 px-3 py-2 text-left">ลำดับ</th>
              <th className="border-b border-slate-200 px-3 py-2 text-left">รายการ</th>
              <th className="w-44 border-b border-slate-200 px-3 py-2 text-right">จำนวน / บาท</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border-b border-slate-100 px-3 py-2 font-mono text-slate-500">1</td>
              <td className="border-b border-slate-100 px-3 py-2">รับเงินจาก ฝธช.</td>
              <td className="border-b border-slate-100 px-3 py-1.5">
                <CommaNumberInput
                  aria-label="ยอดรับเงินจาก ฝธช."
                  className="w-full rounded-md border border-amber-300 bg-amber-50/40 px-2 py-1 text-right text-sm tabular-nums"
                  value={receivedAmount}
                  maxFractionDigits={2}
                  onChange={(raw) => {
                    receivedTouchedRef.current = true;
                    setReceivedAmount(raw);
                  }}
                />
              </td>
            </tr>
            <tr>
              <td className="border-b border-slate-100 px-3 py-2 font-mono text-slate-500">2</td>
              <td className="border-b border-slate-100 px-3 py-2">ค่าใช้จ่ายที่ยืมเงินทดรองจ่าย</td>
              <td className="border-b border-slate-100 px-3 py-2 text-right font-semibold tabular-nums">
                {formatBaht(advanceSpend, { digits: 2 })}
              </td>
            </tr>
            <tr className="bg-[#faf9ff]">
              <td className="px-3 py-2 font-mono text-slate-500">3</td>
              <td className="px-3 py-2 font-black text-[#1e1b3a]">คงเหลือส่งคืนทุกรายการ</td>
              <td className="px-3 py-2 text-right">
                <span className="border-b-2 border-double border-[#0000BF] pb-0.5 text-base font-black tabular-nums text-[#0000BF]">
                  {formatBaht(returnAmount, { digits: 2 })}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <label className="block">
        <span className="text-xs font-medium text-slate-700">หมายเหตุ</span>
        <textarea
          className="mt-1 min-h-[72px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
    </div>
  );
});
