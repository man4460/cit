import { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson } from "../api/client";
import { Modal, ModalFormActions, ModalFormBody } from "../components/Modal";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { PermissionMatrix, permissionSummary } from "../components/PermissionMatrix";
import { fullPermissions, type PermissionMap } from "../lib/permissions";
import { rowMatchesFilter } from "../lib/searchNormalize";

type Status = "PENDING" | "APPROVED" | "REJECTED";

type Applicant = {
  id: string;
  username: string;
  role: "ADMIN" | "OPERATOR";
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  employeeCode: string | null;
  position: string | null;
  affiliation: string | null;
  active: boolean;
  status: Status;
  permissions: PermissionMap | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectReason: string | null;
  createdAt: string;
};

const TABS: { id: Status; label: string; tone: string }[] = [
  { id: "PENDING", label: "รออนุมัติ", tone: "text-amber-700" },
  { id: "APPROVED", label: "อนุมัติแล้ว", tone: "text-emerald-700" },
  { id: "REJECTED", label: "ไม่อนุมัติ", tone: "text-rose-600" },
];

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

function displayName(a: Applicant) {
  return [a.firstName, a.lastName].filter(Boolean).join(" ") || a.fullName || a.username;
}

export function RegistrationReviewPage() {
  const [rows, setRows] = useState<Applicant[]>([]);
  const [tab, setTab] = useState<Status>("PENDING");
  const [filter, setFilter] = useState("");
  const [target, setTarget] = useState<Applicant | null>(null);
  const [role, setRole] = useState<"ADMIN" | "OPERATOR">("OPERATOR");
  const [perms, setPerms] = useState<PermissionMap>(() => fullPermissions("read"));
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const all = await apiJson<Applicant[]>("/api/admin/users", { skipCache: true });
    // เฉพาะบัญชีที่มาจากการสมัคร (มีเลขประจำตัวพนักงาน) หรือยังไม่อนุมัติ
    setRows(all.filter((u) => u.status !== "APPROVED" || u.employeeCode));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  const shown = useMemo(
    () =>
      rows
        .filter((r) => r.status === tab)
        .filter((r) => rowMatchesFilter(filter, [r.username, displayName(r), r.employeeCode, r.position, r.affiliation]))
        .sort((a, b) => (tab === "PENDING" ? a.createdAt.localeCompare(b.createdAt) : (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? ""))),
    [rows, tab, filter],
  );

  const duplicates = useMemo(() => {
    if (!target) return [];
    return rows.filter(
      (r) =>
        r.id !== target.id &&
        r.status !== "REJECTED" &&
        ((target.employeeCode && r.employeeCode === target.employeeCode) || displayName(r) === displayName(target)),
    );
  }, [rows, target]);

  function openReview(a: Applicant) {
    setTarget(a);
    setRole(a.role);
    setPerms(a.status === "APPROVED" && a.permissions ? a.permissions : fullPermissions("read"));
    setRejecting(false);
    setReason(a.rejectReason ?? "");
    setErr(null);
  }

  async function approve() {
    if (!target) return;
    setBusy(true);
    setErr(null);
    try {
      await apiJson(`/api/admin/users/${target.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ role, permissions: perms }),
      });
      setTarget(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "อนุมัติไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!target) return;
    setBusy(true);
    setErr(null);
    try {
      await apiJson(`/api/admin/users/${target.id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
      setTarget(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function remove(a: Applicant) {
    if (!confirm(`ลบคำขอของ "${displayName(a)}" ถาวร?`)) return;
    await apiJson(`/api/admin/users/${a.id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <PageHeaderBar
        title="ตรวจสอบและอนุมัติสมาชิก"
        count={shown.length}
        filter={{ value: filter, onChange: setFilter, printTitle: "คำขอสมัครสมาชิก", placeholder: "ค้นหาชื่อ / เลขประจำตัว / ตำแหน่ง / สังกัด…" }}
      />

      <div className="mt-3 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-3.5 py-1 text-[12.5px] font-bold transition ${
              tab === t.id ? "border-indigo-300 bg-indigo-50 text-[#1e1b4b]" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            {t.label} <span className={`tabular-nums ${t.tone}`}>{counts[t.id]}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white/80">
        {shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            {tab === "PENDING" ? "ไม่มีคำขอที่รออนุมัติ" : "ไม่มีรายการ"}
          </p>
        ) : (
          <table className="w-full min-w-[52rem] text-[12.5px]">
            <thead className="bg-slate-50 text-[11px] text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-bold">ชื่อ–นามสกุล</th>
                <th className="px-3 py-2 text-left font-bold">เลขประจำตัว</th>
                <th className="px-3 py-2 text-left font-bold">ตำแหน่ง</th>
                <th className="px-3 py-2 text-left font-bold">สังกัด</th>
                <th className="px-3 py-2 text-left font-bold">ชื่อผู้ใช้</th>
                <th className="px-3 py-2 text-left font-bold">{tab === "PENDING" ? "สมัครเมื่อ" : "ตรวจสอบเมื่อ / โดย"}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2 font-bold text-[#1e1b4b]">{displayName(a)}</td>
                  <td className="px-3 py-2 tabular-nums">{a.employeeCode ?? "—"}</td>
                  <td className="px-3 py-2">{a.position ?? "—"}</td>
                  <td className="px-3 py-2">{a.affiliation ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-[12px] text-slate-600">{a.username}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {tab === "PENDING" ? (
                      fmtDateTime(a.createdAt)
                    ) : (
                      <>
                        {fmtDateTime(a.reviewedAt)}
                        <span className="block text-[11px]">{a.reviewedBy ?? ""}</span>
                        {tab === "APPROVED" ? (
                          <span className="block text-[11px] text-emerald-700">{permissionSummary(a.role, a.permissions)}</span>
                        ) : a.rejectReason ? (
                          <span className="block text-[11px] text-rose-600">เหตุผล: {a.rejectReason}</span>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {tab !== "APPROVED" ? (
                      <button
                        type="button"
                        onClick={() => openReview(a)}
                        className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1 text-[12px] font-bold text-indigo-700 hover:bg-indigo-100"
                      >
                        {tab === "PENDING" ? "ตรวจสอบ / อนุมัติ" : "พิจารณาใหม่"}
                      </button>
                    ) : null}
                    {tab === "REJECTED" ? (
                      <button
                        type="button"
                        onClick={() => void remove(a)}
                        className="ml-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-[12px] font-bold text-rose-600 hover:bg-rose-100"
                      >
                        ลบ
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {tab === "APPROVED" ? (
        <p className="mt-2 text-[11.5px] text-slate-500">แก้ไขสิทธิ์ของผู้ที่อนุมัติแล้วได้ที่เมนู "จัดการผู้ใช้"</p>
      ) : null}

      <Modal open={Boolean(target)} onClose={() => setTarget(null)} size="wide" title={target ? `ตรวจสอบคำขอ — ${displayName(target)}` : ""}>
        {target ? (
          <ModalFormBody>
            {err ? <p className="text-sm text-rose-600">{err}</p> : null}
            <div className="grid gap-x-6 gap-y-1.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-[12.5px] sm:grid-cols-2">
              <Info label="ชื่อ" value={target.firstName} />
              <Info label="นามสกุล" value={target.lastName} />
              <Info label="เลขประจำตัวพนักงาน" value={target.employeeCode} />
              <Info label="ตำแหน่ง" value={target.position} />
              <Info label="สังกัด" value={target.affiliation} />
              <Info label="ชื่อผู้ใช้" value={target.username} />
              <Info label="สมัครเมื่อ" value={fmtDateTime(target.createdAt)} />
              {target.status === "REJECTED" ? <Info label="เคยไม่อนุมัติ" value={target.rejectReason ?? "ไม่ระบุเหตุผล"} /> : null}
            </div>
            {duplicates.length ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                พบบัญชีที่อาจซ้ำ: {duplicates.map((d) => `${displayName(d)} (${d.username}${d.employeeCode ? ` · ${d.employeeCode}` : ""})`).join(", ")}
              </p>
            ) : null}

            {rejecting ? (
              <label className="block">
                <span className="text-xs font-bold text-slate-600">เหตุผลที่ไม่อนุมัติ (ผู้สมัครจะเห็นข้อความนี้เมื่อพยายามเข้าสู่ระบบ)</span>
                <input
                  autoFocus
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="เช่น ข้อมูลไม่ตรงกับทะเบียนกำลังพล"
                />
              </label>
            ) : (
              <>
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">บทบาท</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={role}
                    onChange={(e) => setRole(e.target.value as "ADMIN" | "OPERATOR")}
                  >
                    <option value="OPERATOR">ผู้ปฏิบัติการ (กำหนดสิทธิ์รายส่วน)</option>
                    <option value="ADMIN">ผู้ดูแลระบบ (ใช้ได้ทุกส่วน)</option>
                  </select>
                </label>
                <div>
                  <p className="mb-1 text-xs font-bold text-slate-600">สิทธิ์ที่อนุมัติ — ใช้งานข้อมูลส่วนไหนได้ และได้ระดับใด</p>
                  {role === "ADMIN" ? (
                    <p className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-[12px] text-indigo-800">ผู้ดูแลระบบใช้งานและแก้ไขได้ทุกส่วน รวมถึงจัดการผู้ใช้</p>
                  ) : (
                    <PermissionMatrix value={perms} onChange={setPerms} />
                  )}
                </div>
              </>
            )}
          </ModalFormBody>
        ) : null}
        <ModalFormActions>
          {rejecting ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void reject()}
                className="rounded-full bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                ยืนยันไม่อนุมัติ
              </button>
              <button type="button" className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700" onClick={() => setRejecting(false)}>
                กลับ
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void approve()}
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                อนุมัติและเปิดใช้งาน
              </button>
              {target?.status === "PENDING" ? (
                <button
                  type="button"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-100"
                  onClick={() => setRejecting(true)}
                >
                  ไม่อนุมัติ
                </button>
              ) : null}
              <button type="button" className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700" onClick={() => setTarget(null)}>
                ยกเลิก
              </button>
            </>
          )}
        </ModalFormActions>
      </Modal>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <p className="flex gap-2">
      <span className="w-36 shrink-0 text-slate-500">{label}</span>
      <span className="font-semibold text-[#1e1b4b]">{value || "—"}</span>
    </p>
  );
}
