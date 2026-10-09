import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { EvaluationDetail } from "../lib/missionEvaluation";
import { formatIncidentTime, severityMeta, type MissionIncident } from "../lib/missionIncidents";
import {
  OUTCOME_OPTIONS,
  buildReportHtml,
  buildReportText,
  reportSubject,
  type ReportExtras,
  type ReportForm,
} from "../lib/missionReport";
import type { MissionSummary } from "../types";
import { Modal } from "./Modal";

type Props = { open: boolean; onClose: () => void; summary: MissionSummary };

type EstimateTotals = { approvalTotal: string | null } | null;

const draftKey = (missionId: string) => `missionReportDraft:${missionId}`;

const outcomeTone: Record<string, string> = {
  emerald: "border-emerald-500 bg-emerald-50 text-emerald-800 ring-emerald-200",
  amber: "border-amber-500 bg-amber-50 text-amber-800 ring-amber-200",
  rose: "border-rose-500 bg-rose-50 text-rose-800 ring-rose-200",
};

function defaultForm(name: string): ReportForm {
  return {
    recipient: "ผู้บริหาร",
    outcome: "success",
    incidents: "",
    suggestions: "",
    reporterName: name,
    reporterPosition: "",
    includeExpenses: true,
    includeVehicles: false,
    includeEvaluation: true,
  };
}

function loadDraft(missionId: string, name: string): ReportForm {
  const base = defaultForm(name);
  try {
    const raw = localStorage.getItem(draftKey(missionId));
    if (raw) return { ...base, ...(JSON.parse(raw) as Partial<ReportForm>) };
  } catch {
    /* draft เสีย — ใช้ค่าเริ่มต้น */
  }
  return base;
}

async function copyRich(html: string, text: string): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      /* fallback เป็นข้อความล้วน */
    }
  }
  await navigator.clipboard.writeText(text);
}

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100";

