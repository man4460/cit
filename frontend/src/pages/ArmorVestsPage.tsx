import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { apiJson } from "../api/client";
import { DetailField } from "../components/DetailField";
import { FitSingleLine } from "../components/FitSingleLine";
import { Modal, ModalFormActions, ModalFormBody, ModalFormSection } from "../components/Modal";
import { ModuleDocumentsModal } from "../components/ModuleDocumentsModal";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { PickableDateInput } from "../components/PickableDateInput";
import { PrintA4Table } from "../components/PrintA4Table";
import { MODULE_DOCUMENT_CATEGORIES } from "../lib/moduleDocumentCategories";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { listCardAccentClass, listCardClass, toolbarLinkBtnClass, toolbarPrimaryBtnClass } from "../lib/uiTokens";
import type { BulletproofVest } from "../types";
import type { LoadOptions } from "../lib/loadOptions";
import { setLoadBusy } from "../lib/loadOptions";

type DashKey = "" | "all" | "expired" | "expiring" | "noDate";
type LifeStatus = "ok" | "expiring" | "expired" | "unknown";

const EXPIRING_DAYS = 365;

/** มาตรฐานเสื้อเกราะขั้นต่ำตามหน่วยงาน */
const ARMOR_STANDARD_ROWS: {
  unit: string;
  abbr: string;
  detail: string;
  total: number;
}[] = [
  {
    unit: "สำนักงานใหญ่",
    abbr: "สนญ.",
    detail: "ระดับ 2 จำนวน 4 ตัว และระดับ 3 จำนวน 3 ตัว",
    total: 7,
  },
  {
    unit: "สายออกบัตรธนาคาร",
    abbr: "ทอศ.",
    detail: "ระดับ 2 จำนวน 5 ตัว",
    total: 5,
  },
  {
    unit: "สำนักงานภาคเหนือ",
    abbr: "สภน.",
    detail: "ระดับ 2 จำนวน 3 ตัว",
    total: 3,
  },
  {
    unit: "สำนักงานภาคตะวันออกเฉียงเหนือ",
    abbr: "สภอ.",
    detail: "ระดับ 2 จำนวน 3 ตัว",
    total: 3,
  },
  {
    unit: "สำนักงานภาคใต้",
    abbr: "สภต.",
    detail: "ระดับ 3 จำนวน 3 ตัว",
    total: 3,
  },
  {
    unit: "ทีมขนส่งธนบัตรและทรัพย์สินมีค่า",
    abbr: "ทขส.",
    detail: "ระดับ 2 จำนวน 10 ตัว",
    total: 10,
  },
];

const ARMOR_STANDARD_TOTAL = ARMOR_STANDARD_ROWS.reduce((s, r) => s + r.total, 0);

function emptyForm() {
  return {
    code: "",
    description: "เสื้อเกราะกันกระสุน",
    level: "2",
    team: "",
    capturedAt: "",
    costCenter: "",
    registerNo: "",
    permitBeginsAt: "",
    permitExpiresAt: "",
    notes: "",
    docUrl: "",
  };
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatThDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function permitLife(iso: string | null | undefined): LifeStatus {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  const today = startOfToday();
  if (d.getTime() < today.getTime()) return "expired";
  const soon = new Date(today);
  soon.setDate(soon.getDate() + EXPIRING_DAYS);
  if (d.getTime() <= soon.getTime()) return "expiring";
  return "ok";
}

function VestIcon({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const gradId = `vestGrad-${uid}`;
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden>
      <path
        d="M16 10c0 4 3.5 7 8 7s8-3 8-7l3 3v23c0 1.6-1.2 3-2.8 3H15.8C14.2 39 13 37.6 13 36V13l3-3Z"
        stroke={`url(#${gradId})`}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M24 17v22M18 22h12M18 28h12" stroke={`url(#${gradId})`} strokeWidth="1.8" strokeLinecap="round" />
      <defs>
        <linearGradient id={gradId} x1="13" y1="10" x2="36" y2="39" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0000BF" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function InsightCard({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: string;
  active: boolean;
  onClick?: () => void;
}) {
  const className = `min-w-0 rounded-[1.25rem] border px-3 py-2.5 text-left shadow-[0_10px_30px_-18px_rgba(30,27,75,0.28)] transition ${
    active ? "border-[#0000BF]/45 ring-2 ring-[#0000BF]/20" : "border-[#e8e6fc]/80"
  } ${onClick ? "hover:border-[#0000BF]/30" : ""} bg-gradient-to-br ${tone}`;
  const inner = (
    <>
      <FitSingleLine className="font-semibold text-[#66638c]" maxPx={11} minPx={8} title={label}>
        {label}
      </FitSingleLine>
      <FitSingleLine className="mt-1 font-black tabular-nums text-[#1e1b4b]" maxPx={26} minPx={13} title={String(value)}>
        {value.toLocaleString("th-TH")}
      </FitSingleLine>
    </>
  );
  if (!onClick) return <div className={className}>{inner}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={className}>
      {inner}
    </button>
  );
}

