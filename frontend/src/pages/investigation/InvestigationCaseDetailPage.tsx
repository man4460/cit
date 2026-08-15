import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFormJson, apiJson } from "../../api/client";
import { Modal, ModalFormActions, ModalFormBody, ModalFormSection } from "../../components/Modal";
import { PageHeaderBar } from "../../components/PageHeaderBar";
import { useAuth } from "../../context/AuthContext";
import {
  CASE_EVENT_LABEL_TH,
  DECISION_LABEL_TH,
  DOCUMENT_KIND_LABEL_TH,
  ISSUE_STATUS_LABEL_TH,
  ISSUE_STATUS_TONE,
  ORG_ROLE_LABEL_TH,
  PRIORITY_LABEL_TH,
  STAGE_LABEL_TH,
  STATUS_LABEL_TH,
  STATUS_TONE,
  isActiveCaseStatus,
} from "../../lib/investigationLabels";
import { mediaUrl, toolbarLinkBtnClass, toolbarPrimaryBtnClass } from "../../lib/uiTokens";
import type {
  InvestigationApproval,
  InvestigationCaseDetail,
  InvestigationDocument,
  InvestigationDocumentKind,
  InvestigationIssue,
  InvestigationIssueStatus,
  InvestigationMember,
} from "../../types";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type IssueForm = {
  title: string;
  detail: string;
  status: InvestigationIssueStatus;
  assigneeMemberId: string;
  dueAt: string;
  finding: string;
};

