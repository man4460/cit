import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeaderBar } from "../../components/PageHeaderBar";
import { BudgetSubNav } from "../../components/BudgetSubNav";
import { apiJson } from "../../api/client";
import { rowMatchesFilter } from "../../lib/searchNormalize";
import { toolbarMasterGroupClass } from "../../lib/uiTokens";
import { kindLabel, type BudgetKind } from "./budgetFormat";

type Account = {
  id: string;
  parentId: string | null;
  ciCode: string | null;
  superiorCi: string | null;
  fileRef: string | null;
  name: string;
  definition: string | null;
  kind: BudgetKind;
  sortOrder: number;
  isSummary: boolean;
};

export function BudgetAccountsPage() {
  const [rows, setRows] = useState<Account[]>([]);
  const [filter, setFilter] = useState("");
  const [kind, setKind] = useState<"" | BudgetKind>("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const q = new URLSearchParams();
      if (kind) q.set("kind", kind);
      const data = await apiJson<Account[]>(`/api/budget/accounts?${q}`);
      setRows(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const depthOf = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) return 0;
    seen.add(id);
    const row = byId.get(id);
    if (!row?.parentId) return 0;
    return 1 + depthOf(row.parentId, seen);
  };

  const filtered = useMemo(() => {
    return rows.filter((r) =>
      rowMatchesFilter(filter, [r.name, r.ciCode, r.fileRef, r.superiorCi, r.definition]),
    );
  }, [rows, filter]);

  return (
    <div className="space-y-4">
      <PageHeaderBar
        title="ทะเบียนบัญชีงบ"
        count={filtered.length}
        filter={{
          value: filter,
          onChange: setFilter,
          placeholder: "ค้นหา CI / ชื่อ / File…",
          printTitle: "ทะเบียนบัญชีงบ",
          trailing: (
            <div className={toolbarMasterGroupClass}>
              {(
                [
                  ["", "ทั้งหมด"],
                  ["EXPENSE", "ค่าใช้จ่าย"],
                  ["CAPEX", "สินทรัพย์ถาวร"],
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
          ),
        }}
        extras={<BudgetSubNav />}
      />

      {err ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{err}</p> : null}
      {loading ? <p className="text-sm text-slate-500">กำลังโหลด…</p> : null}

      <div className="overflow-hidden rounded-[1.25rem] border border-[#e8e6fc] bg-white/90">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#ecebff] bg-gradient-to-r from-[#faf9ff] to-[#fdf2f8] text-[11px] text-[#66638c]">
              <th className="px-3 py-2 font-bold">รหัส CI</th>
              <th className="px-3 py-2 font-bold">File</th>
              <th className="px-3 py-2 font-bold">ชื่อบัญชี</th>
              <th className="px-3 py-2 font-bold">หมวด</th>
              <th className="px-3 py-2 font-bold">Superior</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const depth = depthOf(r.id);
              return (
                <tr key={r.id} className="border-b border-[#ecebff] hover:bg-[#0000BF]/[0.04]">
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{r.ciCode ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{r.fileRef ?? "—"}</td>
                  <td className="px-3 py-2" style={{ paddingLeft: `${12 + depth * 16}px` }}>
                    <span className={r.isSummary ? "font-black text-[#1e1b4b]" : "font-medium text-[#2e2a58]"}>
                      {r.name}
                    </span>
                    {r.definition ? (
                      <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-500 whitespace-pre-line">{r.definition}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{kindLabel(r.kind)}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{r.superiorCi ?? "—"}</td>
                </tr>
              );
            })}
            {!loading && !filtered.length ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">
                  ไม่พบรายการ
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
