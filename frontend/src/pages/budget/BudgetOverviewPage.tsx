import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { PageHeaderBar } from "../../components/PageHeaderBar";
import { BudgetOverviewSubNav } from "../../components/BudgetOverviewSubNav";
import { BudgetStatCard, BUDGET_STAT_TONES } from "../../components/BudgetStatCard";
import { FitSingleLine } from "../../components/FitSingleLine";
import { apiJson } from "../../api/client";
import { toolbarLinkBtnClass } from "../../lib/uiTokens";
import {
  formatBaht,
  formatPct,
  kindLabel,
  pctToneClass,
  type BudgetKind,
  type BudgetYearLineRow,
} from "./budgetFormat";
import {
  buildCapexMajors,
  buildExpenseMajors,
  parseExpenseNo,
  sectionOf,
  type BudgetMajor,
} from "./budgetCategories";

function m(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return (n / 1_000_000).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function openDocumentUrl(url: string | null | undefined) {
  const raw = String(url ?? "").trim();
  if (!raw) return;
  const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  window.open(href, "_blank", "noopener,noreferrer");
}

export function BudgetOverviewPage() {
  const { yearBe: yearParam } = useParams();
  const yearBe = yearParam === "2570" ? 2570 : yearParam === "2569" ? 2569 : null;

  const [lines, setLines] = useState<BudgetYearLineRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBaht, setShowBaht] = useState(false);
  const [kindFilter, setKindFilter] = useState<BudgetKind>("EXPENSE");
  const [selected, setSelected] = useState<BudgetMajor | null>(null);

  const load = useCallback(async (y: number) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiJson<{ lines: BudgetYearLineRow[] }>(`/api/budget/lines?bucket=${y}`);
      setLines(res.lines);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (yearBe) void load(yearBe);
  }, [load, yearBe]);

  useEffect(() => {
    setSelected(null);
    setKindFilter("EXPENSE");
  }, [yearBe]);

  const expenseMajors = useMemo(() => buildExpenseMajors(lines), [lines]);
  const capexMajors = useMemo(() => buildCapexMajors(lines), [lines]);

  const kindStats = useMemo(() => {
    const kinds: BudgetKind[] = ["EXPENSE", "CAPEX"];
    return kinds.map((kind) => {
      const sec = sectionOf(lines, kind);
      const allocated = sec?.allocatedAmount ?? 0;
      const spent = sec?.spent ?? 0;
      return {
        kind,
        label: kindLabel(kind),
        allocated,
        spent,
        remaining: allocated - spent,
        pctUsed: allocated > 0 ? spent / allocated : null,
        majorCount: kind === "EXPENSE" ? expenseMajors.length : capexMajors.length,
      };
    });
  }, [lines, expenseMajors, capexMajors]);

  const totals = useMemo(() => {
    const allocated = kindStats.reduce((s, k) => s + k.allocated, 0);
    const spent = kindStats.reduce((s, k) => s + k.spent, 0);
    return {
      allocated,
      spent,
      remaining: allocated - spent,
      pctUsed: allocated > 0 ? spent / allocated : null,
    };
  }, [kindStats]);

  const selectedTitle = selected?.name ?? "";
  const selectedChildren = selected?.children ?? [];
  const selectedAllocated = selected?.allocated ?? 0;
  const selectedSpent = selected?.spent ?? 0;
  const selectedRemaining = selected?.remaining ?? 0;
  const selectedPct = selected?.pctUsed ?? null;
  const selectedMeta = selected ? kindLabel(selected.kind) : "";

  if (!yearBe) return <Navigate to="/budget/overview/2569" replace />;

  const isTrackingYear = yearBe === 2569;
  const isRequestYear = yearBe === 2570;
  const detailTo = `/budget/year/${yearBe}`;
  const fmt = (n: number | null | undefined) => (showBaht ? formatBaht(n) : m(n));
  const unit = showBaht ? "บาท" : "ลบ.";
  const isExpenseView = kindFilter === "EXPENSE";
  const amountLabel = isRequestYear ? "คำขอตั้ง" : "จัดสรร";
  const pageTitle = isRequestYear ? `สรุปคำขอตั้งงบปี ${yearBe}` : `สรุปงบปี ${yearBe}`;

  return (
    <div className="space-y-4">
      <PageHeaderBar
        title={pageTitle}
        filter={{
          value: "",
          onChange: () => {},
          showSearch: false,
          printTitle: pageTitle,
          trailing: (
            <button type="button" className={toolbarLinkBtnClass} onClick={() => setShowBaht((v) => !v)}>
              หน่วย: {showBaht ? "บาท" : "ล้านบาท"}
            </button>
          ),
        }}
        extras={<BudgetOverviewSubNav />}
      />

      {err ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{err}</p> : null}
      {loading ? <p className="text-sm text-slate-500">กำลังโหลด…</p> : null}

      {/* KPI รวม */}
      <div className={`grid gap-3 sm:grid-cols-2 ${isTrackingYear ? "lg:grid-cols-4" : "lg:grid-cols-2"}`}>
        <BudgetStatCard
          label={isRequestYear ? "คำขอตั้งทั้งสิ้น" : "งบจัดสรรทั้งสิ้น"}
          tone={isRequestYear ? BUDGET_STAT_TONES.request : BUDGET_STAT_TONES.approve}
        >
          <FitSingleLine
            className="font-black tabular-nums text-[#1e1b4b]"
            maxPx={30}
            minPx={12}
            title={`${fmt(totals.allocated)} ${unit}`}
          >
            {fmt(totals.allocated)} <span className="font-bold text-[#66638c]">{unit}</span>
          </FitSingleLine>
          {isRequestYear ? (
            <p className="mt-1 text-[11px] font-medium text-amber-800">ยังไม่อนุมัติจัดสรร</p>
          ) : null}
        </BudgetStatCard>
        {isRequestYear ? (
          <BudgetStatCard
            label="สถานะ"
            tone={BUDGET_STAT_TONES.status}
            className="!border-amber-200/80 !bg-gradient-to-br !from-amber-50/80 !via-white !to-[#fdf2f8]/40"
          >
            <div className="text-xl font-black text-amber-950">รออนุมัติ</div>
            <p className="mt-1 text-[11px] text-amber-900/80">
              โครงสร้างหมวดเดียวกับปี 2569 · ตัวเลขเป็นยอดคำขอตั้ง
            </p>
          </BudgetStatCard>
        ) : null}
        {isTrackingYear ? (
          <>
            <BudgetStatCard label="ใช้ไป" tone={BUDGET_STAT_TONES.spent}>
              <FitSingleLine
                className={`font-black tabular-nums ${pctToneClass(totals.pctUsed)}`}
                maxPx={30}
                minPx={12}
                title={`${fmt(totals.spent)} ${unit}`}
              >
                {fmt(totals.spent)} <span className="font-bold text-[#66638c]">{unit}</span>
              </FitSingleLine>
            </BudgetStatCard>
            <BudgetStatCard label="คงเหลือ" tone={BUDGET_STAT_TONES.remain}>
              <FitSingleLine
                className="font-black tabular-nums text-[#1e1b4b]"
                maxPx={30}
                minPx={12}
                title={`${fmt(totals.remaining)} ${unit}`}
              >
                {fmt(totals.remaining)} <span className="font-bold text-[#66638c]">{unit}</span>
              </FitSingleLine>
            </BudgetStatCard>
            <BudgetStatCard label="% ใช้ไป" tone={BUDGET_STAT_TONES.pct}>
              <FitSingleLine
                className={`font-black ${pctToneClass(totals.pctUsed)}`}
                maxPx={30}
                minPx={12}
                title={formatPct(totals.pctUsed)}
              >
                {formatPct(totals.pctUsed)}
              </FitSingleLine>
            </BudgetStatCard>
          </>
        ) : null}
      </div>

      {/* การ์ดหมวด — คลิกกรอง */}
      <div className="grid gap-3 md:grid-cols-2">
        {kindStats.map((k) => {
          const active = kindFilter === k.kind;
          const isExpense = k.kind === "EXPENSE";
          return (
            <BudgetStatCard
              key={k.kind}
              label={k.label}
              icon={isExpense ? "cash" : "equipment"}
              tone={isExpense ? BUDGET_STAT_TONES.expense : BUDGET_STAT_TONES.capex}
              onClick={() => setKindFilter(k.kind)}
              active={active}
              trailing={
                active ? (
                  <span className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-2 py-0.5 text-[10px] font-bold text-white">
                    กำลังดู
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-[#4d47b6]">คลิกเพื่อกรอง</span>
                )
              }
            >
              <FitSingleLine
                className="font-black tabular-nums text-[#1e1b4b]"
                maxPx={26}
                minPx={11}
                title={`${fmt(k.allocated)} ${unit}`}
              >
                {fmt(k.allocated)} <span className="font-bold text-[#66638c]">{unit}</span>
              </FitSingleLine>
              {isTrackingYear ? (
                <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div className="min-w-0">
                    <dt className="text-slate-500">ใช้ไป</dt>
                    <dd className={`font-semibold ${pctToneClass(k.pctUsed)}`}>
                      <FitSingleLine className="font-semibold tabular-nums" maxPx={12} minPx={8} title={fmt(k.spent)}>
                        {fmt(k.spent)}
                      </FitSingleLine>
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-slate-500">คงเหลือ</dt>
                    <dd className="font-semibold text-[#2e2a58]">
                      <FitSingleLine className="font-semibold tabular-nums" maxPx={12} minPx={8} title={fmt(k.remaining)}>
                        {fmt(k.remaining)}
                      </FitSingleLine>
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-slate-500">% ใช้</dt>
                    <dd className={`font-semibold ${pctToneClass(k.pctUsed)}`}>{formatPct(k.pctUsed)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  {k.majorCount} หมวด · {isRequestYear ? "ยอดคำขอตั้ง" : "กรอบงบ"}
                </p>
              )}
            </BudgetStatCard>
          );
        })}
      </div>

      {/* รายการหัวข้อใหญ่ */}
      <section className="overflow-hidden rounded-[1.25rem] border border-[#e8e6fc] bg-white/90">
        <div className="border-b border-[#ecebff] bg-gradient-to-r from-[#faf9ff] to-[#fdf2f8] px-3 py-2">
          <h2 className="text-xs font-black text-[#1e1b4b]">
            หัวข้อใหญ่ · {kindLabel(kindFilter)}
            <span className="ml-1.5 text-[11px] font-bold text-slate-500">
              ({isExpenseView ? expenseMajors.length : capexMajors.length} รายการ)
            </span>
          </h2>
        </div>
        <div className="divide-y divide-[#ecebff]">
          {(isExpenseView ? expenseMajors : capexMajors).map((block) => {
            const pct = block.pctUsed;
            return (
              <button
                key={block.key}
                type="button"
                onClick={() => setSelected(block)}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition hover:bg-[#0000BF]/[0.04]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold leading-snug text-[#1e1b4b]">{block.name}</div>
                  <div className="mt-0.5 text-[10px] leading-none text-slate-500">
                    {block.children.length} รายการย่อย
                  </div>
                </div>
                <div className="flex min-w-0 max-w-[55%] shrink-0 items-center gap-3 text-right text-xs sm:max-w-none">
                  <div className="min-w-0 w-[6.5rem] sm:w-[7.5rem]">
                    <div className="text-[9px] font-bold uppercase leading-none text-slate-400">{amountLabel}</div>
                    <FitSingleLine
                      className="font-semibold tabular-nums leading-tight text-[#2e2a58]"
                      maxPx={12}
                      minPx={8}
                      title={fmt(block.allocated)}
                    >
                      {fmt(block.allocated)}
                    </FitSingleLine>
                  </div>
                  {isTrackingYear ? (
                    <>
                      <div className="min-w-0 w-[6.5rem] sm:w-[7.5rem]">
                        <div className="text-[9px] font-bold uppercase leading-none text-slate-400">ใช้ไป</div>
                        <FitSingleLine
                          className={`font-semibold tabular-nums leading-tight ${pctToneClass(pct)}`}
                          maxPx={12}
                          minPx={8}
                          title={fmt(block.spent)}
                        >
                          {fmt(block.spent)}
                        </FitSingleLine>
                      </div>
                      <div className={`min-w-[2.75rem] text-[12px] font-bold ${pctToneClass(pct)}`}>
                        {formatPct(pct)}
                      </div>
                    </>
                  ) : null}
                  <span className="text-[10px] font-bold text-[#4d47b6]">→</span>
                </div>
              </button>
            );
          })}
          {!loading && (isExpenseView ? !expenseMajors.length : !capexMajors.length) ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">ไม่พบหัวข้อในหมวดนี้</p>
          ) : null}
        </div>
      </section>

      {/* Popup รายละเอียดหัวข้อใหญ่ */}
      {selected ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/35 p-3 sm:items-center print:hidden"
          onClick={() => setSelected(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#e8e6fc] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-[#ecebff] bg-gradient-to-r from-[#faf9ff] via-white to-[#fdf2f8] px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-[#4d47b6]">
                    {selectedMeta}
                    {isRequestYear ? " · คำขอตั้ง (ยังไม่อนุมัติ)" : ""}
                  </div>
                  <h2 className="mt-1 text-base font-black leading-snug text-[#1e1b4b]">{selectedTitle}</h2>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg px-2 py-1 text-sm font-bold text-[#4d47b6] hover:bg-[#0000BF]/8"
                  onClick={() => setSelected(null)}
                >
                  ปิด
                </button>
              </div>

              {isRequestYear ? (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-[#e8e6fc] bg-white/90 px-3 py-2">
                    <div className="text-[10px] font-bold text-slate-500">{amountLabel}</div>
                    <div className="text-sm font-black tabular-nums text-[#1e1b4b]">
                      {fmt(selectedAllocated)} {unit}
                    </div>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2">
                    <div className="text-[10px] font-bold text-amber-800/80">สถานะ</div>
                    <div className="text-sm font-black text-amber-950">ยังไม่ได้รับอนุมัติจัดสรร</div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-xl border border-[#e8e6fc] bg-white/90 px-3 py-2">
                    <div className="text-[10px] font-bold text-slate-500">{amountLabel}</div>
                    <div className="text-sm font-black tabular-nums text-[#1e1b4b]">
                      {fmt(selectedAllocated)} {unit}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#e8e6fc] bg-white/90 px-3 py-2">
                    <div className="text-[10px] font-bold text-slate-500">ใช้ไป</div>
                    <div className={`text-sm font-black tabular-nums ${pctToneClass(selectedPct)}`}>
                      {fmt(selectedSpent)} {unit}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#e8e6fc] bg-white/90 px-3 py-2">
                    <div className="text-[10px] font-bold text-slate-500">คงเหลือ</div>
                    <div className="text-sm font-black tabular-nums text-[#1e1b4b]">
                      {fmt(selectedRemaining)} {unit}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#e8e6fc] bg-white/90 px-3 py-2">
                    <div className="text-[10px] font-bold text-slate-500">% ใช้</div>
                    <div className={`text-sm font-black ${pctToneClass(selectedPct)}`}>{formatPct(selectedPct)}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {selectedChildren.length ? (
                <section>
                  <h3 className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-[#66638c]">
                    รายการในหมวด ({selectedChildren.length})
                  </h3>
                  <ul className="overflow-hidden rounded-xl border border-[#e8e6fc] divide-y divide-[#ecebff]">
                    {selectedChildren.map((c, idx) => {
                      const pct = c.allocatedAmount > 0 ? c.spent / c.allocatedAmount : null;
                      const parsed = parseExpenseNo(c.name);
                      const isSubNo = parsed?.minor != null;
                      const isGroupOrNested =
                        selected?.kind === "EXPENSE" &&
                        !isSubNo &&
                        (/กลุ่ม\s*\d|กลุ่ม\d/.test(c.name) || (!c.ciCode && !c.isSummary && Boolean(parsed)));
                      const isHeading =
                        selected?.kind === "EXPENSE" ? !isSubNo && !isGroupOrNested : true;
                      const itemName =
                        (selected.kind === "CAPEX") && !/^\d+\.\s/.test(c.name) ? `${idx + 1}. ${c.name}` : c.name;

                      const nameClass = isHeading
                        ? "text-[12px] font-bold text-[#1e1b4b]"
                        : isSubNo
                          ? "text-[12px] font-semibold text-[#6d28d9]"
                          : "text-[11px] font-medium text-slate-500";

                      return (
                        <li key={c.id} className="flex items-center justify-between gap-2 bg-white px-3 py-1.5">
                          <div className={`min-w-0 flex-1 ${isSubNo || isGroupOrNested ? "pl-3" : ""}`}>
                            <div className={`truncate leading-snug ${nameClass}`}>{itemName}</div>
                            {(c.ciCode || c.fileRef || c.documentUrl) && (
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                {c.ciCode ? (
                                  <span className="font-mono text-[10px] leading-none text-slate-400">{c.ciCode}</span>
                                ) : null}
                                {c.fileRef ? (
                                  <span className="text-[10px] leading-none text-slate-400">{c.fileRef}</span>
                                ) : null}
                                {c.documentUrl ? (
                                  <button
                                    type="button"
                                    className="text-[10px] font-bold leading-none text-[#0000BF] hover:underline"
                                    onClick={() => openDocumentUrl(c.documentUrl)}
                                    title={c.documentUrl}
                                  >
                                    เปิดเอกสาร ↗
                                  </button>
                                ) : null}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 text-right text-[11px] leading-tight">
                            <div className="tabular-nums text-slate-600">{fmt(c.allocatedAmount)}</div>
                            {isTrackingYear ? (
                              <div className={`font-semibold tabular-nums ${pctToneClass(pct)}`}>
                                {fmt(c.spent)} · {formatPct(pct)}
                              </div>
                            ) : (
                              <div className="text-[10px] text-slate-400">{amountLabel}</div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : (
                <p className="text-sm text-slate-500">ไม่มีรายการย่อยใต้หัวข้อนี้ — เป็นรายการงบเดี่ยว</p>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Link to={detailTo} className={toolbarLinkBtnClass} onClick={() => setSelected(null)}>
                  ไปหน้ารายละเอียดปี {yearBe}
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
