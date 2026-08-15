import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiUrl } from "../api/client";
import {
  DECISION_LABEL_TH,
  ISSUE_STATUS_LABEL_TH,
  PRIORITY_LABEL_TH,
  STATUS_LABEL_TH,
} from "../lib/investigationLabels";
import { brandGradientBarClass } from "../lib/uiTokens";
import type { InvestigationApprovalLink } from "../types";

/**
 * หน้าอนุมัติจากลิงก์ในอีเมล — ไม่ต้องเข้าสู่ระบบ
 * ยิง API ตรงโดยไม่แนบ Authorization เพราะ endpoint เป็น public + ตรวจด้วย token
 */
async function fetchLink(token: string): Promise<InvestigationApprovalLink> {
  const res = await fetch(apiUrl(`/api/investigation-approval/${token}`), {
    headers: { Accept: "application/json" },
  });
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(data?.error ?? "เปิดลิงก์ไม่สำเร็จ");
  return data as unknown as InvestigationApprovalLink;
}

async function postDecision(token: string, decision: "APPROVED" | "REJECTED", comment: string) {
  const res = await fetch(apiUrl(`/api/investigation-approval/${token}`), {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ decision, comment: comment.trim() || null }),
  });
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(data?.error ?? "บันทึกผลพิจารณาไม่สำเร็จ");
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

export function ApprovalLinkPage() {
  const { token = "" } = useParams();
  const [data, setData] = useState<InvestigationApprovalLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"APPROVED" | "REJECTED" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setData(await fetchLink(token));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เปิดลิงก์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(decision: "APPROVED" | "REJECTED") {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await postDecision(token, decision, comment);
      setDone(decision);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกผลพิจารณาไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-[#f5f3ff] via-white to-[#fdf2f8] px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="overflow-hidden rounded-[1.5rem] border border-[#e8e6fc] bg-white/95 shadow-[0_24px_60px_-28px_rgba(30,27,75,0.28)]">
          <div className={`h-1.5 w-full ${brandGradientBarClass}`} />
          <div className="p-6">
            <h1 className="text-lg font-black text-[#1e1b4b]">พิจารณาเรื่องงานสืบสวน</h1>

            {loading ? (
              <p className="mt-6 text-center text-sm text-slate-600">กำลังโหลด…</p>
            ) : done ? (
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
                <p className="text-base font-black text-emerald-800">
                  บันทึกผลเรียบร้อย — {done === "APPROVED" ? "เห็นชอบ" : "ไม่อนุมัติ"}
                </p>
                <p className="mt-1 text-sm text-emerald-900">
                  {done === "APPROVED"
                    ? "ระบบส่งเรื่องต่อให้ผู้พิจารณาลำดับถัดไปแล้ว"
                    : "ระบบแจ้งผลกลับไปยังผู้เสนอแล้ว"}
                </p>
                <p className="mt-3 text-xs text-slate-500">ปิดหน้านี้ได้เลย</p>
              </div>
            ) : err && !data ? (
              <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-8 text-center">
                <p className="text-sm font-bold text-rose-800">{err}</p>
              </div>
            ) : data ? (
              <>
                <p className="mt-1 text-sm text-slate-600">
                  เรียน {data.orgRoleLabel} {data.approverName ?? ""} — {data.stageLabel} (ขั้นที่ {data.sequence})
                </p>
                {data.expiresAt ? (
                  <p className="mt-0.5 text-[11px] text-slate-500">ลิงก์ใช้ได้ถึง {fmtDate(data.expiresAt)}</p>
                ) : null}

                {err ? (
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {err}
                  </p>
                ) : null}

                <section className="mt-4 rounded-xl border border-[#e8e6fc] bg-[#faf9ff] p-4">
                  <p className="font-mono text-[11px] font-bold text-slate-500">{data.case.caseNumber}</p>
                  <h2 className="mt-0.5 text-base font-bold text-[#1e1b3a]">{data.case.title}</h2>
                  <p className="mt-1 text-[12px] text-slate-600">
                    {data.case.categoryName ?? "—"}
                    {data.case.teamName ? ` · ${data.case.teamName}` : ""} · สถานะ{" "}
                    {STATUS_LABEL_TH[data.case.status]} · ความสำคัญ{" "}
                    {
                      PRIORITY_LABEL_TH[
                        (data.case.priority === 1 || data.case.priority === 3 ? data.case.priority : 2) as 1 | 2 | 3
                      ]
                    }
                    {data.case.slaDueAt ? ` · SLA ${fmtDate(data.case.slaDueAt)}` : ""}
                  </p>
                  {data.case.summary?.trim() ? (
                    <p className="mt-3 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-700">
                      {data.case.summary}
                    </p>
                  ) : null}
                  {data.case.conclusion?.trim() ? (
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-emerald-800">ผลสรุป</p>
                      <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-800">
                        {data.case.conclusion}
                      </p>
                      {data.case.recommendation?.trim() ? (
                        <>
                          <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-emerald-800">
                            ข้อเสนอแนะ
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-800">
                            {data.case.recommendation}
                          </p>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                {data.case.issues.length > 0 ? (
                  <section className="mt-3 rounded-xl border border-[#e8e6fc] p-4">
                    <h3 className="text-sm font-black text-[#1e1b4b]">ประเด็นย่อย ({data.case.issues.length})</h3>
                    <ul className="mt-2 space-y-1.5">
                      {data.case.issues.map((i) => (
                        <li key={i.id} className="rounded-lg bg-[#faf9ff] px-3 py-2">
                          <p className="text-[12px] font-semibold text-[#1e1b3a]">
                            <span className="mr-1.5 rounded bg-white px-1.5 py-0.5 text-[10px] font-black text-slate-600">
                              {ISSUE_STATUS_LABEL_TH[i.status]}
                            </span>
                            {i.title}
                          </p>
                          {i.finding?.trim() ? (
                            <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-700">
                              {i.finding}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {data.previousComments.length > 0 ? (
                  <section className="mt-3 rounded-xl border border-[#e8e6fc] p-4">
                    <h3 className="text-sm font-black text-[#1e1b4b]">ความเห็นก่อนหน้า</h3>
                    <ul className="mt-2 space-y-1.5">
                      {data.previousComments.map((c) => (
                        <li key={c.sequence} className="rounded-lg bg-[#faf9ff] px-3 py-2">
                          <p className="text-[11px] font-bold text-[#2e2a58]">
                            {c.orgRoleLabel} {c.approverName ?? "—"} · {DECISION_LABEL_TH[c.decision]}
                          </p>
                          {c.comment?.trim() ? (
                            <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-slate-700">{c.comment}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <label className="mt-4 block">
                  <span className="text-xs font-medium text-slate-700">ความเห็นของท่าน</span>
                  <textarea
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="ระบุความเห็นประกอบการพิจารณา (ถ้ามี)"
                  />
                </label>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                    onClick={() => void decide("APPROVED")}
                  >
                    {busy ? "กำลังบันทึก…" : "เห็นชอบ ส่งต่อตามสายงาน"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-full border border-rose-200 bg-rose-50 px-5 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-100 disabled:opacity-50"
                    onClick={() => void decide("REJECTED")}
                  >
                    ไม่อนุมัติ
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] text-slate-500">
          ระบบฐานข้อมูลงานสืบสวนกลาง — ลิงก์นี้ใช้พิจารณาได้ครั้งเดียว
        </p>
      </div>
    </div>
  );
}
