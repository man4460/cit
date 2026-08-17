import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../../api/client";
import { PageHeaderBar } from "../../components/PageHeaderBar";
import { KIND_LABEL_TH, STATUS_LABEL_TH, isStrategicKind, teamShortName } from "../../lib/investigationLabels";
import type { LoadOptions } from "../../lib/loadOptions";
import { setLoadBusy } from "../../lib/loadOptions";
import {
  listCardAccentClass,
  listCardClass,
  toolbarLinkBtnClass,
  toolbarPrimaryBtnClass,
} from "../../lib/uiTokens";
import type { InvestigationCase, InvestigationStats } from "../../types";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

type StatTone = "indigo" | "rose" | "violet" | "cyan" | "slate" | "amber" | "orange" | "emerald";

const STAT_THEME: Record<
  StatTone,
  { card: string; label: string; value: string; hint: string; bar: string; chip: string }
> = {
  indigo: {
    card: "border-indigo-200/80 bg-gradient-to-br from-indigo-50 via-white to-[#fdf2f8]/60",
    label: "text-indigo-700",
    value: "text-[#0000BF]",
    hint: "text-indigo-700/70",
    bar: "bg-gradient-to-b from-[#0000BF] via-[#8b5cf6] to-[#ec4899]",
    chip: "bg-[#0000BF]/10 text-[#0000BF]",
  },
  rose: {
    card: "border-rose-200/90 bg-gradient-to-br from-rose-50 via-white to-rose-50/40",
    label: "text-rose-700",
    value: "text-rose-700",
    hint: "text-rose-700/70",
    bar: "bg-gradient-to-b from-rose-500 to-pink-400",
    chip: "bg-rose-500/15 text-rose-700",
  },
  violet: {
    card: "border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50/50",
    label: "text-violet-700",
    value: "text-violet-700",
    hint: "text-violet-700/70",
    bar: "bg-gradient-to-b from-[#0000BF] to-[#8b5cf6]",
    chip: "bg-violet-500/15 text-violet-700",
  },
  cyan: {
    card: "border-cyan-200/80 bg-gradient-to-br from-cyan-50 via-white to-teal-50/50",
    label: "text-cyan-800",
    value: "text-cyan-800",
    hint: "text-cyan-800/70",
    bar: "bg-gradient-to-b from-cyan-600 to-teal-400",
    chip: "bg-cyan-500/15 text-cyan-800",
  },
  slate: {
    card: "border-slate-200/90 bg-gradient-to-br from-slate-50 via-white to-slate-100/40",
    label: "text-slate-600",
    value: "text-slate-700",
    hint: "text-slate-500",
    bar: "bg-gradient-to-b from-slate-400 to-slate-300",
    chip: "bg-slate-200/80 text-slate-700",
  },
  amber: {
    card: "border-amber-200/90 bg-gradient-to-br from-amber-50 via-white to-yellow-50/50",
    label: "text-amber-800",
    value: "text-amber-700",
    hint: "text-amber-800/70",
    bar: "bg-gradient-to-b from-amber-500 to-yellow-400",
    chip: "bg-amber-500/15 text-amber-800",
  },
  orange: {
    card: "border-orange-200/90 bg-gradient-to-br from-orange-50 via-white to-amber-50/40",
    label: "text-orange-800",
    value: "text-orange-700",
    hint: "text-orange-800/70",
    bar: "bg-gradient-to-b from-orange-500 to-amber-400",
    chip: "bg-orange-500/15 text-orange-800",
  },
  emerald: {
    card: "border-emerald-200/90 bg-gradient-to-br from-emerald-50 via-white to-teal-50/40",
    label: "text-emerald-800",
    value: "text-emerald-700",
    hint: "text-emerald-800/70",
    bar: "bg-gradient-to-b from-emerald-500 to-teal-400",
    chip: "bg-emerald-500/15 text-emerald-800",
  },
};

