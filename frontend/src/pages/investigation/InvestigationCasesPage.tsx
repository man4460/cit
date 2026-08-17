import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiJson } from "../../api/client";
import { InvestigationFilesModal } from "../../components/InvestigationFilesModal";
import { Modal, ModalFormActions, ModalFormBody, ModalFormSection } from "../../components/Modal";
import { PageHeaderBar } from "../../components/PageHeaderBar";
import type { LoadOptions } from "../../lib/loadOptions";
import { setLoadBusy } from "../../lib/loadOptions";
import {
  KIND_LABEL_TH,
  ORG_ROLE_LABEL_TH,
  PRIORITY_LABEL_TH,
  STATUS_LABEL_TH,
  STATUS_ORDER,
  STATUS_TONE,
  categorySubtitle,
  isActiveCaseStatus,
  isStrategicKind,
  teamShortName,
} from "../../lib/investigationLabels";
import { rowMatchesFilter } from "../../lib/searchNormalize";
import {
  brandGradientFillClass,
  listCardAccentClass,
  listCardClass,
  toolbarLinkBtnClass,
  toolbarMasterBtnClass,
  toolbarMasterGroupClass,
  toolbarPrimaryBtnClass,
} from "../../lib/uiTokens";
import type {
  InvestigationCase,
  InvestigationCaseStatus,
  InvestigationCategory,
  InvestigationMember,
  InvestigationTeam,
} from "../../types";

type FormState = {
  title: string;
  summary: string;
  categoryId: string;
  subCategoryId: string;
  teamId: string;
  leadMemberId: string;
  requestedByMemberId: string;
  priority: 1 | 2 | 3;
  slaDueAt: string;
};