export function ArmorVestsPage() {
  const [rows, setRows] = useState<BulletproofVest[]>([]);
  const [loading, setLoading] = useState(true);
  const [listFilter, setListFilter] = useState("");
  const [dashKey, setDashKey] = useState<DashKey>("");
  const [kindFilter, setKindFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [detail, setDetail] = useState<BulletproofVest | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [standardNoteOpen, setStandardNoteOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (opts?: LoadOptions) => {
    setLoadBusy(setLoading, opts, true);
    try {
      setRows(await apiJson<BulletproofVest[]>("/api/bulletproof-vests"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const searchRows = useMemo(
    () =>
      rows.filter((r) =>
        rowMatchesFilter(listFilter, [
          r.code,
          r.description,
          r.level,
          r.team,
          r.costCenter,
          r.registerNo,
          r.notes,
          r.docUrl,
          formatThDate(r.capturedAt),
          formatThDate(r.permitExpiresAt),
        ]),
      ),
    [rows, listFilter],
  );

  const scoped = useMemo(
    () =>
      searchRows.filter((r) => {
        if (kindFilter && r.description !== kindFilter) return false;
        if (teamFilter && (r.team || "ไม่ระบุทีม") !== teamFilter) return false;
        if (levelFilter && r.level !== levelFilter) return false;
        return true;
      }),
    [searchRows, kindFilter, teamFilter, levelFilter],
  );

  const dashStats = useMemo(() => {
    let expired = 0;
    let expiring = 0;
    let noDate = 0;
    const kinds = new Map<string, number>();
    const teams = new Map<string, number>();
    const levels = new Map<string, number>();
    for (const r of searchRows) {
      kinds.set(r.description, (kinds.get(r.description) || 0) + 1);
      const team = r.team || "ไม่ระบุทีม";
      teams.set(team, (teams.get(team) || 0) + 1);
      if (r.level) levels.set(r.level, (levels.get(r.level) || 0) + 1);
    }
    for (const r of scoped) {
      const life = permitLife(r.permitExpiresAt);
      if (life === "expired") expired += 1;
      else if (life === "expiring") expiring += 1;
      else if (life === "unknown") noDate += 1;
    }
    return {
      total: scoped.length,
      expired,
      expiring,
      noDate,
      kinds: [...kinds.entries()].sort((a, b) => b[1] - a[1]),
      teams: [...teams.entries()].sort((a, b) => b[1] - a[1]),
      levels: [...levels.entries()].sort((a, b) => a[0].localeCompare(b[0], "th")),
    };
  }, [searchRows, scoped]);

  const filtered = useMemo(
    () =>
      scoped.filter((r) => {
        if (!dashKey || dashKey === "all") return true;
        const life = permitLife(r.permitExpiresAt);
        if (dashKey === "expired") return life === "expired";
        if (dashKey === "expiring") return life === "expiring";
        if (dashKey === "noDate") return life === "unknown";
        return true;
      }),
    [scoped, dashKey],
  );

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(r: BulletproofVest) {
    setDetail(null);
    setEditingId(r.id);
    setForm({
      code: r.code,
      description: r.description,
      level: r.level,
      team: r.team ?? "",
      capturedAt: toDateInput(r.capturedAt),
      costCenter: r.costCenter ?? "",
      registerNo: r.registerNo ?? "",
      permitBeginsAt: toDateInput(r.permitBeginsAt),
      permitExpiresAt: toDateInput(r.permitExpiresAt),
      notes: r.notes ?? "",
      docUrl: r.docUrl ?? "",
    });
    setModalOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body = JSON.stringify({
      code: form.code.trim(),
      description: form.description.trim(),
      level: form.level.trim(),
      team: form.team.trim() || null,
      capturedAt: form.capturedAt || null,
      costCenter: form.costCenter.trim() || null,
      registerNo: form.registerNo.trim() || null,
      permitBeginsAt: form.permitBeginsAt || null,
      permitExpiresAt: form.permitExpiresAt || null,
      notes: form.notes.trim() || null,
      docUrl: form.docUrl.trim() || null,
    });
    try {
      if (editingId) await apiJson(`/api/bulletproof-vests/${editingId}`, { method: "PUT", body });
      else await apiJson("/api/bulletproof-vests", { method: "POST", body });
      setModalOpen(false);
      setEditingId(null);
      await load({ silent: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: BulletproofVest) {
    if (!confirm(`ลบเสื้อเกราะ «${r.code}» ?`)) return;
    try {
      await apiJson(`/api/bulletproof-vests/${r.id}`, { method: "DELETE" });
      setDetail(null);
      await load({ silent: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  const dashCards = [
    { key: "all" as DashKey, label: "เสื้อเกราะทั้งหมด", value: dashStats.total, tone: "from-[#0000BF]/8 via-[#8b5cf6]/8 to-[#ec4899]/10" },
    { key: "expired" as DashKey, label: "หมดอายุ", value: dashStats.expired, tone: "from-rose-100/80 to-pink-100/70" },
    { key: "expiring" as DashKey, label: "ใกล้หมดอายุ", value: dashStats.expiring, tone: "from-amber-50 to-orange-100/70" },
    { key: "noDate" as DashKey, label: "ไม่ระบุวันหมดอายุ", value: dashStats.noDate, tone: "from-slate-50 to-slate-100/80" },
  ];

  return (
    <div>
      <PageHeaderBar
        title="เสื้อเกราะ"
        count={filtered.length}
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "เสื้อเกราะ",
          placeholder: "กรองรหัส / ชนิด / ทีม / ทะเบียน / ระดับ…",
        }}
        extras={
          <>
            <button type="button" className={toolbarLinkBtnClass} onClick={() => setDocsOpen(true)}>
              เอกสาร
            </button>
            <button type="button" className={toolbarLinkBtnClass} onClick={() => setStandardNoteOpen(true)}>
              โน้ตสำคัญ
            </button>
          </>
        }
        primary={
          <button type="button" onClick={openAdd} className={toolbarPrimaryBtnClass}>
            เพิ่มเสื้อเกราะ
          </button>
        }
      />

      <Modal
        open={standardNoteOpen}
        onClose={() => setStandardNoteOpen(false)}
        title="มาตรฐานเสื้อเกราะขั้นต่ำ"
        size="form"
      >
        <ModalFormBody>
          <ModalFormSection title="จำนวนตามหน่วยงาน">
            <p className="text-sm leading-relaxed text-[#2e2a58]">
              กำหนดจำนวนเสื้อเกราะขั้นต่ำที่แต่ละหน่วยงานต้องมี ดังนี้
            </p>
            <ol className="space-y-2.5 text-sm leading-relaxed text-[#1e1b4b]">
              {ARMOR_STANDARD_ROWS.map((row, i) => (
                <li key={row.abbr} className="rounded-xl border border-[#e8e6fc] bg-[#faf9ff]/90 px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="font-bold">
                      {i + 1}. {row.unit}{" "}
                      <span className="font-semibold text-[#4d47b6]">({row.abbr})</span>
                    </span>
                    <span className="shrink-0 text-xs font-black tabular-nums text-[#66638c]">
                      รวม {row.total} ตัว
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] text-slate-700">{row.detail}</p>
                </li>
              ))}
            </ol>
            <p className="rounded-xl border border-[#0000BF]/15 bg-[#0000BF]/[0.04] px-3 py-2 text-sm font-bold text-[#1e1b4b]">
              รวมทั้งสิ้น {ARMOR_STANDARD_TOTAL} ตัว
            </p>
          </ModalFormSection>

          <ModalFormSection title="อักษรย่อหน่วยงาน">
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {ARMOR_STANDARD_ROWS.map((row) => (
                <li
                  key={`abbr-${row.abbr}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[#ecebff] bg-white/90 px-2.5 py-1.5 text-sm"
                >
                  <span className="min-w-0 truncate text-slate-700">{row.unit}</span>
                  <span className="shrink-0 font-black text-[#4d47b6]">{row.abbr}</span>
                </li>
              ))}
            </ul>
          </ModalFormSection>
        </ModalFormBody>
        <ModalFormActions>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            onClick={() => setStandardNoteOpen(false)}
          >
            ปิด
          </button>
        </ModalFormActions>
      </Modal>

      <div className="mt-4 grid gap-2 print:hidden sm:grid-cols-2 lg:grid-cols-4">
        {dashCards.map((c) => (
          <InsightCard
            key={c.label}
            label={c.label}
            value={c.value}
            tone={c.tone}
            active={Boolean(c.key) && dashKey === c.key}
            onClick={() => setDashKey((cur) => (cur === c.key ? "" : c.key))}
          />
        ))}
      </div>

      {dashStats.kinds.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5 print:hidden">
          {dashStats.kinds.map(([name, n]) => {
            const active = kindFilter === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setKindFilter((cur) => (cur === name ? "" : name))}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  active
                    ? "border-[#0000BF]/40 bg-[#0000BF]/10 text-[#0000BF]"
                    : "border-[#e8e6fc] bg-white/80 text-[#2e2a58] hover:border-[#0000BF]/30"
                }`}
              >
                <span>{name}</span>
                <span className="tabular-nums text-[#66638c]">{n.toLocaleString("th-TH")}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {dashStats.levels.length > 0 || dashStats.teams.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5 print:hidden">
          {dashStats.levels.map(([name, n]) => {
            const active = levelFilter === name;
            return (
              <button
                key={`lv-${name}`}
                type="button"
                onClick={() => setLevelFilter((cur) => (cur === name ? "" : name))}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  active
                    ? "border-violet-400/50 bg-violet-50 text-violet-800"
                    : "border-[#e8e6fc] bg-white/80 text-[#2e2a58] hover:border-violet-300"
                }`}
              >
                <span>ระดับ {name}</span>
                <span className="tabular-nums text-[#66638c]">{n.toLocaleString("th-TH")}</span>
              </button>
            );
          })}
          {dashStats.teams.map(([name, n]) => {
            const active = teamFilter === name;
            return (
              <button
                key={`tm-${name}`}
                type="button"
                onClick={() => setTeamFilter((cur) => (cur === name ? "" : name))}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  active
                    ? "border-[#ec4899]/40 bg-[#ec4899]/10 text-[#be185d]"
                    : "border-[#e8e6fc] bg-white/80 text-[#2e2a58] hover:border-[#ec4899]/30"
                }`}
              >
                <span>{name}</span>
                <span className="tabular-nums text-[#66638c]">{n.toLocaleString("th-TH")}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditingId(null); }} title={editingId ? "แก้ไขเสื้อเกราะ" : "เพิ่มเสื้อเกราะ"} size="form">
        <form onSubmit={(e) => void save(e)}>
          <ModalFormBody>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-slate-700">รหัส</span>
                <input required className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">ระดับ</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))} placeholder="2 / 3" />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">ชนิด</span>
                <input required className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">ทีม</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={form.team} onChange={(e) => setForm((f) => ({ ...f, team: e.target.value }))} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">ทะเบียน</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={form.registerNo} onChange={(e) => setForm((f) => ({ ...f, registerNo: e.target.value }))} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">วันที่จัดหา</span>
                <PickableDateInput type="date" className="mt-1" value={form.capturedAt} onChange={(v) => setForm((f) => ({ ...f, capturedAt: v }))} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">ศูนย์ต้นทุน</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={form.costCenter} onChange={(e) => setForm((f) => ({ ...f, costCenter: e.target.value }))} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">วันเริ่มอนุญาต</span>
                <PickableDateInput type="date" className="mt-1" value={form.permitBeginsAt} onChange={(v) => setForm((f) => ({ ...f, permitBeginsAt: v }))} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">วันหมดอายุ</span>
                <PickableDateInput type="date" className="mt-1" value={form.permitExpiresAt} onChange={(v) => setForm((f) => ({ ...f, permitExpiresAt: v }))} />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">ลิงก์เอกสาร</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={form.docUrl} onChange={(e) => setForm((f) => ({ ...f, docUrl: e.target.value }))} placeholder="https://…" />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">หมายเหตุ</span>
                <textarea rows={3} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </label>
            </div>
          </ModalFormBody>
          <ModalFormActions>
            <button type="submit" disabled={saving} className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            <button type="button" className="rounded-lg border border-slate-200 px-4 py-2 text-sm" onClick={() => { setModalOpen(false); setEditingId(null); }}>ยกเลิก</button>
          </ModalFormActions>
        </form>
      </Modal>

      <div className="mt-6 print:hidden">
        {loading ? (
          <div className="rounded-[1.15rem] border border-[#e8e6fc] bg-white/70 px-4 py-10 text-center text-slate-600">กำลังโหลด…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">
            ยังไม่มีเสื้อเกราะ — กด «เพิ่มเสื้อเกราะ» หรือรีสตาร์ท API เพื่อซิงก์จาก CSV
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">ไม่มีรายการที่ตรงกับการกรอง</div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((r, idx) => {
              const life = permitLife(r.permitExpiresAt);
              return (
                <li key={r.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetail(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetail(r);
                      }
                    }}
                    className={`${listCardClass} cursor-pointer transition hover:border-[#0000BF]/35`}
                  >
                    <span className={`absolute inset-y-0 left-0 w-1 ${listCardAccentClass(idx)}`} aria-hidden />
                    <div className="min-w-0 flex-1 pl-2">
                      <div className="flex gap-2.5">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#e8e6fc] bg-gradient-to-br from-[#0000BF]/10 via-[#8b5cf6]/10 to-[#ec4899]/10 shadow-sm">
                          <VestIcon className="h-8 w-8" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-mono text-sm font-bold text-[#1e1b4b]">{r.code}</p>
                              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8b5cf6]">
                                {r.level ? `ระดับ ${r.level}` : "เสื้อเกราะ"}
                              </p>
                            </div>
                            {life === "expired" ? (
                              <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">หมดอายุ</span>
                            ) : life === "expiring" ? (
                              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">ใกล้หมดอายุ</span>
                            ) : null}
                          </div>
                          <p className="mt-1.5 text-xs font-medium text-[#2e2a58]">{r.description}</p>
                        </div>
                      </div>
                      <dl className="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
                        <div>
                          <dt className="text-slate-500">ทีม</dt>
                          <dd className="font-medium text-[#2e2a58]">{r.team || "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">ทะเบียน</dt>
                          <dd className="font-semibold text-[#ec4899]">{r.registerNo || "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">จัดหา</dt>
                          <dd className="tabular-nums text-slate-800">{formatThDate(r.capturedAt)}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">หมดอายุ</dt>
                          <dd className={`tabular-nums font-semibold ${life === "expired" ? "text-rose-700" : life === "expiring" ? "text-amber-800" : "text-slate-800"}`}>
                            {formatThDate(r.permitExpiresAt)}
                          </dd>
                        </div>
                        {r.notes ? (
                          <div className="col-span-2">
                            <dt className="text-slate-500">หมายเหตุ</dt>
                            <dd className="whitespace-pre-wrap text-slate-700">{r.notes}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>
                    <div
                      className="mt-3 flex flex-wrap gap-1.5 border-t border-[#ecebff] pt-2.5 pl-2"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {r.docUrl ? (
                        <a
                          href={r.docUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-[#0000BF]/25 bg-[#0000BF]/8 px-2.5 py-1 text-xs font-bold text-[#0000BF] hover:bg-[#0000BF]/12"
                        >
                          ดูเอกสาร
                        </a>
                      ) : null}
                      <button type="button" className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100" onClick={() => openEdit(r)}>แก้ไข</button>
                      <button type="button" className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100" onClick={() => void remove(r)}>ลบ</button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? detail.code : "รายละเอียดเสื้อเกราะ"} size="form">
        {detail ? (
          <>
            <ModalFormBody>
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailField label="รหัส" value={detail.code} mono />
                <DetailField label="ระดับ" value={detail.level ? `ระดับ ${detail.level}` : "—"} />
                <DetailField label="ชนิด" value={detail.description} className="sm:col-span-2" />
                <DetailField label="ทีม" value={detail.team || "—"} />
                <DetailField label="ทะเบียน" value={detail.registerNo || "—"} />
                <DetailField label="วันที่จัดหา" value={formatThDate(detail.capturedAt)} />
                <DetailField label="วันเริ่มอนุญาต" value={formatThDate(detail.permitBeginsAt)} />
                <DetailField label="วันหมดอายุ" value={formatThDate(detail.permitExpiresAt)} />
                <DetailField label="หมายเหตุ" value={detail.notes || "—"} className="sm:col-span-2" />
                <DetailField
                  label="ลิงก์เอกสาร"
                  value={
                    detail.docUrl ? (
                      <a href={detail.docUrl} target="_blank" rel="noopener noreferrer" className="text-[#0000BF] hover:underline">
                        เปิดเอกสาร
                      </a>
                    ) : (
                      "—"
                    )
                  }
                  className="sm:col-span-2"
                />
              </div>
            </ModalFormBody>
            <ModalFormActions>
              <button type="button" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100" onClick={() => openEdit(detail)}>แก้ไข</button>
              <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100" onClick={() => setDetail(null)}>ปิด</button>
            </ModalFormActions>
          </>
        ) : null}
      </Modal>

      <PrintA4Table
        columns={[
          { label: "รหัส" },
          { label: "ชนิด" },
          { label: "ระดับ" },
          { label: "ทีม" },
          { label: "ทะเบียน" },
          { label: "จัดหา" },
          { label: "หมดอายุ" },
          { label: "หมายเหตุ" },
        ]}
        rows={filtered.map((r) => {
          const life = permitLife(r.permitExpiresAt);
          const lifeLabel = life === "expired" ? "หมดอายุ" : life === "expiring" ? "ใกล้หมดอายุ" : "";
          return [
            r.code,
            r.description,
            r.level || "—",
            r.team || "—",
            r.registerNo || "—",
            formatThDate(r.capturedAt),
            `${formatThDate(r.permitExpiresAt)}${lifeLabel ? ` (${lifeLabel})` : ""}`,
            (r.notes || "—").replace(/\s+/g, " "),
          ];
        })}
      />

      <ModuleDocumentsModal
        open={docsOpen}
        categoryName={MODULE_DOCUMENT_CATEGORIES.armor}
        onClose={() => setDocsOpen(false)}
      />
    </div>
  );
}
