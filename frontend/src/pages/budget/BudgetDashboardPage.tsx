import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { PageHeaderBar } from "../../components/PageHeaderBar";
import { apiJson } from "../../api/client";
import { toolbarLinkBtnClass } from "../../lib/uiTokens";
import { formatBaht, formatPct, pctToneClass, type BudgetKind } from "./budgetFormat";

type KindRow = {
  kind: BudgetKind;
  label: string;
  year69: number;
  year70: number;
  spent69: number;
  remaining69: number;
  pctUsed69: number | null;
  delta: number;
  deltaPct: number | null;
};

type LineBrief = {
  name: string;
  ciCode: string | null;
  budget?: number;
  spent?: number;
  pctUsed?: number | null;
  remaining?: number;
  year69?: number;
  year70?: number;
  delta?: number;
  deltaPct?: number | null;
  reason?: string | null;
};

type ExecutivePayload = {
  title: string;
  subtitle: string;
  unitNote: string;
  asOfLabel: string;
  totalsNote?: string;
  headline: {
    year69Budget: number;
    year70Request: number;
    delta: number;
    deltaPct: number | null;
    spent69: number;
    spentPct: number | null;
    remaining69: number;
    commitmentTotal: number;
    expenseShare70: number | null;
    capexShare70: number | null;
  };
  byKind: KindRow[];
  spend69: { expense: LineBrief[]; capex: LineBrief[] };
  request70: {
    expenseIncreases: LineBrief[];
    expenseDecreases: LineBrief[];
    capexIncreases: LineBrief[];
    capexDecreases: LineBrief[];
  };
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

function KpiCard({
  eyebrow,
  value,
  unit,
  note,
  accent,
}: {
  eyebrow: string;
  value: string;
  unit?: string;
  note: string;
  accent?: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-[#e8e6fc] bg-gradient-to-br from-white via-[#faf9ff] to-[#fdf2f8]/70 p-4 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-wide text-[#66638c]">{eyebrow}</div>
      <div className={`mt-1 flex items-baseline gap-1 ${accent ?? "text-[#1e1b4b]"}`}>
        <span className="text-3xl font-black tabular-nums">{value}</span>
        {unit ? <span className="text-sm font-bold text-[#66638c]">{unit}</span> : null}
      </div>
      <p className="mt-1 text-xs leading-snug text-slate-600">{note}</p>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[1.25rem] border border-[#e8e6fc] bg-white/90 shadow-sm">
      <div className="border-b border-[#ecebff] bg-gradient-to-r from-[#faf9ff] to-[#fdf2f8] px-4 py-2.5">
        <h2 className="text-sm font-black text-[#1e1b4b]">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function DeltaTable({
  rows,
  empty,
}: {
  rows: LineBrief[];
  empty: string;
}) {
  if (!rows.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-[#ecebff] text-[11px] text-[#66638c]">
            <th className="px-2 py-1.5 font-bold">รายการ</th>
            <th className="px-2 py-1.5 text-right font-bold">ปี 69</th>
            <th className="px-2 py-1.5 text-right font-bold">ปี 70</th>
            <th className="px-2 py-1.5 text-right font-bold">เพิ่ม/ลด</th>
            <th className="px-2 py-1.5 font-bold">เหตุผล/ประเด็น</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.ciCode}-${r.name}`} className="border-b border-[#ecebff] align-top hover:bg-[#0000BF]/[0.04]">
              <td className="px-2 py-1.5">
                {r.ciCode ? <span className="mr-1 font-mono text-[11px] text-slate-500">{r.ciCode}</span> : null}
                <span className="font-medium text-[#2e2a58]">{r.name}</span>
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{m(r.year69)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{m(r.year70)}</td>
              <td className={`px-2 py-1.5 text-right tabular-nums ${deltaClass(r.delta)}`}>
                {signedM(r.delta)}
                <div className="text-[11px] font-medium text-slate-500">{formatPct(r.deltaPct ?? null)}</div>
              </td>
              <td className="max-w-sm px-2 py-1.5 text-[11px] leading-snug text-slate-600 whitespace-pre-line">
                {r.reason?.trim() || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SpendTable({ rows }: { rows: LineBrief[] }) {
  if (!rows.length) return <p className="text-sm text-slate-500">ไม่มีข้อมูล</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead>
          <tr className="border-b border-[#ecebff] text-[11px] text-[#66638c]">
            <th className="px-2 py-1.5 font-bold">รายการ</th>
            <th className="px-2 py-1.5 text-right font-bold">งบปี 69</th>
            <th className="px-2 py-1.5 text-right font-bold">ใช้ไป</th>
            <th className="px-2 py-1.5 text-right font-bold">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.ciCode}-${r.name}`} className="border-b border-[#ecebff] hover:bg-[#0000BF]/[0.04]">
              <td className="px-2 py-1.5 font-medium text-[#2e2a58]">{r.name}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{m(r.budget)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{m(r.spent)}</td>
              <td className={`px-2 py-1.5 text-right ${pctToneClass(r.pctUsed ?? null)}`}>{formatPct(r.pctUsed ?? null)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BudgetDashboardPage() {
  const [data, setData] = useState<ExecutivePayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBaht, setShowBaht] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiJson<ExecutivePayload>("/api/budget/executive");
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const h = data?.headline;

  return (
    <div className="space-y-4 print:space-y-3">
      <PageHeaderBar
        title="ภาพรวมงบประมาณ"
        filter={{
          value: "",
          onChange: () => {},
          showSearch: false,
          printTitle: data?.title ?? "ภาพรวมงบประมาณ",
          trailing: (
            <button
              type="button"
              className={toolbarLinkBtnClass}
              onClick={() => setShowBaht((v) => !v)}
            >
              หน่วย: {showBaht ? "บาท" : "ล้านบาท"}
            </button>
          ),
        }}
        extras={
          <>
            <Link to="/budget/year/2569" className={toolbarLinkBtnClass}>
              ปี 2569
            </Link>
            <Link to="/budget/year/2570" className={toolbarLinkBtnClass}>
              ปี 2570
            </Link>
            <Link to="/budget/year/2570?funding=commitment" className={toolbarLinkBtnClass}>
              งบผูกพัน
            </Link>
          </>
        }
      />

      {err ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{err}</p> : null}
      {loading && !data ? <p className="text-sm text-slate-500">กำลังโหลด…</p> : null}

      {data && h ? (
        <>
          <div className="rounded-[1.25rem] border border-[#e8e6fc] bg-gradient-to-br from-[#0000BF]/[0.06] via-[#8b5cf6]/[0.05] to-[#ec4899]/[0.06] px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[#4d47b6]">{data.subtitle}</div>
            <h2 className="text-lg font-black text-[#1e1b4b] sm:text-xl">{data.title}</h2>
            <p className="mt-0.5 text-xs text-slate-600">
              {data.asOfLabel} · {showBaht ? "แสดงเป็นบาท" : "หน่วย: ล้านบาท (ปัดสำหรับนำเสนอ)"}
              {data.totalsNote ? ` · ${data.totalsNote}` : ` · ${data.unitNote}`}
            </p>
          </div>

          {/* Slide 2 style headline */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Link to="/budget/year/2569" className="block transition hover:opacity-95">
              <KpiCard
                eyebrow="69 งบปี 2569 →"
                value={showBaht ? formatBaht(h.year69Budget) : m(h.year69Budget)}
                unit={showBaht ? "บาท" : "ลบ."}
                note="อนุมัติแล้ว · เปิดดูรายละเอียด/ใช้จ่าย"
              />
            </Link>
            <Link to="/budget/year/2570" className="block transition hover:opacity-95">
              <KpiCard
                eyebrow="70 คำขอปี 2570 →"
                value={showBaht ? formatBaht(h.year70Request) : m(h.year70Request)}
                unit={showBaht ? "บาท" : "ลบ."}
                note="กรอบคำขอ · เปิดดูรายละเอียด"
              />
            </Link>
            <KpiCard
              eyebrow="Δ เพิ่มสุทธิ"
              value={showBaht ? formatBaht(h.delta) : signedM(h.delta)}
              unit={showBaht ? "บาท" : "ลบ."}
              note={`เทียบปี 2569 ${formatPct(h.deltaPct)}`}
              accent={deltaClass(h.delta)}
            />
            <Link to="/budget/year/2569" className="block transition hover:opacity-95">
              <KpiCard
                eyebrow="ใช้ไป ณ 31 ก.ค. 69 →"
                value={showBaht ? formatBaht(h.spent69) : m(h.spent69)}
                unit={showBaht ? "บาท" : "ลบ."}
                note={`ใช้ไปประมาณ ${formatPct(h.spentPct)} ของงบปี 2569`}
                accent={pctToneClass(h.spentPct)}
              />
            </Link>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {data.byKind.map((k) => (
              <div key={k.kind} className="rounded-[1.25rem] border border-[#e8e6fc] bg-white/90 p-4">
                <div className="text-sm font-black text-[#1e1b4b]">{k.label}</div>
                <div className="mt-2 text-2xl font-black tabular-nums text-[#1e1b4b]">
                  {showBaht ? formatBaht(k.year70) : m(k.year70)}
                  <span className="ml-1 text-sm font-bold text-[#66638c]">{showBaht ? "บาท" : "ลบ."}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  คำขอปี 70 · สัดส่วน{" "}
                  {formatPct(k.kind === "EXPENSE" ? h.expenseShare70 : h.capexShare70)}
                </p>
                <p className={`mt-1 text-xs ${deltaClass(k.delta)}`}>
                  จากปี 69: {showBaht ? formatBaht(k.delta) : signedM(k.delta)} ({formatPct(k.deltaPct)})
                </p>
              </div>
            ))}
            <div className="rounded-[1.25rem] border border-[#e8e6fc] bg-white/90 p-4">
              <div className="text-sm font-black text-[#1e1b4b]">งบผูกพัน</div>
              <div className="mt-2 text-2xl font-black tabular-nums text-[#1e1b4b]">
                {showBaht ? formatBaht(h.commitmentTotal) : m(h.commitmentTotal)}
                <span className="ml-1 text-sm font-bold text-[#66638c]">{showBaht ? "บาท" : "ลบ."}</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">ดูรายละเอียดได้ในแต่ละปีงบประมาณ</p>
              <Link
                to="/budget/year/2570?funding=commitment"
                className="mt-2 inline-block text-xs font-bold text-[#4d47b6]"
              >
                เปิดงบผูกพันปี 2570 →
              </Link>
            </div>
          </div>

          <SectionCard title="ตารางเปรียบเทียบหมวดงบปี 69 และ 70">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#ecebff] text-[11px] text-[#66638c]">
                    <th className="px-2 py-1.5 font-bold">หมวด</th>
                    <th className="px-2 py-1.5 text-right font-bold">ปี 2569</th>
                    <th className="px-2 py-1.5 text-right font-bold">ปี 2570</th>
                    <th className="px-2 py-1.5 text-right font-bold">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byKind.map((k) => (
                    <tr key={k.kind} className="border-b border-[#ecebff]">
                      <td className="px-2 py-1.5 font-medium">{k.label}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {showBaht ? formatBaht(k.year69) : m(k.year69)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                        {showBaht ? formatBaht(k.year70) : m(k.year70)}
                      </td>
                      <td className={`px-2 py-1.5 text-right tabular-nums ${deltaClass(k.delta)}`}>
                        {showBaht ? formatBaht(k.delta) : signedM(k.delta)} ({formatPct(k.deltaPct)})
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-[#faf9ff]/80 font-black text-[#1e1b4b]">
                    <td className="px-2 py-1.5">รวม</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {showBaht ? formatBaht(h.year69Budget) : m(h.year69Budget)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {showBaht ? formatBaht(h.year70Request) : m(h.year70Request)}
                    </td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${deltaClass(h.delta)}`}>
                      {showBaht ? formatBaht(h.delta) : signedM(h.delta)} ({formatPct(h.deltaPct)})
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Slide 3 — spend 69 */}
          <SectionCard title={`สรุปงบปี 2569 ที่ใช้ไปแล้ว · ${data.asOfLabel}`}>
            <div className="mb-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#ecebff] text-[11px] text-[#66638c]">
                    <th className="px-2 py-1.5 font-bold">หมวด</th>
                    <th className="px-2 py-1.5 text-right font-bold">งบที่มี</th>
                    <th className="px-2 py-1.5 text-right font-bold">ใช้แล้ว</th>
                    <th className="px-2 py-1.5 text-right font-bold">คงเหลือ</th>
                    <th className="px-2 py-1.5 text-right font-bold">% ใช้</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byKind.map((k) => (
                    <tr key={k.kind} className="border-b border-[#ecebff]">
                      <td className="px-2 py-1.5 font-medium">{k.label}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {showBaht ? formatBaht(k.year69) : m(k.year69)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {showBaht ? formatBaht(k.spent69) : m(k.spent69)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {showBaht ? formatBaht(k.remaining69) : m(k.remaining69)}
                      </td>
                      <td className={`px-2 py-1.5 text-right ${pctToneClass(k.pctUsed69)}`}>
                        {formatPct(k.pctUsed69)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-[#faf9ff]/80 font-black">
                    <td className="px-2 py-1.5">รวมทั้งสิ้น</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {showBaht ? formatBaht(h.year69Budget) : m(h.year69Budget)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {showBaht ? formatBaht(h.spent69) : m(h.spent69)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {showBaht ? formatBaht(h.remaining69) : m(h.remaining69)}
                    </td>
                    <td className={`px-2 py-1.5 text-right ${pctToneClass(h.spentPct)}`}>{formatPct(h.spentPct)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-[#66638c]">หมวดค่าใช้จ่าย — รายการใช้สูง</h3>
                <SpendTable rows={data.spend69.expense} />
              </div>
              <div>
                <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-[#66638c]">หมวดสินทรัพย์ถาวร — รายการใช้สูง</h3>
                <SpendTable rows={data.spend69.capex} />
              </div>
            </div>
          </SectionCard>

          {/* Slide 4–5 request deltas */}
          <SectionCard title="คำขอตั้งงบปี 2570 · หมวดค่าใช้จ่าย (เพิ่มสีเขียว / ลดสีแดง)">
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-emerald-700">รายการเพิ่มหลัก</h3>
                <DeltaTable rows={data.request70.expenseIncreases} empty="ไม่มีรายการเพิ่ม" />
              </div>
              <div>
                <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-rose-600">รายการลดหลัก</h3>
                <DeltaTable rows={data.request70.expenseDecreases} empty="ไม่มีรายการลด" />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="คำขอตั้งงบปี 2570 · หมวดสินทรัพย์ถาวร (เพิ่มสีเขียว / ลดสีแดง)">
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-emerald-700">รายการเพิ่มหลัก</h3>
                <DeltaTable rows={data.request70.capexIncreases} empty="ไม่มีรายการเพิ่ม" />
              </div>
              <div>
                <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-rose-600">รายการลดหลัก</h3>
                <DeltaTable rows={data.request70.capexDecreases} empty="ไม่มีรายการลด" />
              </div>
            </div>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
