import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { ModuleDocumentsModal } from "../../components/ModuleDocumentsModal";
import { BudgetStatCard, BUDGET_STAT_TONES } from "../../components/BudgetStatCard";
import { PageHeaderBar } from "../../components/PageHeaderBar";
import { FitSingleLine } from "../../components/FitSingleLine";
import { apiJson } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { MODULE_DOCUMENT_CATEGORIES } from "../../lib/moduleDocumentCategories";
import { NavGlyph } from "../../lib/navVisuals";
import { rowMatchesFilter } from "../../lib/searchNormalize";
import type { LoadOptions } from "../../lib/loadOptions";
import { setLoadBusy } from "../../lib/loadOptions";
import {
  brandGradientFillClass,
  toolbarLinkBtnClass,
  toolbarMasterBtnClass,
  toolbarMasterGroupClass,
  toolbarPrimaryBtnClass,
} from "../../lib/uiTokens";
import {
  buildManagedMajors,
  childItemsOf,
  ciLeafAllocatedTotal,
  ciLeafRequestedTotal,
  isRealBudgetLine,
  parseExpenseNo,
  rollupAllocated,
  rollupRequested,
  rollupSpent,
  sectionAllocatedTotal,
  sectionOf,
  sectionRequestedTotal,
  topLevelChildren,
  type BudgetCategoryRow,
  type BudgetMajor,
} from "./budgetCategories";
import {
  formatBaht,
  formatPct,
  kindLabel,
  parseBudgetYearBe,
  pctToneClass,
  type BudgetFundingType,
  type BudgetKind,
  type BudgetYearLineRow,
} from "./budgetFormat";

type Tx = { id: string; amount: number; occurredAt: string; description: string | null; refNo: string | null };
type Snap = { id: string; asOfDate: string; spentAmount: number; source: string; notes: string | null };

type RequestItem = {
  id: string;
  accountId: string;
  requestedAmount: number;
  planEndAmount: number | null;
};

type LineFormState = {
  mode: "create" | "edit";
  line: BudgetYearLineRow | null;
  categoryId: string;
  parentAccountId: string;
  name: string;
  requestAmount: string;
  approvedAmount: string;
  ciCode: string;
  fileRef: string;
  documentUrl: string;
  notes: string;
};

type CatFormState = {
  mode: "create" | "edit";
  id: string | null;
  name: string;
  kind: BudgetKind;
};

function openDocumentUrl(url: string | null | undefined) {
  const raw = String(url ?? "").trim();
  if (!raw) return;
  const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  window.open(href, "_blank", "noopener,noreferrer");
}

function parseMoney(raw: string): number | null {
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** จัดรูปแบบช่องกรอกเงินให้มีคอมมา (เช่น 5,900,000) */
function formatMoneyInput(raw: string): string {
  const s = String(raw).replace(/[^\d.]/g, "");
  if (!s) return "";
  const dot = s.indexOf(".");
  const intRaw = dot >= 0 ? s.slice(0, dot) : s;
  const decRaw = dot >= 0 ? s.slice(dot + 1).replace(/\./g, "").slice(0, 2) : null;
  const intPart = (intRaw.replace(/^0+(?=\d)/, "") || (decRaw != null ? "0" : intRaw)) || "0";
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (dot >= 0) return decRaw != null && decRaw.length > 0 ? `${withCommas}.${decRaw}` : `${withCommas}.`;
  return intRaw === "" ? "" : withCommas;
}

function moneyFieldFromNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return "";
  return formatMoneyInput(String(n));
}

/** แสดงชื่อตามเลขในชื่อจริง: 1. = หัวข้อ, 1.1 = หัวข้อย่อย — ไม่ใส่เลขซ้ำ */
function budgetLineDisplayName(name: string, fallbackIndex: number, nested: boolean): string {
  const trimmed = name.trim();
  if (/^\d+\.\d+/.test(trimmed) || /^\d+\.\s/.test(trimmed) || /^\d+\.[^\d]/.test(trimmed)) {
    return trimmed;
  }
  if (/^\d+\./.test(trimmed)) return trimmed;
  return nested ? trimmed : `${fallbackIndex}. ${trimmed}`;
}