function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2 text-sm ${disabled ? "cursor-not-allowed text-slate-400" : "cursor-pointer text-slate-700"}`}>
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-300"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function MissionReportModal({ open, onClose, summary }: Props) {
  const { user } = useAuth();
  const reporterDefault = user?.fullName?.trim() || user?.username || "";
  const [hadDraft] = useState(() => localStorage.getItem(draftKey(summary.missionId)) != null);
  const [form, setForm] = useState<ReportForm>(() => loadDraft(summary.missionId, reporterDefault));
  const [extras, setExtras] = useState<ReportExtras>({ approvedBudget: null, evaluation: null, incidents: [] });
  const [copied, setCopied] = useState<"subject" | "body" | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all([
      apiJson<EstimateTotals>(`/api/missions/${summary.missionId}/estimate`).catch(() => null),
      apiJson<EvaluationDetail>(`/api/mission-evaluations/${summary.missionId}`, { skipCache: true }).catch(() => null),
      apiJson<MissionIncident[]>(`/api/missions/${summary.missionId}/incidents`, { skipCache: true }).catch(() => []),
    ]).then(([est, ev, incidents]) => {
      if (cancelled) return;
      const approved = est?.approvalTotal != null && est.approvalTotal !== "" ? Number(est.approvalTotal) : null;
      setExtras({
        approvedBudget: approved != null && Number.isFinite(approved) && approved > 0 ? approved : null,
        evaluation: ev?.summary ?? null,
        incidents,
      });
      if (!hadDraft && incidents.length) {
        setForm((f) => (f.outcome === "success" ? { ...f, outcome: "successWithIssues" } : f));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, summary.missionId, hadDraft]);

  useEffect(() => {
    try {
      localStorage.setItem(draftKey(summary.missionId), JSON.stringify(form));
    } catch {
      /* storage เต็ม — ข้าม */
    }
  }, [form, summary.missionId]);

  const subject = useMemo(() => reportSubject(summary), [summary]);
  const text = useMemo(() => buildReportText(summary, form, extras), [summary, form, extras]);
  const html = useMemo(() => buildReportHtml(summary, form, extras), [summary, form, extras]);
  const hasEvaluation = (extras.evaluation?.responseCount ?? 0) > 0;

  function patch(p: Partial<ReportForm>) {
    setForm((f) => ({ ...f, ...p }));
  }

  function flash(kind: "subject" | "body") {
    setCopied(kind);
    window.setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1800);
  }

  async function copySubject() {
    try {
      await navigator.clipboard.writeText(subject);
      flash("subject");
    } catch {
      alert("คัดลอกไม่สำเร็จ");
    }
  }

  async function copyBody() {
    try {
      await copyRich(html, text);
      flash("body");
    } catch {
      alert("คัดลอกไม่สำเร็จ");
    }
  }

  function openMail() {
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  }

  function resetDraft() {
    if (!confirm("ล้างข้อความที่กรอกไว้ทั้งหมด?")) return;
    setForm(defaultForm(reporterDefault));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="wide"
      title={
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-white shadow-md">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 4h16v16H4z" />
              <path d="m4 7 8 6 8-6" />
            </svg>
          </span>
          <span>
            <span className="block text-base font-bold text-slate-900">รายงานผลการปฏิบัติภารกิจ</span>
            <span className="block text-xs font-normal text-slate-500">สร้างข้อความรายงานผู้บริหาร — คัดลอกไปวางในอีเมลได้ทันที</span>
          </span>
        </span>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">ผลการปฏิบัติ</h4>
            <div className="grid gap-2">
              {OUTCOME_OPTIONS.map((o) => {
                const active = form.outcome === o.key;
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => patch({ outcome: o.key })}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                      active ? `${outcomeTone[o.tone]} ring-2` : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span className={`h-3 w-3 shrink-0 rounded-full border-2 ${active ? "border-current bg-current" : "border-slate-300"}`} />
                    {o.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">เรียน</label>
            <input className={inputCls} value={form.recipient} onChange={(e) => patch({ recipient: e.target.value })} placeholder="ผู้บริหาร" />
          </section>

          <section className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">เหตุการณ์ระหว่างปฏิบัติ</label>
            {extras.incidents.length ? (
              <div className="space-y-1 rounded-xl border border-rose-100 bg-rose-50/50 p-2.5">
                <p className="text-[11px] font-semibold text-rose-700">
                  ดึงจากบันทึกเหตุการณ์ไม่ปกติ {extras.incidents.length} รายการ
                </p>
                <ul className="space-y-0.5">
                  {extras.incidents.map((i) => (
                    <li key={i.id} className="flex items-center gap-1.5 text-xs text-slate-700">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${severityMeta(i.severity).dot}`} />
                      <span className="tabular-nums text-slate-500">{formatIncidentTime(i.occurredAt)}</span>
                      <span className="truncate font-medium">{i.category}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">ไม่มีบันทึกเหตุการณ์ไม่ปกติในทริปนี้ (เพิ่มได้ที่หน้าสรุปภารกิจ)</p>
            )}
            <textarea
              className={`${inputCls} min-h-[4rem]`}
              value={form.incidents}
              onChange={(e) => patch({ incidents: e.target.value })}
              placeholder="หมายเหตุเพิ่มเติม (ไม่บังคับ)"
            />
          </section>

          <section className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">ปัญหาอุปสรรค / ข้อเสนอแนะ</label>
            <textarea
              className={`${inputCls} min-h-[5rem]`}
              value={form.suggestions}
              onChange={(e) => patch({ suggestions: e.target.value })}
              placeholder="ไม่บังคับ — เว้นว่างจะไม่แสดงหัวข้อนี้"
            />
          </section>

          <section className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">ผู้รายงาน</label>
              <input className={inputCls} value={form.reporterName} onChange={(e) => patch({ reporterName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">ตำแหน่ง</label>
              <input className={inputCls} value={form.reporterPosition} onChange={(e) => patch({ reporterPosition: e.target.value })} />
            </div>
          </section>

          <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">ข้อมูลที่แนบในรายงาน</h4>
            <Toggle checked={form.includeExpenses} onChange={(v) => patch({ includeExpenses: v })} label="ค่าใช้จ่าย (งบประมาณเทียบจ่ายจริง)" />
            <Toggle checked={form.includeVehicles} onChange={(v) => patch({ includeVehicles: v })} label="รายการทะเบียนรถแต่ละคัน" />
            <Toggle
              checked={form.includeEvaluation}
              onChange={(v) => patch({ includeEvaluation: v })}
              label={hasEvaluation ? "ผลประเมินจากผู้ร่วมภารกิจ" : "ผลประเมินจากผู้ร่วมภารกิจ (ยังไม่มีผู้ตอบ)"}
              disabled={!hasEvaluation}
            />
          </section>

          <button type="button" onClick={resetDraft} className="text-xs font-semibold text-slate-400 hover:text-rose-600">
            ล้างข้อความที่กรอก
          </button>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3">
              <span className="mt-0.5 shrink-0 text-xs font-bold text-slate-400">หัวเรื่อง</span>
              <p className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{subject}</p>
            </div>
            <div
              className="max-h-[55dvh] overflow-y-auto px-5 py-4"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void copySubject()}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              {copied === "subject" ? "คัดลอกแล้ว" : "คัดลอกหัวเรื่อง"}
            </button>
            <button
              type="button"
              onClick={openMail}
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 shadow-sm hover:bg-violet-100"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 4h16v16H4z" />
                <path d="m4 7 8 6 8-6" />
              </svg>
              เปิดในโปรแกรมอีเมล
            </button>
            <button
              type="button"
              onClick={() => void copyBody()}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-5 py-2 text-sm font-bold text-white shadow-md hover:opacity-95"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
              </svg>
              {copied === "body" ? "คัดลอกเนื้อหาแล้ว" : "คัดลอกเนื้อหา"}
            </button>
          </div>
          <p className="text-right text-[11px] text-slate-400">
            “คัดลอกเนื้อหา” จะคงรูปแบบหัวข้อเมื่อวางใน Outlook / Gmail · ข้อความที่กรอกจะถูกบันทึกไว้ในเครื่องนี้อัตโนมัติ
          </p>
        </div>
      </div>
    </Modal>
  );
}
