import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeaderBar } from "../../components/PageHeaderBar";
import { BudgetSubNav } from "../../components/BudgetSubNav";
import { apiJson } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { rowMatchesFilter } from "../../lib/searchNormalize";
import { toolbarMasterGroupClass, toolbarPrimaryBtnClass } from "../../lib/uiTokens";
import type { LoadOptions } from "../../lib/loadOptions";
import { setLoadBusy } from "../../lib/loadOptions";
import {
  formatBaht,
  formatPct,
  kindLabel,
  parseBudgetYearBe,
  pctToneClass,
  type BudgetBucket,
  type BudgetKind,
  type BudgetYearLineRow,
} from "./budgetFormat";
import { BudgetBucketTabs } from "./BudgetBucketTabs";

type Tx = { id: string; amount: number; occurredAt: string; description: string | null; refNo: string | null };
type Snap = { id: string; asOfDate: string; spentAmount: number; source: string; notes: string | null };

function parseBucketParam(raw: string | null): BudgetBucket {
  if (!raw) return "2569";
  if (raw === "commitment") return "commitment";
  const y = parseBudgetYearBe(raw);
  return y != null ? String(y) : "2569";
}

export function BudgetSpendPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [searchParams, setSearchParams] = useSearchParams();
  const [bucket, setBucketState] = useState<BudgetBucket>(() => parseBucketParam(searchParams.get("bucket")));
  const setBucket = (b: BudgetBucket) => {
    setBucketState(b);
    setSearchParams(b === "2569" ? {} : { bucket: b }, { replace: true });
  };
  const [kind, setKind] = useState<"" | BudgetKind>("");
  const [filter, setFilter] = useState("");
  const [lines, setLines] = useState<BudgetYearLineRow[]>([]);
  const [label, setLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<BudgetYearLineRow | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [txAmount, setTxAmount] = useState("");
  const [txDesc, setTxDesc] = useState("");
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const showSpendCols = bucket === "2569";

  const load = useCallback(async (opts?: LoadOptions) => {
    setLoadBusy(setLoading, opts, true);
    setErr(null);
    try {
      const q = new URLSearchParams({ bucket });
      if (kind) q.set("kind", kind);
      const res = await apiJson<{ label: string; lines: BudgetYearLineRow[] }>(`/api/budget/lines?${q}`);
      setLines(res.lines);
      setLabel(res.label);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [bucket, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (row: BudgetYearLineRow) => {
    setSelected(row);
    setEditingTxId(null);
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

  const resetTxForm = () => {
    setEditingTxId(null);
    setTxAmount("");
    setTxDesc("");
    setTxDate(new Date().toISOString().slice(0, 10));
  };

  const startEditTx = (t: Tx) => {
    setEditingTxId(t.id);
    setTxAmount(String(t.amount));
    setTxDesc(t.description ?? "");
    const d = new Date(t.occurredAt);
    if (!Number.isNaN(d.getTime())) {
      setTxDate(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      );
    }
  };

  const saveTx = async () => {
    if (!selected || !isAdmin) return;
    const amount = Number(txAmount.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount === 0) return;
    setSaving(true);
    try {
      const payload = {
        amount,
        description: txDesc.trim() || null,
        occurredAt: txDate ? new Date(`${txDate}T12:00:00`).toISOString() : undefined,
      };
      let saved: Tx;
      if (editingTxId) {
        saved = await apiJson<Tx>(`/api/budget/year-lines/${selected.id}/transactions/${editingTxId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setTxs((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
      } else {
        saved = await apiJson<Tx>(`/api/budget/year-lines/${selected.id}/transactions`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setTxs((prev) => [saved, ...prev]);
      }
      resetTxForm();
      await load({ silent: true });
      const refreshed = (
        await apiJson<{ lines: BudgetYearLineRow[] }>(`/api/budget/lines?bucket=${bucket}`)
      ).lines.find((l) => l.id === selected.id);
      if (refreshed) setSelected(refreshed);
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
      setTxs((prev) => prev.filter((t) => t.id !== txId));
      if (editingTxId === txId) resetTxForm();
      await load({ silent: true });
      const refreshed = (
        await apiJson<{ lines: BudgetYearLineRow[] }>(`/api/budget/lines?bucket=${bucket}`)
      ).lines.find((l) => l.id === selected.id);
      if (refreshed) setSelected(refreshed);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  };

  const filtered = useMemo(
    () =>
      lines.filter((r) =>
        rowMatchesFilter(filter, [r.name, r.ciCode, r.fileRef, r.buyerName, r.superiorCi, r.notes, r.categoryName]),
      ),
    [lines, filter],
  );

  return (
    <div className="space-y-4">
      <PageHeaderBar
        title="ติดตามใช้จ่าย"
        count={filtered.length}
        filter={{
          value: filter,
          onChange: setFilter,
          placeholder: "ค้นหารหัส / ชื่อ / ผู้จัดซื้อ…",
          printTitle: label || "ติดตามงบประมาณ",
          trailing: (
            <div className="flex flex-wrap items-center gap-1">
              <BudgetBucketTabs value={bucket} onChange={setBucket} />
              <div className={toolbarMasterGroupClass}>
                {(
                  [
                    ["", "ทั้งหมด"],
                    ["EXPENSE", "ค่าใช้จ่าย"],
                    ["CAPEX", "ครุภัณฑ์"],
                  ] as const
                ).map(([k, labelK]) => (
                  <button
                    key={labelK}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[11px] font-bold sm:h-9 sm:px-3 sm:text-xs ${
                      kind === k
                        ? "bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-white shadow-md"
                        : "text-[#4d47b6] hover:bg-[#0000BF]/8"
                    }`}
                  >
                    {labelK}
                  </button>
                ))}
              </div>
            </div>
          ),
        }}
        extras={<BudgetSubNav />}
      />

      {err ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{err}</p> : null}
      {label ? <p className="text-sm font-semibold text-[#4d47b6]">{label}</p> : null}

      <div className="overflow-x-auto rounded-[1.25rem] border border-[#e8e6fc] bg-white/90">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#ecebff] bg-gradient-to-r from-[#faf9ff] to-[#fdf2f8] text-[11px] text-[#66638c]">
              <th className="px-3 py-2 font-bold">รหัส</th>
              <th className="px-3 py-2 font-bold">ชื่อ</th>
              {bucket === "commitment" ? <th className="px-3 py-2 font-bold">ปีอ้างอิง</th> : null}
              <th className="px-3 py-2 text-right font-bold">
                {bucket === "commitment" ? "งบผูกพัน" : "จัดสรร"}
              </th>
              {showSpendCols ? (
                <>
                  <th className="px-3 py-2 text-right font-bold">เหลื่อมปี</th>
                  <th className="px-3 py-2 text-right font-bold">รวม</th>
                  <th className="px-3 py-2 text-right font-bold">ใช้ไป</th>
                  <th className="px-3 py-2 text-right font-bold">%</th>
                </>
              ) : (
                <th className="px-3 py-2 text-right font-bold">งบผูกพันคู่ขนาน</th>
              )}
              <th className="px-3 py-2 font-bold">ผู้จัดซื้อ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.id}
                className={`cursor-pointer border-b border-[#ecebff] hover:bg-[#0000BF]/[0.04] ${
                  r.isSummary ? "bg-[#faf9ff]/80 font-semibold" : ""
                }`}
                onClick={() => void openDetail(r)}
              >
                <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{r.ciCode ?? "—"}</td>
                <td className="px-3 py-2">
                  <div className={r.isSummary ? "font-black text-[#1e1b4b]" : ""}>{r.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {r.categoryName ? (
                      <span className="rounded bg-violet-500/12 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                        {r.categoryName}
                      </span>
                    ) : !r.isSummary ? (
                      <span className="rounded bg-slate-500/10 px-1.5 py-0.5 text-[10px] text-slate-500">ไม่ระบุหมวด</span>
                    ) : null}
                    {r.fileRef ? <span className="text-[11px] text-slate-500">{r.fileRef}</span> : null}
                  </div>
                </td>
                {bucket === "commitment" ? (
                  <td className="px-3 py-2 text-xs text-slate-600">{r.yearBe ?? "—"}</td>
                ) : null}
                <td className="px-3 py-2 text-right font-semibold">{formatBaht(r.allocatedAmount)}</td>
                {showSpendCols ? (
                  <>
                    <td className="px-3 py-2 text-right">{formatBaht(r.carryInAmount)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatBaht(r.totalBudget)}</td>
                    <td className="px-3 py-2 text-right">{formatBaht(r.spent)}</td>
                    <td className={`px-3 py-2 text-right ${pctToneClass(r.pctUsed)}`}>{formatPct(r.pctUsed)}</td>
                  </>
                ) : (
                  <td className="px-3 py-2 text-right">{formatBaht(r.commitmentAmount)}</td>
                )}
                <td className="px-3 py-2 text-xs text-slate-600">{r.buyerName ?? "—"}</td>
              </tr>
            ))}
            {!loading && !filtered.length ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  ไม่พบรายการ — ลองรัน seed:budget
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30 p-3 print:hidden" onClick={() => setSelected(null)}>
          <div
            className="flex h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#e8e6fc] bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 border-b border-[#ecebff] px-4 py-3">
              <div>
                <div className="text-xs text-slate-500">
                  {kindLabel(selected.kind)} · {selected.ciCode ?? "—"}
                  {selected.yearBe ? ` · ปี ${selected.yearBe}` : ""}
                  {selected.fundingType === "COMMITMENT" ? " · งบผูกพัน" : ""}
                </div>
                <h2 className="text-base font-black text-[#1e1b4b]">{selected.name}</h2>
                <div className="mt-1 text-sm text-slate-600">
                  {showSpendCols ? (
                    <>
                      ใช้ไป {formatBaht(selected.spent)} / {formatBaht(selected.totalBudget)}{" "}
                      <span className={pctToneClass(selected.pctUsed)}>({formatPct(selected.pctUsed)})</span>
                    </>
                  ) : (
                    <>ยอด {formatBaht(selected.allocatedAmount)}</>
                  )}
                </div>
              </div>
              <button type="button" className="text-sm font-bold text-[#4d47b6]" onClick={() => setSelected(null)}>
                ปิด
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {showSpendCols ? (
                <>
                  <section>
                    <h3 className="text-xs font-black uppercase tracking-wide text-[#66638c]">ยอดตัดจากไฟล์งบ</h3>
                    <p className="mt-1 text-[11px] leading-snug text-slate-500">
                      ยอดใช้ไปตามไฟล์ ณ วันที่นั้น — ไม่ใช่รายการที่กรอกด้านล่าง
                    </p>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {snaps.map((s) => (
                        <li key={s.id} className="rounded-lg border border-[#ecebff] px-2.5 py-1.5">
                          <div className="flex justify-between gap-2">
                            <span>{new Date(s.asOfDate).toLocaleDateString("th-TH")}</span>
                            <span className="font-semibold">{formatBaht(s.spentAmount)}</span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {s.source === "IMPORT" ? "จากไฟล์งบ" : "บันทึกมือ"}
                            {s.notes ? ` · ${s.notes}` : ""}
                          </div>
                        </li>
                      ))}
                      {!snaps.length ? <li className="text-slate-500">ยังไม่มียอดตัดจากไฟล์</li> : null}
                    </ul>
                  </section>
                  <section>
                    <h3 className="text-xs font-black uppercase tracking-wide text-[#66638c]">ประวัติการใช้จ่าย</h3>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {txs.map((t) => (
                        <li key={t.id} className="flex justify-between gap-2 rounded-lg border border-[#ecebff] px-2.5 py-1.5">
                          <div>
                            <div>{t.description || "—"}</div>
                            <div className="text-[11px] text-slate-500">
                              {new Date(t.occurredAt).toLocaleDateString("th-TH")}
                              {t.refNo ? ` · ${t.refNo}` : ""}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-semibold">{formatBaht(t.amount)}</span>
                            {isAdmin ? (
                              <div className="mt-0.5 flex justify-end gap-2">
                                <button
                                  type="button"
                                  className="text-[11px] font-bold text-[#4d47b6]"
                                  onClick={() => startEditTx(t)}
                                >
                                  แก้ไข
                                </button>
                                <button
                                  type="button"
                                  className="text-[11px] font-bold text-rose-600"
                                  onClick={() => void deleteTx(t.id)}
                                >
                                  ลบ
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </li>
                      ))}
                      {!txs.length ? <li className="text-slate-500">ยังไม่มีรายการ</li> : null}
                    </ul>
                    {isAdmin ? (
                      <div className="mt-3 space-y-2 rounded-xl border border-[#e8e6fc] bg-[#faf9ff]/80 p-3">
                        <p className="text-[11px] font-bold text-[#66638c]">
                          {editingTxId ? "แก้ไขการใช้จ่าย" : "เพิ่มการใช้จ่าย"}
                        </p>
                        <input
                          type="date"
                          className="w-full rounded-lg border border-[#dcd8f0] px-2.5 py-1.5 text-sm"
                          value={txDate}
                          onChange={(e) => setTxDate(e.target.value)}
                        />
                        <input
                          className="w-full rounded-lg border border-[#dcd8f0] px-2.5 py-1.5 text-sm"
                          placeholder="จำนวนเงิน"
                          value={txAmount}
                          onChange={(e) => setTxAmount(e.target.value)}
                        />
                        <input
                          className="w-full rounded-lg border border-[#dcd8f0] px-2.5 py-1.5 text-sm"
                          placeholder="รายละเอียด"
                          value={txDesc}
                          onChange={(e) => setTxDesc(e.target.value)}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={toolbarPrimaryBtnClass}
                            disabled={saving}
                            onClick={() => void saveTx()}
                          >
                            {saving ? "กำลังบันทึก…" : editingTxId ? "บันทึกการแก้ไข" : "เพิ่มรายการ"}
                          </button>
                          {editingTxId ? (
                            <button
                              type="button"
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600"
                              onClick={resetTxForm}
                            >
                              ยกเลิก
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </section>
                </>
              ) : (
                <section className="text-sm text-slate-600">
                  <p>{selected.notes || "รายการงบผูกพัน / จัดสรรรายปี — ยังไม่ตัดใช้จ่ายในโมดูลนี้"}</p>
                </section>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
