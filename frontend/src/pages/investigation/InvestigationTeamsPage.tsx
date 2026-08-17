import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../../api/client";
import { Modal, ModalFormActions, ModalFormBody, ModalFormSection } from "../../components/Modal";
import { PageHeaderBar } from "../../components/PageHeaderBar";
import { ORG_ROLE_LABEL_TH, ORG_ROLE_ORDER } from "../../lib/investigationLabels";
import { rowMatchesFilter } from "../../lib/searchNormalize";
import type { LoadOptions } from "../../lib/loadOptions";
import { setLoadBusy } from "../../lib/loadOptions";
import {
  brandGradientFillClass,
  listCardAccentClass,
  listCardClass,
  toolbarLinkBtnClass,
  toolbarPrimaryBtnClass,
} from "../../lib/uiTokens";
import type {
  InvestigationCategory,
  InvestigationMember,
  InvestigationOrgRole,
  InvestigationTeam,
  Personnel,
} from "../../types";

type TeamForm = { name: string; code: string; description: string; sortOrder: number };
type MemberForm = {
  fullName: string;
  orgRole: InvestigationOrgRole;
  position: string;
  email: string;
  phone: string;
  teamId: string;
  personnelId: string;
  active: boolean;
};

function emptyTeamForm(sortOrder = 0): TeamForm {
  return { name: "", code: "", description: "", sortOrder };
}

function emptyMemberForm(teamId = ""): MemberForm {
  return {
    fullName: "",
    orgRole: "INVESTIGATOR",
    position: "",
    email: "",
    phone: "",
    teamId,
    personnelId: "",
    active: true,
  };
}

/** ตำแหน่งระดับ ผช.ผอ. ขึ้นไปคือผู้มีสิทธิ์พิจารณาอนุมัติ */
function isApprover(role: InvestigationOrgRole) {
  return role !== "INVESTIGATOR";
}

