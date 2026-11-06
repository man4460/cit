import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router-dom";
import { apiJson } from "../api/client";
import { AllowanceTemplateModal } from "../components/AllowanceTemplateModal";
import { CommaNumberInput } from "../components/CommaNumberInput";
import { MissionBotAllowancePrintSheet } from "../components/MissionBotAllowancePrintSheet";
import { MissionPoliceAllowancePrintSheet } from "../components/MissionPoliceAllowancePrintSheet";
import { PageHeaderBar } from "../components/PageHeaderBar";
import {
  applyAllowanceTemplate,
  fetchAllowanceTemplate,
  allowanceSourceSig,
  botRowTotal,
  buildBotAllowanceDoc,
  buildPoliceAllowanceDoc,
  deleteAllowanceDocFromServer,
  fetchAllowanceDoc,
  mergeStoredDoc,
  saveAllowanceDocToServer,
  clearAllowanceDraft,
  newRowKey,
  policeDocTotal,
  resolveAllowanceDoc,
  saveAllowanceDraft,
  type AllowanceDocSource,
  type AllowanceSigner,
  type BotAllowanceDoc,
  type BotDocRow,
  type PoliceAllowanceDoc,
  type PoliceDocRow,
  type StoredAllowanceDoc,
} from "../lib/allowanceDocs";
import { formatBahtPlain } from "../lib/botAllowancePrint";
import { policeGroupColor } from "../lib/policeAllowancePrint";
import { printIsolatedElement } from "../lib/printIsolated";
import { toolbarLinkBtnClass, toolbarPrimaryBtnClass } from "../lib/uiTokens";
import type { MissionSummary } from "../types";

type Kind = "bot" | "police";

