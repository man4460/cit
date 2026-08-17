import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { apiJson } from "../api/client";
import { FitSingleLine } from "../components/FitSingleLine";
import { Modal, ModalFormActions, ModalFormBody } from "../components/Modal";
import { ModuleDocumentsModal } from "../components/ModuleDocumentsModal";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { PickableDateInput } from "../components/PickableDateInput";
import { PrintA4Table } from "../components/PrintA4Table";
import { MODULE_DOCUMENT_CATEGORIES } from "../lib/moduleDocumentCategories";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { listCardAccentClass, brandGradientFillClass, toolbarLinkBtnClass, toolbarMasterBtnClass, toolbarMasterGroupClass, toolbarPrimaryBtnClass } from "../lib/uiTokens";
import { ListPagination } from "../components/ListPagination";
import type { FireExtinguisher, FireHost } from "../types";
import type { LoadOptions } from "../lib/loadOptions";
import { setLoadBusy } from "../lib/loadOptions";

const PAGE_SIZE = 25; // 5 คอลัมน์ × 5 แถว
const fireGridClass = "grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
const fireCardClass =
  "group relative flex h-full flex-col overflow-hidden rounded-xl border border-[#e8e6fc] bg-gradient-to-br from-white/95 via-[#faf9ff]/90 to-[#fdf2f8]/50 p-2 shadow-[0_8px_20px_-16px_rgba(30,27,75,0.35)] transition hover:border-[#0000BF]/35";

type TabId = "extinguishers" | "hosts";
type DashKey = "" | "all" | "normal" | "abnormal" | "disposed" | "expired" | "expiring" | "noDate";
type TankLifeStatus = "ok" | "expiring" | "expired" | "unknown";

function emptyForm() {
  return {
    code: "",
    location: "",
    kind: "",
    sizeLabel: "",
    manufacturedAt: "",
    status: "ปกติ",
    guardTeam: "",
    notes: "",
  };
}

function emptyHostForm() {
  return { code: "", detail: "", location: "", guardTeam: "" };
}

type HostEquipKind =
  | "hose"
  | "nozzle"
  | "outlet"
  | "axe"
  | "wrench"
  | "pump"
  | "grate"
  | "suction"
  | "coupling"
  | "lamp"
  | "fuel"
  | "tank"
  | "other";

type HostEquipItem = {
  name: string;
  qty: number | null;
  unit: string | null;
  note: string;
  kind: HostEquipKind;
};

const EQUIP_KIND_LABEL: Record<HostEquipKind, string> = {
  hose: "สายดับเพลิง",
  nozzle: "หัวฉีด",
  outlet: "หัวจ่ายน้ำ",
  axe: "ขวาน",
  wrench: "ชะแลง",
  pump: "เครื่องสูบน้ำ",
  grate: "ตะแกรง",
  suction: "งวงสูบน้ำ",
  coupling: "ข้อต่อ",
  lamp: "ไฟส่องสว่าง",
  fuel: "ถังน้ำมัน",
  tank: "ถังดับเพลิง",
  other: "อื่น ๆ",
};

const EQUIP_UNITS = "ม้วน|อัน|หัว|ด้าม|เส้น|ดวง|ถัง";