export function InvestigationTeamsPage() {
  const [teams, setTeams] = useState<InvestigationTeam[]>([]);
  const [members, setMembers] = useState<InvestigationMember[]>([]);
  const [categories, setCategories] = useState<InvestigationCategory[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState("");
  const [saving, setSaving] = useState(false);

  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<InvestigationTeam | null>(null);
  const [teamForm, setTeamForm] = useState<TeamForm>(emptyTeamForm);

  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<InvestigationMember | null>(null);
  const [memberForm, setMemberForm] = useState<MemberForm>(emptyMemberForm);

  const load = useCallback(async (opts?: LoadOptions) => {
    setLoadBusy(setLoading, opts, true);
    setErr(null);
    try {
      const [teamRows, memberRows, categoryRows] = await Promise.all([
        apiJson<InvestigationTeam[]>("/api/investigation/teams"),
        apiJson<InvestigationMember[]>("/api/investigation/members"),
        apiJson<InvestigationCategory[]>("/api/investigation/categories"),
      ]);
      setTeams(teamRows);
      setMembers(memberRows);
      setCategories(categoryRows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดข้อมูลทีมไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!memberModalOpen || personnel.length) return;
    void apiJson<Personnel[]>("/api/personnel")
      .then(setPersonnel)
      .catch(() => setPersonnel([]));
  }, [memberModalOpen, personnel.length]);

  const chainMembers = useMemo(
    () =>
      [...members]
        .filter((m) => isApprover(m.orgRole) && m.active)
        .sort((a, b) => b.approvalLevel - a.approvalLevel || a.fullName.localeCompare(b.fullName, "th")),
    [members],
  );

  const unassigned = useMemo(() => members.filter((m) => !m.teamId), [members]);

  /** แฟ้มคดีในความรับผิดชอบของแต่ละทีม */
  const filesByTeam = useMemo(() => {
    const map = new Map<string, InvestigationCategory[]>();
    for (const c of categories) {
      if (!c.teamId) continue;
      const list = map.get(c.teamId);
      if (list) list.push(c);
      else map.set(c.teamId, [c]);
    }
    return map;
  }, [categories]);

  const filteredTeams = useMemo(
    () =>
      teams.filter((t) =>
        rowMatchesFilter(listFilter, [
          t.name,
          t.code,
          t.description,
          ...(t.members ?? []).map((m) => m.fullName),
          ...(filesByTeam.get(t.id) ?? []).map((c) => c.name),
        ]),
      ),
    [teams, listFilter, filesByTeam],
  );

  function openCreateTeam() {
    setEditingTeam(null);
    setTeamForm(emptyTeamForm(teams.length));
    setTeamModalOpen(true);
    setErr(null);
  }

  function openEditTeam(t: InvestigationTeam) {
    setEditingTeam(t);
    setTeamForm({
      name: t.name,
      code: t.code ?? "",
      description: t.description ?? "",
      sortOrder: t.sortOrder,
    });
    setTeamModalOpen(true);
    setErr(null);
  }

  async function submitTeam(e: React.FormEvent) {
    e.preventDefault();
    const name = teamForm.name.trim();
    if (!name) {
      setErr("กรอกชื่อทีม");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const body = {
        name,
        code: teamForm.code.trim() || null,
        description: teamForm.description.trim() || null,
        sortOrder: teamForm.sortOrder,
      };
      if (editingTeam) {
        await apiJson(`/api/investigation/teams/${editingTeam.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await apiJson("/api/investigation/teams", { method: "POST", body: JSON.stringify(body) });
      }
      setTeamModalOpen(false);
      setEditingTeam(null);
      await load({ silent: true });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "บันทึกทีมไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function removeTeam(t: InvestigationTeam) {
    if (!confirm(`ลบทีม «${t.name}» ?`)) return;
    setErr(null);
    try {
      await apiJson(`/api/investigation/teams/${t.id}`, { method: "DELETE" });
      await load({ silent: true });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "ลบทีมไม่สำเร็จ");
    }
  }

  function openCreateMember(teamId = "") {
    setEditingMember(null);
    setMemberForm(emptyMemberForm(teamId));
    setMemberModalOpen(true);
    setErr(null);
  }

  function openEditMember(m: InvestigationMember) {
    setEditingMember(m);
    setMemberForm({
      fullName: m.fullName,
      orgRole: m.orgRole,
      position: m.position ?? "",
      email: m.email ?? "",
      phone: m.phone ?? "",
      teamId: m.teamId ?? "",
      personnelId: m.personnelId ?? "",
      active: m.active,
    });
    setMemberModalOpen(true);
    setErr(null);
  }

  async function submitMember(e: React.FormEvent) {
    e.preventDefault();
    const fullName = memberForm.fullName.trim();
    if (!fullName) {
      setErr("กรอกชื่อ-สกุล");
      return;
    }
    if (isApprover(memberForm.orgRole) && !memberForm.email.trim()) {
      setErr("ผู้อนุมัติต้องมีอีเมล เพื่อรับลิงก์พิจารณา");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const body = {
        fullName,
        orgRole: memberForm.orgRole,
        position: memberForm.position.trim() || null,
        email: memberForm.email.trim() || null,
        phone: memberForm.phone.trim() || null,
        teamId: memberForm.teamId || null,
        personnelId: memberForm.personnelId || null,
        active: memberForm.active,
      };
      if (editingMember) {
        await apiJson(`/api/investigation/members/${editingMember.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await apiJson("/api/investigation/members", { method: "POST", body: JSON.stringify(body) });
      }
      setMemberModalOpen(false);
      setEditingMember(null);
      await load({ silent: true });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "บันทึกบุคลากรไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(m: InvestigationMember) {
    if (!confirm(`ลบ «${m.fullName}» ออกจากทะเบียนสืบสวน ?`)) return;
    setErr(null);
    try {
      await apiJson(`/api/investigation/members/${m.id}`, { method: "DELETE" });
      await load({ silent: true });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "ลบไม่สำเร็จ");
    }
  }

  function applyPersonnel(personnelId: string) {
    const p = personnel.find((x) => x.id === personnelId);
    setMemberForm((f) => ({
      ...f,
      personnelId,
      fullName: p ? `${p.rank ? `${p.rank} ` : ""}${p.fullName}`.trim() : f.fullName,
      position: p?.position ?? f.position,
      phone: p?.phone ?? f.phone,
    }));
  }

  return (
    <div>
      <PageHeaderBar
        title="ทีมสืบสวน"
        count={members.length}
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "ทีมสืบสวนและสายบังคับบัญชา",
          placeholder: "กรองชื่อทีม / ชื่อบุคลากร…",
        }}
        extras={
          <>
            <Link to="/investigation" className={toolbarLinkBtnClass}>
              แดชบอร์ด
            </Link>
            <Link to="/investigation/cases" className={toolbarLinkBtnClass}>
              ทะเบียนคดี
            </Link>
            <button type="button" onClick={openCreateTeam} className={toolbarLinkBtnClass}>
              เพิ่มทีม
            </button>
          </>
        }
        primary={
          <button type="button" onClick={() => openCreateMember()} className={toolbarPrimaryBtnClass}>
            เพิ่มบุคลากร
          </button>
        }
      />

      {err ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</p>
      ) : null}

      <section className="mt-4 rounded-[1.25rem] border border-[#e8e6fc] bg-white/90 p-4">
        <h2 className="text-sm font-black text-[#1e1b4b]">สายอนุมัติปัจจุบัน</h2>
        <p className="mt-0.5 text-[11px] text-slate-600">
          เรื่องจะถูกเสนอจาก ผช.ผอ. ขึ้นไปตามลำดับ จนถึง ผอ. โดยส่งลิงก์พิจารณาไปทางอีเมล
        </p>
        {chainMembers.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-amber-200 bg-amber-50/60 px-3 py-3 text-xs text-amber-900">
            ยังไม่มีผู้อนุมัติ — เพิ่มบุคลากรตำแหน่ง ผช.ผอ. / รอง ผอ. / ผอ. พร้อมอีเมลก่อน จึงจะเสนอคดีได้
          </p>
        ) : (
          <ol className="mt-3 flex flex-wrap items-center gap-2">
            {chainMembers.map((m, idx) => (
              <li key={m.id} className="flex items-center gap-2">
                {idx > 0 ? <span className="text-slate-400">←</span> : null}
                <span className="rounded-full bg-[#f3f1ff] px-3 py-1 text-[11px] font-bold text-[#2e2a58] ring-1 ring-[#e8e6fc]">
                  {ORG_ROLE_LABEL_TH[m.orgRole]} {m.fullName}
                  {m.team ? <span className="ml-1 font-normal text-slate-500">({m.team.name})</span> : null}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="mt-4">
        {loading ? (
          <div className="rounded-xl border border-dashed border-[#dcd8f0] px-4 py-10 text-center text-slate-600">
            กำลังโหลด…
          </div>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {filteredTeams.map((t, idx) => {
              const teamMembers = [...(t.members ?? [])].sort(
                (a, b) => b.approvalLevel - a.approvalLevel || a.fullName.localeCompare(b.fullName, "th"),
              );
              const teamFiles = filesByTeam.get(t.id) ?? [];
              return (
                <li key={t.id}>
                  <div className={`${listCardClass} p-3`}>
                    <span className={`absolute inset-y-0 left-0 w-1 ${listCardAccentClass(idx)}`} aria-hidden />
                    <div className="min-w-0 flex-1 pl-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {t.code ? (
                          <span className="rounded bg-[#0000BF]/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#0000BF]">
                            {t.code}
                          </span>
                        ) : null}
                        <span className="text-[10px] font-bold text-slate-500">
                          {teamMembers.length} คน · {teamFiles.length} แฟ้ม
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-semibold leading-snug text-[#1e1b3a]">{t.name}</p>
                      {t.description ? (
                        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-600">
                          {t.description}
                        </p>
                      ) : null}

                      {teamFiles.length > 0 ? (
                        <div className="mt-2">
                          <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                            แฟ้มในความรับผิดชอบ
                          </p>
                          <ul className="mt-1 flex flex-wrap gap-1">
                            {teamFiles.map((c) => (
                              <li
                                key={c.id}
                                title={c.description ?? undefined}
                                className="rounded bg-[#f3f1ff] px-1.5 py-0.5 text-[10px] font-semibold text-[#2e2a58] ring-1 ring-[#e8e6fc]"
                              >
                                {c.name}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <ul className="mt-2.5 space-y-1">
                        {teamMembers.length === 0 ? (
                          <li className="text-[11px] text-slate-500">ยังไม่มีสมาชิก</li>
                        ) : (
                          teamMembers.map((m) => (
                            <li
                              key={m.id}
                              className="flex items-center justify-between gap-2 rounded-lg bg-[#faf9ff] px-2 py-1"
                            >
                              <span className="min-w-0 truncate text-[11px] text-[#2e2a58]">
                                <span className="font-bold">{ORG_ROLE_LABEL_TH[m.orgRole]}</span> {m.fullName}
                                {m.email ? (
                                  <span className="ml-1 text-slate-500">· {m.email}</span>
                                ) : isApprover(m.orgRole) ? (
                                  <span className="ml-1 font-bold text-rose-600">· ไม่มีอีเมล</span>
                                ) : null}
                              </span>
                              <button
                                type="button"
                                className="shrink-0 text-[10px] font-bold text-[#4d47b6] hover:underline"
                                onClick={() => openEditMember(m)}
                              >
                                แก้ไข
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-[#ecebff] pt-2 pl-2">
                      <button
                        type="button"
                        className="rounded-lg border border-[#dcd8f0] bg-white px-2.5 py-1 text-xs font-medium text-[#2e2a58] hover:bg-[#0000BF]/5"
                        onClick={() => openCreateMember(t.id)}
                      >
                        เพิ่มสมาชิก
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                        onClick={() => openEditTeam(t)}
                      >
                        แก้ไขทีม
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100"
                        onClick={() => void removeTeam(t)}
                      >
                        ลบทีม
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {unassigned.length > 0 ? (
        <section className="mt-4 rounded-[1.25rem] border border-[#e8e6fc] bg-white/90 p-4">
          <h2 className="text-sm font-black text-[#1e1b4b]">ผู้บริหารส่วนกลาง (ไม่สังกัดทีม)</h2>
          <p className="mt-0.5 text-[11px] text-slate-600">
            ใช้เป็นขั้นอนุมัติของทุกทีมที่ยังไม่มีผู้อนุมัติระดับนั้น
          </p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {unassigned.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-[#faf9ff] px-2.5 py-1.5"
              >
                <span className="min-w-0 truncate text-[11px] text-[#2e2a58]">
                  <span className="font-bold">{ORG_ROLE_LABEL_TH[m.orgRole]}</span> {m.fullName}
                  {m.email ? <span className="ml-1 text-slate-500">· {m.email}</span> : null}
                </span>
                <span className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="text-[10px] font-bold text-[#4d47b6] hover:underline"
                    onClick={() => openEditMember(m)}
                  >
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    className="text-[10px] font-bold text-rose-600 hover:underline"
                    onClick={() => void removeMember(m)}
                  >
                    ลบ
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Modal
        open={teamModalOpen}
        onClose={() => !saving && setTeamModalOpen(false)}
        title={editingTeam ? "แก้ไขทีมสืบสวน" : "เพิ่มทีมสืบสวน"}
      >
        <form onSubmit={(e) => void submitTeam(e)}>
          <ModalFormBody>
            {err ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</p>
            ) : null}
            <ModalFormSection title="ข้อมูลทีม">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">
                    ชื่อทีม <span className="text-rose-500">*</span>
                  </span>
                  <input
                    required
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={teamForm.name}
                    onChange={(e) => setTeamForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">รหัสทีม</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={teamForm.code}
                    onChange={(e) => setTeamForm((f) => ({ ...f, code: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">ลำดับแสดง</span>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={teamForm.sortOrder}
                    onChange={(e) => setTeamForm((f) => ({ ...f, sortOrder: Number(e.target.value) || 0 }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">ขอบเขตงาน</span>
                  <textarea
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={teamForm.description}
                    onChange={(e) => setTeamForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </label>
              </div>
            </ModalFormSection>
          </ModalFormBody>
          <ModalFormActions>
            <button
              type="submit"
              disabled={saving}
              className={`rounded-full px-4 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 disabled:opacity-50 ${brandGradientFillClass}`}
            >
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            <button
              type="button"
              disabled={saving}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => setTeamModalOpen(false)}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      <Modal
        open={memberModalOpen}
        onClose={() => !saving && setMemberModalOpen(false)}
        title={editingMember ? "แก้ไขบุคลากรสืบสวน" : "เพิ่มบุคลากรสืบสวน"}
        size="wide"
      >
        <form onSubmit={(e) => void submitMember(e)}>
          <ModalFormBody>
            {err ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</p>
            ) : null}
            <ModalFormSection title="ข้อมูลบุคลากร">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">เลือกจากทะเบียนกำลังพล (ถ้ามี)</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={memberForm.personnelId}
                    onChange={(e) => applyPersonnel(e.target.value)}
                  >
                    <option value="">— กรอกเอง —</option>
                    {personnel.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.rank ? `${p.rank} ` : ""}
                        {p.fullName}
                        {p.position ? ` · ${p.position}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">
                    ชื่อ-สกุล <span className="text-rose-500">*</span>
                  </span>
                  <input
                    required
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={memberForm.fullName}
                    onChange={(e) => setMemberForm((f) => ({ ...f, fullName: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">ตำแหน่งตามสายงาน</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={memberForm.orgRole}
                    onChange={(e) =>
                      setMemberForm((f) => ({ ...f, orgRole: e.target.value as InvestigationOrgRole }))
                    }
                  >
                    {ORG_ROLE_ORDER.map((r) => (
                      <option key={r} value={r}>
                        {ORG_ROLE_LABEL_TH[r]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">ทีม</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={memberForm.teamId}
                    onChange={(e) => setMemberForm((f) => ({ ...f, teamId: e.target.value }))}
                  >
                    <option value="">— ส่วนกลาง (ไม่สังกัดทีม) —</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">ตำแหน่งงาน</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={memberForm.position}
                    onChange={(e) => setMemberForm((f) => ({ ...f, position: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">
                    อีเมล {isApprover(memberForm.orgRole) ? <span className="text-rose-500">*</span> : null}
                  </span>
                  <input
                    type="email"
                    placeholder="name@bot.or.th"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={memberForm.email}
                    onChange={(e) => setMemberForm((f) => ({ ...f, email: e.target.value }))}
                  />
                  <span className="mt-1 block text-[11px] text-slate-500">ใช้ส่งลิงก์พิจารณาอนุมัติ</span>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">โทรศัพท์</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={memberForm.phone}
                    onChange={(e) => setMemberForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </label>
                <label className="flex items-center gap-2 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={memberForm.active}
                    onChange={(e) => setMemberForm((f) => ({ ...f, active: e.target.checked }))}
                  />
                  <span className="text-xs font-medium text-slate-700">ใช้งานอยู่ (อยู่ในสายอนุมัติ)</span>
                </label>
              </div>
            </ModalFormSection>
          </ModalFormBody>
          <ModalFormActions>
            <button
              type="submit"
              disabled={saving}
              className={`rounded-full px-4 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 disabled:opacity-50 ${brandGradientFillClass}`}
            >
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            {editingMember ? (
              <button
                type="button"
                disabled={saving}
                className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-600 hover:bg-rose-100"
                onClick={() => {
                  setMemberModalOpen(false);
                  void removeMember(editingMember);
                }}
              >
                ลบ
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => setMemberModalOpen(false)}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>
    </div>
  );
}
