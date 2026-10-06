import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { apiFormJson, apiJson } from "../../api/client";
import { CommaNumberInput } from "../../components/CommaNumberInput";
import { Modal, ModalFormActions, ModalFormBody } from "../../components/Modal";
import { ModuleDocumentsModal } from "../../components/ModuleDocumentsModal";
import { PageHeaderBar } from "../../components/PageHeaderBar";
import { useAuth } from "../../context/AuthContext";
import { MODULE_DOCUMENT_CATEGORIES } from "../../lib/moduleDocumentCategories";
import type { LoadOptions } from "../../lib/loadOptions";
import { setLoadBusy } from "../../lib/loadOptions";
import {
  mediaUrl,
  toolbarLinkBtnClass,
  toolbarMasterBtnClass,
  toolbarMasterGroupClass,
  toolbarPrimaryBtnClass,
} from "../../lib/uiTokens";
import {
  installmentFor,
  isLastInstallment,
  lastInstallmentAmount,
  lastInstallmentYm,
  suggestRoundMonthly,
} from "../../lib/osInstallments";
import type { OsAreaGroup, OsContract, OsContractDocumentLink, OsMonthlyAcceptance } from "../../types";

type ContractForm = {
  vendorName: string;
  contractNo: string;
  title: string;
  startDate: string;
  endDate: string;
  monthlyAmount: string;
  totalAmount: string;
  notes: string;
  active: boolean;
};

const ROUND_UNITS = [
  { v: 100, label: "หลักร้อย" },
  { v: 1000, label: "หลักพัน" },
  { v: 10000, label: "หลักหมื่น" },
] as const;

function emptyContractForm(): ContractForm {
  return {
    vendorName: "",
    contractNo: "",
    title: "",
    startDate: "",
    endDate: "",
    monthlyAmount: "",
    totalAmount: "",
    notes: "",
    active: true,
  };
}

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20";
const labelClass = "text-xs font-semibold text-slate-600";
const DOC_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf";

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

function fmtMoney(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function currentYearCe() {
  return new Date().getFullYear();
}

function monthLabel(monthYm: string) {
  const [y, m] = monthYm.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("th-TH", { month: "short", year: "numeric" });
}

function contractMonths(startIso: string, endIso: string): number | null {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return null;
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
}

function fileKind(name: string | null | undefined, mime?: string | null) {
  const n = (name ?? "").toLowerCase();
  const m = (mime ?? "").toLowerCase();
  if (m.includes("pdf") || n.endsWith(".pdf")) return { label: "PDF", cls: "bg-rose-100 text-rose-700" };
  if (m.includes("word") || /\.docx?$/.test(n)) return { label: "DOC", cls: "bg-blue-100 text-blue-700" };
  if (m.includes("sheet") || m.includes("excel") || /\.xlsx?$/.test(n)) return { label: "XLS", cls: "bg-emerald-100 text-emerald-700" };
  if (m.includes("presentation") || m.includes("powerpoint") || /\.pptx?$/.test(n))
    return { label: "PPT", cls: "bg-orange-100 text-orange-700" };
  if (m.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic)$/.test(n)) return { label: "IMG", cls: "bg-violet-100 text-violet-700" };
  return { label: "FILE", cls: "bg-slate-100 text-slate-600" };
}

const ICON_PATHS = {
  shield: "M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3zm-3 9l2 2 4-4",
  building: "M4 21V5a2 2 0 012-2h8a2 2 0 012 2v16M16 9h2a2 2 0 012 2v10M3 21h18M8 7h2M8 11h2M8 15h2M12 7h.01M12 11h.01M12 15h.01",
  calendar: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z",
  wallet: "M3 7h15a3 3 0 013 3v7a3 3 0 01-3 3H6a3 3 0 01-3-3V7zm0 0V6a2 2 0 012-2h11M16 13.5h2",
  check: "M20 6L9 17l-5-5",
  checkCircle: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  clock: "M12 7v5l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z",
  ban: "M5.6 5.6l12.8 12.8M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  clip: "M15.5 7.5l-6.8 6.8a2 2 0 102.8 2.8l7.1-7.1a4 4 0 10-5.7-5.7l-7.4 7.4a6 6 0 108.5 8.5L20 14",
  upload: "M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3",
  trash: "M5 7h14M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3",
  pencil: "M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4zM13.5 6.5l4 4",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  undo: "M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3",
  folder: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  note: "M5 4h10l4 4v12H5V4zm9 0v5h5M8 13h8M8 17h5",
  info: "M12 8h.01M11 12h1v4h1m-1-13a9 9 0 110 18 9 9 0 010-18z",
  chevronL: "M15 18l-6-6 6-6",
  chevronR: "M9 18l6-6-6-6",
  hash: "M5 9h14M5 15h14M10 3L8 21M16 3l-2 18",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
} as const;

type IconName = keyof typeof ICON_PATHS;

function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

const SECTION_TONES = {
  indigo: { wrap: "border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-white", icon: "from-[#0000BF] to-[#8b5cf6]" },
  sky: { wrap: "border-sky-100 bg-gradient-to-br from-sky-50/70 via-white to-white", icon: "from-sky-500 to-cyan-400" },
  emerald: { wrap: "border-emerald-100 bg-gradient-to-br from-emerald-50/70 via-white to-white", icon: "from-emerald-500 to-teal-400" },
  amber: { wrap: "border-amber-100 bg-gradient-to-br from-amber-50/70 via-white to-white", icon: "from-amber-500 to-orange-400" },
  violet: { wrap: "border-violet-100 bg-gradient-to-br from-violet-50/70 via-white to-white", icon: "from-violet-500 to-purple-400" },
} as const;

