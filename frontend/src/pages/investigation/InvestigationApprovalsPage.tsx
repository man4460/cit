import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../../api/client";
import { Modal, ModalFormActions, ModalFormBody, ModalFormSection } from "../../components/Modal";
import { PageHeaderBar } from "../../components/PageHeaderBar";
import { useAuth } from "../../context/AuthContext";
import type { LoadOptions } from "../../lib/loadOptions";
import { setLoadBusy } from "../../lib/loadOptions";
import {
  ORG_ROLE_LABEL_TH,
  PRIORITY_LABEL_TH,
  STAGE_LABEL_TH,
  STATUS_LABEL_TH,
  STATUS_TONE,
} from "../../lib/investigationLabels";
import { rowMatchesFilter } from "../../lib/searchNormalize";
import {
  listCardAccentClass,
  listCardClass,
  toolbarLinkBtnClass,
} from "../../lib/uiTokens";
import type { InvestigationApproval } from "../../types";

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

export function InvestigationApprovalsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<InvestigationApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [decideOn, setDecideOn] = useState<InvestigationApproval | null>(null);
  const [comment, setComment] = useState("");

  const load = useCallback(async (opts?: LoadOptions) => {
    setLoadBusy(setLoading, opts, true);
    setErr(null);
    try {
      const data = await apiJson<InvestigationApproval[]>("/api/investigation/approvals/inbox");
      setRows(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดกล่องงานไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      rows.filter((a) =>
        rowMatchesFilter(listFilter, [
          a.case?.caseNumber,
          a.case?.title,
          a.case?.category?.name,
          a.approverName,
          STAGE_LABEL_TH[a.stage],
        ]),
      ),
    [rows, listFilter],
  );

  async function decide(decision: "APPROVED" | "REJECTED") {
    if (!decideOn?.case) return;
    setBusy(true);
    setErr(null);
    try {
      await apiJson(`/api/investigation/cases/${decideOn.caseId}/approvals/${decideOn.id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision, comment: comment.trim() || null }),
      });
      setDecideOn(null);
      setComment("");
      await load({ silent: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกผลพิจารณาไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeaderBar
        title="เรื่องรอพิจารณา"
        count={filtered.length}
        subtitle={
          user?.role === "ADMIN" ? (
            <span className="text-slate-600">ผู้ดูแลระบบเห็นทุกเรื่องที่ค้างพิจารณา</span>
          ) : undefined
        }
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "เรื่องรอพิจารณาอนุมัติ",
          placeholder: "กรองเลขคดี / ชื่อเรื่อง…",
        }}
        extras={
          <>
            <Link to="/investigation" className={toolbarLinkBtnClass}>
              แดชบอร์ด
            </Link>
            <Link to="/investigation/cases" className={toolbarLinkBtnClass}>
              ทะเบียนคดี
            </Link>
          </>
        }
      />

      {err ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</p>
      ) : null}

      <div className="mt-4">
        {loading ? (
          <div className="rounded-xl border border-dashed border-[#dcd8f0] px-4 py-10 text-center text-slate-600">
            กำลังโหลด…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#dcd8f0] px-4 py-10 text-center text-slate-600">
            {rows.length === 0
              ? "ไม่มีเรื่องรอพิจารณา — ถ้าคุณควรอยู่ในสายอนุมัติ ให้ผูกบัญชีผู้ใช้ในหน้าทีมสืบสวน"
              : "ไม่มีรายการที่ตรงกับการกรอง"}
          </div>
        ) : (
          <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((a, idx) => {
              const c = a.case;
              const priority = (c?.priority === 1 || c?.priority === 3 ? c.priority : 2) as 1 | 2 | 3;
              return (
                <li key={a.id}>
                  <div className={`${listCardClass} min-h-[9rem] p-3`}>
                    <span className={`absolute inset-y-0 left-0 w-1 ${listCardAccentClass(idx)}`} aria-hidden />
                    <div className="min-w-0 flex-1 pl-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[10px] font-bold text-slate-500">
                          {c?.caseNumber ?? "—"}
                        </span>
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800">
                          {STAGE_LABEL_TH[a.stage]}
                        </span>
                        {c ? (
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 ${STATUS_TONE[c.status]}`}>
                            {STATUS_LABEL_TH[c.status]}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-[#1e1b3a]">
                        {c?.title ?? "—"}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-[#4d47b6]">
                        {c?.category?.name ?? "—"}
                        {c?.team ? ` · ${c.team.name}` : ""}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-600">
                        ขั้นที่ {a.sequence} · {ORG_ROLE_LABEL_TH[a.orgRole]} {a.approverName ?? "—"} · ความสำคัญ{" "}
                        {PRIORITY_LABEL_TH[priority]}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">เสนอเมื่อ {fmtDateTime(a.createdAt)}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-[#ecebff] pt-2 pl-2">
                      <button
                        type="button"
                        className="rounded-lg bg-[#0000BF] px-2.5 py-1 text-xs font-bold text-white hover:bg-[#0000a3]"
                        onClick={() => {
                          setDecideOn(a);
                          setComment("");
                          setErr(null);
                        }}
                      >
                        พิจารณา
                      </button>
                      <Link
                        to={`/investigation/cases/${a.caseId}`}
                        className="rounded-lg border border-[#dcd8f0] bg-white px-2.5 py-1 text-xs font-medium text-[#2e2a58] hover:bg-[#0000BF]/5"
                      >
                        เปิดสำนวน
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal
        open={Boolean(decideOn)}
        onClose={() => !busy && setDecideOn(null)}
        title={decideOn ? STAGE_LABEL_TH[decideOn.stage] : "พิจารณา"}
      >
        <ModalFormBody>
          {err ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</p>
          ) : null}
          <ModalFormSection title="รายละเอียดเรื่อง">
            <p className="text-[12px] font-semibold text-[#1e1b3a]">
              {decideOn?.case?.caseNumber} — {decideOn?.case?.title}
            </p>
            {decideOn?.case?.summary?.trim() ? (
              <p className="mt-2 whitespace-pre-wrap rounded-xl bg-[#faf9ff] p-3 text-[12px] leading-relaxed text-slate-700">
                {decideOn.case.summary}
              </p>
            ) : null}
            {decideOn?.case?.conclusion?.trim() ? (
              <p className="mt-2 whitespace-pre-wrap rounded-xl bg-emerald-50 p-3 text-[12px] leading-relaxed text-slate-800">
                <span className="font-bold text-emerald-800">ผลสรุป: </span>
                {decideOn.case.conclusion}
              </p>
            ) : null}
            <label className="mt-3 block">
              <span className="text-xs font-medium text-slate-700">ความเห็น</span>
              <textarea
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
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