function emptyForm(categoryId = "", teamId = ""): FormState {
  return {
    title: "",
    summary: "",
    categoryId,
    subCategoryId: "",
    teamId,
    leadMemberId: "",
    requestedByMemberId: "",
    priority: 2,
    slaDueAt: "",
  };
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

function isSlaBreached(c: InvestigationCase) {
  if (!c.slaDueAt) return false;
  if (!isActiveCaseStatus(c.status)) return false;
  return new Date(c.slaDueAt).getTime() < Date.now();
}

export function InvestigationCasesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<InvestigationCase[]>([]);
  const [categories, setCategories] = useState<InvestigationCategory[]>([]);
  const [teams, setTeams] = useState<InvestigationTeam[]>([]);
  const [members, setMembers] = useState<InvestigationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(() => searchParams.get("categoryId")?.trim() ?? "");
  const [teamFilter, setTeamFilter] = useState(() => searchParams.get("teamId")?.trim() ?? "");
  const [statusFilter, setStatusFilter] = useState<"" | InvestigationCaseStatus>("");
  const [scope, setScope] = useState<"active" | "archived">("active");
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InvestigationCase | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadMasters = useCallback(async () => {
    const [cats, teamRows, memberRows] = await Promise.all([
      apiJson<InvestigationCategory[]>("/api/investigation/categories"),
      apiJson<InvestigationTeam[]>("/api/investigation/teams"),
      apiJson<InvestigationMember[]>("/api/investigation/members"),
    ]);
    setCategories(cats);
    setTeams(teamRows);
    setMembers(memberRows);
    return cats;
  }, []);

  const load = useCallback(async (opts?: LoadOptions) => {
    setLoadBusy(setLoading, opts, true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (categoryFilter) qs.set("categoryId", categoryFilter);
      if (teamFilter) qs.set("teamId", teamFilter);
      if (statusFilter) qs.set("status", statusFilter);
      else qs.set("scope", scope);
      const [data] = await Promise.all([
        apiJson<InvestigationCase[]>(`/api/investigation/cases?${qs}`),
        loadMasters(),
      ]);
      setRows(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดคดีไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, teamFilter, statusFilter, scope, loadMasters]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      rows.filter((c) =>
        rowMatchesFilter(listFilter, [
          c.title,
          c.caseNumber,
          c.summary,
          c.category?.name,
          c.category?.nameEn,
          c.subCategory?.name,
          c.category?.kind,
          c.team?.name,
          STATUS_LABEL_TH[c.status],
        ]),
      ),
    [rows, listFilter],
  );

  function openCreate() {
    setEditing(null);
    const first = categories[0];
    // ทีมมอบหมายอิสระ — ไม่บังคับตามแฟ้ม (แนะนำได้ถ้ามี)
    setForm(emptyForm(first?.id ?? "", ""));
    setFormOpen(true);
    setErr(null);
  }

  function openEdit(c: InvestigationCase) {
    setEditing(c);
    setForm({
      title: c.title,
      summary: c.summary ?? "",
      categoryId: c.categoryId,
      subCategoryId: c.subCategoryId ?? "",
      teamId: c.teamId ?? "",
      leadMemberId: c.leadMemberId ?? "",
      requestedByMemberId: c.requestedByMemberId ?? "",
      priority: (c.priority === 1 || c.priority === 3 ? c.priority : 2) as 1 | 2 | 3,
      slaDueAt: toDateInput(c.slaDueAt),
    });
    setFormOpen(true);
    setErr(null);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setEditing(null);
  }

  const teamMembers = useMemo(
    () => (form.teamId ? members.filter((m) => m.teamId === form.teamId) : members),
    [members, form.teamId],
  );

  /** แฟ้มหลักเรียงตามลำดับ (ไม่ผูกทีม) */
  const rootCategories = useMemo(
    () => [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "th")),
    [categories],
  );

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === form.categoryId) ?? null,
    [categories, form.categoryId],
  );

  const subOptions = useMemo(() => selectedCategory?.children ?? [], [selectedCategory]);

  /** เลือกแฟ้ม → เคลียร์หมวดย่อย · ทีมยังเลือกได้อิสระ (แนะนำจากแฟ้มได้ถ้ายังว่าง) */
  function pickCategory(categoryId: string) {
    const cat = categories.find((c) => c.id === categoryId);
    setForm((f) => ({
      ...f,
      categoryId,
      subCategoryId: "",
      teamId: f.teamId || cat?.teamId || "",
    }));
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) {
      setErr("กรอกชื่อเรื่องคดี");
      return;
    }
    if (!form.categoryId) {
      setErr("เลือกแฟ้มคดี — หรือเพิ่มแฟ้มก่อน");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const body = {
        title,
        summary: form.summary.trim() || null,
        categoryId: form.categoryId,
        subCategoryId: form.subCategoryId || null,
        teamId: form.teamId || null,
        leadMemberId: form.leadMemberId || null,
        requestedByMemberId: form.requestedByMemberId || null,
        priority: form.priority,
        slaDueAt: form.slaDueAt || null,
      };
      if (editing) {
        await apiJson<InvestigationCase>(`/api/investigation/cases/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        setFormOpen(false);
        setEditing(null);
        await load({ silent: true });
      } else {
        const created = await apiJson<InvestigationCase>("/api/investigation/cases", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setFormOpen(false);
        navigate(`/investigation/cases/${created.id}`);
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function removeCase(c: InvestigationCase) {
    if (!confirm(`ลบคดี «${c.caseNumber} — ${c.title}» ?`)) return;
    setErr(null);
    try {
      await apiJson(`/api/investigation/cases/${c.id}`, { method: "DELETE" });
      await load({ silent: true });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "ลบไม่สำเร็จ");
    }
  }

  return (
    <div>
      <PageHeaderBar
        title={scope === "archived" ? "คดีที่จัดเก็บ" : "ทะเบียนคดี"}
        count={filtered.length}
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: scope === "archived" ? "คดีสืบสวนที่จัดเก็บ" : "ทะเบียนคดีสืบสวน",
          placeholder: "กรองเลขคดี / ชื่อ / สรุป / แฟ้ม / ทีม…",
        }}
        segments={
          <div className={toolbarMasterGroupClass}>
            <select
              aria-label="กรองแฟ้มคดี"
              className={`${toolbarMasterBtnClass} max-w-[11rem] truncate border-0 bg-transparent`}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">ทุกแฟ้มคดี</option>
              {rootCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              aria-label="กรองทีม"
              className={`${toolbarMasterBtnClass} max-w-[10rem] truncate border-0 bg-transparent`}
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
            >
              <option value="">ทุกทีม</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              aria-label="กรองสถานะ"
              className={`${toolbarMasterBtnClass} max-w-[9rem] truncate border-0 bg-transparent`}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "" | InvestigationCaseStatus)}
            >
              <option value="">สถานะทั้งหมด</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL_TH[s]}
                </option>
              ))}
            </select>
          </div>
        }
        beforeFilter={
          <div className={toolbarMasterGroupClass}>
            <button
              type="button"
              className={`${toolbarMasterBtnClass} ${scope === "active" ? "bg-[#0000BF]/10" : ""}`}
              onClick={() => setScope("active")}
            >
              คดีปัจจุบัน
            </button>
            <button
              type="button"
              className={`${toolbarMasterBtnClass} ${scope === "archived" ? "bg-[#0000BF]/10" : ""}`}
              onClick={() => setScope("archived")}
            >
              จัดเก็บ
            </button>
          </div>
        }
        masters={
          <div className={toolbarMasterGroupClass}>
            <button type="button" onClick={() => setCatModalOpen(true)} className={toolbarMasterBtnClass}>
              แฟ้มคดี
            </button>
          </div>
        }
        extras={
          <>
            <Link to="/investigation" className={toolbarLinkBtnClass}>
              แดชบอร์ด
            </Link>
            <Link to="/investigation/approvals" className={toolbarLinkBtnClass}>
              รออนุมัติ
            </Link>
            <Link to="/investigation/teams" className={toolbarLinkBtnClass}>
              ทีม
            </Link>
          </>
        }
        primary={
          <button type="button" onClick={openCreate} className={toolbarPrimaryBtnClass}>
            เปิดคดีใหม่
          </button>
        }
      />

      <InvestigationFilesModal
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        onChanged={() => void load({ silent: true })}
        teams={teams}
      />

      {err && !formOpen ? (
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
              ? scope === "archived"
                ? "ยังไม่มีคดีที่จัดเก็บ"
                : "ยังไม่มีคดี — กด «เปิดคดีใหม่»"
              : "ไม่มีรายการที่ตรงกับการกรอง"}
          </div>
        ) : (
          <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((c, idx) => {
              const breached = isSlaBreached(c);
              const kind = c.category?.kind;
              return (
                <li key={c.id}>
                  <div className={`${listCardClass} min-h-[9rem] p-3`}>
                    <span className={`absolute inset-y-0 left-0 w-1 ${listCardAccentClass(idx)}`} aria-hidden />
                    <Link to={`/investigation/cases/${c.id}`} className="min-w-0 flex-1 pl-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[10px] font-bold text-slate-500">{c.caseNumber}</span>
                        {kind ? (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              isStrategicKind(kind)
                                ? "bg-[#0000BF]/10 text-[#0000BF]"
                                : "bg-cyan-500/10 text-cyan-800"
                            }`}
                          >
                            {KIND_LABEL_TH[kind]}
                          </span>
                        ) : null}
                        {breached ? (
                          <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                            เกิน SLA
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-[#1e1b3a]">{c.title}</p>
                      <p className="mt-1 text-[11px] font-semibold text-[#4d47b6]">
                        {c.category?.name ?? "—"}
                        {c.subCategory ? (
                          <span className="font-normal text-slate-500"> › {c.subCategory.name}</span>
                        ) : null}
                        {c.team ? (
                          <span className="font-normal text-slate-500"> · {teamShortName(c.team)}</span>
                        ) : null}
                      </p>
                      {categorySubtitle(c.category) ? (
                        <p className="text-[10px] text-slate-400">{categorySubtitle(c.category)}</p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 ${STATUS_TONE[c.status]}`}
                        >
                          {STATUS_LABEL_TH[c.status]}
                        </span>
                        <span className="text-[10px] text-slate-600">
                          ความสำคัญ{" "}
                          {PRIORITY_LABEL_TH[(c.priority === 1 || c.priority === 3 ? c.priority : 2) as 1 | 2 | 3]}
                          {" · "}SLA {fmtDate(c.slaDueAt)}
                        </span>
                      </div>
                      {c.summary?.trim() ? (
                        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-700">{c.summary}</p>
                      ) : null}
                    </Link>
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-[#ecebff] pt-2 pl-2">
                      <Link
                        to={`/investigation/cases/${c.id}`}
                        className="rounded-lg border border-[#dcd8f0] bg-white px-2.5 py-1 text-xs font-medium text-[#2e2a58] hover:bg-[#0000BF]/5"
                      >
                        เปิดสำนวน
                      </Link>
                      <button
                        type="button"
                        className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                        onClick={() => openEdit(c)}
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100"
                        onClick={() => void removeCase(c)}
                      >
                        ลบ
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal open={formOpen} onClose={closeForm} title={editing ? "แก้ไขคดี" : "เปิดคดีใหม่"} size="wide">
        <form onSubmit={(e) => void submitForm(e)}>
          <ModalFormBody>
            {err && formOpen ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</p>
            ) : null}
            <ModalFormSection title="ข้อมูลคดี">
              <div className="grid gap-4 sm:grid-cols-2">
                {editing ? (
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-slate-700">เลขคดี</span>
                    <input
                      readOnly
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700"
                      value={editing.caseNumber}
                    />
                  </label>
                ) : null}
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">
                    ชื่อเรื่อง <span className="text-rose-500">*</span>
                  </span>
                  <input
                    required
                    maxLength={200}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">แฟ้มคดี</span>
                  <select
                    required
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.categoryId}
                    onChange={(e) => pickCategory(e.target.value)}
                  >
                    <option value="">— เลือกแฟ้มคดี —</option>
                    {rootCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({KIND_LABEL_TH[c.kind]})
                      </option>
                    ))}
                  </select>
                  {categories.length === 0 ? (
                    <p className="mt-1 text-[11px] text-amber-800">ยังไม่มีแฟ้มคดี — กดปุ่ม «แฟ้มคดี» เพื่อเพิ่ม</p>
                  ) : categorySubtitle(selectedCategory) ? (
                    <span className="mt-1 block text-[11px] text-slate-500">{categorySubtitle(selectedCategory)}</span>
                  ) : null}
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">หมวดย่อย</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.subCategoryId}
                    onChange={(e) => setForm((f) => ({ ...f, subCategoryId: e.target.value }))}
                    disabled={!form.categoryId || subOptions.length === 0}
                  >
                    <option value="">
                      {subOptions.length === 0 ? "— ไม่มีหมวดย่อย —" : "— ไม่ระบุหมวดย่อย —"}
                    </option>
                    {subOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.nameEn ? ` · ${s.nameEn}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">ทีมรับผิดชอบ</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.teamId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, teamId: e.target.value, leadMemberId: "", requestedByMemberId: "" }))
                    }
                  >
                    <option value="">— ยังไม่ระบุทีม —</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {teamShortName(t)} ({t.name})
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    มอบหมายทีมใดก็ได้ตามโหลดงาน — สายอนุมัติใช้ผู้บังคับบัญชาของทีมนี้
                  </span>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">หัวหน้าคดี</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.leadMemberId}
                    onChange={(e) => setForm((f) => ({ ...f, leadMemberId: e.target.value }))}
                  >
                    <option value="">— ยังไม่ระบุ —</option>
                    {teamMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {ORG_ROLE_LABEL_TH[m.orgRole]} {m.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">ผู้เสนอเปิดคดี</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.requestedByMemberId}
                    onChange={(e) => setForm((f) => ({ ...f, requestedByMemberId: e.target.value }))}
                  >
                    <option value="">— ยังไม่ระบุ —</option>
                    {teamMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {ORG_ROLE_LABEL_TH[m.orgRole]} {m.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">ความสำคัญ</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) as 1 | 2 | 3 }))}
                  >
                    <option value={1}>{PRIORITY_LABEL_TH[1]}</option>
                    <option value={2}>{PRIORITY_LABEL_TH[2]}</option>
                    <option value={3}>{PRIORITY_LABEL_TH[3]}</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">วันครบ SLA</span>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.slaDueAt}
                    onChange={(e) => setForm((f) => ({ ...f, slaDueAt: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">ความเป็นมา / มูลเหตุ</span>
                  <textarea
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.summary}
                    onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                  />
                </label>
              </div>
              {!editing ? (
                <p className="mt-3 rounded-xl bg-[#faf9ff] px-3 py-2 text-[11px] text-slate-600">
                  คดีใหม่จะอยู่สถานะ «ร่าง» — เข้าสำนวนแล้วกด «เสนอขออนุมัติ» เพื่อส่งตามสายงาน
                </p>
              ) : null}
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
              onClick={closeForm}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>
    </div>
  );
}