function FormSection({
  tone,
  icon,
  title,
  hint,
  right,
  children,
}: {
  tone: keyof typeof SECTION_TONES;
  icon: IconName;
  title: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  const t = SECTION_TONES[tone];
  return (
    <section className={`rounded-2xl border p-4 shadow-sm ${t.wrap}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ${t.icon}`}>
          <Icon name={icon} className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black text-[#1e1b4b]">{title}</h3>
          {hint ? <p className="text-[11px] text-slate-500">{hint}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function DropZone({ title, hint, onFile }: { title: string; hint: string; onFile: (file: File) => void }) {
  const [over, setOver] = useState(false);
  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  }
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-3 py-4 text-center transition ${
        over ? "border-amber-400 bg-amber-50" : "border-amber-200 hover:border-amber-400 hover:bg-amber-50/60"
      }`}
    >
      <Icon name="upload" className="h-7 w-7 text-amber-500" />
      <span className="text-sm font-bold text-[#2e2a58]">{title}</span>
      <span className="text-[11px] text-slate-500">{hint}</span>
      <input
        type="file"
        accept={DOC_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}

function DocRow({
  doc,
  compact,
  onRemove,
}: {
  doc: Pick<OsContractDocumentLink, "id" | "title" | "fileUrl" | "mimeType" | "originalName">;
  compact?: boolean;
  onRemove?: () => void;
}) {
  const href = mediaUrl(doc.fileUrl);
  const text = compact ? "text-[11px]" : "text-[12.5px]";
  return (
    <li className={`flex min-w-0 items-baseline gap-2 ${text}`}>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 truncate font-semibold text-[#0000BF] hover:underline"
          title={doc.title}
        >
          {doc.title}
        </a>
      ) : (
        <span className="min-w-0 truncate text-slate-600">{doc.title}</span>
      )}
      {onRemove ? (
        <button type="button" onClick={onRemove} className="shrink-0 text-[10.5px] font-semibold text-rose-500 hover:underline">
          ลบ
        </button>
      ) : null}
    </li>
  );
}

const GROUP_TONES = [
  { tile: "from-[#0000BF] to-[#8b5cf6]", on: "border-indigo-300 from-indigo-50 ring-indigo-200", text: "text-indigo-700", chip: "bg-indigo-100 text-indigo-700" },
  { tile: "from-sky-500 to-cyan-400", on: "border-sky-300 from-sky-50 ring-sky-200", text: "text-sky-700", chip: "bg-sky-100 text-sky-700" },
  { tile: "from-emerald-500 to-teal-400", on: "border-emerald-300 from-emerald-50 ring-emerald-200", text: "text-emerald-700", chip: "bg-emerald-100 text-emerald-700" },
  { tile: "from-amber-500 to-orange-400", on: "border-amber-300 from-amber-50 ring-amber-200", text: "text-amber-700", chip: "bg-amber-100 text-amber-800" },
  { tile: "from-pink-500 to-fuchsia-400", on: "border-pink-300 from-pink-50 ring-pink-200", text: "text-pink-700", chip: "bg-pink-100 text-pink-700" },
  { tile: "from-violet-500 to-purple-400", on: "border-violet-300 from-violet-50 ring-violet-200", text: "text-violet-700", chip: "bg-violet-100 text-violet-700" },
] as const;

/** สีอ่อนตามไตรมาส (ม.ค.–มี.ค., เม.ย.–มิ.ย., ก.ค.–ก.ย., ต.ค.–ธ.ค.) */
const MONTH_ACCENTS = [
  { bar: "bg-sky-300", soft: "from-sky-50/70 to-white", border: "border-sky-100", chip: "text-sky-700 bg-sky-100" },
  { bar: "bg-emerald-300", soft: "from-emerald-50/70 to-white", border: "border-emerald-100", chip: "text-emerald-700 bg-emerald-100" },
  { bar: "bg-amber-300", soft: "from-amber-50/70 to-white", border: "border-amber-100", chip: "text-amber-800 bg-amber-100" },
  { bar: "bg-violet-300", soft: "from-violet-50/70 to-white", border: "border-violet-100", chip: "text-violet-700 bg-violet-100" },
] as const;

function monthAccent(monthYm: string) {
  const m = Number(monthYm.slice(5, 7));
  return MONTH_ACCENTS[Math.floor((((m - 1) % 12) + 12) % 12 / 3)];
}

function monthsOfYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

function monthInRange(monthYm: string, startIso: string, endIso: string) {
  const y = Number(monthYm.slice(0, 4));
  const m = Number(monthYm.slice(5, 7));
  const ms = new Date(y, m - 1, 1).getTime();
  const me = new Date(y, m, 0, 23, 59, 59, 999).getTime();
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return me >= start && ms <= end;
}

function upsertContractInGroups(groups: OsAreaGroup[], contract: OsContract): OsAreaGroup[] {
  return groups.map((g) => {
    if (g.id !== contract.areaGroupId) return g;
    const list = g.contracts ?? [];
    const idx = list.findIndex((c) => c.id === contract.id);
    const contracts =
      idx >= 0 ? list.map((c, i) => (i === idx ? contract : c)) : [...list, contract];
    return { ...g, contracts };
  });
}

function removeContractFromGroups(groups: OsAreaGroup[], contractId: string, groupId: string): OsAreaGroup[] {
  return groups.map((g) =>
    g.id !== groupId ? g : { ...g, contracts: (g.contracts ?? []).filter((c) => c.id !== contractId) },
  );
}

function bumpContractAcceptanceCount(
  groups: OsAreaGroup[],
  contractId: string,
  delta: number,
): OsAreaGroup[] {
  return groups.map((g) => ({
    ...g,
    contracts: (g.contracts ?? []).map((c) =>
      c.id !== contractId
        ? c
        : {
            ...c,
            _count: { acceptances: Math.max(0, (c._count?.acceptances ?? 0) + delta) },
          },
    ),
  }));
}

function upsertAcceptance(list: OsMonthlyAcceptance[], row: OsMonthlyAcceptance): OsMonthlyAcceptance[] {
  const idx = list.findIndex((a) => a.id === row.id);
  if (idx >= 0) return list.map((a, i) => (i === idx ? row : a));
  return [...list, row].sort((a, b) => a.monthYm.localeCompare(b.monthYm));
}

function KpiTile({
  icon,
  label,
  value,
  sub,
  tile,
  wrap,
}: {
  icon: IconName;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tile: string;
  wrap: string;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border bg-gradient-to-br to-white p-3 shadow-sm ${wrap}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ${tile}`}>
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[10.5px] font-bold text-slate-500">{label}</p>
        <p className="truncate text-[15px] font-black tabular-nums text-[#1e1b4b]">{value}</p>
        {sub ? <p className="truncate text-[10.5px] text-slate-500">{sub}</p> : null}
      </div>
    </div>
  );
}

function RecordOnlyNote({ className = "" }: { className?: string }) {
  return (
    <p className={`flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2 text-[11.5px] text-sky-900 ${className}`}>
      <Icon name="info" className="mt-px h-4 w-4 shrink-0 text-sky-500" />
      <span>
        การตรวจรับเป็น<b>การบันทึกเพื่อติดตามเท่านั้น</b> — ไม่หักหรือกระทบงบประมาณ (ยอดงบประมาณมาจากไฟล์ระบบหลัก)
      </span>
    </p>
  );
}

export function OsOutsourcingPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [groups, setGroups] = useState<OsAreaGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedContractId, setSelectedContractId] = useState("");
  const [acceptances, setAcceptances] = useState<OsMonthlyAcceptance[]>([]);
  const [yearCe, setYearCe] = useState(currentYearCe);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<OsContract | null>(null);
  const [contractForm, setContractForm] = useState<ContractForm>(emptyContractForm);

  const [acceptModal, setAcceptModal] = useState<{ mode: "create" | "edit"; monthYm: string; id?: string } | null>(
    null,
  );
  const [acceptAmount, setAcceptAmount] = useState("");
  const [roundUnit, setRoundUnit] = useState<number>(1000);
  const [monthlyAuto, setMonthlyAuto] = useState(true);

  useEffect(() => {
    if (!monthlyAuto) return;
    const total = Number(contractForm.totalAmount);
    const count = contractMonths(contractForm.startDate, contractForm.endDate);
    if (contractForm.totalAmount.trim() === "" || !(total > 0) || !count) return;
    const next = String(suggestRoundMonthly(total, count, roundUnit));
    setContractForm((f) => (f.monthlyAmount === next ? f : { ...f, monthlyAmount: next }));
  }, [monthlyAuto, contractForm.totalAmount, contractForm.startDate, contractForm.endDate, roundUnit]);
  const [acceptNegative, setAcceptNegative] = useState(false);
  const [acceptRemarks, setAcceptRemarks] = useState("");
  const [acceptFile, setAcceptFile] = useState<File | null>(null);
  const [docUploadingId, setDocUploadingId] = useState<string | null>(null);
  const [contractDocUploading, setContractDocUploading] = useState(false);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const attachTargetIdRef = useRef<string | null>(null);
  const contractAttachInputRef = useRef<HTMLInputElement>(null);

  const loadGroups = useCallback(async (opts?: LoadOptions) => {
    setLoadBusy(setLoading, opts, true);
    setErr(null);
    try {
      const rows = await apiJson<OsAreaGroup[]>("/api/os-outsourcing/groups");
      setGroups(rows);
      setSelectedGroupId((prev) => prev || rows[0]?.id || "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดกลุ่มไม่สำเร็จ");
    } finally {
      setLoadBusy(setLoading, opts, false);
    }
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );
  const selectedGroupTone = GROUP_TONES[Math.max(0, groups.findIndex((g) => g.id === selectedGroupId)) % GROUP_TONES.length];

  const contracts = useMemo(() => selectedGroup?.contracts ?? [], [selectedGroup]);

  useEffect(() => {
    if (!selectedGroupId) return;
    const list = groups.find((g) => g.id === selectedGroupId)?.contracts ?? [];
    const still = list.some((c) => c.id === selectedContractId);
    if (!still) setSelectedContractId(list.find((c) => c.active)?.id ?? list[0]?.id ?? "");
  }, [selectedGroupId, groups, selectedContractId]);

  const selectedContract = useMemo(
    () => contracts.find((c) => c.id === selectedContractId) ?? null,
    [contracts, selectedContractId],
  );

  const loadAcceptances = useCallback(async (opts?: LoadOptions) => {
    if (!selectedContractId) {
      setAcceptances([]);
      return;
    }
    if (!opts?.silent) setErr(null);
    try {
      const rows = await apiJson<OsMonthlyAcceptance[]>(
        `/api/os-outsourcing/contracts/${selectedContractId}/acceptances?year=${yearCe}`,
      );
      setAcceptances(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดตรวจรับไม่สำเร็จ");
    }
  }, [selectedContractId, yearCe]);

  useEffect(() => {
    void loadAcceptances();
  }, [loadAcceptances]);

  const acceptanceByMonth = useMemo(() => {
    const map = new Map<string, OsMonthlyAcceptance>();
    for (const a of acceptances) map.set(a.monthYm, a);
    return map;
  }, [acceptances]);

  const yearStats = useMemo(() => {
    if (!selectedContract) return null;
    const months = monthsOfYear(yearCe).filter((m) => monthInRange(m, selectedContract.startDate, selectedContract.endDate));
    const done = months.filter((m) => acceptanceByMonth.has(m)).length;
    const total = acceptances.reduce((s, a) => s + a.acceptedAmount, 0);
    return { inRange: months.length, done, pending: months.length - done, total };
  }, [selectedContract, yearCe, acceptances, acceptanceByMonth]);

  function openCreateContract() {
    if (!selectedGroupId) {
      setErr("เลือกกลุ่มก่อน");
      return;
    }
    setEditingContract(null);
    setContractForm(emptyContractForm());
    setMonthlyAuto(true);
    setContractModalOpen(true);
    setErr(null);
  }

  function openEditContract(c: OsContract) {
    setEditingContract(c);
    setContractForm({
      vendorName: c.vendorName,
      contractNo: c.contractNo ?? "",
      title: c.title ?? "",
      startDate: toDateInput(c.startDate),
      endDate: toDateInput(c.endDate),
      monthlyAmount: c.monthlyAmount != null ? String(c.monthlyAmount) : "",
      totalAmount: c.totalAmount != null ? String(c.totalAmount) : "",
      notes: c.notes ?? "",
      active: c.active,
    });
    setMonthlyAuto(c.monthlyAmount == null);
    setContractModalOpen(true);
    setErr(null);
  }

  async function submitContract(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGroupId) return;
    const vendorName = contractForm.vendorName.trim();
    if (!vendorName) {
      setErr("กรอกชื่อผู้รับจ้าง");
      return;
    }
    if (!contractForm.startDate || !contractForm.endDate) {
      setErr("ระบุวันเริ่มและสิ้นสุดสัญญา");
      return;
    }
    {
      const total = Number(contractForm.totalAmount);
      const monthly = Number(contractForm.monthlyAmount);
      const count = contractMonths(contractForm.startDate, contractForm.endDate);
      if (contractForm.totalAmount.trim() && contractForm.monthlyAmount.trim() && count && lastInstallmentAmount(total, monthly, count) < 0) {
        setErr("งวดปกติสูงเกินมูลค่าสัญญา — งวดสุดท้ายติดลบ");
        return;
      }
    }
    setSaving(true);
    setErr(null);
    try {
      const body = {
        areaGroupId: editingContract?.areaGroupId ?? selectedGroupId,
        vendorName,
        contractNo: contractForm.contractNo.trim() || null,
        title: contractForm.title.trim() || null,
        startDate: contractForm.startDate,
        endDate: contractForm.endDate,
        monthlyAmount: contractForm.monthlyAmount.trim() === "" ? null : Number(contractForm.monthlyAmount),
        totalAmount: contractForm.totalAmount.trim() === "" ? null : Number(contractForm.totalAmount),
        notes: contractForm.notes.trim() || null,
        active: contractForm.active,
      };
      if (editingContract) {
        const updated = await apiJson<OsContract>(`/api/os-outsourcing/contracts/${editingContract.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        setGroups((prev) => upsertContractInGroups(prev, updated));
      } else {
        const created = await apiJson<OsContract>("/api/os-outsourcing/contracts", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setGroups((prev) => upsertContractInGroups(prev, created));
        setSelectedContractId(created.id);
      }
      setContractModalOpen(false);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "บันทึกสัญญาไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function removeContract(c: OsContract) {
    if (!confirm(`ลบสัญญา «${c.vendorName}» ? รายการตรวจรับและเอกสารของสัญญานี้จะถูกลบด้วย`)) return;
    setErr(null);
    try {
      await apiJson(`/api/os-outsourcing/contracts/${c.id}`, { method: "DELETE" });
      if (selectedContractId === c.id) setSelectedContractId("");
      setGroups((prev) => removeContractFromGroups(prev, c.id, c.areaGroupId));
      setAcceptances((prev) => (selectedContractId === c.id ? [] : prev));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "ลบสัญญาไม่สำเร็จ");
    }
  }

  function openAccept(monthYm: string) {
    if (!isAdmin) {
      setErr("การบันทึกตรวจรับต้องเป็นผู้ดูแลระบบ");
      return;
    }
    if (!selectedContract) return;
    setAcceptModal({ mode: "create", monthYm });
    const expected = installmentFor(selectedContract, monthYm);
    setAcceptAmount(expected != null ? String(Math.abs(expected)) : "");
    setAcceptNegative(false);
    setAcceptRemarks("");
    setAcceptFile(null);
    setErr(null);
  }

  function openEditAccept(a: OsMonthlyAcceptance) {
    if (!isAdmin) {
      setErr("แก้ไขตรวจรับต้องเป็นผู้ดูแลระบบ");
      return;
    }
    setAcceptModal({ mode: "edit", monthYm: a.monthYm, id: a.id });
    setAcceptAmount(String(Math.abs(a.acceptedAmount)));
    setAcceptNegative(a.acceptedAmount < 0);
    setAcceptRemarks(a.remarks ?? "");
    setAcceptFile(null);
    setErr(null);
  }

  async function submitAccept(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedContractId || !acceptModal) return;
    const raw = Number(acceptAmount);
    if (acceptAmount.trim() === "" || !Number.isFinite(raw)) {
      setErr("ยอดตรวจรับไม่ถูกต้อง");
      return;
    }
    const amount = acceptNegative ? -Math.abs(raw) : Math.abs(raw);
    setSaving(true);
    setErr(null);
    try {
      let saved: OsMonthlyAcceptance;
      if (acceptModal.mode === "edit" && acceptModal.id) {
        saved = await apiJson<OsMonthlyAcceptance>(`/api/os-outsourcing/acceptances/${acceptModal.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            acceptedAmount: amount,
            remarks: acceptRemarks.trim() || null,
          }),
        });
      } else {
        const fd = new FormData();
        fd.append("monthYm", acceptModal.monthYm);
        fd.append("acceptedAmount", String(amount));
        if (acceptRemarks.trim()) fd.append("remarks", acceptRemarks.trim());
        if (acceptFile) fd.append("file", acceptFile);
        saved = await apiFormJson<OsMonthlyAcceptance>(
          `/api/os-outsourcing/contracts/${selectedContractId}/acceptances`,
          fd,
        );
        setGroups((prev) => bumpContractAcceptanceCount(prev, selectedContractId, 1));
      }
      setAcceptances((prev) => upsertAcceptance(prev, saved));
      setAcceptModal(null);
      setAcceptFile(null);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : acceptModal.mode === "edit" ? "แก้ไขไม่สำเร็จ" : "บันทึกตรวจรับไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function revokeAccept(a: OsMonthlyAcceptance) {
    if (!isAdmin) {
      setErr("การยกเลิกตรวจรับต้องเป็นผู้ดูแลระบบ");
      return;
    }
    if (!confirm(`ยกเลิกบันทึกตรวจรับ ${monthLabel(a.monthYm)} ? เอกสารแนบของเดือนนี้จะถูกลบด้วย`)) return;
    setErr(null);
    try {
      await apiJson(`/api/os-outsourcing/acceptances/${a.id}`, { method: "DELETE" });
      setAcceptances((prev) => prev.filter((row) => row.id !== a.id));
      setGroups((prev) => bumpContractAcceptanceCount(prev, a.contractId, -1));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "ยกเลิกไม่สำเร็จ");
    }
  }

  function pickAttachDoc(acceptanceId: string) {
    if (!isAdmin) {
      setErr("แนบเอกสารตรวจรับต้องเป็นผู้ดูแลระบบ");
      return;
    }
    attachTargetIdRef.current = acceptanceId;
    attachInputRef.current?.click();
  }

  async function onAttachFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const acceptanceId = attachTargetIdRef.current;
    e.target.value = "";
    attachTargetIdRef.current = null;
    if (!file || !acceptanceId) return;
    setDocUploadingId(acceptanceId);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const updated = await apiFormJson<OsMonthlyAcceptance>(
        `/api/os-outsourcing/acceptances/${acceptanceId}/documents`,
        fd,
      );
      setAcceptances((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "แนบเอกสารไม่สำเร็จ");
    } finally {
      setDocUploadingId(null);
    }
  }

  async function removeAcceptanceDoc(acceptanceId: string, linkId: string, title: string) {
    if (!isAdmin) return;
    if (!confirm(`ลบเอกสาร «${title}» จากตรวจรับและคลังเอกสาร?`)) return;
    setErr(null);
    try {
      const updated = await apiJson<OsMonthlyAcceptance>(
        `/api/os-outsourcing/acceptances/${acceptanceId}/documents/${linkId}`,
        { method: "DELETE" },
      );
      setAcceptances((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "ลบเอกสารไม่สำเร็จ");
    }
  }

  function pickContractAttachDoc() {
    if (!isAdmin) {
      setErr("แนบเอกสารสัญญาต้องเป็นผู้ดูแลระบบ");
      return;
    }
    if (!selectedContractId) return;
    contractAttachInputRef.current?.click();
  }

  async function onContractAttachFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedContractId) return;
    setContractDocUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const updated = await apiFormJson<OsContract>(`/api/os-outsourcing/contracts/${selectedContractId}/documents`, fd);
      setGroups((prev) => upsertContractInGroups(prev, updated));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "แนบเอกสารสัญญาไม่สำเร็จ");
    } finally {
      setContractDocUploading(false);
    }
  }

  async function removeContractDoc(linkId: string, title: string) {
    if (!isAdmin || !selectedContractId) return;
    if (!confirm(`ลบเอกสาร «${title}» จากสัญญาและคลังเอกสาร?`)) return;
    setErr(null);
    try {
      const updated = await apiJson<OsContract>(`/api/os-outsourcing/contracts/${selectedContractId}/documents/${linkId}`, {
        method: "DELETE",
      });
      setGroups((prev) => upsertContractInGroups(prev, updated));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "ลบเอกสารสัญญาไม่สำเร็จ");
    }
  }

  const formMonths = contractMonths(contractForm.startDate, contractForm.endDate);
  const formMonthly = contractForm.monthlyAmount.trim() === "" ? null : Number(contractForm.monthlyAmount);
  const formTotalRaw = contractForm.totalAmount.trim() === "" ? null : Number(contractForm.totalAmount);
  const formTotal = formTotalRaw != null && Number.isFinite(formTotalRaw) && formTotalRaw > 0 ? formTotalRaw : null;
  const acceptMonthYm = acceptModal?.monthYm ?? "";
  const acceptAccent = acceptMonthYm ? monthAccent(acceptMonthYm) : MONTH_ACCENTS[0];

  return (
    <div>
      <PageHeaderBar
        title="งานจ้าง OS"
        count={groups.length}
        subtitle="บันทึกสัญญาและการตรวจรับรายเดือน (บันทึกเพื่อติดตาม ไม่หักงบประมาณ)"
        filter={{
          value: "",
          onChange: () => {},
          showSearch: false,
          printTitle: "งานจ้าง OS — ตรวจรับรายเดือน",
        }}
        segments={
          <div className={toolbarMasterGroupClass}>
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`${toolbarMasterBtnClass} ${selectedGroupId === g.id ? "bg-[#0000BF]/10" : ""}`}
                onClick={() => setSelectedGroupId(g.id)}
              >
                {g.name}
              </button>
            ))}
          </div>
        }
        extras={
          <button type="button" className={toolbarLinkBtnClass} onClick={() => setDocsOpen(true)}>
            <Icon name="folder" className="mr-1 inline h-3.5 w-3.5" />
            คลังเอกสาร
          </button>
        }
        primary={
          <button type="button" className={toolbarPrimaryBtnClass} onClick={openCreateContract}>
            <Icon name="plus" className="mr-1 inline h-3.5 w-3.5" />
            เพิ่มสัญญา
          </button>
        }
      />

      <ModuleDocumentsModal
        open={docsOpen}
        onClose={() => setDocsOpen(false)}
        categoryName={MODULE_DOCUMENT_CATEGORIES.osOutsourcing}
      />

      {err && !contractModalOpen && !acceptModal ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <Icon name="info" className="h-4 w-4 shrink-0" />
          {err}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-6 text-center text-sm text-slate-600">กำลังโหลด…</p>
      ) : !groups.length ? (
        <p className="mt-6 text-center text-sm text-slate-600">ยังไม่มีกลุ่มพื้นที่</p>
      ) : (
        <>
          {selectedGroup ? (
            <section className="mt-4 overflow-hidden rounded-[1.25rem] border border-[#e8e6fc] bg-white shadow-sm">
              <div className={`h-1.5 bg-gradient-to-r ${selectedGroupTone.tile}`} aria-hidden />
              <div className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${selectedGroupTone.tile}`}>
                      <Icon name="building" className="h-6 w-6" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-md px-1.5 py-px font-mono text-[10px] font-black ${selectedGroupTone.chip}`}>
                          {selectedGroup.code}
                        </span>
                        <span className="text-[12px] font-bold text-slate-500">{selectedGroup.name}</span>
                        {selectedContract ? (
                          selectedContract.active ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-px text-[10px] font-black text-emerald-700">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                              ใช้งาน
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-px text-[10px] font-black text-slate-600">
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                              ปิดสัญญา
                            </span>
                          )
                        ) : null}
                      </div>
                      {selectedContract ? (
                        <>
                          <h2 className="mt-1 text-base font-black leading-snug text-[#1e1b4b]">{selectedContract.vendorName}</h2>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-slate-600">
                            {selectedContract.contractNo ? (
                              <span className="inline-flex items-center gap-1">
                                <Icon name="hash" className="h-3.5 w-3.5 text-indigo-400" />
                                <span className="font-mono">{selectedContract.contractNo}</span>
                              </span>
                            ) : null}
                            {selectedContract.title ? (
                              <span className="inline-flex items-center gap-1">
                                <Icon name="note" className="h-3.5 w-3.5 text-indigo-400" />
                                {selectedContract.title}
                              </span>
                            ) : null}
                          </p>
                        </>
                      ) : (
                        <p className="mt-1.5 text-[12.5px] text-amber-800">ยังไม่มีสัญญาในกลุ่มนี้ — กด «เพิ่มสัญญา»</p>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {contracts.length > 1 ? (
                      <select
                        aria-label="เลือกสัญญา"
                        className="max-w-[16rem] rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-800 shadow-sm focus:border-[#8b5cf6] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20"
                        value={selectedContractId}
                        onChange={(e) => setSelectedContractId(e.target.value)}
                      >
                        {contracts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.active ? "● " : "○ "}
                            {c.contractNo ? `${c.contractNo} · ` : ""}
                            {c.vendorName}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {selectedContract ? (
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100"
                          onClick={() => openEditContract(selectedContract)}
                        >
                          <Icon name="pencil" className="h-3.5 w-3.5" />
                          แก้ไขสัญญา
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-600 hover:bg-rose-100"
                          onClick={() => void removeContract(selectedContract)}
                        >
                          <Icon name="trash" className="h-3.5 w-3.5" />
                          ลบ
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {selectedContract && yearStats ? (
                  <>
                    <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                      <KpiTile
                        icon="calendar"
                        label="ระยะสัญญา"
                        value={`${contractMonths(selectedContract.startDate, selectedContract.endDate) ?? "—"} เดือน`}
                        sub={`${fmtDate(selectedContract.startDate)} – ${fmtDate(selectedContract.endDate)}`}
                        tile="from-sky-500 to-cyan-400"
                        wrap="border-sky-100 from-sky-50/80"
                      />
                      <KpiTile
                        icon="wallet"
                        label={selectedContract.totalAmount != null ? "งวดปกติ / เดือน" : "ยอดรายเดือนตามสัญญา"}
                        value={`${fmtMoney(selectedContract.monthlyAmount)} บาท`}
                        sub={
                          selectedContract.totalAmount != null && selectedContract.monthlyAmount != null ? (
                            <>
                              งวดสุดท้าย{" "}
                              <b className="tabular-nums text-emerald-700">
                                {fmtMoney(installmentFor(selectedContract, lastInstallmentYm(selectedContract.endDate) ?? ""))}
                              </b>{" "}
                              · มูลค่ารวม {fmtMoney(selectedContract.totalAmount)}
                            </>
                          ) : (
                            "ใช้เป็นค่าเริ่มต้นตอนตรวจรับ"
                          )
                        }
                        tile="from-emerald-500 to-teal-400"
                        wrap="border-emerald-100 from-emerald-50/80"
                      />
                      <KpiTile
                        icon="checkCircle"
                        label={`ตรวจรับปี ${yearCe + 543}`}
                        value={`${yearStats.done} / ${yearStats.inRange} เดือน`}
                        sub={
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-violet-100">
                            <span
                              className="block h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400"
                              style={{ width: `${yearStats.inRange ? (yearStats.done / yearStats.inRange) * 100 : 0}%` }}
                            />
                          </span>
                        }
                        tile="from-violet-500 to-purple-400"
                        wrap="border-violet-100 from-violet-50/80"
                      />
                      <KpiTile
                        icon="chart"
                        label={`ยอดตรวจรับรวมปี ${yearCe + 543}`}
                        value={`${fmtMoney(yearStats.total)} บาท`}
                        sub={yearStats.pending ? `รอตรวจรับ ${yearStats.pending} เดือน` : "ครบทุกเดือนในปีนี้"}
                        tile="from-[#0000BF] to-[#8b5cf6]"
                        wrap="border-indigo-100 from-indigo-50/80"
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px]">
                      <span className="font-bold text-slate-500">เอกสารสัญญา:</span>
                      <input
                        ref={contractAttachInputRef}
                        type="file"
                        className="hidden"
                        accept={DOC_ACCEPT}
                        onChange={(e) => void onContractAttachFileSelected(e)}
                      />
                      {(selectedContract.documents ?? []).length ? (
                        <ul className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
                          {(selectedContract.documents ?? []).map((d) => (
                            <DocRow key={d.id} doc={d} onRemove={isAdmin ? () => void removeContractDoc(d.id, d.title) : undefined} />
                          ))}
                        </ul>
                      ) : (
                        <span className="text-slate-400">ยังไม่มี</span>
                      )}
                      {isAdmin ? (
                        <button
                          type="button"
                          disabled={contractDocUploading}
                          className="font-semibold text-[#0000BF] hover:underline disabled:opacity-40"
                          onClick={pickContractAttachDoc}
                        >
                          {contractDocUploading ? "กำลังอัปโหลด…" : "+ แนบเอกสาร"}
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            </section>
          ) : null}

          {selectedContract ? (
            <section className="mt-4 overflow-hidden rounded-[1.25rem] border border-[#e8e6fc] bg-gradient-to-br from-white via-[#faf9ff] to-[#f3f0ff]/80 shadow-sm shadow-[#0000BF]/[0.04]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ecebff] bg-white/70 px-4 py-3 backdrop-blur-sm">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-400 text-white shadow-md">
                    <Icon name="checkCircle" className="h-[18px] w-[18px]" />
                  </span>
                  <div>
                    <h2 className="text-sm font-black text-[#1e1b4b]">ตรวจรับรายเดือน</h2>
                    <p className="text-[11px] text-slate-500">บันทึกเพื่อติดตามเท่านั้น — ไม่หักงบประมาณ</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 rounded-full border border-violet-200 bg-white p-0.5 shadow-sm">
                  <button
                    type="button"
                    className="rounded-full p-1.5 text-violet-600 hover:bg-violet-50"
                    onClick={() => setYearCe((y) => y - 1)}
                    title="ปีก่อนหน้า"
                  >
                    <Icon name="chevronL" className="h-4 w-4" />
                  </button>
                  <span className="min-w-[5rem] text-center text-sm font-black tabular-nums text-[#1e1b4b]">
                    พ.ศ. {yearCe + 543}
                  </span>
                  <button
                    type="button"
                    className="rounded-full p-1.5 text-violet-600 hover:bg-violet-50"
                    onClick={() => setYearCe((y) => y + 1)}
                    title="ปีถัดไป"
                  >
                    <Icon name="chevronR" className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <input
                ref={attachInputRef}
                type="file"
                className="hidden"
                accept={DOC_ACCEPT}
                onChange={(e) => void onAttachFileSelected(e)}
              />

              <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {monthsOfYear(yearCe).map((monthYm) => {
                  const inRange = monthInRange(monthYm, selectedContract.startDate, selectedContract.endDate);
                  const row = acceptanceByMonth.get(monthYm);
                  const docs = row?.documents ?? [];
                  const accent = monthAccent(monthYm);
                  const amountDisplay = row
                    ? fmtMoney(row.acceptedAmount)
                    : inRange
                      ? fmtMoney(installmentFor(selectedContract, monthYm))
                      : "—";
                  const lastInstallment =
                    inRange && selectedContract.totalAmount != null && isLastInstallment(selectedContract, monthYm);

                  return (
                    <article
                      key={monthYm}
                      className={`relative overflow-hidden rounded-xl border px-3 py-2 shadow-sm ${
                        !inRange
                          ? "border-slate-200/80 bg-slate-50 opacity-60"
                          : `${accent.border} bg-gradient-to-br ${accent.soft}`
                      }`}
                    >
                      <span className={`absolute inset-y-0 left-0 w-1 ${inRange ? accent.bar : "bg-slate-300"}`} aria-hidden />
                      <div className="pl-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[13px] font-black text-[#1e1b4b]">
                            {monthLabel(monthYm)}
                            {lastInstallment ? <span className="ml-1.5 text-[10px] font-bold text-amber-600">งวดสุดท้าย</span> : null}
                          </p>
                          {!inRange ? (
                            <span className="text-[10px] font-bold text-slate-500">นอกสัญญา</span>
                          ) : row ? (
                            <span className="rounded-full bg-emerald-500 px-1.5 py-px text-[10px] font-bold text-white">ตรวจรับแล้ว</span>
                          ) : (
                            <span className={`rounded-full px-1.5 py-px text-[10px] font-bold ${accent.chip}`}>รอตรวจรับ</span>
                          )}
                        </div>

                        {inRange ? (
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <p
                              className={`text-base font-black tabular-nums ${
                                row && row.acceptedAmount < 0 ? "text-rose-600" : row ? "text-[#1e1b4b]" : "text-slate-400"
                              }`}
                              title={row ? "ยอดตรวจรับ (บาท)" : "ยอดตามสัญญา (บาท)"}
                            >
                              {amountDisplay}
                              {row && row.acceptedAmount < 0 ? (
                                <span className="ml-1 text-[10px] font-bold text-rose-600">ปรับลด</span>
                              ) : null}
                            </p>
                            {row ? (
                              <span className="flex shrink-0 items-center gap-2 text-[11px] font-semibold">
                                <button
                                  type="button"
                                  disabled={!isAdmin}
                                  className="text-amber-700 hover:underline disabled:opacity-40"
                                  onClick={() => openEditAccept(row)}
                                >
                                  แก้ไข
                                </button>
                                <button
                                  type="button"
                                  disabled={!isAdmin || docUploadingId === row.id}
                                  className="text-[#0000BF] hover:underline disabled:opacity-40"
                                  onClick={() => pickAttachDoc(row.id)}
                                >
                                  {docUploadingId === row.id ? "อัปโหลด…" : "แนบ"}
                                </button>
                                <button
                                  type="button"
                                  disabled={!isAdmin}
                                  className="text-rose-600 hover:underline disabled:opacity-40"
                                  onClick={() => void revokeAccept(row)}
                                >
                                  ยกเลิก
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={!isAdmin}
                                className="shrink-0 rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm transition hover:brightness-110 disabled:opacity-40"
                                onClick={() => openAccept(monthYm)}
                              >
                                บันทึกตรวจรับ
                              </button>
                            )}
                          </div>
                        ) : null}

                        {row?.remarks ? <p className="mt-0.5 truncate text-[10.5px] text-slate-500" title={row.remarks}>{row.remarks}</p> : null}

                        {inRange && row && docs.length ? (
                          <ul className="mt-1 space-y-0.5 border-t border-black/5 pt-1">
                            {docs.map((d) => (
                              <DocRow
                                key={d.id}
                                doc={d}
                                compact
                                onRemove={isAdmin ? () => void removeAcceptanceDoc(row.id, d.id, d.title) : undefined}
                              />
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
              {!isAdmin ? (
                <p className="border-t border-[#ecebff] bg-white/60 px-4 py-2 text-center text-[11px] text-slate-500">
                  การบันทึก / แก้ไขตรวจรับ ทำได้เฉพาะผู้ดูแลระบบ (ADMIN)
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      )}

      <Modal
        open={contractModalOpen}
        onClose={() => !saving && setContractModalOpen(false)}
        title={
          <span className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-white">
              <Icon name="shield" className="h-4 w-4" />
            </span>
            {editingContract ? "แก้ไขสัญญา" : "เพิ่มสัญญา"}
            {selectedGroup ? (
              <span className={`rounded-md px-1.5 py-px text-[11px] font-bold ${selectedGroupTone.chip}`}>{selectedGroup.name}</span>
            ) : null}
          </span>
        }
        size="wide"
      >
        <form onSubmit={(e) => void submitContract(e)}>
          <ModalFormBody>
            {err && contractModalOpen ? (
              <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>
            ) : null}
            <div className="space-y-4">
              <FormSection tone="indigo" icon="building" title="ข้อมูลสัญญา" hint="ผู้รับจ้าง เลขที่ และชื่อสัญญา">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className={labelClass}>
                      ผู้รับจ้าง / บริษัท <span className="text-rose-500">*</span>
                    </span>
                    <input
                      required
                      className={inputClass}
                      placeholder="เช่น บริษัท รักษาความปลอดภัย ท๊อป การ์เดียน จำกัด"
                      value={contractForm.vendorName}
                      onChange={(e) => setContractForm((f) => ({ ...f, vendorName: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className={`${labelClass} inline-flex items-center gap-1`}>
                      <Icon name="hash" className="h-3.5 w-3.5 text-indigo-400" />
                      เลขสัญญา
                    </span>
                    <input
                      className={inputClass}
                      placeholder="เช่น CIT-OS-001/2569"
                      value={contractForm.contractNo}
                      onChange={(e) => setContractForm((f) => ({ ...f, contractNo: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className={`${labelClass} inline-flex items-center gap-1`}>
                      <Icon name="note" className="h-3.5 w-3.5 text-indigo-400" />
                      ชื่อสัญญา / รายการ
                    </span>
                    <input
                      className={inputClass}
                      placeholder="เช่น จ้างเหมารักษาความปลอดภัย ท่าเรือ"
                      value={contractForm.title}
                      onChange={(e) => setContractForm((f) => ({ ...f, title: e.target.value }))}
                    />
                  </label>
                </div>
              </FormSection>

              <div className="space-y-4">
                <FormSection
                  tone="sky"
                  icon="calendar"
                  title="ระยะเวลาสัญญา"
                  hint="เดือนที่อยู่ในช่วงนี้จะเปิดให้บันทึกตรวจรับ"
                  right={
                    formMonths ? (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-black text-sky-700">{formMonths} เดือน</span>
                    ) : null
                  }
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className={labelClass}>
                        วันเริ่ม <span className="text-rose-500">*</span>
                      </span>
                      <input
                        required
                        type="date"
                        className={inputClass}
                        value={contractForm.startDate}
                        onChange={(e) => setContractForm((f) => ({ ...f, startDate: e.target.value }))}
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>
                        วันสิ้นสุด <span className="text-rose-500">*</span>
                      </span>
                      <input
                        required
                        type="date"
                        className={inputClass}
                        value={contractForm.endDate}
                        onChange={(e) => setContractForm((f) => ({ ...f, endDate: e.target.value }))}
                      />
                    </label>
                  </div>
                </FormSection>

                <FormSection
                  tone="emerald"
                  icon="wallet"
                  title="มูลค่าสัญญาและงวดรายเดือน"
                  hint="งวดปกติใช้เลขกลม เศษทั้งหมดไปรวมที่งวดสุดท้าย"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className={`${labelClass} flex h-4 items-center`}>มูลค่าสัญญารวม (บาท)</span>
                      <CommaNumberInput
                        className={`${inputClass} text-right font-bold tabular-nums`}
                        placeholder="0.00"
                        maxFractionDigits={2}
                        value={contractForm.totalAmount}
                        onChange={(v) => setContractForm((f) => ({ ...f, totalAmount: v }))}
                      />
                    </label>
                    <label className="block">
                      <span className={`${labelClass} flex h-4 items-center justify-between gap-2`}>
                        <span>งวดปกติ / เดือน (บาท)</span>
                        {formTotal != null && !monthlyAuto ? (
                          <button
                            type="button"
                            className="font-semibold text-[#0000BF] hover:underline"
                            onClick={() => setMonthlyAuto(true)}
                          >
                            คำนวณใหม่
                          </button>
                        ) : null}
                      </span>
                      <CommaNumberInput
                        className={`${inputClass} text-right font-bold tabular-nums`}
                        placeholder="0.00"
                        maxFractionDigits={2}
                        value={contractForm.monthlyAmount}
                        onChange={(v) => {
                          setMonthlyAuto(false);
                          setContractForm((f) => ({ ...f, monthlyAmount: v }));
                        }}
                      />
                    </label>
                  </div>

                  {formTotal != null ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="font-semibold text-slate-500">ปัดงวดปกติเป็น</span>
                      {ROUND_UNITS.map((u) => (
                        <button
                          key={u.v}
                          type="button"
                          onClick={() => {
                            setRoundUnit(u.v);
                            setMonthlyAuto(true);
                          }}
                          className={`rounded-full border px-2.5 py-0.5 font-bold transition ${
                            monthlyAuto && roundUnit === u.v
                              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                              : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                          }`}
                        >
                          {u.label}
                        </button>
                      ))}
                      {!monthlyAuto ? <span className="text-slate-400">(กรอกเอง)</span> : null}
                    </div>
                  ) : null}

                  {formMonths && formTotal != null && formMonthly != null && Number.isFinite(formMonthly) ? (
                    (() => {
                      const last = lastInstallmentAmount(formTotal, formMonthly, formMonths);
                      const firstYm = lastInstallmentYm(contractForm.startDate);
                      const lastYm = lastInstallmentYm(contractForm.endDate);
                      const invalid = last < 0;
                      return (
                        <div
                          className={`mt-2 space-y-1 rounded-xl px-3 py-2 text-[12px] ${
                            invalid ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-900"
                          }`}
                        >
                          {formMonths > 1 ? (
                            <p className="flex items-baseline justify-between gap-2">
                              <span>
                                งวดที่ 1–{formMonths - 1}
                                {firstYm ? <span className="text-emerald-700/70"> ({monthLabel(firstYm)} …)</span> : null}
                              </span>
                              <span className="tabular-nums">
                                {fmtMoney(formMonthly)} × {formMonths - 1} = <b>{fmtMoney(formMonthly * (formMonths - 1))}</b>
                              </span>
                            </p>
                          ) : null}
                          <p className="flex items-baseline justify-between gap-2">
                            <span>
                              งวดสุดท้าย (งวดที่ {formMonths})
                              {lastYm ? <span className="text-emerald-700/70"> {monthLabel(lastYm)}</span> : null}
                            </span>
                            <b className="tabular-nums text-amber-700">{fmtMoney(last)}</b>
                          </p>
                          <p className="flex items-baseline justify-between gap-2 border-t border-emerald-200/70 pt-1 font-bold">
                            <span>รวมทั้งสัญญา</span>
                            <span className="tabular-nums">{fmtMoney(formTotal)} บาท</span>
                          </p>
                          {invalid ? <p className="font-bold">งวดปกติสูงเกินไป — งวดสุดท้ายติดลบ</p> : null}
                        </div>
                      );
                    })()
                  ) : formMonths && formMonthly != null && Number.isFinite(formMonthly) ? (
                    <p className="mt-2 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-1.5 text-[11.5px] text-emerald-800">
                      <span>มูลค่าโดยประมาณ ({formMonths} เดือน) — ใส่มูลค่าสัญญารวมเพื่อคำนวณงวดสุดท้าย</span>
                      <b className="tabular-nums">{fmtMoney(formMonthly * formMonths)} บาท</b>
                    </p>
                  ) : null}
                </FormSection>
              </div>

              <FormSection tone="violet" icon="note" title="สถานะและหมายเหตุ">
                <div className="flex flex-wrap gap-2">
                  {[
                    { v: true, label: "ใช้งานอยู่", on: "border-emerald-300 bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
                    { v: false, label: "ปิดสัญญา", on: "border-slate-300 bg-slate-100 text-slate-700", dot: "bg-slate-400" },
                  ].map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      onClick={() => setContractForm((f) => ({ ...f, active: o.v }))}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                        contractForm.active === o.v ? `${o.on} shadow-sm` : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${o.dot}`} />
                      {o.label}
                    </button>
                  ))}
                </div>
                <label className="mt-3 block">
                  <span className={labelClass}>หมายเหตุ</span>
                  <textarea
                    rows={2}
                    className={inputClass}
                    placeholder="เช่น ต่ออายุสัญญาจากปีก่อน / เงื่อนไขพิเศษ"
                    value={contractForm.notes}
                    onChange={(e) => setContractForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </label>
              </FormSection>
            </div>
          </ModalFormBody>
          <ModalFormActions>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-5 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก…" : "บันทึกสัญญา"}
            </button>
            <button
              type="button"
              disabled={saving}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => setContractModalOpen(false)}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      <Modal
        open={Boolean(acceptModal)}
        onClose={() => !saving && setAcceptModal(null)}
        size="form"
        title={
          <span className="flex items-center gap-2">
            <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${acceptAccent.chip}`}>
              <Icon name="checkCircle" className="h-4 w-4" />
            </span>
            {acceptModal?.mode === "edit" ? "แก้ไขตรวจรับ" : "บันทึกตรวจรับ"}
            {acceptMonthYm ? (
              <span className={`rounded-full px-2 py-px text-[11px] font-bold ${acceptAccent.chip}`}>{monthLabel(acceptMonthYm)}</span>
            ) : null}
          </span>
        }
      >
        <form onSubmit={(e) => void submitAccept(e)}>
          <ModalFormBody>
            {err && acceptModal ? (
              <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>
            ) : null}
            <div className="space-y-4">
              <RecordOnlyNote />

              <FormSection
                tone="emerald"
                icon="wallet"
                title="ยอดตรวจรับ"
                hint={(() => {
                  if (!selectedContract || !acceptMonthYm) return undefined;
                  const expected = installmentFor(selectedContract, acceptMonthYm);
                  if (expected == null) return undefined;
                  const last = selectedContract.totalAmount != null && isLastInstallment(selectedContract, acceptMonthYm);
                  return `ตามสัญญา${last ? " (งวดสุดท้าย รวมเศษ)" : ""} ${fmtMoney(expected)} บาท`;
                })()}
              >
                <div className="flex flex-wrap gap-2">
                  {[
                    { neg: false, label: "ยอดปกติ", icon: "plus" as const, on: "border-emerald-300 bg-emerald-50 text-emerald-800" },
                    { neg: true, label: "ปรับลด / หักคืน", icon: "minus" as const, on: "border-rose-300 bg-rose-50 text-rose-700" },
                  ].map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      onClick={() => setAcceptNegative(o.neg)}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                        acceptNegative === o.neg ? `${o.on} shadow-sm` : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      <Icon name={o.icon} className="h-3.5 w-3.5" />
                      {o.label}
                    </button>
                  ))}
                </div>
                <label className="mt-3 block">
                  <span className={labelClass}>
                    จำนวนเงิน (บาท) <span className="text-rose-500">*</span>
                  </span>
                  <div className="relative">
                    {acceptNegative ? (
                      <span className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-lg font-black text-rose-500">−</span>
                    ) : null}
                    <CommaNumberInput
                      required
                      className={`${inputClass} text-right text-base font-black tabular-nums ${acceptNegative ? "pl-8 text-rose-600" : ""}`}
                      placeholder="0.00"
                      maxFractionDigits={2}
                      value={acceptAmount}
                      onChange={setAcceptAmount}
                    />
                  </div>
                </label>
              </FormSection>

              {acceptModal?.mode === "create" ? (
                <FormSection tone="amber" icon="clip" title="เอกสารตรวจรับ" hint="เก็บในคลังเอกสารหมวด «งานจ้าง OS» (ไม่บังคับ)">
                  {acceptFile ? (
                    <ul>
                      <li className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
                        <span className={`flex h-8 w-10 shrink-0 items-center justify-center rounded-lg text-[10px] font-black ${fileKind(acceptFile.name, acceptFile.type).cls}`}>
                          {fileKind(acceptFile.name, acceptFile.type).label}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] font-semibold text-[#1e1b4b]">{acceptFile.name}</p>
                          <p className="text-[10.5px] text-slate-500">
                            {(acceptFile.size / 1024).toLocaleString("th-TH", { maximumFractionDigits: 0 })} KB
                            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-px font-bold text-amber-700">รออัปโหลด</span>
                          </p>
                        </div>
                        <button type="button" onClick={() => setAcceptFile(null)} className="rounded-lg p-1 text-rose-500 hover:bg-rose-50" title="นำออก">
                          <Icon name="x" className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    </ul>
                  ) : (
                    <DropZone title="ลากไฟล์มาวาง หรือคลิกเพื่อเลือก" hint="PDF, Word, Excel, PowerPoint" onFile={setAcceptFile} />
                  )}
                </FormSection>
              ) : null}

              <FormSection tone="indigo" icon="note" title="หมายเหตุ">
                <textarea
                  rows={2}
                  className={`${inputClass} !mt-0`}
                  placeholder="เช่น หักค่าปรับขาดเวร 2 ผลัด"
                  value={acceptRemarks}
                  onChange={(e) => setAcceptRemarks(e.target.value)}
                />
              </FormSection>
            </div>
          </ModalFormBody>
          <ModalFormActions>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-5 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก…" : acceptModal?.mode === "edit" ? "บันทึกการแก้ไข" : "บันทึกตรวจรับ"}
            </button>
            <button
              type="button"
              disabled={saving}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => setAcceptModal(null)}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>
    </div>
  );
}
