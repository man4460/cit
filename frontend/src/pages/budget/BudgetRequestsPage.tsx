import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeaderBar } from "../../components/PageHeaderBar";
import { BudgetOverviewSubNav } from "../../components/BudgetOverviewSubNav";
import { apiJson } from "../../api/client";
import { rowMatchesFilter } from "../../lib/searchNormalize";
import { toolbarLinkBtnClass, toolbarMasterGroupClass } from "../../lib/uiTokens";
import { formatBaht, formatPct, kindLabel, pctToneClass, type BudgetKind } from "./budgetFormat";
import type { LoadOptions } from "../../lib/loadOptions";
import { setLoadBusy } from "../../lib/loadOptions";

type RequestItem = {
  id: string;
  accountId: string;
  ciCode: string | null;
  fileRef: string | null;
  name: string;
  definition: string | null;
  kind: BudgetKind;
  isSummary: boolean;
  sortOrder: number;
  baseAllocated: number;
  baseSpent: number;
  basePctUsed: number | null;
  requestedAmount: number;
  deltaAmount: number | null;
  deltaPercent: number | null;
  changeDirection: string | null;
  reason: string | null;
  planEndAmount: number | null;
};

type RequestsPayload = {
  targetYearBe: number;
  baseYearBe: number;
  items: RequestItem[];
};