function emptyIssueForm(): IssueForm {
  return { title: "", detail: "", status: "OPEN", assigneeMemberId: "", dueAt: "", finding: "" };
}

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[1.25rem] border border-[#e8e6fc] bg-white/90 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-black text-[#1e1b4b]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function InvestigationCaseDetailPage() {
  const { caseId = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [row, setRow] = useState<InvestigationCaseDetail | null>(null);
  const [members, setMembers] = useState<InvestigationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<InvestigationIssue | null>(null);
  const [issueForm, setIssueForm] = useState<IssueForm>(emptyIssueForm);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadKind, setUploadKind] = useState<InvestigationDocumentKind>("EVIDENCE");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadIssueId, setUploadIssueId] = useState("");
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);

  const [reportOpen, setReportOpen] = useState(false);
  const [conclusion, setConclusion] = useState("");
  const [recommendation, setRecommendation] = useState("");

  const [decideOn, setDecideOn] = useState<InvestigationApproval | null>(null);
  const [decideComment, setDecideComment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [detail, memberRows] = await Promise.all([
        apiJson<InvestigationCaseDetail>(`/api/investigation/cases/${caseId}`),
        apiJson<InvestigationMember[]>("/api/investigation/members"),
      ]);
      setRow(detail);
      setMembers(memberRows);
      setConclusion(detail.conclusion ?? "");
      setRecommendation(detail.recommendation ?? "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดคดีไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stageApprovals = useMemo(() => {
    if (!row) return [] as InvestigationApproval[];
    const stage = row.approvalStage;
    if (!stage) {
      // ไม่มีสายค้าง — แสดงสายล่าสุดที่ตัดสินไปแล้ว
      const decided = row.approvals.filter((a) => a.decision !== "PENDING");
      if (!decided.length) return [];
      const lastStage = decided[decided.length - 1].stage;
      return row.approvals.filter((a) => a.stage === lastStage);
    }
    return row.approvals.filter((a) => a.stage === stage);
  }, [row]);

  /** ขั้นที่ถึงคิวพิจารณาตอนนี้ */
  const currentApproval = useMemo(
    () => stageApprovals.find((a) => a.decision === "PENDING") ?? null,
    [stageApprovals],
  );

  const canDecide = useMemo(() => {
    if (!currentApproval) return false;
    if (user?.role === "ADMIN") return true;
    const mine = members.find((m) => m.userId && m.userId === user?.id);
    return Boolean(mine && currentApproval.approverMemberId === mine.id);
  }, [currentApproval, members, user]);

  const slaBreached = useMemo(() => {
    if (!row?.slaDueAt) return false;
    if (!isActiveCaseStatus(row.status)) return false;
    return new Date(row.slaDueAt).getTime() < Date.now();
  }, [row]);

  async function runAction(fn: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : fallback);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitForApproval() {
    if (!row) return;
    if (!confirm(`เสนอขออนุมัติเปิดคดี ${row.caseNumber} ตามสายงาน ?`)) return;
    await runAction(
      () => apiJson(`/api/investigation/cases/${row.id}/submit`, { method: "POST", body: "{}" }),
      "เสนอขออนุมัติไม่สำเร็จ",
    );
  }

  async function archiveCase() {
    if (!row) return;
    if (!confirm(`จัดเก็บคดี ${row.caseNumber} เข้าคลัง ?`)) return;
    await runAction(
      () => apiJson(`/api/investigation/cases/${row.id}/archive`, { method: "POST", body: "{}" }),
      "จัดเก็บไม่สำเร็จ",
    );
  }

  async function setStatus(status: InvestigationCaseDetail["status"]) {
    if (!row) return;
    await runAction(
      () =>
        apiJson(`/api/investigation/cases/${row.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }),
      "เปลี่ยนสถานะไม่สำเร็จ",
    );
  }

  async function submitReport(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    if (!conclusion.trim()) {
      setErr("กรอกผลสรุปการสืบสวน");
      return;
    }
    const ok = await runAction(
      () =>
        apiJson(`/api/investigation/cases/${row.id}/report/submit`, {
          method: "POST",
          body: JSON.stringify({ conclusion: conclusion.trim(), recommendation: recommendation.trim() || null }),
        }),
      "ส่งรายงานไม่สำเร็จ",
    );
    if (ok) setReportOpen(false);
  }

  async function decide(decision: "APPROVED" | "REJECTED") {
    if (!row || !decideOn) return;
    const ok = await runAction(
      () =>
        apiJson(`/api/investigation/cases/${row.id}/approvals/${decideOn.id}/decide`, {
          method: "POST",
          body: JSON.stringify({ decision, comment: decideComment.trim() || null }),
        }),
      "บันทึกผลพิจารณาไม่สำเร็จ",
    );
    if (ok) {
      setDecideOn(null);
      setDecideComment("");
    }
  }

  function openCreateIssue() {
    setEditingIssue(null);
    setIssueForm(emptyIssueForm());
    setIssueModalOpen(true);
    setErr(null);
  }

  function openEditIssue(i: InvestigationIssue) {
    setEditingIssue(i);
    setIssueForm({
      title: i.title,
      detail: i.detail ?? "",
      status: i.status,
      assigneeMemberId: i.assigneeMemberId ?? "",
      dueAt: toDateInput(i.dueAt),
      finding: i.finding ?? "",
    });
    setIssueModalOpen(true);
    setErr(null);
  }

  async function submitIssue(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    const title = issueForm.title.trim();
    if (!title) {
      setErr("กรอกชื่อประเด็น");
      return;
    }
    const body = {
      title,
      detail: issueForm.detail.trim() || null,
      status: issueForm.status,
      assigneeMemberId: issueForm.assigneeMemberId || null,
      dueAt: issueForm.dueAt || null,
      finding: issueForm.finding.trim() || null,
    };
    const ok = await runAction(
      () =>
        editingIssue
          ? apiJson(`/api/investigation/cases/${row.id}/issues/${editingIssue.id}`, {
              method: "PATCH",
              body: JSON.stringify(body),
            })
          : apiJson(`/api/investigation/cases/${row.id}/issues`, {
              method: "POST",
              body: JSON.stringify(body),
            }),
      "บันทึกประเด็นไม่สำเร็จ",
    );
    if (ok) {
      setIssueModalOpen(false);
      setEditingIssue(null);
    }
  }

  async function removeIssue(i: InvestigationIssue) {
    if (!row) return;
    if (!confirm(`ลบประเด็น «${i.title}» ?`)) return;
    await runAction(
      () => apiJson(`/api/investigation/cases/${row.id}/issues/${i.id}`, { method: "DELETE" }),
      "ลบประเด็นไม่สำเร็จ",
    );
  }

  async function uploadDocs(e: React.FormEvent) {
    e.preventDefault();
    if (!row || !uploadFiles?.length) {
      setErr("ยังไม่ได้เลือกไฟล์");
      return;
    }
    const fd = new FormData();
    for (const f of Array.from(uploadFiles)) fd.append("files", f);
    fd.append("kind", uploadKind);
    if (uploadTitle.trim()) fd.append("title", uploadTitle.trim());
    if (uploadIssueId) fd.append("issueId", uploadIssueId);
    const ok = await runAction(
      () => apiFormJson(`/api/investigation/cases/${row.id}/documents`, fd),
      "อัปโหลดไม่สำเร็จ",
    );
    if (ok) {
      setUploadOpen(false);
      setUploadFiles(null);
      setUploadTitle("");
      setUploadIssueId("");
    }
  }

  async function removeDoc(d: InvestigationDocument) {
    if (!row) return;
    if (!confirm(`ลบเอกสาร «${d.originalName ?? d.storedFilename}» ?`)) return;
    await runAction(
      () => apiJson(`/api/investigation/cases/${row.id}/documents/${d.id}`, { method: "DELETE" }),
      "ลบเอกสารไม่สำเร็จ",
    );
  }

  async function removeCase() {
    if (!row) return;
    if (!confirm(`ลบคดี ${row.caseNumber} พร้อมประเด็นและเอกสารทั้งหมด ?`)) return;
    setBusy(true);
    try {
      await apiJson(`/api/investigation/cases/${row.id}`, { method: "DELETE" });
      navigate("/investigation/cases");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ลบคดีไม่สำเร็จ");
      setBusy(false);
    }
  }

  if (loading && !row) {
    return <p className="mt-8 text-center text-sm text-slate-600">กำลังโหลด…</p>;
  }

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

  const canSubmit = row.status === "DRAFT" || row.status === "REJECTED";
  const canWork = row.status === "OPEN" || row.status === "IN_PROGRESS" || row.status === "PENDING_EXTERNAL";
  const priority = (row.priority === 1 || row.priority === 3 ? row.priority : 2) as 1 | 2 | 3;

  return (
    <div>
      <PageHeaderBar
        title={row.caseNumber}
        subtitle={
          <span className="text-slate-600">
            {row.title} · {row.category?.name ?? "—"}
            {row.team ? ` · ${row.team.name}` : ""}
          </span>
        }
        count={row.issues.length}
        filter={{ value: "", onChange: () => {}, showSearch: false, printTitle: `คดี ${row.caseNumber}` }}
        extras={
          <>
            <Link to="/investigation/cases" className={toolbarLinkBtnClass}>
              ทะเบียนคดี
            </Link>
            <Link to={`/investigation/cases/${row.id}/report`} className={toolbarLinkBtnClass}>
              รายงาน A4
            </Link>
          </>
        }
        primary={
          canSubmit ? (
            <button type="button" disabled={busy} onClick={() => void submitForApproval()} className={toolbarPrimaryBtnClass}>
              เสนอขออนุมัติ
            </button>
          ) : canWork ? (
            <button type="button" disabled={busy} onClick={() => setReportOpen(true)} className={toolbarPrimaryBtnClass}>
              ส่งรายงานสรุป
            </button>
          ) : row.status === "CLOSED" ? (
            <button type="button" disabled={busy} onClick={() => void archiveCase()} className={toolbarPrimaryBtnClass}>
              จัดเก็บคดี
            </button>
          ) : undefined
        }
      />

      {err ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${STATUS_TONE[row.status]}`}>
          {STATUS_LABEL_TH[row.status]}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">
          ความสำคัญ {PRIORITY_LABEL_TH[priority]}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">
          SLA {fmtDate(row.slaDueAt)}
        </span>
        {slaBreached ? (
          <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-black text-rose-700 ring-1 ring-rose-200">
            เกิน SLA
          </span>
        ) : null}
        {canWork ? (
          <span className="ml-auto flex flex-wrap gap-1.5">
            {row.status !== "IN_PROGRESS" ? (
              <button
                type="button"
                disabled={busy}
                className={toolbarLinkBtnClass}
                onClick={() => void setStatus("IN_PROGRESS")}
              >
                เริ่มสืบสวน
              </button>
            ) : null}
            {row.status !== "PENDING_EXTERNAL" ? (
              <button
                type="button"
                disabled={busy}
                className={toolbarLinkBtnClass}
                onClick={() => void setStatus("PENDING_EXTERNAL")}
              >
                รอหน่วยงานภายนอก
              </button>
            ) : null}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <SectionCard title="ข้อมูลคดี">
            <dl className="grid gap-x-4 gap-y-2 text-[12px] sm:grid-cols-2">
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">แฟ้มคดี</dt>
                <dd className="text-[#2e2a58]">
                  {row.category?.code ? (
                    <span className="mr-1 font-mono text-[10px] text-slate-400">{row.category.code}</span>
                  ) : null}
                  {row.category?.name ?? "—"}
                  {row.subCategory ? (
                    <span className="block text-[11px] font-normal text-slate-500">› {row.subCategory.name}</span>
                  ) : null}
                  {row.category?.nameEn ? (
                    <span className="block text-[10px] font-normal text-slate-400">{row.category.nameEn}</span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">ทีมรับผิดชอบ</dt>
                <dd className="text-[#2e2a58]">{row.team?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">หัวหน้าคดี</dt>
                <dd className="text-[#2e2a58]">
                  {row.leadMember ? `${ORG_ROLE_LABEL_TH[row.leadMember.orgRole]} ${row.leadMember.fullName}` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">ผู้เสนอ</dt>
                <dd className="text-[#2e2a58]">{row.requestedByMember?.fullName ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">วันเปิดคดี</dt>
                <dd className="text-[#2e2a58]">{fmtDate(row.openedAt)}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">วันปิดคดี</dt>
                <dd className="text-[#2e2a58]">{fmtDate(row.closedAt)}</dd>
              </div>
            </dl>
            {row.summary?.trim() ? (
              <p className="mt-3 whitespace-pre-wrap rounded-xl bg-[#faf9ff] p-3 text-[12px] leading-relaxed text-slate-700">
                {row.summary}
              </p>
            ) : null}
            {row.conclusion?.trim() ? (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-emerald-800">ผลสรุปการสืบสวน</p>
                <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-800">{row.conclusion}</p>
                {row.recommendation?.trim() ? (
                  <>
                    <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-emerald-800">ข้อเสนอแนะ</p>
                    <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-800">
                      {row.recommendation}
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            title={`ประเด็นย่อย (${row.issues.length})`}
            action={
              <button type="button" className={toolbarLinkBtnClass} onClick={openCreateIssue} disabled={busy}>
                เพิ่มประเด็น
              </button>
            }
          >
            {row.issues.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#dcd8f0] px-3 py-6 text-center text-xs text-slate-600">
                ยังไม่มีประเด็นย่อย
              </p>
            ) : (
              <ul className="space-y-2">
                {row.issues.map((i) => (
                  <li key={i.id} className="rounded-xl border border-[#ecebff] bg-[#faf9ff] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-black ring-1 ${ISSUE_STATUS_TONE[i.status]}`}
                          >
                            {ISSUE_STATUS_LABEL_TH[i.status]}
                          </span>
                          {i.dueAt ? (
                            <span className="text-[10px] font-bold text-slate-500">ครบ {fmtDate(i.dueAt)}</span>
                          ) : null}
                          {i.assignee ? (
                            <span className="text-[10px] text-slate-500">· {i.assignee.fullName}</span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[13px] font-semibold text-[#1e1b3a]">{i.title}</p>
                        {i.detail?.trim() ? (
                          <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-600">
                            {i.detail}
                          </p>
                        ) : null}
                        {i.finding?.trim() ? (
                          <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-white px-2 py-1.5 text-[11px] leading-relaxed text-slate-800">
                            <span className="font-bold text-emerald-700">ผลการสืบสวน: </span>
                            {i.finding}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          className="text-[10px] font-bold text-[#4d47b6] hover:underline"
                          onClick={() => openEditIssue(i)}
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          className="text-[10px] font-bold text-rose-600 hover:underline"
                          onClick={() => void removeIssue(i)}
                        >
                          ลบ
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title={`เอกสารแนบ (${row.documents.length})`}
            action={
              <button type="button" className={toolbarLinkBtnClass} onClick={() => setUploadOpen(true)} disabled={busy}>
                แนบเอกสาร
              </button>
            }
          >
            {row.documents.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#dcd8f0] px-3 py-6 text-center text-xs text-slate-600">
                ยังไม่มีเอกสารแนบ
              </p>
            ) : (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {row.documents.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[#ecebff] bg-[#faf9ff] px-2.5 py-1.5"
                  >
                    <a
                      href={mediaUrl(d.fileUrl) ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 truncate text-[11px] text-[#2e2a58] hover:underline"
                    >
                      <span className="mr-1 rounded bg-[#0000BF]/10 px-1 py-0.5 text-[9px] font-black text-[#0000BF]">
                        {DOCUMENT_KIND_LABEL_TH[d.kind]}
                      </span>
                      {d.title || d.originalName || d.storedFilename}
                    </a>
                    <button
                      type="button"
                      className="shrink-0 text-[10px] font-bold text-rose-600 hover:underline"
                      onClick={() => void removeDoc(d)}
                    >
                      ลบ
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title={row.approvalStage ? STAGE_LABEL_TH[row.approvalStage] : "สายอนุมัติ"}>
            {stageApprovals.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#dcd8f0] px-3 py-6 text-center text-xs text-slate-600">
                ยังไม่ได้เสนอเรื่อง
              </p>
            ) : (
              <ol className="space-y-2">
                {stageApprovals.map((a) => {
                  const isCurrent = currentApproval?.id === a.id;
                  return (
                    <li
                      key={a.id}
                      className={`rounded-xl border p-2.5 ${
                        isCurrent ? "border-amber-300 bg-amber-50" : "border-[#ecebff] bg-[#faf9ff]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-[#2e2a58]">
                          {a.sequence}. {ORG_ROLE_LABEL_TH[a.orgRole]} {a.approverName ?? "—"}
                        </span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black ${
                            a.decision === "APPROVED"
                              ? "bg-emerald-100 text-emerald-800"
                              : a.decision === "REJECTED"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {DECISION_LABEL_TH[a.decision]}
                        </span>
                      </div>
                      {a.comment?.trim() ? (
                        <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-700">
                          ความเห็น: {a.comment}
                        </p>
                      ) : null}
                      {a.decidedAt ? (
                        <p className="mt-0.5 text-[10px] text-slate-500">{fmtDateTime(a.decidedAt)}</p>
                      ) : a.notifiedAt ? (
                        <p className="mt-0.5 text-[10px] text-slate-500">ส่งลิงก์แล้ว {fmtDateTime(a.notifiedAt)}</p>
                      ) : null}
                      {isCurrent && canDecide ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="mt-2 w-full rounded-lg bg-[#0000BF] px-2 py-1.5 text-[11px] font-black text-white hover:bg-[#0000a3] disabled:opacity-50"
                          onClick={() => {
                            setDecideOn(a);
                            setDecideComment("");
                          }}
                        >
                          พิจารณาเรื่องนี้
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </SectionCard>

          <SectionCard title="ไทม์ไลน์">
            {row.events.length === 0 ? (
              <p className="text-xs text-slate-600">ยังไม่มีความเคลื่อนไหว</p>
            ) : (
              <ol className="space-y-2 border-l border-[#e8e6fc] pl-3">
                {row.events.map((ev) => (
                  <li key={ev.id} className="relative">
                    <span className="absolute -left-[1.05rem] top-1.5 h-1.5 w-1.5 rounded-full bg-[#8b5cf6]" />
                    <p className="text-[11px] font-bold text-[#2e2a58]">
                      {CASE_EVENT_LABEL_TH[ev.type] ?? ev.type}
                    </p>
                    <p className="text-[11px] leading-relaxed text-slate-700">{ev.message}</p>
                    <p className="text-[10px] text-slate-500">
                      {fmtDateTime(ev.createdAt)}
                      {ev.actorName ? ` · ${ev.actorName}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>

          <button
            type="button"
            disabled={busy}
            className="w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100 disabled:opacity-50"
            onClick={() => void removeCase()}
          >
            ลบคดีนี้
          </button>
        </div>
      </div>

      <Modal
        open={issueModalOpen}
        onClose={() => !busy && setIssueModalOpen(false)}
        title={editingIssue ? "แก้ไขประเด็นย่อย" : "เพิ่มประเด็นย่อย"}
        size="wide"
      >
        <form onSubmit={(e) => void submitIssue(e)}>
          <ModalFormBody>
            {err ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</p>
            ) : null}
            <ModalFormSection title="ประเด็น">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">
                    ชื่อประเด็น <span className="text-rose-500">*</span>
                  </span>
                  <input
                    required
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={issueForm.title}
                    onChange={(e) => setIssueForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">สถานะ</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={issueForm.status}
                    onChange={(e) =>
                      setIssueForm((f) => ({ ...f, status: e.target.value as InvestigationIssueStatus }))
                    }
                  >
                    {(Object.keys(ISSUE_STATUS_LABEL_TH) as InvestigationIssueStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {ISSUE_STATUS_LABEL_TH[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">ผู้รับผิดชอบ</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={issueForm.assigneeMemberId}
                    onChange={(e) => setIssueForm((f) => ({ ...f, assigneeMemberId: e.target.value }))}
                  >
                    <option value="">— ยังไม่ระบุ —</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {ORG_ROLE_LABEL_TH[m.orgRole]} {m.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">ครบกำหนด</span>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={issueForm.dueAt}
                    onChange={(e) => setIssueForm((f) => ({ ...f, dueAt: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">รายละเอียด</span>
                  <textarea
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={issueForm.detail}
                    onChange={(e) => setIssueForm((f) => ({ ...f, detail: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">ผลการสืบสวน</span>
                  <textarea
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={issueForm.finding}
                    onChange={(e) => setIssueForm((f) => ({ ...f, finding: e.target.value }))}
                  />
                </label>
              </div>
            </ModalFormSection>
          </ModalFormBody>
          <ModalFormActions>
            <button
              type="submit"
              disabled={busy}
              className={`rounded-full px-4 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 disabled:opacity-50 bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899]`}
            >
              {busy ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => setIssueModalOpen(false)}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      <Modal open={uploadOpen} onClose={() => !busy && setUploadOpen(false)} title="แนบเอกสารเข้าคดี">
        <form onSubmit={(e) => void uploadDocs(e)}>
          <ModalFormBody>
            {err ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</p>
            ) : null}
            <ModalFormSection title="ไฟล์">
              <div className="grid gap-4">
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">ประเภทเอกสาร</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={uploadKind}
                    onChange={(e) => setUploadKind(e.target.value as InvestigationDocumentKind)}
                  >
                    {(Object.keys(DOCUMENT_KIND_LABEL_TH) as InvestigationDocumentKind[]).map((k) => (
                      <option key={k} value={k}>
                        {DOCUMENT_KIND_LABEL_TH[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">ผูกกับประเด็นย่อย</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={uploadIssueId}
                    onChange={(e) => setUploadIssueId(e.target.value)}
                  >
                    <option value="">— ระดับคดี —</option>
                    {row.issues.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">ชื่อเรียกเอกสาร</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">
                    เลือกไฟล์ <span className="text-rose-500">*</span>
                  </span>
                  <input
                    type="file"
                    multiple
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    onChange={(e) => setUploadFiles(e.target.files)}
                  />
                  <span className="mt-1 block text-[11px] text-slate-500">
                    รูป PDF Word Excel PowerPoint · สูงสุด 24 ไฟล์
                  </span>
                </label>
              </div>
            </ModalFormSection>
          </ModalFormBody>
          <ModalFormActions>
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 disabled:opacity-50"
            >
              {busy ? "กำลังอัปโหลด…" : "อัปโหลด"}
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => setUploadOpen(false)}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      <Modal
        open={reportOpen}
        onClose={() => !busy && setReportOpen(false)}
        title="ส่งรายงานสรุปเพื่อพิจารณาปิดคดี"
        size="wide"
      >
        <form onSubmit={(e) => void submitReport(e)}>
          <ModalFormBody>
            {err ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</p>
            ) : null}
            <ModalFormSection title="สรุปผล">
              <div className="grid gap-4">
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">
                    ผลสรุปการสืบสวน <span className="text-rose-500">*</span>
                  </span>
                  <textarea
                    required
                    rows={6}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={conclusion}
                    onChange={(e) => setConclusion(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">ข้อเสนอแนะ</span>
                  <textarea
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={recommendation}
                    onChange={(e) => setRecommendation(e.target.value)}
                  />
                </label>
                <p className="rounded-xl bg-[#faf9ff] px-3 py-2 text-[11px] text-slate-600">
                  เมื่อส่ง ระบบจะเสนอตามสายงานตั้งแต่ ผช.ผอ. ขึ้นไปจนถึง ผอ. และส่งลิงก์พิจารณาทางอีเมล
                </p>
              </div>
            </ModalFormSection>
          </ModalFormBody>
          <ModalFormActions>
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 disabled:opacity-50"
            >
              {busy ? "กำลังส่ง…" : "ส่งรายงาน"}
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => setReportOpen(false)}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      <Modal
        open={Boolean(decideOn)}
        onClose={() => !busy && setDecideOn(null)}
        title={`พิจารณา — ${decideOn ? ORG_ROLE_LABEL_TH[decideOn.orgRole] : ""} ${decideOn?.approverName ?? ""}`}
      >
        <ModalFormBody>
          {err ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</p>
          ) : null}
          <ModalFormSection title={decideOn ? STAGE_LABEL_TH[decideOn.stage] : "พิจารณา"}>
            <p className="text-[12px] text-slate-700">
              {row.caseNumber} — {row.title}
            </p>
            <label className="mt-3 block">
              <span className="text-xs font-medium text-slate-700">ความเห็น</span>
              <textarea
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={decideComment}
                onChange={(e) => setDecideComment(e.target.value)}
              />
            </label>
          </ModalFormSection>
        </ModalFormBody>
        <ModalFormActions>
          <button
            type="button"
            disabled={busy}
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            onClick={() => void decide("APPROVED")}
          >
            เห็นชอบ ส่งต่อ
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-100 disabled:opacity-50"
            onClick={() => void decide("REJECTED")}
          >
            ไม่อนุมัติ
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            onClick={() => setDecideOn(null)}
          >
            ปิด
          </button>
        </ModalFormActions>
      </Modal>
    </div>
  );
}