const cardClass = "rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm";
const sectionTitleClass = "mb-3 text-sm font-black text-[#1e1b4b]";
const labelClass = "text-xs font-medium text-slate-600";
const inputClass =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0000BF] focus:ring-2 focus:ring-[#0000BF]/15";
const cellInputClass =
  "w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs text-slate-900 outline-none hover:border-slate-200 focus:border-[#0000BF] focus:bg-white";
const thClass = "border-b border-slate-200 px-1.5 py-2 text-left text-[11px] font-bold text-slate-600";
const addRowBtnClass =
  "rounded-lg border border-dashed border-indigo-300 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50";

function summarySource(s: MissionSummary): AllowanceDocSource {
  const routeLabel = s.route
    ? [s.route.startLocation, s.route.endLocation].filter(Boolean).join(" - ") || s.route.name
    : null;
  return {
    missionId: s.missionId,
    title: s.title,
    code: s.code,
    plannedStart: s.plannedStart,
    plannedEnd: s.plannedEnd,
    routeLabel,
    routeMissionDays: s.route?.missionDays ?? null,
    personnel: s.personnel ?? [],
    policeStations: s.policeStations ?? [],
  };
}

/** โหลดสรุปภารกิจ + แบบร่างในเครื่อง (ซิงก์แถวเมื่อภารกิจเปลี่ยน) */
/** โหลดสรุปภารกิจ + เอกสารที่บันทึกในฐานข้อมูล (แถว/ยอดซิงก์กับภารกิจเมื่อเขาเปลี่ยน) */
function useAllowanceDoc<T>(kind: Kind, build: (src: AllowanceDocSource) => T) {
  const { id = "" } = useParams();
  const [summary, setSummary] = useState<MissionSummary | null>(null);
  const [doc, setDoc] = useState<T | null>(null);
  const [edited, setEdited] = useState(false);
  const [sourceSig, setSourceSig] = useState("");
  const [dbUpdatedAt, setDbUpdatedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /**
   * เอกสารมาจากฐานข้อมูลเป็นหลัก — ถ้าฐานข้อมูลไม่มี (เช่นยังไม่เคยบันทึก/ออฟไลน์)
   * จึงใช้แบบร่างในเครื่องนี้เป็นตัวสำรอง กันงานที่ยังไม่ได้บันทึกหายระหว่างรอเน็ต
   */
  const applySummary = useCallback(
    async (s: MissionSummary) => {
      const src = summarySource(s);

      /* 1) เอกสารที่บันทึกไว้ของภารกิจนี้ · 2) ข้อความตั้งต้นที่ผู้ดูแลแก้ไว้ (ใช้ร่วมทุกภารกิจ) */
      let stored: StoredAllowanceDoc<T> | null = null;
      let template: T | null = null;
      try {
        const [docRes, tplRes] = await Promise.all([
          fetchAllowanceDoc<T>(kind, id),
          fetchAllowanceTemplate<T>(kind).catch(() => null),
        ]);
        stored = docRes;
        template = tplRes?.doc ?? null;
      } catch {
        stored = null;
      }

      const resolved = stored
        ? mergeStoredDoc(kind, stored, src, build)
        : resolveAllowanceDoc(kind, id, src, build);
      const withTemplate = stored
        ? resolved
        : { ...resolved, doc: applyAllowanceTemplate(kind, resolved.doc, template) };

      setSummary(s);
      setDoc(withTemplate.doc);
      setEdited(withTemplate.edited);
      setSourceSig(withTemplate.sourceSig);
      setDbUpdatedAt(stored?.updatedAt ?? null);
      setDirty(false);
      setErr(null);
    },
    [build, id, kind],
  );

  const reload = useCallback(
    (opts?: { quiet?: boolean }) => {
      apiJson<MissionSummary>(`/api/missions/${id}/summary`, { skipCache: true })
        .then((s) => applySummary(s))
        .catch((e) => {
          if (!opts?.quiet) setErr(e instanceof Error ? e.message : "โหลดข้อมูลภารกิจไม่สำเร็จ");
        });
    },
    [applySummary, id],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  /* กลับมาที่แท็บหลังสลับไปหน้าอื่น — ดึงเฉพาะตอนไม่มีการแก้ที่ยังไม่บันทึก กันทับงานที่กำลังทำ */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && !dirty) reload({ quiet: true });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [dirty, reload]);

  const update = useCallback(
    (fn: (d: T) => T) => {
      setDoc((cur) => (cur ? fn(cur) : cur));
      setEdited(true);
      setDirty(true);
    },
    [],
  );

  /** บันทึกลงฐานข้อมูล — คืน true เมื่อสำเร็จ */
  const save = useCallback(async (): Promise<boolean> => {
    if (!doc) return false;
    setSaving(true);
    try {
      const stored = await saveAllowanceDocToServer(kind, id, doc, sourceSig);
      /* เก็บสำเนาในเครื่องไว้เป็นตัวสำรองด้วย */
      saveAllowanceDraft(kind, id, doc, sourceSig);
      setDbUpdatedAt(stored.updatedAt);
      setDirty(false);
      setErr(null);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setSaving(false);
    }
  }, [doc, id, kind, sourceSig]);

  async function reset() {
    if (!confirm("ลบเอกสารที่บันทึกไว้ แล้วสร้างใหม่จากข้อมูลภารกิจ?")) return;
    clearAllowanceDraft(kind, id);
    try {
      await deleteAllowanceDocFromServer(kind, id);
    } catch {
      /* ไม่มีในฐานข้อมูลอยู่แล้ว — ดำเนินการต่อ */
    }
    try {
      const s = await apiJson<MissionSummary>(`/api/missions/${id}/summary`, { skipCache: true });
      const src = summarySource(s);
      setSummary(s);
      setDoc(build(src));
      setEdited(false);
      setSourceSig(allowanceSourceSig(kind, src));
      setDbUpdatedAt(null);
      setDirty(false);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดข้อมูลภารกิจไม่สำเร็จ");
    }
  }

  return { id, summary, doc, edited, dirty, saving, dbUpdatedAt, err, update, save, reset };
}

function DocShell({
  title,
  missionId,
  summary,
  dirty,
  saving,
  dbUpdatedAt,
  err,
  onSave,
  onReset,
  onPrint,
  extraTools,
  children,
}: {
  title: string;
  missionId: string;
  summary: MissionSummary | null;
  dirty: boolean;
  saving: boolean;
  dbUpdatedAt: string | null;
  err: string | null;
  onSave: () => Promise<boolean>;
  onReset: () => void;
  onPrint: () => void;
  extraTools?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 print:hidden">
      <PageHeaderBar
        title={title}
        subtitle={
          summary ? (
            <span className="text-xs">
              {[summary.code, summary.title?.trim()].filter(Boolean).join(" · ") || "ภารกิจ"}
              {dirty ? (
                <span className="ml-2 font-semibold text-amber-700">· มีการแก้ไข — ยังไม่บันทึก</span>
              ) : dbUpdatedAt ? (
                <span className="ml-2 text-slate-400">
                  · บันทึกล่าสุด{" "}
                  {new Date(dbUpdatedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              ) : null}
            </span>
          ) : null
        }
        backTo={`/missions/${missionId}/summary`}
        extras={
          summary ? (
            <>
              <button
                type="button"
                className={toolbarPrimaryBtnClass}
                onClick={() => void onSave()}
                disabled={saving || !dirty}
              >
                {saving ? "กำลังบันทึก…" : dirty ? "บันทึก" : "บันทึกแล้ว"}
              </button>
              <button type="button" className={toolbarLinkBtnClass} onClick={onReset}>
                คืนค่าจากภารกิจ
              </button>
              {extraTools}
            </>
          ) : null
        }
        primary={
          summary ? (
            <button type="button" className={`${toolbarPrimaryBtnClass} !rounded-lg !px-3`} onClick={onPrint}>
              พิมพ์
            </button>
          ) : null
        }
      />
      {err ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</p> : null}
      {!summary && !err ? <p className="py-10 text-center text-sm text-slate-500">กำลังโหลด…</p> : null}
      {children}
    </div>
  );
}


function TextField({
  label,
  value,
  onChange,
  wide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  wide?: boolean;
}) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className={labelClass}>{label}</span>
      <input className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function MoneyCell({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <CommaNumberInput
      className={`${cellInputClass} text-right tabular-nums`}
      value={value ? String(value) : ""}
      placeholder="0"
      maxFractionDigits={2}
      onChange={(raw) => onChange(raw === "" ? 0 : Number(raw) || 0)}
    />
  );
}

function RemoveBtn({ onClick, label = "ลบแถว" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-md px-1.5 py-1 text-xs font-bold text-slate-400 hover:bg-rose-50 hover:text-rose-600"
    >
      ✕
    </button>
  );
}

function SignerSection({ signer, onChange }: { signer: AllowanceSigner; onChange: (s: AllowanceSigner) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <TextField label="ชื่อผู้ลงนาม" value={signer.name} onChange={(v) => onChange({ ...signer, name: v })} />
      <TextField label="ตำแหน่ง" value={signer.title} onChange={(v) => onChange({ ...signer, title: v })} />
      <TextField label="บรรทัดเพิ่มเติม (เว้นว่างได้)" value={signer.note} onChange={(v) => onChange({ ...signer, note: v })} />
    </div>
  );
}

/* ================= เบี้ยเลี้ยง ธปท. ================= */

export function MissionBotAllowancePage() {
  const { id, summary, doc, dirty, saving, dbUpdatedAt, err, update, save, reset } = useAllowanceDoc<BotAllowanceDoc>("bot", buildBotAllowanceDoc);
  const [templateOpen, setTemplateOpen] = useState(false);

  const set = <K extends keyof BotAllowanceDoc>(k: K, v: BotAllowanceDoc[K]) => update((d) => ({ ...d, [k]: v }));
  const setRow = (key: string, patch: Partial<BotDocRow>) =>
    update((d) => ({ ...d, rows: d.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));

  function print() {
    if (!printIsolatedElement({ rootSelector: ".bot-allowance-print-root", htmlClass: "print-bot-allowance", pageSize: "A4 landscape" }))
      alert("ไม่พบแบบฟอร์มสำหรับพิมพ์");
  }

  const rows = doc?.rows ?? [];
  const totals = {
    special: rows.reduce((s, r) => s + (r.special || 0), 0),
    perDiem: rows.reduce((s, r) => s + (r.perDiem || 0), 0),
    travel: rows.reduce((s, r) => s + (r.travel || 0), 0),
    all: rows.reduce((s, r) => s + botRowTotal(r), 0),
  };

  return (
    <>
    <DocShell
      title="รายการเบี้ยเลี้ยง ธปท."
      missionId={id}
      summary={summary}
      dirty={dirty}
      saving={saving}
      dbUpdatedAt={dbUpdatedAt}
      err={err}
      onReset={reset}
      onSave={save}
      onPrint={print}
      extraTools={
        <button type="button" className={toolbarLinkBtnClass} onClick={() => setTemplateOpen(true)}>
          ข้อความอ้างอิงตั้งต้น
        </button>
      }
    >
      {doc ? (
        <>
          <section className={cardClass}>
            <h2 className={sectionTitleClass}>หัวเอกสาร</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="หัวเรื่อง" value={doc.heading} onChange={(v) => set("heading", v)} wide />
              <TextField label="เส้นทาง / หน่วยงาน" value={doc.orgLine} onChange={(v) => set("orgLine", v)} />
              <TextField label="วันที่" value={doc.dateLine} onChange={(v) => set("dateLine", v)} />
              <TextField label="ภารกิจ" value={doc.missionLine} onChange={(v) => set("missionLine", v)} />
              <TextField label="คำอธิบายใต้หัวคอลัมน์เบี้ยพิเศษฯ" value={doc.specialHeader} onChange={(v) => set("specialHeader", v)} />
            </div>
          </section>

          <section className={cardClass}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-black text-[#1e1b4b]">รายชื่อ ({rows.length} คน)</h2>
              <p className="text-xs text-slate-500">
                รวมเงิน <b className="text-base tabular-nums text-[#0000BF]">{formatBahtPlain(totals.all)}</b> บาท
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[60rem] border-collapse">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={`${thClass} w-8 text-center`}>#</th>
                    <th className={`${thClass} w-28`}>รหัสพนักงาน</th>
                    <th className={thClass}>ชื่อ-สกุล</th>
                    <th className={thClass}>ตำแหน่ง</th>
                    <th className={`${thClass} w-20`}>ชั้น</th>
                    <th className={`${thClass} w-28 text-right`}>เบี้ยพิเศษฯ</th>
                    <th className={`${thClass} w-28 text-right`}>เบี้ยเลี้ยง</th>
                    <th className={`${thClass} w-28 text-right`}>ยานพาหนะ ไป-กลับ</th>
                    <th className={`${thClass} w-28 text-right`}>รวมเงิน</th>
                    <th className={`${thClass} w-8`} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r, i) => (
                    <tr key={r.key} className="hover:bg-slate-50/60">
                      <td className="px-1.5 text-center text-xs text-slate-400">{i + 1}</td>
                      <td className="px-0.5 py-0.5">
                        <input className={cellInputClass} value={r.employeeCode} onChange={(e) => setRow(r.key, { employeeCode: e.target.value })} />
                      </td>
                      <td className="px-0.5 py-0.5">
                        <input className={`${cellInputClass} font-semibold`} value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })} />
                      </td>
                      <td className="px-0.5 py-0.5">
                        <input className={cellInputClass} value={r.position} onChange={(e) => setRow(r.key, { position: e.target.value })} />
                      </td>
                      <td className="px-0.5 py-0.5">
                        <input className={cellInputClass} value={r.grade} onChange={(e) => setRow(r.key, { grade: e.target.value })} />
                      </td>
                      <td className="px-0.5 py-0.5">
                        <MoneyCell value={r.special} onChange={(n) => setRow(r.key, { special: n })} />
                      </td>
                      <td className="px-0.5 py-0.5">
                        <MoneyCell value={r.perDiem} onChange={(n) => setRow(r.key, { perDiem: n })} />
                      </td>
                      <td className="px-0.5 py-0.5">
                        <MoneyCell value={r.travel} onChange={(n) => setRow(r.key, { travel: n })} />
                      </td>
                      <td className="px-1.5 text-right text-xs font-bold tabular-nums text-[#1e1b4b]">{formatBahtPlain(botRowTotal(r))}</td>
                      <td className="text-center">
                        <RemoveBtn onClick={() => update((d) => ({ ...d, rows: d.rows.filter((x) => x.key !== r.key) }))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 text-xs font-bold">
                  <tr>
                    <td colSpan={5} className="px-1.5 py-2 text-right text-slate-500">
                      รวม
                    </td>
                    <td className="px-1.5 text-right tabular-nums">{formatBahtPlain(totals.special)}</td>
                    <td className="px-1.5 text-right tabular-nums">{formatBahtPlain(totals.perDiem)}</td>
                    <td className="px-1.5 text-right tabular-nums">{formatBahtPlain(totals.travel)}</td>
                    <td className="px-1.5 text-right tabular-nums text-[#0000BF]">{formatBahtPlain(totals.all)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <button
              type="button"
              className={`${addRowBtnClass} mt-2`}
              onClick={() =>
                update((d) => ({
                  ...d,
                  rows: [...d.rows, { key: newRowKey(), employeeCode: "", name: "", position: "", grade: "", special: 0, perDiem: 0, travel: 0 }],
                }))
              }
            >
              + เพิ่มแถว
            </button>
          </section>

          <section className={cardClass}>
            <h2 className={sectionTitleClass}>ท้ายเอกสาร</h2>
            <div className="space-y-3">
              <TextField label="หมายเหตุใต้ตาราง" value={doc.note} onChange={(v) => set("note", v)} />
              <label className="block">
                <span className={labelClass}>อ้างอิงระเบียบ (บรรทัดละ 1 ข้อ)</span>
                <textarea className={`${inputClass} min-h-[7rem]`} value={doc.rules} onChange={(e) => set("rules", e.target.value)} />
              </label>
              <SignerSection signer={doc.signer} onChange={(s) => set("signer", s)} />
            </div>
          </section>

          {createPortal(<MissionBotAllowancePrintSheet doc={doc} />, document.body)}
        </>
      ) : null}
    </DocShell>
      <AllowanceTemplateModal kind="bot" open={templateOpen} onClose={() => setTemplateOpen(false)} />
    </>
  );
}

/* ================= ค่าตอบแทนบุคคลภายนอก ================= */

const emptyPoliceRow = (): PoliceDocRow => ({
  key: newRowKey(),
  rank: "",
  firstName: "",
  lastName: "",
  idDisplay: "",
  amount: 0,
  affiliation: "",
});

export function MissionPoliceAllowancePage() {
  const { id, summary, doc, dirty, saving, dbUpdatedAt, err, update, save, reset } = useAllowanceDoc<PoliceAllowanceDoc>("police", buildPoliceAllowanceDoc);

  const set = <K extends keyof PoliceAllowanceDoc>(k: K, v: PoliceAllowanceDoc[K]) => update((d) => ({ ...d, [k]: v }));
  const setGroup = (gKey: string, fn: (rows: PoliceDocRow[]) => PoliceDocRow[], title?: string) =>
    update((d) => ({
      ...d,
      groups: d.groups.map((g) => (g.key === gKey ? { ...g, title: title ?? g.title, rows: fn(g.rows) } : g)),
    }));
  const setRow = (gKey: string, rKey: string, patch: Partial<PoliceDocRow>) =>
    setGroup(gKey, (rows) => rows.map((r) => (r.key === rKey ? { ...r, ...patch } : r)));

  function print() {
    if (!printIsolatedElement({ rootSelector: ".police-allowance-print-root", htmlClass: "print-police-allowance", pageSize: "A4 portrait" }))
      alert("ไม่พบแบบฟอร์มสำหรับพิมพ์");
  }

  const total = doc ? policeDocTotal(doc) : 0;
  const people = doc?.groups.reduce((s, g) => s + g.rows.length, 0) ?? 0;

  return (
    <DocShell
      title="ค่าตอบแทนบุคคลภายนอก"
      missionId={id}
      summary={summary}
      dirty={dirty}
      saving={saving}
      dbUpdatedAt={dbUpdatedAt}
      err={err}
      onReset={reset}
      onSave={save}
      onPrint={print}
    >
      {doc ? (
        <>
          <section className={cardClass}>
            <h2 className={sectionTitleClass}>หัวเอกสาร</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="หัวเรื่อง" value={doc.heading} onChange={(v) => set("heading", v)} wide />
              <TextField label="เส้นทาง / หน่วยงาน" value={doc.orgLine} onChange={(v) => set("orgLine", v)} />
              <TextField label="วันที่" value={doc.dateLine} onChange={(v) => set("dateLine", v)} />
            </div>
          </section>

          <section className={cardClass}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-black text-[#1e1b4b]">
                รายชื่อตามสังกัด ({doc.groups.length} กลุ่ม · {people} แถว)
              </h2>
              <p className="text-xs text-slate-500">
                รวมเงินทั้งหมด <b className="text-base tabular-nums text-[#0000BF]">{formatBahtPlain(total)}</b> บาท
              </p>
            </div>

            {doc.groups.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">
                ไม่มีรายชื่อบุคคลภายนอกในภารกิจนี้ — เพิ่มกลุ่มเองได้
              </p>
            ) : null}

            <div className="space-y-4">
              {doc.groups.map((g, gi) => {
                const groupTotal = g.rows.reduce((s, r) => s + (r.amount || 0), 0);
                return (
                  <div key={g.key} className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2 px-2 py-1.5" style={{ background: policeGroupColor(gi) }}>
                      <input
                        className={`${cellInputClass} !text-sm font-bold`}
                        value={g.title}
                        onChange={(e) => setGroup(g.key, (rows) => rows, e.target.value)}
                      />
                      <span className="shrink-0 text-xs font-bold tabular-nums text-slate-700">{formatBahtPlain(groupTotal)} บาท</span>
                      <RemoveBtn
                        label="ลบกลุ่ม"
                        onClick={() => {
                          if (confirm(`ลบกลุ่ม «${g.title}»?`)) update((d) => ({ ...d, groups: d.groups.filter((x) => x.key !== g.key) }));
                        }}
                      />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[52rem] border-collapse">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className={`${thClass} w-8 text-center`}>#</th>
                            <th className={`${thClass} w-28`}>ยศ</th>
                            <th className={thClass}>ชื่อ</th>
                            <th className={thClass}>สกุล</th>
                            <th className={`${thClass} w-44`}>บัตรประชาชน / Vendor</th>
                            <th className={`${thClass} w-28 text-right`}>จำนวนเงิน</th>
                            <th className={`${thClass} w-44`}>สังกัด</th>
                            <th className={`${thClass} w-8`} />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {g.rows.map((r, i) => (
                            <tr key={r.key} className={r.isEntity ? "bg-amber-50/40" : "hover:bg-slate-50/60"}>
                              <td className="px-1.5 text-center text-xs text-slate-400">{i + 1}</td>
                              <td className="px-0.5 py-0.5">
                                <input className={cellInputClass} value={r.rank} onChange={(e) => setRow(g.key, r.key, { rank: e.target.value })} />
                              </td>
                              <td className="px-0.5 py-0.5">
                                <input
                                  className={`${cellInputClass} font-semibold`}
                                  value={r.firstName}
                                  onChange={(e) => setRow(g.key, r.key, { firstName: e.target.value })}
                                />
                              </td>
                              <td className="px-0.5 py-0.5">
                                <input className={cellInputClass} value={r.lastName} onChange={(e) => setRow(g.key, r.key, { lastName: e.target.value })} />
                              </td>
                              <td className="px-0.5 py-0.5">
                                <input
                                  className={`${cellInputClass} tabular-nums`}
                                  value={r.idDisplay}
                                  onChange={(e) => setRow(g.key, r.key, { idDisplay: e.target.value })}
                                />
                              </td>
                              <td className="px-0.5 py-0.5">
                                <MoneyCell value={r.amount} onChange={(n) => setRow(g.key, r.key, { amount: n })} />
                              </td>
                              <td className="px-0.5 py-0.5">
                                <input
                                  className={cellInputClass}
                                  value={r.affiliation}
                                  onChange={(e) => setRow(g.key, r.key, { affiliation: e.target.value })}
                                />
                              </td>
                              <td className="text-center">
                                <RemoveBtn onClick={() => setGroup(g.key, (rows) => rows.filter((x) => x.key !== r.key))} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="border-t border-slate-100 px-2 py-1.5">
                      <button
                        type="button"
                        className="text-xs font-bold text-indigo-700 hover:underline"
                        onClick={() => setGroup(g.key, (rows) => [...rows, emptyPoliceRow()])}
                      >
                        + เพิ่มแถวในกลุ่มนี้
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className={`${addRowBtnClass} mt-3`}
              onClick={() =>
                update((d) => ({ ...d, groups: [...d.groups, { key: newRowKey(), title: "กลุ่มใหม่", rows: [emptyPoliceRow()] }] }))
              }
            >
              + เพิ่มกลุ่มสังกัด
            </button>
          </section>

          <section className={cardClass}>
            <h2 className={sectionTitleClass}>ท้ายเอกสาร</h2>
            <div className="space-y-3">
              <label className="block">
                <span className={labelClass}>หมายเหตุ (พิมพ์ต่อจากยอดรวม — เว้นว่างได้)</span>
                <textarea
                  className={`${inputClass} min-h-[4.5rem]`}
                  value={doc.note ?? ""}
                  onChange={(e) => set("note", e.target.value)}
                />
              </label>
              <SignerSection signer={doc.signer} onChange={(s) => set("signer", s)} />
            </div>
          </section>

          {createPortal(<MissionPoliceAllowancePrintSheet doc={doc} />, document.body)}
        </>
      ) : null}
    </DocShell>
  );
}
