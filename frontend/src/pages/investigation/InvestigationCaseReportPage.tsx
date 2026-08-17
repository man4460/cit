import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiJson } from "../../api/client";
import type { LoadOptions } from "../../lib/loadOptions";
import { setLoadBusy } from "../../lib/loadOptions";
import {
  DECISION_LABEL_TH,
  DOCUMENT_KIND_LABEL_TH,
  ISSUE_STATUS_LABEL_TH,
  ORG_ROLE_LABEL_TH,
  PRIORITY_LABEL_TH,
  STAGE_LABEL_TH,
  STATUS_LABEL_TH,
} from "../../lib/investigationLabels";
import { toolbarLinkBtnClass, toolbarPrimaryBtnClass } from "../../lib/uiTokens";
import type { InvestigationApprovalStage, InvestigationCaseDetail } from "../../types";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-b border-slate-200 py-1 print:border-gray-400">
      <p className="text-[9pt] font-bold text-slate-500 print:text-black">{label}</p>
      <p className="text-[10pt] text-slate-900 print:text-black">{value}</p>
    </div>
  );
}

export function InvestigationCaseReportPage() {
  const { caseId = "" } = useParams();
  const [row, setRow] = useState<InvestigationCaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (opts?: LoadOptions) => {
    setLoadBusy(setLoading, opts, true);
    setErr(null);
    try {
      setRow(await apiJson<InvestigationCaseDetail>(`/api/investigation/cases/${caseId}`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดคดีไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !row) return <p className="mt-8 text-center text-sm text-slate-600">กำลังโหลด…</p>;

  if (!row) {
    return (
      <div className="mt-8 text-center">
        <p className="text-sm text-slate-600">{err ?? "ไม่พบคดี"}</p>
        <Link to="/investigation/cases" className="mt-3 inline-block text-sm font-bold text-[#4d47b6] hover:underline">
          กลับทะเบียนคดี
        </Link>
      </div>
    );
  }

  const priority = (row.priority === 1 || row.priority === 3 ? row.priority : 2) as 1 | 2 | 3;
  const stages = Array.from(new Set(row.approvals.map((a) => a.stage))) as InvestigationApprovalStage[];

  return (
    <div className="investigation-report-print">
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link to={`/investigation/cases/${row.id}`} className={toolbarLinkBtnClass}>
          กลับสำนวนคดี
        </Link>
        <Link to="/investigation/cases" className={toolbarLinkBtnClass}>
          ทะเบียนคดี
        </Link>
        <button type="button" onClick={() => window.print()} className={`${toolbarPrimaryBtnClass} ml-auto`}>
          พิมพ์ A4
        </button>
      </div>

      <article className="mx-auto max-w-[210mm] rounded-2xl border border-[#e8e6fc] bg-white p-8 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="border-b-2 border-[#0000BF] pb-3 text-center print:border-black">
          <h1 className="text-[16pt] font-black text-[#1e1b4b] print:text-black">รายงานผลการสืบสวน</h1>
          <p className="mt-1 text-[11pt] font-bold text-slate-700 print:text-black">
            {row.caseNumber} — {row.title}
          </p>
          <p className="mt-0.5 text-[9pt] text-slate-500 print:text-black">
            {row.category?.name ?? "—"}
            {row.team ? ` · ${row.team.name}` : ""} · สถานะ {STATUS_LABEL_TH[row.status]}
          </p>
        </header>

        <section className="mt-4">
          <h2 className="text-[11pt] font-black text-[#1e1b4b] print:text-black">๑. ข้อมูลคดี</h2>
          <div className="mt-1 grid gap-x-6 sm:grid-cols-2">
            <Field label="เลขคดี" value={row.caseNumber} />
            <Field
              label="แฟ้มคดี"
              value={
                row.category
                  ? `${row.category.name}${row.category.nameEn ? ` (${row.category.nameEn})` : ""}`
                  : "—"
              }
            />
            <Field label="หมวดย่อย" value={row.subCategory?.name ?? "—"} />
            <Field label="ทีมรับผิดชอบ" value={row.team?.name ?? "—"} />
            <Field
              label="หัวหน้าคดี"
              value={row.leadMember ? `${ORG_ROLE_LABEL_TH[row.leadMember.orgRole]} ${row.leadMember.fullName}` : "—"}
            />
            <Field label="ผู้เสนอเปิดคดี" value={row.requestedByMember?.fullName ?? "—"} />
            <Field label="ระดับความสำคัญ" value={PRIORITY_LABEL_TH[priority]} />
            <Field label="วันเปิดคดี" value={fmtDate(row.openedAt)} />
            <Field label="กำหนดแล้วเสร็จ (SLA)" value={fmtDate(row.slaDueAt)} />
            <Field label="วันอนุมัติเปิดคดี" value={fmtDate(row.approvedAt)} />
            <Field label="วันปิดคดี" value={fmtDate(row.closedAt)} />
          </div>
          {row.summary?.trim() ? (
            <div className="mt-2">
              <p className="text-[9pt] font-bold text-slate-500 print:text-black">ความเป็นมา / มูลเหตุ</p>
              <p className="mt-0.5 whitespace-pre-wrap text-[10pt] leading-relaxed text-slate-900 print:text-black">
                {row.summary}
              </p>
            </div>
          ) : null}
        </section>

        <section className="mt-5">
          <h2 className="text-[11pt] font-black text-[#1e1b4b] print:text-black">
            ๒. ประเด็นการสืบสวน ({row.issues.length})
          </h2>
          {row.issues.length === 0 ? (
            <p className="mt-1 text-[10pt] text-slate-600 print:text-black">— ไม่มีประเด็นย่อย —</p>
          ) : (
            <table className="mt-1 w-full border-collapse text-[9.5pt]">
              <thead>
                <tr className="bg-[#f3f1ff] print:bg-transparent">
                  <th className="w-8 border border-slate-300 px-1.5 py-1 text-center print:border-gray-500 print:text-black">
                    ที่
                  </th>
                  <th className="border border-slate-300 px-1.5 py-1 text-left print:border-gray-500 print:text-black">
                    ประเด็น
                  </th>
                  <th className="border border-slate-300 px-1.5 py-1 text-left print:border-gray-500 print:text-black">
                    ผลการสืบสวน
                  </th>
                  <th className="w-24 border border-slate-300 px-1.5 py-1 text-center print:border-gray-500 print:text-black">
                    สถานะ
                  </th>
                  <th className="w-28 border border-slate-300 px-1.5 py-1 text-left print:border-gray-500 print:text-black">
                    ผู้รับผิดชอบ
                  </th>
                </tr>
              </thead>
              <tbody>
                {row.issues.map((i, idx) => (
                  <tr key={i.id} className="align-top">
                    <td className="border border-slate-300 px-1.5 py-1 text-center print:border-gray-500 print:text-black">
                      {idx + 1}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-1 print:border-gray-500 print:text-black">
                      <span className="font-semibold">{i.title}</span>
                      {i.detail?.trim() ? (
                        <span className="block whitespace-pre-wrap text-[8.5pt] text-slate-600 print:text-black">
                          {i.detail}
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-pre-wrap border border-slate-300 px-1.5 py-1 print:border-gray-500 print:text-black">
                      {i.finding?.trim() || "—"}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-1 text-center print:border-gray-500 print:text-black">
                      {ISSUE_STATUS_LABEL_TH[i.status]}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-1 print:border-gray-500 print:text-black">
                      {i.assignee?.fullName ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="mt-5">
          <h2 className="text-[11pt] font-black text-[#1e1b4b] print:text-black">๓. ผลสรุปและข้อเสนอแนะ</h2>
          <p className="mt-1 text-[9pt] font-bold text-slate-500 print:text-black">ผลสรุปการสืบสวน</p>
          <p className="whitespace-pre-wrap text-[10pt] leading-relaxed text-slate-900 print:text-black">
            {row.conclusion?.trim() || "— ยังไม่ได้สรุปผล —"}
          </p>
          <p className="mt-2 text-[9pt] font-bold text-slate-500 print:text-black">ข้อเสนอแนะ</p>
          <p className="whitespace-pre-wrap text-[10pt] leading-relaxed text-slate-900 print:text-black">
            {row.recommendation?.trim() || "—"}
          </p>
        </section>

        <section className="mt-5">
          <h2 className="text-[11pt] font-black text-[#1e1b4b] print:text-black">
            ๔. เอกสารประกอบสำนวน ({row.documents.length})
          </h2>
          {row.documents.length === 0 ? (
            <p className="mt-1 text-[10pt] text-slate-600 print:text-black">— ไม่มีเอกสารแนบ —</p>
          ) : (
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[9.5pt] text-slate-900 print:text-black">
              {row.documents.map((d) => (
                <li key={d.id}>
                  [{DOCUMENT_KIND_LABEL_TH[d.kind]}] {d.title || d.originalName || d.storedFilename}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="mt-5">
          <h2 className="text-[11pt] font-black text-[#1e1b4b] print:text-black">๕. การพิจารณาตามสายงาน</h2>
          {stages.length === 0 ? (
            <p className="mt-1 text-[10pt] text-slate-600 print:text-black">— ยังไม่ได้เสนอเรื่อง —</p>
          ) : (
            stages.map((stage) => (
              <div key={stage} className="mt-2">
                <p className="text-[9.5pt] font-bold text-slate-700 print:text-black">{STAGE_LABEL_TH[stage]}</p>
                <table className="mt-1 w-full border-collapse text-[9.5pt]">
                  <thead>
                    <tr className="bg-[#f3f1ff] print:bg-transparent">
                      <th className="w-8 border border-slate-300 px-1.5 py-1 text-center print:border-gray-500 print:text-black">
                        ที่
                      </th>
                      <th className="border border-slate-300 px-1.5 py-1 text-left print:border-gray-500 print:text-black">
                        ผู้พิจารณา
                      </th>
                      <th className="w-24 border border-slate-300 px-1.5 py-1 text-center print:border-gray-500 print:text-black">
                        ผล
                      </th>
                      <th className="border border-slate-300 px-1.5 py-1 text-left print:border-gray-500 print:text-black">
                        ความเห็น
                      </th>
                      <th className="w-28 border border-slate-300 px-1.5 py-1 text-center print:border-gray-500 print:text-black">
                        วันที่
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.approvals
                      .filter((a) => a.stage === stage)
                      .map((a) => (
                        <tr key={a.id} className="align-top">
                          <td className="border border-slate-300 px-1.5 py-1 text-center print:border-gray-500 print:text-black">
                            {a.sequence}
                          </td>
                          <td className="border border-slate-300 px-1.5 py-1 print:border-gray-500 print:text-black">
                            {ORG_ROLE_LABEL_TH[a.orgRole]} {a.approverName ?? "—"}
                          </td>
                          <td className="border border-slate-300 px-1.5 py-1 text-center print:border-gray-500 print:text-black">
                            {DECISION_LABEL_TH[a.decision]}
                          </td>
                          <td className="whitespace-pre-wrap border border-slate-300 px-1.5 py-1 print:border-gray-500 print:text-black">
                            {a.comment?.trim() || "—"}
                          </td>
                          <td className="border border-slate-300 px-1.5 py-1 text-center print:border-gray-500 print:text-black">
                            {fmtDate(a.decidedAt)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </section>

        <footer className="mt-8 grid grid-cols-3 gap-6 text-center text-[9.5pt] text-slate-700 print:text-black">
          {(["INVESTIGATOR", "ASSISTANT_DIRECTOR", "DIRECTOR"] as const).map((role) => (
            <div key={role}>
              <div className="mx-auto mt-8 w-full border-b border-dotted border-slate-500 print:border-black" />
              <p className="mt-1">({ORG_ROLE_LABEL_TH[role]})</p>
              <p className="text-[8.5pt] text-slate-500 print:text-black">
                {role === "INVESTIGATOR" ? "ผู้จัดทำ" : role === "ASSISTANT_DIRECTOR" ? "ผู้ตรวจ" : "ผู้อนุมัติ"}
              </p>
            </div>
          ))}
        </footer>
      </article>
    </div>
  );
}