export function BudgetYearPage() {
  const { yearBe: yearParam, view: viewParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const yearBe = parseBudgetYearBe(yearParam) ?? 2569;
  const bucket = String(yearBe);
  const fundingType: BudgetFundingType =
    searchParams.get("funding") === "commitment" ? "COMMITMENT" : "ANNUAL";
  const isCommitment = fundingType === "COMMITMENT";
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [yearCount, setYearCount] = useState(2);
  const [maxYearBe, setMaxYearBe] = useState<number | null>(2570);
  const isNewestYear = maxYearBe != null && yearBe === maxYearBe && yearCount > 1;
  /** ปีล่าสุด = ขั้นคำขอ (งบประจำ + งบผูกพัน) · ปีเก่า = ติดตามใช้จ่าย */
  const isTracking = !isNewestYear;
  const allowSpend = isTracking;
  const showRequestFields = isCommitment ? isNewestYear : yearBe != null;

  const setFundingMode = (next: BudgetFundingType) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === "COMMITMENT") nextParams.set("funding", "commitment");
    else nextParams.delete("funding");
    setSearchParams(nextParams, { replace: true });
  };

  const [lines, setLines] = useState<BudgetYearLineRow[]>([]);
  const [requestsByAccount, setRequestsByAccount] = useState<Map<string, RequestItem>>(new Map());
  const [filter, setFilter] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<BudgetKind>("EXPENSE");
  const [popupMajor, setPopupMajor] = useState<BudgetMajor | null>(null);
  const [selected, setSelected] = useState<BudgetYearLineRow | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [txAmount, setTxAmount] = useState("");
  const [txDesc, setTxDesc] = useState("");
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [lineForm, setLineForm] = useState<LineFormState | null>(null);
  const [categories, setCategories] = useState<BudgetCategoryRow[]>([]);
  const [catMgrOpen, setCatMgrOpen] = useState(false);
  const [catMgrKind, setCatMgrKind] = useState<BudgetKind>("EXPENSE");
  const [docsOpen, setDocsOpen] = useState(false);
  const [catForm, setCatForm] = useState<CatFormState | null>(null);

  const requestedOf = useCallback(
    (row: BudgetYearLineRow) => {
      const item = requestsByAccount.get(row.accountId);
      if (!item) return 0;
      if (isCommitment) return item.planEndAmount ?? 0;
      return item.requestedAmount;
    },
    [requestsByAccount, isCommitment],
  );

  const load = useCallback(async (opts?: LoadOptions) => {
    setLoadBusy(setLoading, opts, true);
    setErr(null);
    try {
      const [res, catRes, yearsRes] = await Promise.all([
        apiJson<{ label: string; lines: BudgetYearLineRow[] }>(
          `/api/budget/lines?bucket=${bucket}&fundingType=${fundingType}`,
        ),
        apiJson<{ items: BudgetCategoryRow[] }>(`/api/budget/categories`),
        apiJson<{ years: { yearBe: number }[]; maxYearBe: number | null }>("/api/budget/years").catch(() => null),
      ]);
      setLines(res.lines);
      setCategories(catRes.items);
      if (yearsRes) {
        setYearCount(yearsRes.years?.length ?? 0);
        setMaxYearBe(yearsRes.maxYearBe);
      }

      if (showRequestFields) {
        try {
          const reqRes = await apiJson<{ items: RequestItem[] }>(`/api/budget/requests?yearBe=${yearBe}`);
          setRequestsByAccount(new Map(reqRes.items.map((i) => [i.accountId, i])));
        } catch {
          setRequestsByAccount(new Map());
        }
      } else {
        setRequestsByAccount(new Map());
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [bucket, fundingType, showRequestFields, yearBe]);

  useEffect(() => {
    void load();
    setSelected(null);
    setPopupMajor(null);
    setKindFilter("EXPENSE");
  }, [load]);

  const displayLines = lines;

  const expenseMajors = useMemo(
    () => buildManagedMajors(displayLines, categories, "EXPENSE"),
    [displayLines, categories],
  );
  const capexMajors = useMemo(
    () => buildManagedMajors(displayLines, categories, "CAPEX"),
    [displayLines, categories],
  );
  const majors = kindFilter === "EXPENSE" ? expenseMajors : capexMajors;
  const kindCategories = useMemo(
    () => categories.filter((c) => c.kind === kindFilter).sort((a, b) => a.sortOrder - b.sortOrder),
    [categories, kindFilter],
  );

  const kindStats = useMemo(() => {
    return (["EXPENSE", "CAPEX"] as BudgetKind[]).map((kind) => {
      const sec = sectionOf(displayLines, kind);
      const kindLines = displayLines.filter((l) => l.kind === kind);
      const fromCi = ciLeafAllocatedTotal(kindLines);
      const fromMajors = (kind === "EXPENSE" ? expenseMajors : capexMajors).reduce(
        (s, m) => s + m.allocated,
        0,
      );
      /** ยอด KPI ใช้แถวสรุปหมวดก่อน — ไม่บวกรายการย่อยซ้ำ */
      const allocated = sec != null ? sec.allocatedAmount : fromCi || fromMajors;
      const spent = sec?.spent ?? kindLines.filter((l) => !l.isSummary && l.ciCode).reduce((s, l) => s + l.spent, 0);
      const sectionReq = sec != null ? requestedOf(sec) : 0;
      const leafReq = ciLeafRequestedTotal(kindLines, requestedOf);
      const requested = Math.round(sectionReq > 0 ? sectionReq : leafReq);
      return {
        kind,
        label: kindLabel(kind),
        allocated,
        requested: Math.round(requested),
        spent,
        remaining: allocated - spent,
        pctUsed: allocated > 0 ? spent / allocated : null,
        majorCount: kind === "EXPENSE" ? expenseMajors.length : capexMajors.length,
      };
    });
  }, [displayLines, expenseMajors, capexMajors, requestedOf]);

  const totals = useMemo(() => {
    const fromSections = sectionAllocatedTotal(displayLines);
    const allocated = fromSections != null ? fromSections : ciLeafAllocatedTotal(displayLines);
    const spent = kindStats.reduce((s, k) => s + k.spent, 0);
    const fromSectionReq = showRequestFields ? sectionRequestedTotal(displayLines, requestedOf) : null;
    const leafReq = showRequestFields ? Math.round(ciLeafRequestedTotal(displayLines, requestedOf)) : 0;
    /** ถ้าแถวสรุปหมวดมีคำขอเป็น 0 แต่รายการย่อยมี — ใช้ยอดรายการย่อย */
    const requested = showRequestFields
      ? fromSectionReq != null && fromSectionReq > 0
        ? Math.round(fromSectionReq)
        : leafReq
      : 0;
    return {
      allocated: Math.round(allocated * 100) / 100,
      spent,
      remaining: allocated - spent,
      pctUsed: allocated > 0 ? spent / allocated : null,
      requested,
    };
  }, [kindStats, displayLines, requestedOf, showRequestFields]);

  const openDetail = async (row: BudgetYearLineRow) => {
    if (!isRealBudgetLine(row)) return;
    setSelected(row);
    setTxAmount("");
    setTxDesc("");
    setTxDate(new Date().toISOString().slice(0, 10));
    try {
      const [t, s] = await Promise.all([
        apiJson<Tx[]>(`/api/budget/year-lines/${row.id}/transactions`),
        apiJson<Snap[]>(`/api/budget/year-lines/${row.id}/snapshots`),
      ]);
      setTxs(t);
      setSnaps(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดรายละเอียดไม่สำเร็จ");
    }
  };

  const addTx = async () => {
    if (!selected || !isAdmin || !allowSpend) return;
    const amount = Number(txAmount.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount === 0) return;
    setSaving(true);
    try {
      await apiJson(`/api/budget/year-lines/${selected.id}/transactions`, {
        method: "POST",
        body: JSON.stringify({
          amount,
          description: txDesc || null,
          occurredAt: txDate ? new Date(`${txDate}T12:00:00`).toISOString() : undefined,
        }),
      });
      await load({ silent: true });
      const refreshed = (
        await apiJson<{ lines: BudgetYearLineRow[] }>(
          `/api/budget/lines?bucket=${bucket}&fundingType=${fundingType}`,
        )
      ).lines.find((l) => l.id === selected.id);
      if (refreshed) await openDetail(refreshed);
      else await openDetail(selected);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const deleteTx = async (txId: string) => {
    if (!selected || !isAdmin) return;
    if (!window.confirm("ลบรายการใช้จ่ายนี้?")) return;
    try {
      await apiJson(`/api/budget/year-lines/${selected.id}/transactions/${txId}`, { method: "DELETE" });
      await load({ silent: true });
      await openDetail(selected);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  };

  const openCreateForm = (opts?: { categoryId?: string; parent?: BudgetYearLineRow }) => {
    const parent = opts?.parent ?? null;
    const categoryId =
      opts?.categoryId ||
      parent?.categoryId ||
      (popupMajor && popupMajor.catId !== "orphan" ? popupMajor.catId : "") ||
      kindCategories[0]?.id ||
      "";
    const parentTitle = parent?.name?.trim() ?? "";
    setLineForm({
      mode: "create",
      line: null,
      categoryId,
      parentAccountId: parent?.accountId ?? "",
      /** หัวข้อแม่เป็นคำขึ้นต้น — ผู้ใช้พิมพ์หัวข้อย่อยต่อท้ายได้ */
      name: parentTitle ? `${parentTitle} - ` : "",
      requestAmount: "",
      approvedAmount: "",
      ciCode: "",
      fileRef: "",
      documentUrl: "",
      notes: "",
    });
  };

  const openEditForm = (row: BudgetYearLineRow) => {
    setLineForm({
      mode: "edit",
      line: row,
      categoryId: row.categoryId || "",
      parentAccountId: row.parentId || "",
      name: row.name,
      requestAmount: moneyFieldFromNumber(requestedOf(row)),
      approvedAmount: moneyFieldFromNumber(row.allocatedAmount),
      ciCode: row.ciCode ?? "",
      fileRef: row.fileRef ?? "",
      documentUrl: row.documentUrl ?? "",
      notes: row.notes ?? "",
    });
  };

  const saveLineForm = async () => {
    if (!isAdmin || !lineForm) return;
    const name = lineForm.name.trim();
    if (!name) {
      setErr("กรุณาระบุชื่อรายการ");
      return;
    }
    if (lineForm.mode === "create" && !lineForm.categoryId) {
      setErr("กรุณาเลือกหมวดหมู่");
      return;
    }
    const approved = parseMoney(lineForm.approvedAmount || "0");
    const requested = showRequestFields ? parseMoney(lineForm.requestAmount || "0") : 0;
    if (approved == null || (showRequestFields && requested == null)) {
      setErr("จำนวนเงินไม่ถูกต้อง");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      if (lineForm.mode === "create") {
        const created = await apiJson<BudgetYearLineRow>(`/api/budget/year-lines`, {
          method: "POST",
          body: JSON.stringify({
            bucket,
            yearBe,
            fundingType,
            name,
            kind: kindFilter,
            categoryId: lineForm.categoryId || null,
            parentId: lineForm.parentAccountId || null,
            allocatedAmount: approved,
            ciCode: lineForm.ciCode.trim() || null,
            fileRef: lineForm.fileRef.trim() || null,
            documentUrl: lineForm.documentUrl.trim() || null,
            notes: lineForm.notes.trim() || null,
          }),
        });
        if (showRequestFields) {
          await apiJson(`/api/budget/requests`, {
            method: "POST",
            body: JSON.stringify(
              isCommitment
                ? {
                    accountId: created.accountId,
                    targetYearBe: yearBe,
                    planEndAmount: requested,
                  }
                : {
                    accountId: created.accountId,
                    targetYearBe: yearBe,
                    requestedAmount: requested,
                  },
            ),
          });
        }
      } else if (lineForm.line) {
        await apiJson(`/api/budget/year-lines/${lineForm.line.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name,
            categoryId: lineForm.categoryId || null,
            parentId: lineForm.parentAccountId || null,
            ciCode: lineForm.ciCode.trim() || null,
            fileRef: lineForm.fileRef.trim() || null,
            documentUrl: lineForm.documentUrl.trim() || null,
            notes: lineForm.notes.trim() || null,
            allocatedAmount: approved,
          }),
        });
        if (showRequestFields && yearBe != null) {
          await apiJson(`/api/budget/requests`, {
            method: "POST",
            body: JSON.stringify(
              isCommitment
                ? {
                    accountId: lineForm.line.accountId,
                    targetYearBe: yearBe,
                    planEndAmount: requested,
                  }
                : {
                    accountId: lineForm.line.accountId,
                    targetYearBe: yearBe,
                    requestedAmount: requested,
                  },
            ),
          });
        }
      }
      setLineForm(null);
      await load({ silent: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const saveCategory = async () => {
    if (!isAdmin || !catForm) return;
    const name = catForm.name.trim();
    if (!name) {
      setErr("กรุณาระบุชื่อหมวดหมู่");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      if (catForm.mode === "create") {
        await apiJson(`/api/budget/categories`, {
          method: "POST",
          body: JSON.stringify({ name, kind: catForm.kind }),
        });
      } else if (catForm.id) {
        await apiJson(`/api/budget/categories/${catForm.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name, kind: catForm.kind }),
        });
      }
      setCatForm(null);
      await load({ silent: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกหมวดไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (cat: BudgetCategoryRow) => {
    if (!isAdmin) return;
    if (!window.confirm(`ลบหมวด «${cat.name}» ?`)) return;
    setSaving(true);
    setErr(null);
    try {
      await apiJson(`/api/budget/categories/${cat.id}`, { method: "DELETE" });
      await load({ silent: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ลบหมวดไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const deleteLine = async (row: BudgetYearLineRow) => {
    if (!isAdmin || !isRealBudgetLine(row) || row.isSummary) return;
    if (!window.confirm(`ลบรายการ «${row.name}» ?`)) return;
    setSaving(true);
    setErr(null);
    try {
      await apiJson(`/api/budget/year-lines/${row.id}`, { method: "DELETE" });
      if (selected?.id === row.id) setSelected(null);
      await load({ silent: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    setPopupMajor((prev) => {
      if (!prev) return null;
      return majors.find((m) => m.key === prev.key) ?? null;
    });
  }, [majors]);

  const filteredMajors = useMemo(() => {
    const q = filter.trim();
    if (!q) return majors;
    return majors
      .map((m) => {
        const kids = m.children.filter((c) =>
          rowMatchesFilter(q, [c.name, c.ciCode, c.fileRef, c.definition, c.notes, c.categoryName, m.name]),
        );
        const selfHit = rowMatchesFilter(q, [m.name, m.children[0]?.categoryName]);
        if (!selfHit && !kids.length) return null;
        return { ...m, children: selfHit ? m.children : kids };
      })
      .filter((m): m is BudgetMajor => Boolean(m));
  }, [majors, filter]);

  const title = isCommitment ? `งบผูกพันปี ${yearBe}` : `งบปี ${yearBe}`;
  const fmt = formatBaht;
  const unit = "บาท";

  const popupChildren = popupMajor?.children ?? [];

  // ลิงก์เก่า …/allocated|request → หน้าปีเดียว
  if (viewParam) {
    const qs = isCommitment ? "?funding=commitment" : "";
    return <Navigate to={`/budget/year/${yearBe}${qs}`} replace />;
  }

  return (
    <div className="space-y-4">
      <PageHeaderBar
        title={title}
        count={filteredMajors.length}
        filter={{
          value: filter,
          onChange: setFilter,
          placeholder: "ค้นหาหัวข้อ / รหัส CI / File…",
          printTitle: title,
        }}
        segments={
          <div className={toolbarMasterGroupClass}>
            <button
              type="button"
              onClick={() => setFundingMode("ANNUAL")}
              className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[11px] font-black transition sm:h-9 sm:px-3 sm:text-xs ${
                !isCommitment
                  ? `${brandGradientFillClass} text-white shadow-md`
                  : toolbarMasterBtnClass
              }`}
            >
              งบประจำปี
            </button>
            <button
              type="button"
              onClick={() => setFundingMode("COMMITMENT")}
              className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[11px] font-black transition sm:h-9 sm:px-3 sm:text-xs ${
                isCommitment
                  ? `${brandGradientFillClass} text-white shadow-md`
                  : toolbarMasterBtnClass
              }`}
            >
              งบผูกพัน
            </button>
          </div>
        }
        extras={
          <>
            <Link to="/budget/overview/2569" className={toolbarLinkBtnClass}>
              ← สรุปภาพรวม
            </Link>
            {!isAdmin ? (
              <button type="button" className={toolbarLinkBtnClass} onClick={() => setDocsOpen(true)}>
                เอกสาร
              </button>
            ) : null}
          </>
        }
        primary={
          isAdmin ? (
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                className={toolbarLinkBtnClass}
                onClick={() => {
                  setCatMgrKind(kindFilter);
                  setCatMgrOpen(true);
                }}
              >
                จัดการหมวดหมู่
              </button>
              <button type="button" className={toolbarLinkBtnClass} onClick={() => setDocsOpen(true)}>
                เอกสาร
              </button>
              <button type="button" className={toolbarPrimaryBtnClass} onClick={() => openCreateForm()}>
                เพิ่มรายการ
              </button>
            </div>
          ) : undefined
        }
      />

      {err ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{err}</p> : null}
      {loading ? <p className="text-sm text-slate-500">กำลังโหลด…</p> : null}

      <div
        className={`grid gap-3 sm:grid-cols-2 ${
          isTracking ? "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.55fr)]" : "lg:grid-cols-1"
        }`}
      >
        <BudgetStatCard
          label={isNewestYear ? "งบอนุมัติทั้งสิ้น (ยังไม่อนุมัติ)" : "งบอนุมัติทั้งสิ้น"}
          labelHint={
            showRequestFields ? (
              <span className="tabular-nums" title={`คำขอ ${fmt(totals.requested)} ${unit}`}>
                คำขอ {fmt(totals.requested)} {unit}
              </span>
            ) : undefined
          }
          tone={BUDGET_STAT_TONES.approve}
        >
          <p className="text-[1.375rem] font-black leading-tight tabular-nums text-[#1e1b4b]" title={`${fmt(totals.allocated)} ${unit}`}>
            {fmt(totals.allocated)} <span className="text-base font-bold text-[#66638c]">{unit}</span>
          </p>
        </BudgetStatCard>
        {isTracking ? (
          <>
            <BudgetStatCard label="ใช้ไป" tone={BUDGET_STAT_TONES.spent}>
              <p
                className={`text-[1.375rem] font-black leading-tight tabular-nums ${pctToneClass(totals.pctUsed)}`}
                title={`${fmt(totals.spent)} ${unit}`}
              >
                {fmt(totals.spent)} <span className="text-base font-bold text-[#66638c]">{unit}</span>
              </p>
            </BudgetStatCard>
            <BudgetStatCard label="คงเหลือ" tone={BUDGET_STAT_TONES.remain}>
              <p className="text-[1.375rem] font-black leading-tight tabular-nums text-[#1e1b4b]" title={`${fmt(totals.remaining)} ${unit}`}>
                {fmt(totals.remaining)} <span className="text-base font-bold text-[#66638c]">{unit}</span>
              </p>
            </BudgetStatCard>
            <BudgetStatCard label="% ใช้ไป" tone={BUDGET_STAT_TONES.pct} className="sm:col-span-1">
              <p className={`text-[1.375rem] font-black leading-tight tabular-nums ${pctToneClass(totals.pctUsed)}`} title={formatPct(totals.pctUsed)}>
                {formatPct(totals.pctUsed)}
              </p>
            </BudgetStatCard>
          </>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {kindStats.map((k) => {
          const active = kindFilter === k.kind;
          const isExpense = k.kind === "EXPENSE";
          return (
            <BudgetStatCard
              key={k.kind}
              label={k.label}
              labelHint={
                showRequestFields ? (
                  <span className="tabular-nums" title={`คำขอ ${fmt(k.requested)} ${unit}`}>
                    คำขอ {fmt(k.requested)} {unit}
                  </span>
                ) : undefined
              }
              icon={isExpense ? "cash" : "equipment"}
              tone={isExpense ? BUDGET_STAT_TONES.expense : BUDGET_STAT_TONES.capex}
              onClick={() => setKindFilter(k.kind)}
              active={active}
              trailing={
                active ? (
                  <span className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-2 py-0.5 text-[10px] font-bold text-white">
                    กำลังดู
                  </span>
                ) : null
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
              {isTracking ? (
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
                <p className="mt-2 text-xs text-slate-500">{k.majorCount} หมวด</p>
              )}
            </BudgetStatCard>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-[1.25rem] border border-[#e8e6fc] bg-white/90">
        <div className="border-b border-[#ecebff] bg-gradient-to-r from-[#faf9ff] to-[#fdf2f8] px-3 py-2">
          <h2 className="text-xs font-black text-[#1e1b4b]">
            หัวข้อใหญ่ · {kindLabel(kindFilter)}
            <span className="ml-1.5 text-[11px] font-bold text-slate-500">({filteredMajors.length} รายการ)</span>
          </h2>
        </div>
        <div className="divide-y divide-[#ecebff]">
          {filteredMajors.map((block) => {
            const pct = block.pctUsed;
            return (
              <button
                key={block.key}
                type="button"
                onClick={() => setPopupMajor(block)}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition hover:bg-[#0000BF]/[0.04]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold leading-snug text-[#1e1b4b]">{block.name}</div>
                  <div className="mt-0.5 text-[10px] leading-none text-slate-500">
                    {block.children.length} รายการย่อย
                  </div>
                </div>
                <div className="flex min-w-0 max-w-[55%] shrink-0 items-center gap-3 text-right text-xs sm:max-w-none">
                  <div className="min-w-0 w-[5.5rem] sm:w-[6.5rem]">
                    <div className="text-[9px] font-bold uppercase leading-none text-slate-400">อนุมัติ</div>
                    <FitSingleLine
                      className="font-semibold tabular-nums leading-tight text-[#2e2a58]"
                      maxPx={12}
                      minPx={8}
                      title={fmt(block.allocated)}
                    >
                      {fmt(block.allocated)}
                    </FitSingleLine>
                  </div>
                  {isTracking ? (
                    <>
                      <div className="min-w-0 w-[5.5rem] sm:w-[6.5rem]">
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
          {!loading && !filteredMajors.length ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">ไม่พบหัวข้อในหมวดนี้</p>
          ) : null}
        </div>
      </section>

      {/* Popup หมวด — แบบหน้าสรุป */}
      {popupMajor ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/35 p-3 sm:items-center print:hidden"
          onClick={() => setPopupMajor(null)}
        >
          <div
            className="flex max-h-[min(94vh,56rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#e8e6fc] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-[#ecebff] bg-gradient-to-r from-[#faf9ff] via-white to-[#fdf2f8] px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-[#4d47b6]">
                    {kindLabel(popupMajor.kind)}
                  </div>
                  <h2 className="mt-1 text-base font-black leading-snug text-[#1e1b4b]">{popupMajor.name}</h2>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {isAdmin ? (
                    <button
                      type="button"
                      className={toolbarPrimaryBtnClass}
                      onClick={() =>
                        openCreateForm({
                          categoryId: popupMajor.catId !== "orphan" ? popupMajor.catId : undefined,
                        })
                      }
                    >
                      เพิ่ม
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-sm font-bold text-[#4d47b6] hover:bg-[#0000BF]/8"
                    onClick={() => setPopupMajor(null)}
                  >
                    ปิด
                  </button>
                </div>
              </div>

              <div
                className={`mt-3 grid gap-2 ${
                  isTracking && showRequestFields
                    ? "grid-cols-2 sm:grid-cols-4"
                    : isTracking || showRequestFields
                      ? "grid-cols-2"
                      : "grid-cols-1"
                }`}
              >
                {showRequestFields ? (
                  <div className="rounded-xl border border-[#e8e6fc] bg-white/90 px-3 py-2">
                    <div className="text-[10px] font-bold text-slate-500">คำขอ</div>
                    <div className="text-sm font-black tabular-nums text-[#1e1b4b]">
                      {fmt(
                        topLevelChildren(popupMajor.children).reduce((s, c) => {
                          const kids = childItemsOf(popupMajor.children, c.accountId);
                          const self = requestedOf(c);
                          if (!kids.length) return s + self;
                          if (self > 0) return s + self;
                          return s + kids.reduce((a, k) => a + requestedOf(k), 0);
                        }, 0),
                      )}{" "}
                      {unit}
                    </div>
                  </div>
                ) : null}
                <div className="rounded-xl border border-[#e8e6fc] bg-white/90 px-3 py-2">
                  <div className="text-[10px] font-bold text-slate-500">อนุมัติ</div>
                  <div className="text-sm font-black tabular-nums text-[#1e1b4b]">
                    {fmt(popupMajor.allocated)} {unit}
                  </div>
                </div>
                {isTracking ? (
                  <>
                    <div className="rounded-xl border border-[#e8e6fc] bg-white/90 px-3 py-2">
                      <div className="text-[10px] font-bold text-slate-500">ใช้ไป</div>
                      <div className={`text-sm font-black tabular-nums ${pctToneClass(popupMajor.pctUsed)}`}>
                        {fmt(popupMajor.spent)} {unit}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#e8e6fc] bg-white/90 px-3 py-2">
                      <div className="text-[10px] font-bold text-slate-500">% ใช้</div>
                      <div className={`text-sm font-black ${pctToneClass(popupMajor.pctUsed)}`}>
                        {formatPct(popupMajor.pctUsed)}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {popupChildren.length ? (
                <section>
                  <h3 className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-[#66638c]">
                    รายการในหมวด ({popupChildren.length})
                  </h3>
                  <ul className="overflow-hidden rounded-xl border border-[#e8e6fc] divide-y divide-[#ecebff]">
                    {topLevelChildren(popupChildren).map((c, idx) => {
                      const subs = childItemsOf(popupChildren, c.accountId);
                      const renderRow = (row: BudgetYearLineRow, nested: boolean, rowIndex: number, kids: BudgetYearLineRow[]) => {
                        const openable = isRealBudgetLine(row) && !row.isSummary;
                        const nos = parseExpenseNo(row.name);
                        const isSubHead = nested || (nos != null && nos.minor != null);
                        const label = budgetLineDisplayName(row.name, rowIndex, isSubHead);
                        const displayAllocated = nested ? row.allocatedAmount : rollupAllocated(row, kids);
                        const displaySpent = nested ? row.spent : rollupSpent(row, kids);
                        const displayRequested = nested ? requestedOf(row) : rollupRequested(row, kids, requestedOf);
                        const displayPct = displayAllocated > 0 ? displaySpent / displayAllocated : null;
                        return (
                          <li
                            key={row.id}
                            className={`flex items-start justify-between gap-3 px-3 py-2 ${
                              nested ? "bg-[#faf9ff]" : "bg-white"
                            }`}
                          >
                            <div className={`min-w-0 flex-1 ${nested ? "border-l-2 border-[#c4b5fd] pl-3" : ""}`}>
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span
                                  className={`leading-snug ${
                                    nested
                                      ? "text-[12px] font-semibold text-[#6d28d9]"
                                      : "text-[12px] font-bold text-[#1e1b4b]"
                                  }`}
                                >
                                  {label}
                                </span>
                                {!nested && isAdmin && openable ? (
                                  <button
                                    type="button"
                                    className="shrink-0 text-[10px] font-semibold text-[#4d47b6]/80 hover:text-[#0000BF] hover:underline"
                                    onClick={() =>
                                      openCreateForm({ parent: row, categoryId: row.categoryId || undefined })
                                    }
                                  >
                                    + เพิ่มย่อย
                                  </button>
                                ) : null}
                              </div>
                              {(row.ciCode || row.documentUrl) && (
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  {row.ciCode ? (
                                    <span className="font-mono text-[10px] leading-none text-slate-400">
                                      {row.ciCode}
                                    </span>
                                  ) : null}
                                  {row.documentUrl ? (
                                    <button
                                      type="button"
                                      className="text-[10px] font-bold leading-none text-[#0000BF] hover:underline"
                                      onClick={() => openDocumentUrl(row.documentUrl)}
                                      title={row.documentUrl}
                                    >
                                      เปิดเอกสาร ↗
                                    </button>
                                  ) : null}
                                </div>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2.5 text-right text-[11px] leading-tight">
                              {showRequestFields ? (
                                <div className="min-w-[4.5rem]">
                                  <div className="text-[9px] font-bold text-slate-400">คำขอ</div>
                                  <div className="tabular-nums text-slate-700">{fmt(displayRequested)}</div>
                                </div>
                              ) : null}
                              <div className="min-w-[4.5rem]">
                                <div className="text-[9px] font-bold text-slate-400">อนุมัติ</div>
                                <div className="tabular-nums text-slate-700">{fmt(displayAllocated)}</div>
                              </div>
                              {isTracking ? (
                                <div className="min-w-[4.5rem]">
                                  <div className="text-[9px] font-bold text-slate-400">ใช้ไป</div>
                                  <div className={`font-semibold tabular-nums ${pctToneClass(displayPct)}`}>
                                    {fmt(displaySpent)}
                                  </div>
                                </div>
                              ) : null}
                              {isAdmin && openable ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <button
                                    type="button"
                                    className="text-[11px] font-bold text-[#4d47b6] hover:underline"
                                    onClick={() => openEditForm(row)}
                                  >
                                    แก้ไข
                                  </button>
                                  <button
                                    type="button"
                                    className="text-[11px] font-bold text-rose-600 hover:underline"
                                    onClick={() => void deleteLine(row)}
                                  >
                                    ลบ
                                  </button>
                                </div>
                              ) : null}
                              {openable && allowSpend ? (
                                <button
                                  type="button"
                                  className="text-[11px] font-bold text-[#4d47b6] hover:underline"
                                  onClick={() => void openDetail(row)}
                                >
                                  ใช้จ่าย
                                </button>
                              ) : null}
                            </div>
                          </li>
                        );
                      };
                      return (
                        <Fragment key={c.id}>
                          {renderRow(c, false, idx + 1, subs)}
                          {subs.map((s, sIdx) => renderRow(s, true, sIdx + 1, []))}
                        </Fragment>
                      );
                    })}
                  </ul>
                </section>
              ) : (
                <div className="space-y-2 py-4 text-center">
                  <p className="text-sm text-slate-500">ยังไม่มีรายการในหมวดนี้</p>
                  {isAdmin && popupMajor.catId !== "orphan" ? (
                    <button
                      type="button"
                      className={toolbarPrimaryBtnClass}
                      onClick={() => openCreateForm({ categoryId: popupMajor.catId })}
                    >
                      เพิ่มรายการในหมวดนี้
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Drawer ใช้จ่าย */}
      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 p-3 print:hidden" onClick={() => setSelected(null)}>
          <div
            className="flex h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#e8e6fc] bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 border-b border-[#ecebff] px-4 py-3">
              <div>
                <div className="text-xs text-slate-500">
                  {kindLabel(selected.kind)}
                  {selected.ciCode ? ` · ${selected.ciCode}` : ""}
                </div>
                <h2 className="text-base font-black text-[#1e1b4b]">{selected.name}</h2>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {selected.categoryName ? (
                    <span className="rounded-lg bg-violet-500/12 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                      หมวด: {selected.categoryName}
                    </span>
                  ) : (
                    <span className="rounded-lg bg-slate-500/10 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                      ไม่ระบุหมวด
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  อนุมัติ {fmt(selected.allocatedAmount)} {unit}
                  {showRequestFields ? <> · คำขอ {fmt(requestedOf(selected))} {unit}</> : null}
                  {isTracking ? (
                    <>
                      {" "}
                      · ใช้ไป {fmt(selected.spent)}{" "}
                      <span className={pctToneClass(selected.pctUsed)}>({formatPct(selected.pctUsed)})</span>
                    </>
                  ) : null}
                </div>
                {selected.documentUrl ? (
                  <button
                    type="button"
                    className="mt-2 inline-flex items-center rounded-lg border border-[#dcd8f0] bg-white px-2.5 py-1 text-[11px] font-bold text-[#4d47b6] hover:bg-[#0000BF]/8"
                    onClick={() => openDocumentUrl(selected.documentUrl)}
                  >
                    เปิดลิงก์เอกสาร
                  </button>
                ) : null}
              </div>
              <button type="button" className="text-sm font-bold text-[#4d47b6]" onClick={() => setSelected(null)}>
                ปิด
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {snaps.length ? (
                <section>
                  <h3 className="text-xs font-black uppercase tracking-wide text-[#66638c]">ยอด ณ วันที่</h3>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {snaps.map((s) => (
                      <li key={s.id} className="rounded-lg border border-[#ecebff] px-2.5 py-1.5">
                        <div className="flex justify-between gap-2">
                          <span>{new Date(s.asOfDate).toLocaleDateString("th-TH")}</span>
                          <span className="font-semibold">{fmt(s.spentAmount)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section>
                <h3 className="text-xs font-black uppercase tracking-wide text-[#66638c]">ประวัติการใช้จ่าย</h3>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {txs.map((t) => (
                    <li key={t.id} className="flex items-start justify-between gap-2 rounded-lg border border-[#ecebff] px-2.5 py-1.5">
                      <div>
                        <div>{t.description || "—"}</div>
                        <div className="text-[11px] text-slate-500">
                          {new Date(t.occurredAt).toLocaleDateString("th-TH")}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{fmt(t.amount)}</div>
                        {isAdmin ? (
                          <button
                            type="button"
                            className="text-[11px] font-bold text-rose-600"
                            onClick={() => void deleteTx(t.id)}
                          >
                            ลบ
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                  {!txs.length ? <li className="text-slate-500">ยังไม่มีรายการใช้จ่าย</li> : null}
                </ul>
              </section>

              {isAdmin && allowSpend && !selected.isSummary ? (
                <section className="space-y-2 rounded-xl border border-[#e8e6fc] bg-[#faf9ff]/80 p-3">
                  <h3 className="text-xs font-black uppercase tracking-wide text-[#66638c]">เพิ่มการใช้จ่าย</h3>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-[#dcd8f0] px-2.5 py-1.5 text-sm"
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                  />
                  <input
                    className="w-full rounded-lg border border-[#dcd8f0] px-2.5 py-1.5 text-sm"
                    placeholder="จำนวนเงิน (บาท)"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                  />
                  <input
                    className="w-full rounded-lg border border-[#dcd8f0] px-2.5 py-1.5 text-sm"
                    placeholder="รายละเอียด / อ้างอิง"
                    value={txDesc}
                    onChange={(e) => setTxDesc(e.target.value)}
                  />
                  <button type="button" className={toolbarPrimaryBtnClass} disabled={saving} onClick={() => void addTx()}>
                    บันทึกรายการใช้จ่าย
                  </button>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* ฟอร์มเพิ่ม / แก้ไขรายการ */}
      {lineForm ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-3 sm:items-center print:hidden"
          onClick={() => !saving && setLineForm(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-[#e8e6fc] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-[#ecebff] px-4 py-3">
              <h2 className="text-base font-black text-[#1e1b4b]">
                {lineForm.mode === "create" ? "เพิ่มรายการ" : "แก้ไขรายการ"}
                <span className="ml-2 text-xs font-bold text-[#66638c]">{kindLabel(kindFilter)}</span>
              </h2>
            </div>
            <div className="space-y-3 p-4">
              <label className="block text-xs font-bold text-[#66638c]">
                หมวดหมู่ <span className="text-rose-500">*</span>
                <select
                  className="mt-1 w-full rounded-lg border border-[#dcd8f0] px-2.5 py-1.5 text-sm font-medium text-[#1e1b4b]"
                  value={lineForm.categoryId}
                  onChange={(e) => setLineForm({ ...lineForm, categoryId: e.target.value })}
                >
                  <option value="">— เลือกหมวดหมู่ —</option>
                  {kindCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-bold text-[#66638c]">
                อยู่ภายใต้รายการ
                <select
                  className="mt-1 w-full rounded-lg border border-[#dcd8f0] px-2.5 py-1.5 text-sm"
                  value={lineForm.parentAccountId}
                  onChange={(e) => {
                    const parentAccountId = e.target.value;
                    const parent = displayLines.find((l) => l.accountId === parentAccountId);
                    setLineForm((prev) => {
                      if (!prev) return prev;
                      if (prev.mode === "create" && parent) {
                        return { ...prev, parentAccountId, name: `${parent.name.trim()} - ` };
                      }
                      return { ...prev, parentAccountId };
                    });
                  }}
                >
                  <option value="">— ไม่มี —</option>
                  {displayLines
                    .filter((l) => {
                      if (l.kind !== kindFilter || l.isSummary) return false;
                      if (l.categoryId !== lineForm.categoryId) return false;
                      if (lineForm.line && l.accountId === lineForm.line.accountId) return false;
                      /** เลือกได้เฉพาะรายการหลักในหมวด (ยังไม่เป็นลูกของรายการอื่นในหมวดเดียวกัน) */
                      if (!l.parentId) return true;
                      const parentInSameCategory = displayLines.some(
                        (p) =>
                          p.accountId === l.parentId &&
                          p.categoryId === lineForm.categoryId &&
                          !p.isSummary,
                      );
                      return !parentInSameCategory;
                    })
                    .map((l) => (
                      <option key={l.accountId} value={l.accountId}>
                        {l.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block text-xs font-bold text-[#66638c]">
                ชื่อรายการ
                <input
                  className="mt-1 w-full rounded-lg border border-[#dcd8f0] px-2.5 py-1.5 text-sm font-medium text-[#1e1b4b]"
                  value={lineForm.name}
                  onChange={(e) => setLineForm({ ...lineForm, name: e.target.value })}
                  placeholder="ชื่อรายการ"
                  autoFocus
                  onFocus={(e) => {
                    if (lineForm.mode === "create" && lineForm.parentAccountId && e.target.value) {
                      const len = e.target.value.length;
                      requestAnimationFrame(() => e.target.setSelectionRange(len, len));
                    }
                  }}
                />
              </label>
              {showRequestFields ? (
                <label className="block text-xs font-bold text-[#66638c]">
                  จำนวนเงินคำขอ (บาท)
                  <input
                    className="mt-1 w-full rounded-lg border border-[#dcd8f0] px-2.5 py-1.5 text-sm tabular-nums"
                    value={lineForm.requestAmount}
                    onChange={(e) => setLineForm({ ...lineForm, requestAmount: formatMoneyInput(e.target.value) })}
                    inputMode="decimal"
                  />
                </label>
              ) : null}
              <label className="block text-xs font-bold text-[#66638c]">
                จำนวนเงินอนุมัติ (บาท)
                <input
                  className="mt-1 w-full rounded-lg border border-[#dcd8f0] px-2.5 py-1.5 text-sm tabular-nums"
                  value={lineForm.approvedAmount}
                  onChange={(e) => setLineForm({ ...lineForm, approvedAmount: formatMoneyInput(e.target.value) })}
                  inputMode="decimal"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-bold text-[#66638c]">
                  รหัส CI
                  <input
                    className="mt-1 w-full rounded-lg border border-[#dcd8f0] px-2.5 py-1.5 text-sm font-mono"
                    value={lineForm.ciCode}
                    onChange={(e) => setLineForm({ ...lineForm, ciCode: e.target.value })}
                  />
                </label>
                <label className="block text-xs font-bold text-[#66638c]">
                  File
                  <input
                    className="mt-1 w-full rounded-lg border border-[#dcd8f0] px-2.5 py-1.5 text-sm"
                    value={lineForm.fileRef}
                    onChange={(e) => setLineForm({ ...lineForm, fileRef: e.target.value })}
                  />
                </label>
              </div>
              <label className="block text-xs font-bold text-[#66638c]">
                ลิงก์เอกสาร
                <div className="mt-1 flex gap-1.5">
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-[#dcd8f0] px-2.5 py-1.5 text-sm"
                    placeholder="https://…"
                    value={lineForm.documentUrl}
                    onChange={(e) => setLineForm({ ...lineForm, documentUrl: e.target.value })}
                  />
                  <button
                    type="button"
                    className={toolbarLinkBtnClass}
                    disabled={!lineForm.documentUrl.trim()}
                    onClick={() => openDocumentUrl(lineForm.documentUrl)}
                  >
                    เปิด
                  </button>
                </div>
              </label>
              <label className="block text-xs font-bold text-[#66638c]">
                หมายเหตุ
                <textarea
                  className="mt-1 w-full rounded-lg border border-[#dcd8f0] px-2.5 py-1.5 text-sm"
                  rows={2}
                  value={lineForm.notes}
                  onChange={(e) => setLineForm({ ...lineForm, notes: e.target.value })}
                />
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  className={toolbarLinkBtnClass}
                  disabled={saving}
                  onClick={() => setLineForm(null)}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className={toolbarPrimaryBtnClass}
                  disabled={saving}
                  onClick={() => void saveLineForm()}
                >
                  {saving ? "กำลังบันทึก…" : "บันทึก"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* จัดการหมวดหมู่ */}
      {catMgrOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-3 sm:items-center print:hidden"
          onClick={() => {
            if (!saving) {
              setCatMgrOpen(false);
              setCatForm(null);
            }
          }}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#e8e6fc] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[#ecebff] px-4 py-3">
              <h2 className="text-base font-black text-[#1e1b4b]">จัดการหมวดหมู่</h2>
              <div className="flex items-center gap-1">
                {isAdmin ? (
                  <button
                    type="button"
                    className={toolbarPrimaryBtnClass}
                    onClick={() => setCatForm({ mode: "create", id: null, name: "", kind: catMgrKind })}
                  >
                    เพิ่มหมวด
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-sm font-bold text-[#4d47b6] hover:bg-[#0000BF]/8"
                  onClick={() => {
                    setCatMgrOpen(false);
                    setCatForm(null);
                  }}
                >
                  ปิด
                </button>
              </div>
            </div>

            <div className="border-b border-[#ecebff] px-3 pt-3">
              <div className="flex gap-1 rounded-xl bg-[#f5f3ff]/80 p-1">
                {(
                  [
                    { kind: "EXPENSE" as const, icon: "cash" as const, tone: BUDGET_STAT_TONES.expense },
                    { kind: "CAPEX" as const, icon: "equipment" as const, tone: BUDGET_STAT_TONES.capex },
                  ] as const
                ).map((tab) => {
                  const active = catMgrKind === tab.kind;
                  return (
                    <button
                      key={tab.kind}
                      type="button"
                      onClick={() => setCatMgrKind(tab.kind)}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-black transition ${
                        active
                          ? "bg-white text-[#1e1b4b] shadow-sm ring-1 ring-[#0000BF]/15"
                          : "text-[#66638c] hover:bg-white/60 hover:text-[#2e2a58]"
                      }`}
                      aria-current={active ? "page" : undefined}
                    >
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-md ring-1 ${
                          active ? tab.tone.chip : "bg-transparent text-slate-400 ring-transparent"
                        }`}
                      >
                        <NavGlyph name={tab.icon} className="h-3.5 w-3.5" />
                      </span>
                      {kindLabel(tab.kind)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {(() => {
                const rows = categories
                  .filter((c) => c.kind === catMgrKind)
                  .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "th"));
                return (
                  <ul className="overflow-hidden rounded-xl border border-[#e8e6fc] divide-y divide-[#ecebff]">
                    {rows.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-[#1e1b4b]">{c.name}</div>
                          <div className="text-[10px] text-slate-400">{c.accountCount ?? 0} รายการ</div>
                        </div>
                        {isAdmin ? (
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              className="text-[11px] font-bold text-[#4d47b6] hover:underline"
                              onClick={() =>
                                setCatForm({ mode: "edit", id: c.id, name: c.name, kind: c.kind })
                              }
                            >
                              แก้ไข
                            </button>
                            <button
                              type="button"
                              className="text-[11px] font-bold text-rose-600 hover:underline"
                              onClick={() => void deleteCategory(c)}
                            >
                              ลบ
                            </button>
                          </div>
                        ) : null}
                      </li>
                    ))}
                    {!rows.length ? (
                      <li className="px-3 py-3 text-sm text-slate-500">ยังไม่มีหมวดใน{kindLabel(catMgrKind)}</li>
                    ) : null}
                  </ul>
                );
              })()}
            </div>
          </div>
        </div>
      ) : null}

      {catForm ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-3 sm:items-center print:hidden"
          onClick={() => !saving && setCatForm(null)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-[#e8e6fc] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-[#ecebff] px-4 py-3">
              <h2 className="text-base font-black text-[#1e1b4b]">
                {catForm.mode === "create" ? "เพิ่มหมวดหมู่" : "แก้ไขหมวดหมู่"}
              </h2>
            </div>
            <div className="space-y-3 p-4">
              <label className="block text-xs font-bold text-[#66638c]">
                ประเภท
                <select
                  className="mt-1 w-full rounded-lg border border-[#dcd8f0] px-2.5 py-1.5 text-sm"
                  value={catForm.kind}
                  onChange={(e) =>
                    setCatForm({ ...catForm, kind: e.target.value as BudgetKind })
                  }
                >
                  <option value="EXPENSE">ค่าใช้จ่าย</option>
                  <option value="CAPEX">สินทรัพย์ถาวร</option>
                </select>
              </label>
              <label className="block text-xs font-bold text-[#66638c]">
                ชื่อหมวดหมู่
                <input
                  className="mt-1 w-full rounded-lg border border-[#dcd8f0] px-2.5 py-1.5 text-sm font-medium"
                  value={catForm.name}
                  onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                  autoFocus
                />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" className={toolbarLinkBtnClass} disabled={saving} onClick={() => setCatForm(null)}>
                  ยกเลิก
                </button>
                <button type="button" className={toolbarPrimaryBtnClass} disabled={saving} onClick={() => void saveCategory()}>
                  บันทึก
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ModuleDocumentsModal
        open={docsOpen}
        categoryName={MODULE_DOCUMENT_CATEGORIES.budget}
        onClose={() => setDocsOpen(false)}
      />
    </div>
  );
}