function normalizeHostDetailText(s: string): string {
  return s
    .replace(/[\u200b\u200c\u200d\ufeff\u00a0]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyHostEquip(name: string): HostEquipKind {
  const n = name.toLowerCase();
  if (/สายดับเพลิง|สายเปียก|สายแห้ง/.test(n)) return "hose";
  if (/หัวฉีด/.test(n)) return "nozzle";
  if (/หัวจ่าย/.test(n)) return "outlet";
  if (/ขวาน|ขวาม/.test(n)) return "axe";
  if (/แชลง|ที่ขัน/.test(n)) return "wrench";
  if (/เครื่องสูบ/.test(n)) return "pump";
  if (/ตะแกรง/.test(n)) return "grate";
  if (/งวง/.test(n)) return "suction";
  if (/ข้อต่อ/.test(n)) return "coupling";
  if (/ไฟส่อง|ส่องสว่าง/.test(n)) return "lamp";
  if (/ถังน้ำมัน|น้ำมัน/.test(n)) return "fuel";
  if (/ถัง|bf|ดับเพลิง/.test(n)) return "tank";
  return "other";
}

function parseHostDetailLine(raw: string): HostEquipItem | null {
  let line = normalizeHostDetailText(raw);
  if (!line || line === "#NAME?") return null;

  let note = "";
  const noteMatch = line.match(/^(.*?)(\([^)]*\))\s*$/);
  if (noteMatch) {
    line = noteMatch[1].trim();
    note = noteMatch[2].replace(/^\(|\)$/g, "").trim();
  }

  const qtyNamed = line.match(new RegExp(`^(.*?)\\s*จำนวน\\s+(\\d+)\\s*(${EQUIP_UNITS})?\\s*$`));
  if (qtyNamed) {
    const name = qtyNamed[1].trim();
    return {
      name,
      qty: Number(qtyNamed[2]),
      unit: qtyNamed[3] || null,
      note,
      kind: classifyHostEquip(name),
    };
  }

  const withUnit = line.match(new RegExp(`^(.*?)\\s+(\\d+)\\s*(${EQUIP_UNITS})\\s*$`));
  if (withUnit) {
    const name = withUnit[1].trim();
    return {
      name,
      qty: Number(withUnit[2]),
      unit: withUnit[3],
      note,
      kind: classifyHostEquip(name),
    };
  }

  if (/เครื่องสูบน้ำ/.test(line)) {
    return { name: line, qty: 1, unit: "เครื่อง", note, kind: "pump" };
  }

  return { name: line, qty: null, unit: null, note, kind: classifyHostEquip(line) };
}

function parseHostDetail(detail: string): HostEquipItem[] {
  if (!detail?.trim()) return [];
  return detail
    .split(/\r?\n/)
    .map(parseHostDetailLine)
    .filter((x): x is HostEquipItem => x != null);
}

function hostDetailPrint(detail: string): string {
  const items = parseHostDetail(detail);
  if (items.length === 0) return detail?.trim() || "—";
  return items
    .map((i) => {
      const qty = [i.qty, i.unit].filter(Boolean).join(" ");
      return [i.name, qty || null, i.note || null].filter(Boolean).join(" ");
    })
    .join(" · ");
}

function HostEquipIcon({ kind, className }: { kind: HostEquipKind; className?: string }) {
  const stroke = "currentColor";
  const common = { className, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true as const };
  switch (kind) {
    case "hose":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7.5" stroke={stroke} strokeWidth="1.8" />
          <circle cx="12" cy="12" r="3.2" stroke={stroke} strokeWidth="1.6" />
          <path d="M12 4.5v15M4.5 12h15" stroke={stroke} strokeWidth="1.2" opacity="0.45" />
        </svg>
      );
    case "nozzle":
      return (
        <svg {...common}>
          <path d="M4 12h8l5-3v6l-5-3H4z" stroke={stroke} strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M17 9.5 20 8v8l-3-1.5" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    case "outlet":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" stroke={stroke} strokeWidth="1.7" />
          <circle cx="12" cy="12" r="2.2" fill={stroke} />
          <path d="M12 5v2.5M12 16.5V19M5 12h2.5M16.5 12H19" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "axe":
      return (
        <svg {...common}>
          <path d="M11 21 13 7" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M8 6.5c2-3 6-3 8 0l-1.2 1.8c-1.6-1.2-4-1.2-5.6 0L8 6.5z" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    case "wrench":
      return (
        <svg {...common}>
          <path
            d="M14.5 5.5a4 4 0 0 0-5.2 5.2L5 15l4 4 4.3-4.3a4 4 0 0 0 5.2-5.2l-2.6 2.6-2.4-2.4 2.6-2.6z"
            stroke={stroke}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "pump":
      return (
        <svg {...common}>
          <rect x="4" y="9" width="12" height="9" rx="1.5" stroke={stroke} strokeWidth="1.7" />
          <path d="M8 9V7h4v2M16 12h3v3h-3M7 18v2M13 18v2" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="10" cy="13.5" r="1.6" stroke={stroke} strokeWidth="1.4" />
        </svg>
      );
    case "grate":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="1.5" stroke={stroke} strokeWidth="1.7" />
          <path d="M8 5v14M12 5v14M16 5v14M4 10h16M4 14h16" stroke={stroke} strokeWidth="1.3" />
        </svg>
      );
    case "suction":
      return (
        <svg {...common}>
          <path d="M4 14c3-6 6-6 9 0s6 6 7 0" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M4 17h3M17 11h3" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "coupling":
      return (
        <svg {...common}>
          <rect x="3" y="9" width="7" height="6" rx="1" stroke={stroke} strokeWidth="1.6" />
          <rect x="14" y="9" width="7" height="6" rx="1" stroke={stroke} strokeWidth="1.6" />
          <path d="M10 12h4" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "lamp":
      return (
        <svg {...common}>
          <path d="M9 14.5c0-2.5-2-3.5-2-6a5 5 0 0 1 10 0c0 2.5-2 3.5-2 6" stroke={stroke} strokeWidth="1.7" />
          <path d="M10 17h4M10.5 19.5h3" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "fuel":
      return (
        <svg {...common}>
          <path d="M7 7h8v13H7V7z" stroke={stroke} strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M9 7V5h4v2M15 10h2.5a1.5 1.5 0 0 1 1.5 1.5V16" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "tank":
      return (
        <svg {...common}>
          <rect x="8" y="7" width="8" height="13" rx="2" stroke={stroke} strokeWidth="1.7" />
          <path d="M10 7V5h4v2M16 10c2 0 3 1.2 3 3s-1 3-3 3" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="5" y="5" width="14" height="14" rx="3" stroke={stroke} strokeWidth="1.7" />
          <path d="M9 12h6M12 9v6" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
  }
}

const equipKindTone: Record<HostEquipKind, string> = {
  hose: "bg-[#0000BF]/10 text-[#0000BF]",
  nozzle: "bg-[#8b5cf6]/12 text-[#6d28d9]",
  outlet: "bg-[#ec4899]/12 text-[#db2777]",
  axe: "bg-amber-100 text-amber-800",
  wrench: "bg-sky-100 text-sky-700",
  pump: "bg-indigo-100 text-indigo-700",
  grate: "bg-slate-100 text-slate-600",
  suction: "bg-cyan-100 text-cyan-700",
  coupling: "bg-violet-100 text-violet-700",
  lamp: "bg-yellow-100 text-yellow-800",
  fuel: "bg-orange-100 text-orange-800",
  tank: "bg-rose-100 text-rose-700",
  other: "bg-[#f3f0ff] text-[#4d47b6]",
};

function HostEquipmentList({ detail, compact = false }: { detail: string; compact?: boolean }) {
  const items = useMemo(() => parseHostDetail(detail), [detail]);
  if (items.length === 0) {
    return (
      <p className={`rounded-md bg-[#faf9ff] px-1.5 py-1 text-slate-500 ${compact ? "mt-1 text-[9px]" : "mt-2 text-[11px]"}`}>
        ไม่มีรายละเอียดอุปกรณ์
      </p>
    );
  }
  if (compact) {
    const preview = items.slice(0, 3);
    const more = items.length - preview.length;
    return (
      <p className="mt-1 line-clamp-2 text-[9px] leading-snug text-slate-600">
        {preview.map((it) => `${it.name}${it.qty != null ? `×${it.qty}` : ""}`).join(" · ")}
        {more > 0 ? ` · +${more}` : ""}
      </p>
    );
  }
  return (
    <ul className="mt-1.5 max-h-36 space-y-px overflow-y-auto rounded-lg border border-[#ecebff] bg-[#faf9ff] p-1">
      {items.map((item, i) => (
        <li
          key={`${item.name}-${i}`}
          className="flex items-center gap-1.5 rounded-md bg-white px-1.5 py-0.5 ring-1 ring-[#ecebff]/70"
        >
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${equipKindTone[item.kind]}`}
            title={item.name}
          >
            <HostEquipIcon kind={item.kind} className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium leading-none text-[#2e2a58]">{item.name}</p>
            {item.note ? <p className="mt-px truncate text-[9px] leading-tight text-rose-600">{item.note}</p> : null}
          </div>
          <div className="ml-auto grid w-[4.4rem] shrink-0 grid-cols-[1.35rem_minmax(0,1fr)] items-baseline gap-x-1">
            <span className="text-right text-[12px] font-black tabular-nums leading-none text-[#1e1b4b]">
              {item.qty ?? ""}
            </span>
            <span className="truncate text-[10px] font-medium leading-none text-[#6b6798]">{item.unit ?? ""}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** ไอคอนถังดับเพลิง (FEX) */
function FireExtinguisherIcon({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const gradId = `fexGrad-${uid}`;
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden>
      <rect x="16" y="14" width="16" height="26" rx="4" fill={`url(#${gradId})`} />
      <path d="M20 14V10c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v4" stroke="#4d47b6" strokeWidth="2" strokeLinecap="round" />
      <path d="M24 8V5" stroke="#4d47b6" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="5" r="2" fill="#ec4899" />
      <path d="M32 18c4 0 7 2.5 7 6s-3 6-7 6" stroke="#8b5cf6" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M32 20.5h3.5" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" />
      <rect x="19" y="22" width="10" height="8" rx="1.5" fill="white" fillOpacity="0.85" />
      <path d="M21 26h6M21 28.5h4" stroke="#4d47b6" strokeWidth="1.4" strokeLinecap="round" />
      <defs>
        <linearGradient id={gradId} x1="16" y1="14" x2="32" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0000BF" />
          <stop offset="0.55" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** ไอคอนตู้ดับเพลิง / สายดับเพลิง (FHC) */
function FireHoseCabinetIcon({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const gradId = `fhcGrad-${uid}`;
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden>
      <rect x="8" y="8" width="32" height="34" rx="3" fill={`url(#${gradId})`} />
      <rect x="11" y="11" width="26" height="28" rx="1.5" fill="white" fillOpacity="0.92" />
      <path d="M14 16h20M14 20h20" stroke="#dcd8f0" strokeWidth="1.2" />
      <circle cx="24" cy="28" r="7" stroke="#0000BF" strokeWidth="2.2" />
      <path d="M24 21.5v13.5" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M17.5 28c0-3.6 2.9-6.5 6.5-6.5"
        stroke="#ec4899"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M30.5 25.5 34 22" stroke="#0000BF" strokeWidth="2" strokeLinecap="round" />
      <circle cx="35" cy="21" r="1.8" fill="#ec4899" />
      <rect x="36" y="20" width="3" height="14" rx="1" fill="#4d47b6" />
      <defs>
        <linearGradient id={gradId} x1="8" y1="8" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0000BF" />
          <stop offset="0.5" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
      </defs>
    </svg>
  );
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

/** อายุถังเป็นปีเต็มจากวันที่ผลิตถึงวันนี้ */
function tankAgeYearsNum(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years -= 1;
  return Math.max(0, years);
}

function tankAgeYears(iso: string | null | undefined): string {
  const n = tankAgeYearsNum(iso);
  return n == null ? "—" : `${n} ปี`;
}

/** BF2000 / Dry che / Softex / Halotron = 10 ปี, ชนิดอื่น = 15 ปี */
function tankLifespanYears(kind: string): number {
  const n = kind.toLowerCase().replace(/[\s\-_.]/g, "");
  if (n.includes("bf2000") || n.includes("dryche") || n.includes("softex") || n.includes("halotron")) return 10;
  return 15;
}

function tankLifeStatus(kind: string, manufacturedAt: string | null | undefined): TankLifeStatus {
  const age = tankAgeYearsNum(manufacturedAt);
  if (age == null) return "unknown";
  const life = tankLifespanYears(kind);
  if (age >= life) return "expired";
  if (age >= life - 1) return "expiring";
  return "ok";
}

function isDisposedStatus(status: string) {
  return status.includes("จำหน่าย");
}
function isNormalStatus(status: string) {
  return status === "ปกติ" || !status.trim();
}
function isAbnormalStatus(status: string) {
  return !isNormalStatus(status) && !isDisposedStatus(status);
}
function hostHasDamage(detail: string) {
  return /ชำรุด|เสียหาย|ขาด/.test(detail);
}

const statusChip = (status: string) => {
  if (isNormalStatus(status)) return "bg-emerald-500/15 text-emerald-700";
  if (isDisposedStatus(status)) return "bg-slate-200/80 text-slate-600";
  if (status.includes("ชำรุด") || status.includes("เสีย") || status.includes("ไม่ปกติ")) return "bg-rose-500/15 text-rose-700";
  return "bg-amber-500/15 text-amber-800";
};

function FireInsightCard({
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

export function FireSafetyPage() {
  const [tab, setTab] = useState<TabId>("extinguishers");
  const [rows, setRows] = useState<FireExtinguisher[]>([]);
  const [hosts, setHosts] = useState<FireHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [listFilter, setListFilter] = useState("");
  /** "" = ทุกอายุ, "none" = ไม่ระบุวันที่ผลิต, ตัวเลข = อายุครบปีนั้นพอดี */
  const [ageYearsFilter, setAgeYearsFilter] = useState("");
  const [dashKey, setDashKey] = useState<DashKey>("");
  const [kindFilter, setKindFilter] = useState("");
  const [hostEquipFilter, setHostEquipFilter] = useState<HostEquipKind | "">("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [hostModalOpen, setHostModalOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [hostForm, setHostForm] = useState(emptyHostForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (opts?: LoadOptions) => {
    setLoadBusy(setLoading, opts, true);
    try {
      const [e, h] = await Promise.all([
        apiJson<FireExtinguisher[]>("/api/fire-extinguishers"),
        apiJson<FireHost[]>("/api/fire-hosts"),
      ]);
      setRows(e);
      setHosts(h);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ageYearOptions = useMemo(() => {
    const set = new Set<number>();
    for (const r of rows) {
      const n = tankAgeYearsNum(r.manufacturedAt);
      if (n != null) set.add(n);
    }
    set.add(5);
    return [...set].sort((a, b) => a - b);
  }, [rows]);

  const searchExtinguishers = useMemo(
    () =>
      rows.filter((r) => {
        if (
          !rowMatchesFilter(listFilter, [
            r.code,
            r.location,
            r.kind,
            r.sizeLabel,
            r.status,
            r.guardTeam,
            r.notes,
            formatThDate(r.manufacturedAt),
            tankAgeYears(r.manufacturedAt),
          ])
        ) {
          return false;
        }
        if (ageYearsFilter) {
          const age = tankAgeYearsNum(r.manufacturedAt);
          if (ageYearsFilter === "none") {
            if (age != null) return false;
          } else if (age !== Number(ageYearsFilter)) {
            return false;
          }
        }
        return true;
      }),
    [rows, listFilter, ageYearsFilter],
  );

  const scopedExtinguishers = useMemo(
    () =>
      searchExtinguishers.filter((r) => !kindFilter || (r.kind.trim() || "ไม่ระบุ") === kindFilter),
    [searchExtinguishers, kindFilter],
  );

  const searchHosts = useMemo(
    () => hosts.filter((r) => rowMatchesFilter(listFilter, [r.code, r.detail, r.location, r.guardTeam])),
    [hosts, listFilter],
  );

  const scopedHosts = useMemo(
    () =>
      searchHosts.filter(
        (r) => !hostEquipFilter || parseHostDetail(r.detail).some((it) => it.kind === hostEquipFilter),
      ),
    [searchHosts, hostEquipFilter],
  );

  const dashStats = useMemo(() => {
    let normal = 0;
    let abnormal = 0;
    let disposed = 0;
    let expired = 0;
    let expiring = 0;
    let noDate = 0;
    for (const r of scopedExtinguishers) {
      if (isDisposedStatus(r.status)) {
        disposed += 1;
        continue;
      }
      if (isAbnormalStatus(r.status)) abnormal += 1;
      else normal += 1;
      const life = tankLifeStatus(r.kind, r.manufacturedAt);
      if (life === "expired") expired += 1;
      else if (life === "expiring") expiring += 1;
      else if (life === "unknown") noDate += 1;
    }
    const kinds = new Map<string, number>();
    for (const r of searchExtinguishers) {
      if (isDisposedStatus(r.status)) continue;
      const k = r.kind.trim() || "ไม่ระบุ";
      kinds.set(k, (kinds.get(k) || 0) + 1);
    }

    let hostOk = 0;
    let hostDamaged = 0;
    let hostNoDetail = 0;
    let hostEquipTotal = 0;
    for (const h of scopedHosts) {
      const items = parseHostDetail(h.detail);
      if (items.length === 0) hostNoDetail += 1;
      else if (hostHasDamage(h.detail)) hostDamaged += 1;
      else hostOk += 1;
      for (const it of items) hostEquipTotal += it.qty ?? 1;
    }
    const equip = new Map<HostEquipKind, number>();
    for (const h of searchHosts) {
      for (const it of parseHostDetail(h.detail)) {
        equip.set(it.kind, (equip.get(it.kind) || 0) + (it.qty ?? 1));
      }
    }

    return {
      total: scopedExtinguishers.length,
      normal,
      abnormal,
      disposed,
      expired,
      expiring,
      noDate,
      kinds: [...kinds.entries()].sort((a, b) => b[1] - a[1]),
      cabinets: scopedHosts.length,
      hostOk,
      hostDamaged,
      hostNoDetail,
      hostEquipTotal,
      equip: [...equip.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [scopedExtinguishers, searchExtinguishers, scopedHosts, searchHosts]);

  const filtered = useMemo(
    () =>
      scopedExtinguishers.filter((r) => {
        if (!dashKey || dashKey === "all") return true;
        if (dashKey === "normal") return isNormalStatus(r.status) && !isDisposedStatus(r.status);
        if (dashKey === "abnormal") return isAbnormalStatus(r.status);
        if (dashKey === "disposed") return isDisposedStatus(r.status);
        if (dashKey === "expired") return !isDisposedStatus(r.status) && tankLifeStatus(r.kind, r.manufacturedAt) === "expired";
        if (dashKey === "expiring") return !isDisposedStatus(r.status) && tankLifeStatus(r.kind, r.manufacturedAt) === "expiring";
        if (dashKey === "noDate") return !isDisposedStatus(r.status) && tankLifeStatus(r.kind, r.manufacturedAt) === "unknown";
        return true;
      }),
    [scopedExtinguishers, dashKey],
  );

  const filteredHosts = useMemo(
    () =>
      scopedHosts.filter((r) => {
        if (!dashKey || dashKey === "all") return true;
        const items = parseHostDetail(r.detail);
        if (dashKey === "normal") return items.length > 0 && !hostHasDamage(r.detail);
        if (dashKey === "abnormal") return hostHasDamage(r.detail);
        if (dashKey === "noDate") return items.length === 0;
        return true;
      }),
    [scopedHosts, dashKey],
  );

  const listTotal = tab === "extinguishers" ? filtered.length : filteredHosts.length;
  const pageCount = Math.max(1, Math.ceil(listTotal / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  const pagedExtinguishers = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const pagedHosts = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredHosts.slice(start, start + PAGE_SIZE);
  }, [filteredHosts, safePage]);

  useEffect(() => {
    setPage(1);
  }, [tab, listFilter, ageYearsFilter, dashKey, kindFilter, hostEquipFilter]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  function selectDash(key: DashKey) {
    setDashKey((cur) => (cur === key ? "" : key));
  }

  function openAdd() {
    if (tab === "hosts") {
      setEditingId(null);
      setHostForm(emptyHostForm());
      setHostModalOpen(true);
      return;
    }
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(r: FireExtinguisher) {
    setEditingId(r.id);
    setForm({
      code: r.code,
      location: r.location,
      kind: r.kind,
      sizeLabel: r.sizeLabel,
      manufacturedAt: toDateInput(r.manufacturedAt),
      status: r.status || "ปกติ",
      guardTeam: r.guardTeam ?? "",
      notes: r.notes ?? "",
    });
    setModalOpen(true);
  }

  function openEditHost(r: FireHost) {
    setEditingId(r.id);
    setHostForm({
      code: r.code,
      detail: r.detail,
      location: r.location,
      guardTeam: r.guardTeam ?? "",
    });
    setHostModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
  }

  function closeHostModal() {
    setHostModalOpen(false);
    setEditingId(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body = JSON.stringify({
      code: form.code.trim(),
      location: form.location.trim(),
      kind: form.kind.trim(),
      sizeLabel: form.sizeLabel.trim(),
      manufacturedAt: form.manufacturedAt || null,
      status: form.status.trim() || "ปกติ",
      guardTeam: form.guardTeam.trim() || null,
      notes: form.notes.trim() || null,
    });
    try {
      if (editingId) {
        await apiJson(`/api/fire-extinguishers/${editingId}`, { method: "PUT", body });
      } else {
        await apiJson("/api/fire-extinguishers", { method: "POST", body });
      }
      closeModal();
      await load({ silent: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function saveHost(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body = JSON.stringify({
      code: hostForm.code.trim(),
      detail: hostForm.detail.trim(),
      location: hostForm.location.trim(),
      guardTeam: hostForm.guardTeam.trim() || null,
    });
    try {
      if (editingId) {
        await apiJson(`/api/fire-hosts/${editingId}`, { method: "PUT", body });
      } else {
        await apiJson("/api/fire-hosts", { method: "POST", body });
      }
      closeHostModal();
      await load({ silent: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function removeRow(r: FireExtinguisher) {
    if (!confirm(`ลบถังดับเพลิง «${r.code}» ?`)) return;
    try {
      await apiJson(`/api/fire-extinguishers/${r.id}`, { method: "DELETE" });
      await load({ silent: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  async function removeHost(r: FireHost) {
    if (!confirm(`ลบรายการ «${r.code}» ?`)) return;
    try {
      await apiJson(`/api/fire-hosts/${r.id}`, { method: "DELETE" });
      await load({ silent: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  return (
    <div>
      <PageHeaderBar
        title="อัคคีภัย"
        count={listTotal}
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: tab === "hosts" ? "ตู้ดับเพลิง" : "ถังดับเพลิง",
          placeholder:
            tab === "extinguishers"
              ? "กรองรหัส / สถานที่ / ชนิด / สถานะ / ทีม…"
              : "กรองรหัส / สถานที่ / รายละเอียด / ทีม…",
        }}
        extras={
          <>
            <button type="button" className={toolbarLinkBtnClass} onClick={() => setDocsOpen(true)}>
              เอกสาร
            </button>
            {tab === "extinguishers" ? (
              <label className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#e8e6fc] bg-[#faf9ff]/90 px-2 shadow-sm sm:h-9 sm:px-2.5">
                <span className="hidden text-[11px] font-bold text-[#4d47b6] sm:inline sm:text-xs">อายุถัง</span>
                <select
                  aria-label="กรองตามอายุถัง (ปี)"
                  className="max-w-[7.5rem] cursor-pointer border-0 bg-transparent py-0.5 text-[11px] font-semibold text-[#2e2a58] outline-none sm:max-w-[9rem] sm:text-xs"
                  value={ageYearsFilter}
                  onChange={(e) => setAgeYearsFilter(e.target.value)}
                >
                  <option value="">ทุกอายุ</option>
                  <option value="none">ไม่ระบุปี</option>
                  {ageYearOptions.map((y) => (
                    <option key={y} value={String(y)}>
                      {y} ปี
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        }
        segments={
          <div className={toolbarMasterGroupClass}>
            {(
              [
                ["extinguishers", "ถังดับเพลิง", FireExtinguisherIcon],
                ["hosts", "ตู้ดับเพลิง", FireHoseCabinetIcon],
              ] as const
            ).map(([id, label, Icon]) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setTab(id);
                    setDashKey("");
                  }}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-black transition sm:h-9 sm:px-3 sm:text-xs ${
                    active ? `${brandGradientFillClass} text-white shadow-md` : toolbarMasterBtnClass
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? "brightness-0 invert" : ""}`} />
                  {label}
                </button>
              );
            })}
          </div>
        }
        primary={
          <button type="button" onClick={openAdd} className={toolbarPrimaryBtnClass}>
            {tab === "hosts" ? "เพิ่มตู้ดับเพลิง" : "เพิ่มถังดับเพลิง"}
          </button>
        }
      />

      <div className="mt-4 grid gap-2 print:hidden sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {(tab === "extinguishers"
          ? [
              { key: "all" as DashKey, label: "ถังทั้งหมด", value: dashStats.total, tone: "from-[#0000BF]/8 via-[#8b5cf6]/8 to-[#ec4899]/10" },
              { key: "normal" as DashKey, label: "ปกติ", value: dashStats.normal, tone: "from-emerald-50 to-emerald-100/70" },
              { key: "abnormal" as DashKey, label: "ไม่ปกติ", value: dashStats.abnormal, tone: "from-rose-50 to-rose-100/80" },
              { key: "disposed" as DashKey, label: "จำหน่าย", value: dashStats.disposed, tone: "from-slate-50 to-slate-100/80" },
              { key: "expired" as DashKey, label: "หมดอายุ", value: dashStats.expired, tone: "from-rose-100/80 to-pink-100/70" },
              { key: "expiring" as DashKey, label: "ใกล้หมดอายุ", value: dashStats.expiring, tone: "from-amber-50 to-orange-100/70" },
              { key: "noDate" as DashKey, label: "ไม่ระบุปีผลิต", value: dashStats.noDate, tone: "from-violet-50 to-fuchsia-50" },
            ]
          : [
              { key: "all" as DashKey, label: "ตู้ทั้งหมด", value: dashStats.cabinets, tone: "from-[#0000BF]/8 via-[#8b5cf6]/8 to-[#ec4899]/10" },
              { key: "normal" as DashKey, label: "ปกติ", value: dashStats.hostOk, tone: "from-emerald-50 to-emerald-100/70" },
              { key: "abnormal" as DashKey, label: "ชำรุด", value: dashStats.hostDamaged, tone: "from-rose-50 to-rose-100/80" },
              { key: "noDate" as DashKey, label: "ไม่มีรายละเอียด", value: dashStats.hostNoDetail, tone: "from-violet-50 to-fuchsia-50" },
              { key: "" as DashKey, label: "รวมอุปกรณ์", value: dashStats.hostEquipTotal, tone: "from-amber-50 to-orange-100/70" },
            ]
        ).map((c) => (
          <FireInsightCard
            key={`${tab}-${c.label}`}
            label={c.label}
            value={c.value}
            tone={c.tone}
            active={Boolean(c.key) && dashKey === c.key}
            onClick={c.key ? () => selectDash(c.key) : undefined}
          />
        ))}
      </div>
      {tab === "extinguishers" && dashStats.kinds.length > 0 ? (
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
                <span className="text-[10px] font-medium text-[#8b5cf6]">{tankLifespanYears(name)} ปี</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {tab === "hosts" && dashStats.equip.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5 print:hidden">
          {dashStats.equip.map(([kind, n]) => {
            const active = hostEquipFilter === kind;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => setHostEquipFilter((cur) => (cur === kind ? "" : kind))}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  active
                    ? "border-[#ec4899]/40 bg-[#ec4899]/10 text-[#db2777]"
                    : "border-[#e8e6fc] bg-white/80 text-[#2e2a58] hover:border-[#ec4899]/30"
                }`}
              >
                <span>{EQUIP_KIND_LABEL[kind]}</span>
                <span className="tabular-nums text-[#66638c]">{n.toLocaleString("th-TH")}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <Modal open={modalOpen} onClose={closeModal} title={editingId ? "แก้ไขถังดับเพลิง" : "เพิ่มถังดับเพลิง"} size="form">
        <form onSubmit={(e) => void save(e)}>
          <ModalFormBody>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">รหัสถังดับเพลิง</span>
                <input
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="เช่น 40G11FEX6201"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">สถานที่ติดตั้ง</span>
                <input
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">ชนิด</span>
                <input
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  value={form.kind}
                  onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
                  placeholder="BF2000 / Dry che"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">ขนาด</span>
                <input
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  value={form.sizeLabel}
                  onChange={(e) => setForm((f) => ({ ...f, sizeLabel: e.target.value }))}
                  placeholder="15 ปอนด์"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">วันที่ผลิต</span>
                <PickableDateInput
                  type="date"
                  className="mt-1"
                  value={form.manufacturedAt}
                  onChange={(v) => setForm((f) => ({ ...f, manufacturedAt: v }))}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">สถานะ</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  placeholder="ปกติ"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">ทีมรักษาการณ์</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  value={form.guardTeam}
                  onChange={(e) => setForm((f) => ({ ...f, guardTeam: e.target.value }))}
                  placeholder="สภต."
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">หมายเหตุ</span>
                <textarea
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </label>
            </div>
          </ModalFormBody>
          <ModalFormActions>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              onClick={closeModal}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      <Modal open={hostModalOpen} onClose={closeHostModal} title={editingId ? "แก้ไขตู้สายดับเพลิง" : "เพิ่มตู้สายดับเพลิง"} size="form">
        <form onSubmit={(e) => void saveHost(e)}>
          <ModalFormBody>
            <div className="grid gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-700">รหัส</span>
                <input
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900"
                  value={hostForm.code}
                  onChange={(e) => setHostForm((f) => ({ ...f, code: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">สถานที่</span>
                <input
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  value={hostForm.location}
                  onChange={(e) => setHostForm((f) => ({ ...f, location: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">ทีมรักษาการณ์</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  value={hostForm.guardTeam}
                  onChange={(e) => setHostForm((f) => ({ ...f, guardTeam: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">รายละเอียดอุปกรณ์</span>
                <textarea
                  rows={6}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  value={hostForm.detail}
                  onChange={(e) => setHostForm((f) => ({ ...f, detail: e.target.value }))}
                />
              </label>
            </div>
          </ModalFormBody>
          <ModalFormActions>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              onClick={closeHostModal}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      <div className="mt-6 print:hidden">
        {loading ? (
          <div className="rounded-[1.15rem] border border-[#e8e6fc] bg-white/70 px-4 py-10 text-center text-slate-600">
            กำลังโหลด…
          </div>
        ) : tab === "extinguishers" ? (
          rows.length === 0 ? (
            <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">
              ยังไม่มีถังดับเพลิง — กด «เพิ่มถังดับเพลิง» หรือรีสตาร์ท API เพื่อซิงก์จาก CSV
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">
              ไม่มีรายการที่ตรงกับการกรอง
            </div>
          ) : (
            <ul className={fireGridClass}>
              {pagedExtinguishers.map((r, idx) => {
                const life = tankLifeStatus(r.kind, r.manufacturedAt);
                const lifespan = tankLifespanYears(r.kind);
                return (
                  <li key={r.id}>
                    <div className={fireCardClass}>
                      <span className={`absolute inset-y-0 left-0 w-0.5 ${listCardAccentClass(idx)}`} aria-hidden />
                      <div className="min-w-0 flex-1 pl-1.5">
                        <div className="flex items-start gap-1.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#e8e6fc] bg-gradient-to-br from-[#0000BF]/10 via-[#8b5cf6]/10 to-[#ec4899]/10">
                            <FireExtinguisherIcon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-1">
                              <p className="truncate font-mono text-[11px] font-bold text-[#1e1b4b]" title={r.code}>
                                {r.code}
                              </p>
                              <span className={`shrink-0 rounded-full px-1.5 py-px text-[8px] font-bold ${statusChip(r.status)}`}>
                                {r.status}
                              </span>
                            </div>
                            <p className="mt-0.5 line-clamp-1 text-[9px] font-medium text-[#2e2a58]" title={r.location}>
                              {r.location || "—"}
                            </p>
                          </div>
                        </div>
                        <dl className="mt-1.5 grid grid-cols-2 gap-x-1 gap-y-0.5 text-[9px]">
                          <div className="min-w-0">
                            <dt className="text-slate-500">ชนิด</dt>
                            <dd className="truncate font-semibold text-[#4d47b6]" title={r.kind}>
                              {r.kind || "—"}
                            </dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-slate-500">ขนาด</dt>
                            <dd className="truncate font-semibold text-[#ec4899]">{r.sizeLabel || "—"}</dd>
                          </div>
                          <div className="col-span-2 min-w-0">
                            <dt className="text-slate-500">อายุ / ใช้งาน</dt>
                            <dd className="flex flex-wrap items-center gap-1">
                              <span
                                className={`font-bold tabular-nums ${
                                  life === "expired"
                                    ? "text-rose-700"
                                    : life === "expiring"
                                      ? "text-amber-800"
                                      : "text-slate-800"
                                }`}
                              >
                                {tankAgeYears(r.manufacturedAt)}
                                <span className="font-medium text-slate-500"> / {lifespan} ปี</span>
                              </span>
                              {life === "expired" ? (
                                <span className="rounded-full bg-rose-100 px-1 py-px text-[8px] font-bold text-rose-700">หมดอายุ</span>
                              ) : life === "expiring" ? (
                                <span className="rounded-full bg-amber-100 px-1 py-px text-[8px] font-bold text-amber-800">ใกล้หมด</span>
                              ) : null}
                            </dd>
                          </div>
                        </dl>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1 border-t border-[#ecebff] pt-1.5 pl-1.5">
                        <button
                          type="button"
                          className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-800 hover:bg-amber-100"
                          onClick={() => openEdit(r)}
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[9px] font-medium text-rose-600 hover:bg-rose-100"
                          onClick={() => void removeRow(r)}
                        >
                          ลบ
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : hosts.length === 0 ? (
          <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">
            ยังไม่มีตู้สายดับเพลิง — กด «เพิ่มตู้สาย» หรือรีสตาร์ท API เพื่อซิงก์จาก CSV
          </div>
        ) : filteredHosts.length === 0 ? (
          <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">
            ไม่มีรายการที่ตรงกับการกรอง
          </div>
        ) : (
          <ul className={fireGridClass}>
            {pagedHosts.map((r, idx) => (
              <li key={r.id}>
                <div className={fireCardClass}>
                  <span className={`absolute inset-y-0 left-0 w-0.5 ${listCardAccentClass(idx)}`} aria-hidden />
                  <div className="min-w-0 flex-1 pl-1.5">
                    <div className="flex items-start gap-1.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#e8e6fc] bg-gradient-to-br from-[#0000BF]/10 via-[#8b5cf6]/10 to-[#ec4899]/10">
                        <FireHoseCabinetIcon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[11px] font-bold text-[#1e1b4b]" title={r.code}>
                          {r.code}
                        </p>
                        <p className="mt-0.5 line-clamp-1 text-[9px] font-medium text-[#2e2a58]" title={r.location}>
                          {r.location || "—"}
                        </p>
                        <p className="mt-0.5 truncate text-[9px] text-slate-500">ทีม: {r.guardTeam || "—"}</p>
                      </div>
                    </div>
                    <HostEquipmentList detail={r.detail} compact />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1 border-t border-[#ecebff] pt-1.5 pl-1.5">
                    <button
                      type="button"
                      className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-800 hover:bg-amber-100"
                      onClick={() => openEditHost(r)}
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[9px] font-medium text-rose-600 hover:bg-rose-100"
                      onClick={() => void removeHost(r)}
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!loading && listTotal > 0 ? (
          <ListPagination
            page={safePage}
            pageCount={pageCount}
            total={listTotal}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            className="print:hidden"
          />
        ) : null}
      </div>

      {tab === "extinguishers" ? (
        <PrintA4Table
          columns={[
            { label: "รหัส" },
            { label: "ชนิด" },
            { label: "ขนาด" },
            { label: "สถานที่" },
            { label: "ทีม" },
            { label: "ผลิต" },
            { label: "อายุ" },
            { label: "สถานะ" },
          ]}
          rows={filtered.map((r) => {
            const life = tankLifeStatus(r.kind, r.manufacturedAt);
            const lifeLabel = life === "expired" ? " หมดอายุ" : life === "expiring" ? " ใกล้หมดอายุ" : "";
            return [
              r.code,
              r.kind,
              r.sizeLabel || "—",
              r.location || "—",
              r.guardTeam || "—",
              formatThDate(r.manufacturedAt),
              `${tankAgeYears(r.manufacturedAt)} / ${tankLifespanYears(r.kind)} ปี${lifeLabel}`,
              r.status || "—",
            ];
          })}
        />
      ) : (
        <PrintA4Table
          columns={[
            { label: "รหัส" },
            { label: "สถานที่" },
            { label: "ทีม" },
            { label: "รายละเอียด" },
          ]}
          rows={filteredHosts.map((r) => [r.code, r.location || "—", r.guardTeam || "—", hostDetailPrint(r.detail)])}
        />
      )}

      <ModuleDocumentsModal
        open={docsOpen}
        categoryName={MODULE_DOCUMENT_CATEGORIES.fire}
        onClose={() => setDocsOpen(false)}
      />
    </div>
  );
}