function StatCard({
  label,
  value,
  hint,
  tone = "indigo",
  alert = false,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: StatTone;
  /** เน้นเมื่อมีค่าที่ต้องสนใจ (เช่น เกิน SLA) */
  alert?: boolean;
}) {
  const t = STAT_THEME[tone];
  return (
    <div
      className={`relative overflow-hidden rounded-[1.25rem] border p-4 shadow-sm transition ${t.card} ${
        alert ? "ring-2 ring-rose-300/70 shadow-rose-200/40" : ""
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${t.bar}`} aria-hidden />
      <div className="pl-2">
        <div className="flex items-center justify-between gap-2">
          <p className={`text-[10px] font-black uppercase tracking-[0.14em] ${t.label}`}>{label}</p>
          {alert ? (
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${t.chip}`}>ต้องดู</span>
          ) : null}
        </div>
        <p className={`mt-1 text-2xl font-black tabular-nums ${t.value}`}>{value}</p>
        {hint ? <p className={`mt-1 text-[11px] leading-snug ${t.hint}`}>{hint}</p> : null}
      </div>
    </div>
  );
}

export function InvestigationDashboardPage() {
  const [stats, setStats] = useState<InvestigationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (opts?: LoadOptions) => {
    setLoadBusy(setLoading, opts, true);
    setErr(null);
    try {
      const data = await apiJson<InvestigationStats>("/api/investigation/stats");
      setStats(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดสถิติไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categoryBars = useMemo(() => stats?.byCategory ?? [], [stats]);
  const teamBars = useMemo(() => stats?.byTeam ?? [], [stats]);
  const maxCat = Math.max(1, ...categoryBars.map((p) => Math.max(p.activeCount ?? 0, p.count)));
  const maxTeam = Math.max(1, ...teamBars.map((t) => Math.max(t.activeCount ?? 0, t.count)));
  const strategicCount = categoryBars.filter((c) => c.kind === "STRATEGIC").length;
  const bauCount = categoryBars.filter((c) => c.kind === "BAU").length;

  return (
    <div>
      <PageHeaderBar
        title="แดชบอร์ดสืบสวน"
        count={stats?.active ?? 0}
        filter={{
          value: "",
          onChange: () => {},
          showSearch: false,
          printTitle: "แดชบอร์ดสืบสวนและประมวลข่าว",
        }}
        extras={
          <>
            <Link to="/investigation/approvals" className={toolbarLinkBtnClass}>
              รออนุมัติ
            </Link>
            <Link to="/investigation/teams" className={toolbarLinkBtnClass}>
              ทีมสืบสวน
            </Link>
          </>
        }
        primary={
          <Link to="/investigation/cases" className={toolbarPrimaryBtnClass}>
            ทะเบียนคดี
          </Link>
        }
      />

      {err ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</p>
      ) : null}

      {loading && !stats ? (
        <p className="mt-6 text-center text-sm text-slate-600">กำลังโหลด…</p>
      ) : stats ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="คดีที่เปิดอยู่"
              value={stats.active.toLocaleString("th-TH")}
              hint="เปิดคดี / กำลังสืบ / รอภายนอก / รอพิจารณารายงาน"
              tone="indigo"
            />
            <StatCard
              label="เกิน SLA"
              value={stats.slaBreached.toLocaleString("th-TH")}
              hint="ครบกำหนดแล้วยังไม่ปิด"
              tone="rose"
              alert={stats.slaBreached > 0}
            />
            <StatCard
              label="Strategic (นโยบาย)"
              value={stats.strategic.active.toLocaleString("th-TH")}
              hint={`ทั้งหมด ${stats.strategic.total.toLocaleString("th-TH")} คดี · ${strategicCount} แฟ้ม`}
              tone="violet"
            />
            <StatCard
              label="BAU"
              value={stats.bau.active.toLocaleString("th-TH")}
              hint={`ทั้งหมด ${stats.bau.total.toLocaleString("th-TH")} คดี · ${bauCount} แฟ้ม`}
              tone="cyan"
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="ร่าง" value={stats.draft.toLocaleString("th-TH")} hint="ยังไม่เสนอขออนุมัติ" tone="slate" />
            <StatCard
              label="รออนุมัติเปิดคดี"
              value={stats.pendingApproval.toLocaleString("th-TH")}
              hint="ค้างในสายบังคับบัญชา"
              tone="amber"
              alert={stats.pendingApproval > 0}
            />
            <StatCard
              label="รอพิจารณารายงาน"
              value={stats.reportSubmitted.toLocaleString("th-TH")}
              hint="เสนอสรุปเพื่อปิดคดี"
              tone="orange"
              alert={stats.reportSubmitted > 0}
            />
            <StatCard
              label="ปิด / จัดเก็บ"
              value={`${stats.closed.toLocaleString("th-TH")} / ${stats.archived.toLocaleString("th-TH")}`}
              hint={stats.rejected > 0 ? `ไม่อนุมัติ ${stats.rejected} คดี` : "คดีที่จบแล้ว"}
              tone="emerald"
            />
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-black text-[#1e1b4b]">โหลดงานตามแฟ้มคดี</h2>
              <Link to="/investigation/cases" className="text-xs font-bold text-[#4d47b6] hover:underline">
                ทะเบียนคดี
              </Link>
            </div>
            {categoryBars.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#dcd8f0] px-4 py-8 text-center text-sm text-slate-600">
                ยังไม่มีแฟ้มคดี — ไปที่ทะเบียนคดีเพื่อเพิ่ม
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {categoryBars.map((row, idx) => {
                  const active = row.activeCount ?? 0;
                  const pct = Math.round((active / maxCat) * 100);
                  return (
                    <li key={row.id}>
                      <Link
                        to={`/investigation/cases?categoryId=${encodeURIComponent(row.id)}`}
                        className={`${listCardClass} block min-h-[7rem] p-4 hover:border-[#0000BF]/30`}
                      >
                        <span className={`absolute inset-y-0 left-0 w-1 ${listCardAccentClass(idx)}`} aria-hidden />
                        <div className="pl-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-[#1e1b4b]">{row.name}</p>
                              {row.nameEn ? (
                                <p className="mt-0.5 truncate text-[11px] text-slate-500">{row.nameEn}</p>
                              ) : null}
                            </div>
                            <p
                              className={`shrink-0 text-2xl font-black tabular-nums ${
                                active > 0 ? "text-[#0000BF]" : "text-slate-400"
                              }`}
                            >
                              {active}
                            </p>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">
                            กำลังดำเนินการ · ทั้งหมด {row.count.toLocaleString("th-TH")} คดี
                            {row.childrenCount > 0 ? ` · ${row.childrenCount} หมวดย่อย` : ""}
                            <span className="ml-1 font-bold text-slate-400">({KIND_LABEL_TH[row.kind]})</span>
                          </p>
                          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#f3f1ff]">
                            <div
                              className={`h-full rounded-full ${
                                isStrategicKind(row.kind)
                                  ? "bg-gradient-to-r from-[#0000BF] to-[#8b5cf6]"
                                  : "bg-gradient-to-r from-cyan-600 to-sky-400"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <section className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-black text-[#1e1b4b]">ปริมาณงานตามทีม</h2>
              <Link to="/investigation/teams" className="text-xs font-bold text-[#4d47b6] hover:underline">
                จัดการทีม
              </Link>
            </div>
            {teamBars.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#dcd8f0] px-4 py-8 text-center text-sm text-slate-600">
                ยังไม่มีทีม — ไปที่หน้าทีมสืบสวนเพื่อเพิ่ม
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {teamBars.map((t, idx) => {
                  const active = t.activeCount ?? 0;
                  const pct = Math.round((active / maxTeam) * 100);
                  return (
                    <li key={t.id}>
                      <Link
                        to={`/investigation/cases?teamId=${encodeURIComponent(t.id)}`}
                        title={t.name}
                        className={`${listCardClass} block min-h-[7.5rem] p-4 hover:border-[#0000BF]/30`}
                      >
                        <span className={`absolute inset-y-0 left-0 w-1 ${listCardAccentClass(idx)}`} aria-hidden />
                        <div className="pl-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              {t.code ? (
                                <p className="font-mono text-[10px] font-bold tracking-wide text-slate-400">{t.code}</p>
                              ) : null}
                              <p className="mt-0.5 truncate text-sm font-black text-[#1e1b4b]">
                                {teamShortName(t)}
                              </p>
                            </div>
                            <p
                              className={`shrink-0 text-2xl font-black tabular-nums ${
                                active > 0 ? "text-[#0000BF]" : "text-slate-400"
                              }`}
                            >
                              {active}
                            </p>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">
                            กำลังดำเนินการ · ทั้งหมด {t.count.toLocaleString("th-TH")} คดี
                          </p>
                          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#f3f1ff]">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-black text-[#1e1b4b]">อัปเดตล่าสุด</h2>
              <Link to="/investigation/cases" className="text-xs font-bold text-[#4d47b6] hover:underline">
                ดูทั้งหมด
              </Link>
            </div>
            {stats.recent.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#dcd8f0] px-4 py-10 text-center text-sm text-slate-600">
                ยังไม่มีคดี — ไปที่ทะเบียนคดีเพื่อเพิ่ม
              </div>
            ) : (
              <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {stats.recent.map((c: InvestigationCase, idx) => (
                  <li key={c.id}>
                    <Link to={`/investigation/cases/${c.id}`} className={`${listCardClass} block min-h-[5.5rem] p-3`}>
                      <span className={`absolute inset-y-0 left-0 w-1 ${listCardAccentClass(idx)}`} aria-hidden />
                      <div className="pl-2">
                        <p className="text-[10px] font-bold text-slate-500">
                          {c.caseNumber} · {STATUS_LABEL_TH[c.status]}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-[#1e1b3a]">{c.title}</p>
                        <p className="mt-1 text-[10px] text-slate-600">
                          {c.category?.name ?? "—"}
                          {c.team ? ` · ${c.team.name}` : ""} · อัปเดต {fmtDate(c.updatedAt)}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