function m(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return (n / 1_000_000).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function signedM(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const v = n / 1_000_000;
  const s = v.toLocaleString("th-TH", { maximumFractionDigits: 2 });
  return v > 0 ? `+${s}` : s;
}

function deltaClass(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return "text-slate-600";
  return n > 0 ? "font-bold text-emerald-700" : "font-bold text-rose-600";
}

export function BudgetRequestsPage() {
  const targetYearBe = 2570;
  const [data, setData] = useState<RequestsPayload | null>(null);
  const [exec, setExec] = useState<{
    headline: {
      year69Budget: number;
      year70Request: number;
      delta: number;
      deltaPct: number | null;
    };
    byKind: { kind: BudgetKind; label: string; year69: number; year70: number; delta: number }[];
  } | null>(null);
  const [filter, setFilter] = useState("");
  const [kind, setKind] = useState<"" | BudgetKind>("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBaht, setShowBaht] = useState(false);

  const load = useCallback(async (opts?: LoadOptions) => {
    setLoadBusy(setLoading, opts, true);
    setErr(null);
    try {
      const [res, ex] = await Promise.all([
        apiJson<RequestsPayload>(`/api/budget/requests?yearBe=${targetYearBe}`),
        apiJson<{
          headline: {
            year69Budget: number;
            year70Request: number;
            delta: number;
            deltaPct: number | null;
          };
          byKind: { kind: BudgetKind; label: string; year69: number; year70: number; delta: number }[];
        }>("/api/budget/executive"),
      ]);
      setData(res);
      setExec(ex);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const detailItems = useMemo(() => {
    let items = (data?.items ?? []).filter((i) => !i.isSummary && Boolean(i.ciCode));
    if (kind) items = items.filter((i) => i.kind === kind);
    return items.filter((r) => rowMatchesFilter(filter, [r.name, r.ciCode, r.fileRef, r.reason, r.changeDirection]));
  }, [data, filter, kind]);

  const summary = useMemo(() => {
    if (exec) {
      const expense = exec.byKind.find((k) => k.kind === "EXPENSE");
      const capex = exec.byKind.find((k) => k.kind === "CAPEX");
      return {
        base: exec.headline.year69Budget,
        requested: exec.headline.year70Request,
        delta: exec.headline.delta,
        deltaPct: exec.headline.deltaPct,
        expense: expense
          ? { base: expense.year69, requested: expense.year70, delta: expense.delta }
          : null,
        capex: capex ? { base: capex.year69, requested: capex.year70, delta: capex.delta } : null,
      };
    }
    return {
      base: 0,
      requested: 0,
      delta: 0,
      deltaPct: null as number | null,
      expense: null,
      capex: null,
    };
  }, [exec]);

  const increases = useMemo(
    () =>
      detailItems
        .filter((x) => (x.deltaAmount ?? x.requestedAmount - x.baseAllocated) > 0)
        .sort((a, b) => (b.deltaAmount ?? 0) - (a.deltaAmount ?? 0))
        .slice(0, 8),
    [detailItems],
  );
  const decreases = useMemo(
    () =>
      detailItems
        .filter((x) => (x.deltaAmount ?? x.requestedAmount - x.baseAllocated) < 0)
        .sort((a, b) => (a.deltaAmount ?? 0) - (b.deltaAmount ?? 0))
        .slice(0, 8),
    [detailItems],
  );

  const baseYear = data?.baseYearBe ?? targetYearBe - 1;
  const fmt = (n: number | null | undefined) => (showBaht ? formatBaht(n) : m(n));
  const unit = showBaht ? "บาท" : "ลบ.";

  return (
    <div className="space-y-4">
      <PageHeaderBar
        title="คำขอปีถัดไป"
        count={detailItems.length}
        filter={{
          value: filter,
          onChange: setFilter,
          placeholder: "ค้นหา CI / ชื่อ / เหตุผล…",
          printTitle: `คำของบปี ${targetYearBe} เทียบปี ${baseYear}`,
          trailing: (
            <div className="flex flex-wrap items-center gap-1">
              <button type="button" className={toolbarLinkBtnClass} onClick={() => setShowBaht((v) => !v)}>
                หน่วย: {showBaht ? "บาท" : "ล้านบาท"}
              </button>
              <div className={toolbarMasterGroupClass}>
                {(
                  [
                    ["", "ทั้งหมด"],
                    ["EXPENSE", "ค่าใช้จ่าย"],
                    ["CAPEX", "ครุภัณฑ์"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[11px] font-bold sm:h-9 sm:px-3 sm:text-xs ${
                      kind === k
                        ? "bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-white shadow-md"
                        : "text-[#4d47b6] hover:bg-[#0000BF]/8"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ),
        }}
        extras={
          <>
            <Link to="/budget/year/2569" className={toolbarLinkBtnClass}>
              งบประมาณ
            </Link>
            <BudgetOverviewSubNav />
          </>
        }
      />

      <p className="text-sm text-[#4d47b6]">
        รายละเอียดคำขอปี {targetYearBe} และเปรียบเทียบกับงบปี {baseYear}
      </p>

      {err ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{err}</p> : null}
      {loading && !data ? <p className="text-sm text-slate-500">กำลังโหลด…</p> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[1.25rem] border border-[#e8e6fc] bg-gradient-to-br from-white via-[#faf9ff] to-[#fdf2f8]/60 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[#66638c]">งบปี {baseYear}</div>
          <div className="mt-1 text-2xl font-black tabular-nums text-[#1e1b4b]">
            {fmt(summary.base)} <span className="text-sm font-bold text-[#66638c]">{unit}</span>
          </div>
        </div>
        <div className="rounded-[1.25rem] border border-[#e8e6fc] bg-gradient-to-br from-white via-[#faf9ff] to-[#fdf2f8]/60 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[#66638c]">คำขอปี {targetYearBe}</div>
          <div className="mt-1 text-2xl font-black tabular-nums text-[#1e1b4b]">
            {fmt(summary.requested)} <span className="text-sm font-bold text-[#66638c]">{unit}</span>
          </div>
        </div>
        <div className="rounded-[1.25rem] border border-[#e8e6fc] bg-gradient-to-br from-white via-[#faf9ff] to-[#fdf2f8]/60 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[#66638c]">Δ เปลี่ยนแปลง</div>
          <div className={`mt-1 text-2xl font-black tabular-nums ${deltaClass(summary.delta)}`}>
            {showBaht ? formatBaht(summary.delta) : signedM(summary.delta)}{" "}
            <span className="text-sm font-bold text-[#66638c]">{unit}</span>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            {summary.deltaPct != null ? formatPct(summary.deltaPct) : summary.base > 0 ? formatPct(summary.delta / summary.base) : "—"}{" "}
            เทียบปี {baseYear}
          </p>
        </div>
      </div>

      {(summary.expense || summary.capex) && (
        <div className="overflow-hidden rounded-[1.25rem] border border-[#e8e6fc] bg-white/90">
          <div className="border-b border-[#ecebff] bg-gradient-to-r from-[#faf9ff] to-[#fdf2f8] px-4 py-2.5 text-sm font-black text-[#1e1b4b]">
            เปรียบเทียบตามหมวด
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#ecebff] text-[11px] text-[#66638c]">
                <th className="px-3 py-2 font-bold">หมวด</th>
                <th className="px-3 py-2 text-right font-bold">ปี {baseYear}</th>
                <th className="px-3 py-2 text-right font-bold">คำขอ {targetYearBe}</th>
                <th className="px-3 py-2 text-right font-bold">Δ</th>
              </tr>
            </thead>
            <tbody>
              {summary.expense ? (
                <tr className="border-b border-[#ecebff]">
                  <td className="px-3 py-2 font-medium">หมวดค่าใช้จ่าย</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(summary.expense.base)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt(summary.expense.requested)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${deltaClass(summary.expense.delta)}`}>
                    {showBaht ? formatBaht(summary.expense.delta) : signedM(summary.expense.delta)}
                  </td>
                </tr>
              ) : null}
              {summary.capex ? (
                <tr className="border-b border-[#ecebff]">
                  <td className="px-3 py-2 font-medium">หมวดสินทรัพย์ถาวร</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(summary.capex.base)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt(summary.capex.requested)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${deltaClass(summary.capex.delta)}`}>
                    {showBaht ? formatBaht(summary.capex.delta) : signedM(summary.capex.delta)}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-[1.25rem] border border-[#e8e6fc] bg-white/90">
          <div className="border-b border-[#ecebff] bg-emerald-50/80 px-4 py-2.5 text-sm font-black text-emerald-800">
            รายการเพิ่มหลัก
          </div>
          <ul className="divide-y divide-[#ecebff] text-sm">
            {increases.map((r) => {
              const d = r.deltaAmount ?? r.requestedAmount - r.baseAllocated;
              return (
                <li key={r.id} className="px-3 py-2">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-[#2e2a58]">{r.name}</span>
                    <span className={deltaClass(d)}>{showBaht ? formatBaht(d) : signedM(d)}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 line-clamp-2 whitespace-pre-line">
                    {r.reason || kindLabel(r.kind)}
                  </div>
                </li>
              );
            })}
            {!loading && !increases.length ? <li className="px-3 py-4 text-slate-500">ไม่มีรายการเพิ่ม</li> : null}
          </ul>
        </section>
        <section className="overflow-hidden rounded-[1.25rem] border border-[#e8e6fc] bg-white/90">
          <div className="border-b border-[#ecebff] bg-rose-50/80 px-4 py-2.5 text-sm font-black text-rose-800">
            รายการลดหลัก
          </div>
          <ul className="divide-y divide-[#ecebff] text-sm">
            {decreases.map((r) => {
              const d = r.deltaAmount ?? r.requestedAmount - r.baseAllocated;
              return (
                <li key={r.id} className="px-3 py-2">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-[#2e2a58]">{r.name}</span>
                    <span className={deltaClass(d)}>{showBaht ? formatBaht(d) : signedM(d)}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 line-clamp-2 whitespace-pre-line">
                    {r.reason || kindLabel(r.kind)}
                  </div>
                </li>
              );
            })}
            {!loading && !decreases.length ? <li className="px-3 py-4 text-slate-500">ไม่มีรายการลด</li> : null}
          </ul>
        </section>
      </div>

      <div className="overflow-x-auto rounded-[1.25rem] border border-[#e8e6fc] bg-white/90">
        <div className="border-b border-[#ecebff] bg-gradient-to-r from-[#faf9ff] to-[#fdf2f8] px-4 py-2.5 text-sm font-black text-[#1e1b4b]">
          รายละเอียดคำขอทั้งหมด
        </div>
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#ecebff] text-[11px] text-[#66638c]">
              <th className="px-3 py-2 font-bold">รหัส</th>
              <th className="px-3 py-2 font-bold">รายการ</th>
              <th className="px-3 py-2 text-right font-bold">งบปี {baseYear}</th>
              <th className="px-3 py-2 text-right font-bold">ใช้ไป {baseYear}</th>
              <th className="px-3 py-2 text-right font-bold">คำขอ {targetYearBe}</th>
              <th className="px-3 py-2 text-right font-bold">Δ</th>
              <th className="px-3 py-2 font-bold">ทิศทาง</th>
              <th className="px-3 py-2 font-bold">เหตุผล</th>
            </tr>
          </thead>
          <tbody>
            {detailItems.map((r) => {
              const d = r.deltaAmount ?? r.requestedAmount - r.baseAllocated;
              return (
                <tr key={r.id} className="border-b border-[#ecebff] hover:bg-[#0000BF]/[0.04]">
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{r.ciCode ?? "—"}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-[11px] text-slate-500">{kindLabel(r.kind)}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(r.baseAllocated)}</td>
                  <td className={`px-3 py-2 text-right ${pctToneClass(r.basePctUsed)}`}>
                    {fmt(r.baseSpent)}
                    <div className="text-[11px]">{formatPct(r.basePctUsed)}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(r.requestedAmount)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${deltaClass(d)}`}>
                    {showBaht ? formatBaht(d) : signedM(d)}
                    <div className="text-[11px] text-slate-500">{formatPct(r.deltaPercent)}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">{r.changeDirection ?? "—"}</td>
                  <td className="max-w-xs px-3 py-2 text-[11px] text-slate-600 whitespace-pre-line">{r.reason ?? "—"}</td>
                </tr>
              );
            })}
            {!loading && !detailItems.length ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  ไม่พบคำขอ
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
