import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { apiJson } from "../api/client";
import { FitSingleLine } from "../components/FitSingleLine";
import { Modal, ModalFormActions, ModalFormBody, ModalFormSection } from "../components/Modal";
import { ModuleDocumentsModal } from "../components/ModuleDocumentsModal";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { PickableDateInput } from "../components/PickableDateInput";
import { PrintA4Table } from "../components/PrintA4Table";
import { MODULE_DOCUMENT_CATEGORIES } from "../lib/moduleDocumentCategories";
import { rowMatchesFilter } from "../lib/searchNormalize";
import {
  brandGradientFillClass,
  listCardAccentClass,
  listCardClass,
  toolbarLinkBtnClass,
  toolbarMasterBtnClass,
  toolbarMasterGroupClass,
  toolbarPrimaryBtnClass,
} from "../lib/uiTokens";
import type { Ammunition, Firearm } from "../types";

type TabId = "guns" | "ammo";
type DashKey =
  | ""
  | "all"
  | "ready"
  | "notReady"
  | "inStock"
  | "disposed"
  | "noStatus"
  | "empty"
  | "stocked"
  | "expired"
  | "expiring";

const GUN_STATUSES = ["สภาพพร้อมใช้งาน", "ไม่พร้อมใช้งาน", "จำหน่าย/คงคลัง", "จำหน่าย"] as const;
type AmmoLife = "ok" | "expiring" | "expired" | "unknown";

const AMMO_LIFE_YEARS = 5;

/** มาตรฐานอาวุธปืนและกระสุนขั้นต่ำตามพื้นที่รักษาการณ์ */
const WEAPON_STANDARD_ROWS: {
  unit: string;
  abbr: string;
  revolver: number;
  revolverAmmo: number;
  shotgun: number;
  shotgunAmmo: number;
  semi: number;
  semiAmmo: number;
}[] = [
  { unit: "สำนักงานใหญ่", abbr: "ทญศ.", revolver: 25, revolverAmmo: 600, shotgun: 6, shotgunAmmo: 150, semi: 3, semiAmmo: 180 },
  { unit: "งานขนส่งธนบัตร", abbr: "ทขส.", revolver: 0, revolverAmmo: 0, shotgun: 0, shotgunAmmo: 0, semi: 0, semiAmmo: 0 },
  { unit: "สายออกบัตรธนาคาร", abbr: "ทอศ.", revolver: 33, revolverAmmo: 792, shotgun: 5, shotgunAmmo: 125, semi: 4, semiAmmo: 240 },
  { unit: "สำนักงานภาคเหนือ", abbr: "สภน.", revolver: 10, revolverAmmo: 240, shotgun: 2, shotgunAmmo: 50, semi: 1, semiAmmo: 60 },
  { unit: "สำนักงานภาคตะวันออกเฉียงเหนือ", abbr: "สภอ.", revolver: 10, revolverAmmo: 240, shotgun: 2, shotgunAmmo: 50, semi: 1, semiAmmo: 60 },
  { unit: "สำนักงานภาคใต้", abbr: "สภต.", revolver: 10, revolverAmmo: 240, shotgun: 2, shotgunAmmo: 50, semi: 1, semiAmmo: 60 },
];

const WEAPON_STANDARD_TOTAL = WEAPON_STANDARD_ROWS.reduce(
  (acc, r) => ({
    revolver: acc.revolver + r.revolver,
    revolverAmmo: acc.revolverAmmo + r.revolverAmmo,
    shotgun: acc.shotgun + r.shotgun,
    shotgunAmmo: acc.shotgunAmmo + r.shotgunAmmo,
    semi: acc.semi + r.semi,
    semiAmmo: acc.semiAmmo + r.semiAmmo,
  }),
  { revolver: 0, revolverAmmo: 0, shotgun: 0, shotgunAmmo: 0, semi: 0, semiAmmo: 0 },
);

function emptyGunForm() {
  return {
    code: "",
    brand: "",
    serial: "",
    registerNo: "",
    registerCard: "",
    purchasedAt: "",
    team: "",
    status: "สภาพพร้อมใช้งาน",
    detail: "",
    fixNote: "",
    docUrl: "",
  };
}

function emptyAmmoForm() {
  return { code: "", kind: "", purchasedAt: "", quantity: "", team: "", detail: "" };
}

function emptyWithdrawForm() {
  return { lotId: "", quantity: "", withdrawnBy: "", movedAt: "", note: "" };
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

function ammoAgeYears(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years -= 1;
  return Math.max(0, years);
}

function ammoExpiryDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setFullYear(d.getFullYear() + AMMO_LIFE_YEARS);
  return d;
}

function ammoLifeStatus(purchasedAt: string | null | undefined): AmmoLife {
  const age = ammoAgeYears(purchasedAt);
  if (age == null) return "unknown";
  if (age >= AMMO_LIFE_YEARS) return "expired";
  if (age >= AMMO_LIFE_YEARS - 1) return "expiring";
  return "ok";
}

function lastWithdrawnBy(lot: Ammunition): string | null {
  const out = (lot.moves ?? []).find((m) => m.kind === "OUT");
  return out?.withdrawnBy ?? null;
}

function ammoLedgerRows(lots: Ammunition[]) {
  return lots
    .flatMap((lot) => (lot.moves ?? []).map((m) => ({ move: m, lot })))
    .sort((a, b) => {
      const da = new Date(a.move.movedAt).getTime() - new Date(b.move.movedAt).getTime();
      if (da !== 0) return da;
      return new Date(a.move.createdAt).getTime() - new Date(b.move.createdAt).getTime();
    });
}

function gunKindLabel(brand: string): string {
  const b = brand.replace(/"/g, "").trim();
  if (/ลูกซอง/.test(b)) return "ลูกซอง";
  if (/รีวอลเวอร์|สมิท/.test(b)) return "รีวอลเวอร์";
  if (/9\s*มม|9mm|อูซี่|uzi/i.test(b)) return "9 มม.";
  return "อื่น ๆ";
}

function isGunInStock(status: string) {
  return /คงคลัง|ฝากคลัง/.test(status);
}
function isGunDisposed(status: string) {
  return /จำหน่าย/.test(status) && !isGunInStock(status);
}
function isGunReady(status: string) {
  return /พร้อมใช้งาน/.test(status) && !/ไม่พร้อม/.test(status) && !isGunDisposed(status) && !isGunInStock(status);
}
function isGunNotReady(status: string) {
  return /ไม่พร้อม/.test(status) && !isGunDisposed(status) && !isGunInStock(status);
}

function gunStatusChip(status: string) {
  if (isGunInStock(status)) return "bg-violet-500/15 text-violet-800";
  if (isGunDisposed(status)) return "bg-slate-200/80 text-slate-600";
  if (isGunReady(status)) return "bg-emerald-500/15 text-emerald-700";
  if (isGunNotReady(status)) return "bg-rose-500/15 text-rose-700";
  return "bg-slate-200/80 text-slate-600";
}

function gunStatusOptions(current: string) {
  const list = [...GUN_STATUSES];
  if (current && !list.includes(current as (typeof GUN_STATUSES)[number])) list.push(current as (typeof GUN_STATUSES)[number]);
  return list;
}

function GunIcon({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const gradId = `gunGrad-${uid}`;
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden>
      <path d="M8 22h22l4-6h6" stroke={`url(#${gradId})`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 22v10h6l2-6" stroke={`url(#${gradId})`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="36" cy="16" r="2.2" fill="#ec4899" />
      <defs>
        <linearGradient id={gradId} x1="8" y1="16" x2="40" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0000BF" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function AmmoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden>
      <rect x="18" y="8" width="12" height="28" rx="6" stroke="#0000BF" strokeWidth="2.2" />
      <path d="M21 12h6M21 16h6" stroke="#8b5cf6" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M24 36v6" stroke="#ec4899" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="24" cy="42" r="2" fill="#ec4899" />
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

export function WeaponsPage() {
  const [tab, setTab] = useState<TabId>("guns");
  const [guns, setGuns] = useState<Firearm[]>([]);
  const [ammo, setAmmo] = useState<Ammunition[]>([]);
  const [loading, setLoading] = useState(true);
  const [listFilter, setListFilter] = useState("");
  const [dashKey, setDashKey] = useState<DashKey>("");
  const [kindFilter, setKindFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [ammoModalOpen, setAmmoModalOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [standardNoteOpen, setStandardNoteOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawLots, setWithdrawLots] = useState<Ammunition[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [gunForm, setGunForm] = useState(emptyGunForm);
  const [ammoForm, setAmmoForm] = useState(emptyAmmoForm);
  const [withdrawForm, setWithdrawForm] = useState(emptyWithdrawForm);
  const [ledgerTitle, setLedgerTitle] = useState("");
  const [ledgerLots, setLedgerLots] = useState<Ammunition[] | null>(null);
  const [zeroTitle, setZeroTitle] = useState("");
  const [zeroLots, setZeroLots] = useState<Ammunition[] | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, a] = await Promise.all([
        apiJson<Firearm[]>("/api/firearms"),
        apiJson<Ammunition[]>("/api/ammunition"),
      ]);
      setGuns(g);
      setAmmo(a);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const searchGuns = useMemo(
    () =>
      guns.filter((r) =>
        rowMatchesFilter(listFilter, [
          r.code, r.brand, r.serial, r.registerNo, r.registerCard, r.team, r.status, r.detail, r.fixNote, r.docUrl,
          formatThDate(r.purchasedAt), gunKindLabel(r.brand),
        ]),
      ),
    [guns, listFilter],
  );

  const scopedGuns = useMemo(
    () => searchGuns.filter((r) => !kindFilter || gunKindLabel(r.brand) === kindFilter),
    [searchGuns, kindFilter],
  );

  const searchAmmo = useMemo(
    () =>
      ammo.filter((r) =>
        rowMatchesFilter(listFilter, [
          r.code,
          r.kind,
          r.team,
          r.detail,
          String(r.remainingQty),
          formatThDate(r.purchasedAt),
          lastWithdrawnBy(r),
          ...(r.moves ?? []).flatMap((m) => [m.withdrawnBy, m.note, String(m.quantity)]),
        ]),
      ),
    [ammo, listFilter],
  );

  const scopedAmmo = useMemo(
    () => searchAmmo.filter((r) => !kindFilter || r.kind === kindFilter),
    [searchAmmo, kindFilter],
  );

  const dashStats = useMemo(() => {
    let ready = 0;
    let notReady = 0;
    let inStock = 0;
    let disposed = 0;
    let noStatus = 0;
    const kinds = new Map<string, number>();
    for (const r of searchGuns) {
      const k = gunKindLabel(r.brand);
      kinds.set(k, (kinds.get(k) || 0) + 1);
    }
    for (const r of scopedGuns) {
      if (isGunInStock(r.status)) inStock += 1;
      else if (isGunDisposed(r.status)) disposed += 1;
      else if (isGunReady(r.status)) ready += 1;
      else if (isGunNotReady(r.status)) notReady += 1;
      else noStatus += 1;
    }
    let empty = 0;
    let stocked = 0;
    let qtyTotal = 0;
    let expired = 0;
    let expiring = 0;
    const ammoKinds = new Map<string, number>();
    for (const r of searchAmmo) ammoKinds.set(r.kind, (ammoKinds.get(r.kind) || 0) + r.remainingQty);
    for (const r of scopedAmmo) {
      if (r.remainingQty <= 0) {
        empty += 1;
        continue;
      }
      qtyTotal += r.remainingQty;
      stocked += 1;
      const life = ammoLifeStatus(r.purchasedAt);
      if (life === "expired") expired += 1;
      else if (life === "expiring") expiring += 1;
    }
    return {
      guns: scopedGuns.length,
      ready,
      notReady,
      inStock,
      disposed,
      noStatus,
      kinds: [...kinds.entries()].sort((a, b) => b[1] - a[1]),
      ammoLots: scopedAmmo.filter((r) => r.remainingQty > 0).length,
      qtyTotal,
      empty,
      stocked,
      expired,
      expiring,
      ammoKinds: [...ammoKinds.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [searchGuns, scopedGuns, searchAmmo, scopedAmmo]);

  const filteredGuns = useMemo(
    () =>
      scopedGuns.filter((r) => {
        if (!dashKey || dashKey === "all") return true;
        if (dashKey === "ready") return isGunReady(r.status);
        if (dashKey === "notReady") return isGunNotReady(r.status);
        if (dashKey === "inStock") return isGunInStock(r.status);
        if (dashKey === "disposed") return isGunDisposed(r.status);
        if (dashKey === "noStatus")
          return !isGunReady(r.status) && !isGunNotReady(r.status) && !isGunInStock(r.status) && !isGunDisposed(r.status);
        return true;
      }),
    [scopedGuns, dashKey],
  );

  const filteredAmmo = useMemo(
    () =>
      scopedAmmo.filter((r) => {
        if (r.remainingQty <= 0) return false;
        if (!dashKey || dashKey === "all" || dashKey === "empty") return true;
        if (dashKey === "stocked") return true;
        if (dashKey === "expired") return ammoLifeStatus(r.purchasedAt) === "expired";
        if (dashKey === "expiring") return ammoLifeStatus(r.purchasedAt) === "expiring";
        return true;
      }),
    [scopedAmmo, dashKey],
  );

  const ammoStocks = useMemo(() => {
    const historyByKey = new Map<string, Ammunition[]>();
    for (const lot of scopedAmmo) {
      if (lot.remainingQty > 0) continue;
      const team = lot.team || "ไม่ระบุทีม";
      const key = `${lot.kind}:::${team}`;
      const arr = historyByKey.get(key) ?? [];
      arr.push(lot);
      historyByKey.set(key, arr);
    }
    const map = new Map<string, { kind: string; team: string; lots: Ammunition[] }>();
    for (const lot of filteredAmmo) {
      const team = lot.team || "ไม่ระบุทีม";
      const key = `${lot.kind}:::${team}`;
      const cur = map.get(key) ?? { kind: lot.kind, team, lots: [] };
      cur.lots.push(lot);
      map.set(key, cur);
    }
    return [...map.entries()].map(([key, g]) => {
      const activeLots = [...g.lots].sort((a, b) => {
        const da = a.purchasedAt ? new Date(a.purchasedAt).getTime() : 0;
        const db = b.purchasedAt ? new Date(b.purchasedAt).getTime() : 0;
        return da - db;
      });
      const historyLots = [...(historyByKey.get(key) ?? [])].sort((a, b) => {
        const da = a.purchasedAt ? new Date(a.purchasedAt).getTime() : 0;
        const db = b.purchasedAt ? new Date(b.purchasedAt).getTime() : 0;
        return da - db;
      });
      return {
        key,
        kind: g.kind,
        team: g.team,
        remaining: activeLots.reduce((s, l) => s + l.remainingQty, 0),
        activeLots,
        historyLots,
        lots: [...activeLots, ...historyLots],
      };
    });
  }, [filteredAmmo, scopedAmmo]);

  function openAdd() {
    setEditingId(null);
    if (tab === "ammo") {
      setAmmoForm(emptyAmmoForm());
      setAmmoModalOpen(true);
      return;
    }
    setGunForm(emptyGunForm());
    setModalOpen(true);
  }

  function openReplace(kind: string, team: string) {
    setEditingId(null);
    setAmmoForm({
      ...emptyAmmoForm(),
      kind,
      team: team === "ไม่ระบุทีม" ? "" : team,
      purchasedAt: toDateInput(new Date().toISOString()),
    });
    setAmmoModalOpen(true);
  }

  function openWithdraw(lots: Ammunition[]) {
    const usable = lots.filter((l) => l.remainingQty > 0);
    if (usable.length === 0) {
      alert("ไม่มีคงเหลือให้เบิก — ใช้ปุ่มนำเข้าทดแทน");
      return;
    }
    const fifo = usable.find((l) => ammoLifeStatus(l.purchasedAt) !== "expired") ?? usable[0]!;
    setWithdrawLots(usable);
    setWithdrawForm({
      ...emptyWithdrawForm(),
      lotId: fifo.id,
      movedAt: toDateInput(new Date().toISOString()),
    });
    setWithdrawOpen(true);
  }

  function openEditGun(r: Firearm) {
    setEditingId(r.id);
    setGunForm({
      code: r.code,
      brand: r.brand,
      serial: r.serial ?? "",
      registerNo: r.registerNo ?? "",
      registerCard: r.registerCard ?? "",
      purchasedAt: toDateInput(r.purchasedAt),
      team: r.team ?? "",
      status: r.status || "สภาพพร้อมใช้งาน",
      detail: r.detail ?? "",
      fixNote: r.fixNote ?? "",
      docUrl: r.docUrl ?? "",
    });
    setModalOpen(true);
  }

  function openEditAmmo(r: Ammunition) {
    setEditingId(r.id);
    setAmmoForm({
      code: r.code,
      kind: r.kind,
      purchasedAt: toDateInput(r.purchasedAt),
      quantity: String(r.receivedQty),
      team: r.team ?? "",
      detail: r.detail ?? "",
    });
    setAmmoModalOpen(true);
  }

  async function saveGun(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body = JSON.stringify({
      code: gunForm.code.trim(),
      brand: gunForm.brand.trim(),
      serial: gunForm.serial.trim() || null,
      registerNo: gunForm.registerNo.trim() || null,
      registerCard: gunForm.registerCard.trim() || null,
      purchasedAt: gunForm.purchasedAt || null,
      team: gunForm.team.trim() || null,
      status: gunForm.status.trim(),
      detail: gunForm.detail.trim() || null,
      fixNote: gunForm.fixNote.trim() || null,
      docUrl: gunForm.docUrl.trim() || null,
    });
    try {
      if (editingId) await apiJson(`/api/firearms/${editingId}`, { method: "PUT", body });
      else await apiJson("/api/firearms", { method: "POST", body });
      setModalOpen(false);
      setEditingId(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function saveAmmo(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await apiJson(`/api/ammunition/${editingId}`, {
          method: "PUT",
          body: JSON.stringify({
            code: ammoForm.code.trim() || "ไม่ทราบ",
            kind: ammoForm.kind.trim(),
            purchasedAt: ammoForm.purchasedAt || null,
            team: ammoForm.team.trim() || null,
            detail: ammoForm.detail.trim() || null,
          }),
        });
      } else {
        await apiJson("/api/ammunition", {
          method: "POST",
          body: JSON.stringify({
            code: ammoForm.code.trim() || "ไม่ทราบ",
            kind: ammoForm.kind.trim(),
            purchasedAt: ammoForm.purchasedAt || null,
            quantity: Number(ammoForm.quantity) || 0,
            team: ammoForm.team.trim() || null,
            detail: ammoForm.detail.trim() || null,
          }),
        });
      }
      setAmmoModalOpen(false);
      setEditingId(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function saveWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!withdrawForm.lotId) return;
    setSaving(true);
    try {
      await apiJson(`/api/ammunition/${withdrawForm.lotId}/moves`, {
        method: "POST",
        body: JSON.stringify({
          kind: "OUT",
          quantity: Number(withdrawForm.quantity) || 0,
          movedAt: withdrawForm.movedAt || null,
          withdrawnBy: withdrawForm.withdrawnBy.trim(),
          note: withdrawForm.note.trim() || null,
        }),
      });
      setWithdrawOpen(false);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "เบิกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function removeGun(r: Firearm) {
    if (!confirm(`ลบอาวุธปืน «${r.code}» ?`)) return;
    try {
      await apiJson(`/api/firearms/${r.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  async function removeAmmo(r: Ammunition) {
    if (!confirm(`ลบกระสุน «${r.code} · ${r.kind}» ?`)) return;
    try {
      await apiJson(`/api/ammunition/${r.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  const dashCards =
    tab === "guns"
      ? [
          { key: "all" as DashKey, label: "ปืนทั้งหมด", value: dashStats.guns, tone: "from-[#0000BF]/8 via-[#8b5cf6]/8 to-[#ec4899]/10" },
          { key: "ready" as DashKey, label: "สภาพพร้อมใช้งาน", value: dashStats.ready, tone: "from-emerald-50 to-emerald-100/70" },
          { key: "notReady" as DashKey, label: "ไม่พร้อมใช้งาน", value: dashStats.notReady, tone: "from-rose-50 to-rose-100/80" },
          { key: "inStock" as DashKey, label: "จำหน่าย/คงคลัง", value: dashStats.inStock, tone: "from-violet-50 to-fuchsia-50" },
          { key: "disposed" as DashKey, label: "จำหน่าย", value: dashStats.disposed, tone: "from-slate-50 to-slate-100/80" },
          { key: "noStatus" as DashKey, label: "ไม่ระบุสภาพ", value: dashStats.noStatus, tone: "from-slate-50 to-slate-100/80" },
        ]
      : [
          { key: "all" as DashKey, label: "ล็อตจัดซื้อ", value: dashStats.ammoLots, tone: "from-[#0000BF]/8 via-[#8b5cf6]/8 to-[#ec4899]/10" },
          { key: "" as DashKey, label: "คงเหลือรวม", value: dashStats.qtyTotal, tone: "from-amber-50 to-orange-100/70" },
          { key: "expired" as DashKey, label: "หมดอายุ", value: dashStats.expired, tone: "from-rose-100/80 to-pink-100/70" },
          { key: "expiring" as DashKey, label: "ใกล้หมดอายุ", value: dashStats.expiring, tone: "from-amber-50 to-orange-100/70" },
          { key: "empty" as DashKey, label: "ประวัติล็อต", value: dashStats.empty, tone: "from-slate-50 to-slate-100/80" },
        ];

  const chips = tab === "guns" ? dashStats.kinds : dashStats.ammoKinds;

  return (
    <div>
      <PageHeaderBar
        title="อาวุธปืนและกระสุน"
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: tab === "ammo" ? "กระสุนปืน" : "อาวุธปืน",
          placeholder: tab === "guns" ? "กรองรหัส / ชนิด / ทะเบียน / ทีม / สภาพ…" : "กรองชนิด / ทีม / ผู้เบิก / วันจัดซื้อ…",
        }}
        segments={
          <div className={toolbarMasterGroupClass}>
            {(
              [
                ["guns", "อาวุธปืน", GunIcon],
                ["ammo", "กระสุนปืน", AmmoIcon],
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
                    setKindFilter("");
                    setLedgerLots(null);
                    setZeroLots(null);
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
            {tab === "ammo" ? "นำเข้ากระสุน" : "เพิ่มอาวุธปืน"}
          </button>
        }
      />

      <Modal
        open={standardNoteOpen}
        onClose={() => setStandardNoteOpen(false)}
        title="มาตรฐานอาวุธปืนและกระสุนขั้นต่ำ"
        size="wide"
      >
        <ModalFormBody>
          <ModalFormSection title="จำนวนปืนคงคลังตามพื้นที่รักษาการณ์">
            <p className="text-sm leading-relaxed text-[#2e2a58]">
              กำหนดจำนวนอาวุธปืนและกระสุนขั้นต่ำที่แต่ละพื้นที่รักษาการณ์ต้องมี ดังนี้
            </p>
            <div className="overflow-x-auto rounded-xl border border-[#e8e6fc]">
              <table className="min-w-[40rem] w-full border-collapse text-left text-[11px] sm:text-xs">
                <thead>
                  <tr className="bg-[#eef2ff] text-[#1e1b4b]">
                    <th className="border-b border-[#d8d9ff] px-2 py-2 font-bold" rowSpan={2}>
                      พื้นที่รักษาการณ์
                    </th>
                    <th className="border-b border-[#d8d9ff] px-2 py-1.5 text-center font-bold" colSpan={6}>
                      จำนวนปืนคงคลัง
                    </th>
                  </tr>
                  <tr className="bg-[#eef2ff] text-[#2e2a58]">
                    <th className="border-b border-[#d8d9ff] px-1.5 py-1.5 text-center font-semibold leading-tight">
                      ปืนลูกโม่
                      <span className="block text-[9px] font-medium text-slate-500">(กระบอก)</span>
                    </th>
                    <th className="border-b border-[#d8d9ff] px-1.5 py-1.5 text-center font-semibold leading-tight">
                      กระสุนลูกโม่
                      <span className="block text-[9px] font-medium text-slate-500">(นัด)</span>
                    </th>
                    <th className="border-b border-[#d8d9ff] px-1.5 py-1.5 text-center font-semibold leading-tight">
                      ปืนลูกซอง
                      <span className="block text-[9px] font-medium text-slate-500">(กระบอก)</span>
                    </th>
                    <th className="border-b border-[#d8d9ff] px-1.5 py-1.5 text-center font-semibold leading-tight">
                      กระสุนลูกซอง
                      <span className="block text-[9px] font-medium text-slate-500">(นัด)</span>
                    </th>
                    <th className="border-b border-[#d8d9ff] px-1.5 py-1.5 text-center font-semibold leading-tight">
                      ปืนกึ่งอัตโนมัติ
                      <span className="block text-[9px] font-medium text-slate-500">(กระบอก)</span>
                    </th>
                    <th className="border-b border-[#d8d9ff] px-1.5 py-1.5 text-center font-semibold leading-tight">
                      กระสุนกึ่งอัตโนมัติ
                      <span className="block text-[9px] font-medium text-slate-500">(นัด)</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {WEAPON_STANDARD_ROWS.map((row) => (
                    <tr key={row.abbr} className="border-b border-[#ecebff] last:border-0">
                      <td className="px-2 py-2 font-semibold text-[#1e1b4b]">
                        {row.unit === row.abbr ? (
                          row.abbr
                        ) : (
                          <>
                            {row.unit}{" "}
                            <span className="font-bold text-[#4d47b6]">({row.abbr})</span>
                          </>
                        )}
                      </td>
                      <td className="px-1.5 py-2 text-center tabular-nums">{row.revolver.toLocaleString("th-TH")}</td>
                      <td className="px-1.5 py-2 text-center tabular-nums">{row.revolverAmmo.toLocaleString("th-TH")}</td>
                      <td className="px-1.5 py-2 text-center tabular-nums">{row.shotgun.toLocaleString("th-TH")}</td>
                      <td className="px-1.5 py-2 text-center tabular-nums">{row.shotgunAmmo.toLocaleString("th-TH")}</td>
                      <td className="px-1.5 py-2 text-center tabular-nums">{row.semi.toLocaleString("th-TH")}</td>
                      <td className="px-1.5 py-2 text-center tabular-nums">{row.semiAmmo.toLocaleString("th-TH")}</td>
                    </tr>
                  ))}
                  <tr className="bg-[#faf9ff] font-black text-[#1e1b4b]">
                    <td className="px-2 py-2">รวมทั้งสิ้น</td>
                    <td className="px-1.5 py-2 text-center tabular-nums">
                      {WEAPON_STANDARD_TOTAL.revolver.toLocaleString("th-TH")}
                    </td>
                    <td className="px-1.5 py-2 text-center tabular-nums">
                      {WEAPON_STANDARD_TOTAL.revolverAmmo.toLocaleString("th-TH")}
                    </td>
                    <td className="px-1.5 py-2 text-center tabular-nums">
                      {WEAPON_STANDARD_TOTAL.shotgun.toLocaleString("th-TH")}
                    </td>
                    <td className="px-1.5 py-2 text-center tabular-nums">
                      {WEAPON_STANDARD_TOTAL.shotgunAmmo.toLocaleString("th-TH")}
                    </td>
                    <td className="px-1.5 py-2 text-center tabular-nums">
                      {WEAPON_STANDARD_TOTAL.semi.toLocaleString("th-TH")}
                    </td>
                    <td className="px-1.5 py-2 text-center tabular-nums">
                      {WEAPON_STANDARD_TOTAL.semiAmmo.toLocaleString("th-TH")}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </ModalFormSection>

          <ModalFormSection title="อักษรย่อพื้นที่">
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {WEAPON_STANDARD_ROWS.map((row) => (
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

      <div className={`mt-4 grid gap-2 print:hidden sm:grid-cols-2 lg:grid-cols-3 ${tab === "ammo" ? "xl:grid-cols-5" : "xl:grid-cols-6"}`}>
        {dashCards.map((c) => (
          <InsightCard
            key={`${tab}-${c.label}`}
            label={c.label}
            value={c.value}
            tone={c.tone}
            active={Boolean(c.key) && dashKey === c.key}
            onClick={
              !c.key
                ? undefined
                : c.key === "empty"
                  ? () => {
                      setZeroTitle("ประวัติล็อตคงเหลือ 0");
                      setZeroLots(scopedAmmo.filter((l) => l.remainingQty <= 0));
                    }
                  : () => setDashKey((cur) => (cur === c.key ? "" : c.key))
            }
          />
        ))}
      </div>
      {chips.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5 print:hidden">
          {chips.map(([name, n]) => {
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

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditingId(null); }} title={editingId ? "แก้ไขอาวุธปืน" : "เพิ่มอาวุธปืน"} size="form">
        <form onSubmit={(e) => void saveGun(e)}>
          <ModalFormBody>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-slate-700">รหัส</span>
                <input required className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm" value={gunForm.code} onChange={(e) => setGunForm((f) => ({ ...f, code: e.target.value }))} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">หมายเลขเครื่อง</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={gunForm.serial} onChange={(e) => setGunForm((f) => ({ ...f, serial: e.target.value }))} />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">ชนิด / ยี่ห้อ</span>
                <input required className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={gunForm.brand} onChange={(e) => setGunForm((f) => ({ ...f, brand: e.target.value }))} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">ทะเบียน</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={gunForm.registerNo} onChange={(e) => setGunForm((f) => ({ ...f, registerNo: e.target.value }))} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">ใบอนุญาต / ป.4</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={gunForm.registerCard} onChange={(e) => setGunForm((f) => ({ ...f, registerCard: e.target.value }))} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">วันที่จัดซื้อ</span>
                <PickableDateInput type="date" className="mt-1" value={gunForm.purchasedAt} onChange={(v) => setGunForm((f) => ({ ...f, purchasedAt: v }))} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">ทีม</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={gunForm.team} onChange={(e) => setGunForm((f) => ({ ...f, team: e.target.value }))} />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">สถานะ</span>
                <select className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={gunForm.status} onChange={(e) => setGunForm((f) => ({ ...f, status: e.target.value }))}>
                  {gunStatusOptions(gunForm.status).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                  <option value="">ไม่ระบุ</option>
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">ลิงก์เอกสาร</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={gunForm.docUrl} onChange={(e) => setGunForm((f) => ({ ...f, docUrl: e.target.value }))} placeholder="https://…" />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">รายละเอียด</span>
                <textarea rows={3} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={gunForm.detail} onChange={(e) => setGunForm((f) => ({ ...f, detail: e.target.value }))} />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">หมายเหตุซ่อม</span>
                <textarea rows={2} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={gunForm.fixNote} onChange={(e) => setGunForm((f) => ({ ...f, fixNote: e.target.value }))} />
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

      <Modal open={ammoModalOpen} onClose={() => { setAmmoModalOpen(false); setEditingId(null); }} title={editingId ? "แก้ไขล็อตกระสุน" : "นำเข้ากระสุน (ล็อตจัดซื้อใหม่)"} size="form">
        <form onSubmit={(e) => void saveAmmo(e)}>
          <ModalFormBody>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-slate-700">รหัส</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm" value={ammoForm.code} onChange={(e) => setAmmoForm((f) => ({ ...f, code: e.target.value }))} placeholder="ไม่ทราบ" />
              </label>
              {!editingId ? (
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">จำนวนรับเข้า (นัด)</span>
                  <input required type="number" min={1} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={ammoForm.quantity} onChange={(e) => setAmmoForm((f) => ({ ...f, quantity: e.target.value }))} />
                </label>
              ) : (
                <div />
              )}
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">ชนิดกระสุน</span>
                <input required className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={ammoForm.kind} onChange={(e) => setAmmoForm((f) => ({ ...f, kind: e.target.value }))} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">วันจัดซื้อ</span>
                <PickableDateInput type="date" className="mt-1" value={ammoForm.purchasedAt} onChange={(v) => setAmmoForm((f) => ({ ...f, purchasedAt: v }))} />
                <span className="mt-1 block text-[11px] text-slate-500">อายุการใช้งาน 5 ปี — หมดอายุ {ammoForm.purchasedAt ? formatThDate(ammoExpiryDate(ammoForm.purchasedAt)?.toISOString()) : "—"}</span>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">ทีม / คลัง</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={ammoForm.team} onChange={(e) => setAmmoForm((f) => ({ ...f, team: e.target.value }))} />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">รายละเอียด</span>
                <textarea rows={3} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={ammoForm.detail} onChange={(e) => setAmmoForm((f) => ({ ...f, detail: e.target.value }))} />
              </label>
            </div>
          </ModalFormBody>
          <ModalFormActions>
            <button type="submit" disabled={saving} className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {saving ? "กำลังบันทึก…" : editingId ? "บันทึก" : "นำเข้าคลัง"}
            </button>
            <button type="button" className="rounded-lg border border-slate-200 px-4 py-2 text-sm" onClick={() => { setAmmoModalOpen(false); setEditingId(null); }}>ยกเลิก</button>
          </ModalFormActions>
        </form>
      </Modal>

      <Modal open={withdrawOpen} onClose={() => setWithdrawOpen(false)} title="เบิกกระสุน" size="form">
        <form onSubmit={(e) => void saveWithdraw(e)}>
          <ModalFormBody>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">ล็อตจัดซื้อ</span>
                <select
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={withdrawForm.lotId}
                  onChange={(e) => setWithdrawForm((f) => ({ ...f, lotId: e.target.value }))}
                >
                  {withdrawLots.map((l) => (
                      <option key={l.id} value={l.id}>
                        {formatThDate(l.purchasedAt)} · คงเหลือ {l.remainingQty} นัด · {l.code}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">ผู้เบิก</span>
                <input required className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={withdrawForm.withdrawnBy} onChange={(e) => setWithdrawForm((f) => ({ ...f, withdrawnBy: e.target.value }))} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">จำนวนที่เบิก (นัด)</span>
                <input required type="number" min={1} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={withdrawForm.quantity} onChange={(e) => setWithdrawForm((f) => ({ ...f, quantity: e.target.value }))} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">วันที่เบิก</span>
                <PickableDateInput type="date" className="mt-1" value={withdrawForm.movedAt} onChange={(v) => setWithdrawForm((f) => ({ ...f, movedAt: v }))} />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">หมายเหตุ</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={withdrawForm.note} onChange={(e) => setWithdrawForm((f) => ({ ...f, note: e.target.value }))} placeholder="เช่น ฝึกยิงปืนทบทวน" />
              </label>
            </div>
          </ModalFormBody>
          <ModalFormActions>
            <button type="submit" disabled={saving} className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {saving ? "กำลังบันทึก…" : "บันทึกการเบิก"}
            </button>
            <button type="button" className="rounded-lg border border-slate-200 px-4 py-2 text-sm" onClick={() => setWithdrawOpen(false)}>ยกเลิก</button>
          </ModalFormActions>
        </form>
      </Modal>

      <Modal open={ledgerLots != null} onClose={() => setLedgerLots(null)} title={`ประวัติเบิก/นำเข้า · ${ledgerTitle}`} size="wide">
        {ledgerLots ? (
          <div className="overflow-x-auto p-3">
            {ammoLedgerRows(ledgerLots).length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-slate-500">ยังไม่มีรายการเบิกหรือนำเข้า</p>
            ) : (
              <table className="min-w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-[#ecebff] bg-gradient-to-r from-[#f5f3ff] to-[#fdf2f8] text-[11px] font-bold text-[#4d47b6]">
                    <th className="px-2 py-2">วันที่</th>
                    <th className="px-2 py-2">ประเภท</th>
                    <th className="px-2 py-2">ผู้เบิก</th>
                    <th className="px-2 py-2 text-right">จำนวน</th>
                    <th className="px-2 py-2">จากล็อต</th>
                    <th className="px-2 py-2 text-right">คงเหลือหลังทำ</th>
                    <th className="px-2 py-2">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {ammoLedgerRows(ledgerLots).map(({ move, lot }) => (
                    <tr key={move.id} className="border-b border-[#ecebff] hover:bg-[#0000BF]/[0.04]">
                      <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-slate-700">{formatThDate(move.movedAt)}</td>
                      <td className="px-2 py-1.5">
                        <span className={`rounded-full px-1.5 py-px text-[10px] font-bold ${move.kind === "OUT" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-800"}`}>
                          {move.kind === "OUT" ? "เบิก" : "นำเข้า"}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 font-medium text-[#2e2a58]">{move.kind === "OUT" ? move.withdrawnBy || "—" : "—"}</td>
                      <td className={`whitespace-nowrap px-2 py-1.5 text-right font-black tabular-nums ${move.kind === "OUT" ? "text-rose-700" : "text-emerald-800"}`}>
                        {move.kind === "OUT" ? "−" : "+"}
                        {move.quantity.toLocaleString("th-TH")}
                      </td>
                      <td className="px-2 py-1.5 text-slate-700">
                        จัดซื้อ {formatThDate(lot.purchasedAt)}
                        <span className="mt-0.5 block font-mono text-[10px] text-slate-500">{lot.code}</span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-bold tabular-nums text-[#1e1b4b]">
                        {move.remainingAfter.toLocaleString("th-TH")}
                      </td>
                      <td className="max-w-[14rem] truncate px-2 py-1.5 text-slate-600" title={move.note ?? ""}>
                        {move.note || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal open={zeroLots != null} onClose={() => setZeroLots(null)} title={`ประวัติล็อตคงเหลือ 0 · ${zeroTitle}`} size="wide">
        {zeroLots ? (
          <div className="p-3">
            {zeroLots.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-slate-500">ไม่มีล็อตคงเหลือ 0</p>
            ) : (
              <ul className="space-y-1.5">
                {zeroLots.map((lot) => (
                  <li key={lot.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                      <span className="font-bold text-[#1e1b4b]">{lot.kind}</span>
                      <span className="text-slate-600">{lot.team || "ไม่ระบุทีม"}</span>
                      <span className="rounded-full bg-slate-200 px-1.5 py-px text-[10px] font-bold text-slate-600">คงเหลือ 0</span>
                      <span className="ml-auto tabular-nums text-slate-600">รับเข้า {lot.receivedQty.toLocaleString("th-TH")} นัด</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-600">
                      รหัส {lot.code} · จัดซื้อ {formatThDate(lot.purchasedAt)} · หมดอายุ {formatThDate(ammoExpiryDate(lot.purchasedAt)?.toISOString())}
                    </p>
                    {ammoLedgerRows([lot]).length > 0 ? (
                      <ul className="mt-1.5 space-y-px text-[11px] text-slate-600">
                        {ammoLedgerRows([lot]).map(({ move }) => (
                          <li key={move.id}>
                            {move.kind === "OUT" ? "เบิก" : "นำเข้า"} {move.quantity.toLocaleString("th-TH")} นัด
                            {move.withdrawnBy ? ` · ผู้เบิก ${move.withdrawnBy}` : ""}
                            {" · "}
                            {formatThDate(move.movedAt)}
                            {move.note ? ` · ${move.note}` : ""}
                            {" · คงเหลือ "}
                            {move.remainingAfter.toLocaleString("th-TH")}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </Modal>

      <div className="mt-6 print:hidden">
        {loading ? (
          <div className="rounded-[1.15rem] border border-[#e8e6fc] bg-white/70 px-4 py-10 text-center text-slate-600">กำลังโหลด…</div>
        ) : tab === "guns" ? (
          guns.length === 0 ? (
            <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">
              ยังไม่มีอาวุธปืน — กด «เพิ่มอาวุธปืน» หรือรีสตาร์ท API เพื่อซิงก์จาก CSV
            </div>
          ) : filteredGuns.length === 0 ? (
            <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">ไม่มีรายการที่ตรงกับการกรอง</div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredGuns.map((r, idx) => (
                <li key={r.id}>
                  <div className={listCardClass}>
                    <span className={`absolute inset-y-0 left-0 w-1 ${listCardAccentClass(idx)}`} aria-hidden />
                    <div className="min-w-0 flex-1 pl-2">
                      <div className="flex gap-2.5">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#e8e6fc] bg-gradient-to-br from-[#0000BF]/10 via-[#8b5cf6]/10 to-[#ec4899]/10 shadow-sm">
                          <GunIcon className="h-8 w-8" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-mono text-sm font-bold text-[#1e1b4b]">{r.code}</p>
                              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8b5cf6]">{gunKindLabel(r.brand)}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${gunStatusChip(r.status)}`}>
                              {r.status || "ไม่ระบุสภาพ"}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs font-medium text-[#2e2a58]">{r.brand.replace(/"/g, "")}</p>
                        </div>
                      </div>
                      <dl className="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
                        <div>
                          <dt className="text-slate-500">หมายเลขเครื่อง</dt>
                          <dd className="font-mono font-semibold text-[#4d47b6]">{r.serial || "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">ทะเบียน</dt>
                          <dd className="font-semibold text-[#ec4899]">{r.registerNo || "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">จัดซื้อ</dt>
                          <dd className="tabular-nums text-slate-800">{formatThDate(r.purchasedAt)}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">ทีม</dt>
                          <dd className="font-medium text-[#2e2a58]">{r.team || "—"}</dd>
                        </div>
                        {r.registerCard ? (
                          <div className="col-span-2">
                            <dt className="text-slate-500">ใบอนุญาต / ป.4</dt>
                            <dd className="text-slate-700">{r.registerCard}</dd>
                          </div>
                        ) : null}
                        {r.fixNote ? (
                          <div className="col-span-2">
                            <dt className="text-slate-500">หมายเหตุซ่อม</dt>
                            <dd className="text-rose-700">{r.fixNote}</dd>
                          </div>
                        ) : null}
                        {r.detail ? (
                          <div className="col-span-2">
                            <dt className="text-slate-500">รายละเอียด</dt>
                            <dd className="whitespace-pre-wrap text-slate-700">{r.detail}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#ecebff] pt-2.5 pl-2">
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
                      <button type="button" className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100" onClick={() => openEditGun(r)}>แก้ไข</button>
                      <button type="button" className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100" onClick={() => void removeGun(r)}>ลบ</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : ammo.length === 0 ? (
          <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">
            ยังไม่มีสต๊อกกระสุน — กด «นำเข้ากระสุน» หรือรีสตาร์ท API เพื่อซิงก์จาก CSV
          </div>
        ) : ammoStocks.length === 0 ? (
          <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">ไม่มีรายการที่ตรงกับการกรอง</div>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {ammoStocks.map((stock, idx) => (
              <li key={stock.key}>
                <div className={listCardClass}>
                  <span className={`absolute inset-y-0 left-0 w-1 ${listCardAccentClass(idx)}`} aria-hidden />
                  <div className="min-w-0 flex-1 pl-2">
                    <div className="flex gap-2.5">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#e8e6fc] bg-gradient-to-br from-[#0000BF]/10 via-[#8b5cf6]/10 to-[#ec4899]/10 shadow-sm">
                        <AmmoIcon className="h-8 w-8" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-[#1e1b4b]">{stock.kind}</p>
                        <p className="mt-0.5 text-[11px] text-slate-600">
                          คลัง {stock.team} · {stock.activeLots.length} ล็อต
                          {stock.historyLots.length > 0 ? (
                            <>
                              {" · "}
                              <button
                                type="button"
                                className="font-bold text-[#4d47b6] hover:underline"
                                onClick={() => {
                                  setZeroTitle(`${stock.kind} · ${stock.team}`);
                                  setZeroLots(stock.historyLots);
                                }}
                              >
                                ประวัติล็อตคงเหลือ 0 ({stock.historyLots.length})
                              </button>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <div className="shrink-0 rounded-xl bg-[#f5f3ff] px-2.5 py-1.5 text-right">
                        <p className={`text-lg font-black tabular-nums leading-none ${stock.remaining <= 0 ? "text-rose-700" : "text-[#1e1b4b]"}`}>
                          {stock.remaining.toLocaleString("th-TH")}
                        </p>
                        <p className="mt-0.5 text-[10px] font-semibold text-[#6b6798]">คงเหลือ (นัด)</p>
                      </div>
                    </div>
                    <ul className="mt-2.5 space-y-1">
                      {stock.activeLots.map((lot) => {
                        const life = ammoLifeStatus(lot.purchasedAt);
                        return (
                          <li key={lot.id} className="rounded-lg border border-[#ecebff] bg-white px-2 py-1.5">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                              <span className="font-semibold text-[#2e2a58]">จัดซื้อ {formatThDate(lot.purchasedAt)}</span>
                              <span className="text-slate-500">หมดอายุ {formatThDate(ammoExpiryDate(lot.purchasedAt)?.toISOString())}</span>
                              {life === "expired" ? (
                                <span className="rounded-full bg-rose-100 px-1.5 py-px text-[10px] font-bold text-rose-700">หมดอายุ</span>
                              ) : life === "expiring" ? (
                                <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-bold text-amber-800">ใกล้หมดอายุ</span>
                              ) : null}
                              <span className="ml-auto tabular-nums font-black text-[#1e1b4b]">
                                {lot.remainingQty.toLocaleString("th-TH")}
                                <span className="ml-0.5 font-medium text-[#6b6798]">/{lot.receivedQty.toLocaleString("th-TH")} นัด</span>
                              </span>
                            </div>
                            <p className="mt-0.5 text-[10px] text-slate-500">รหัส {lot.code}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <button type="button" className="rounded border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-800" onClick={() => openEditAmmo(lot)}>แก้ไขล็อต</button>
                              <button type="button" className="rounded border border-rose-200 bg-rose-50 px-1.5 py-px text-[10px] font-medium text-rose-600" onClick={() => void removeAmmo(lot)}>ลบล็อต</button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#ecebff] pt-2.5 pl-2">
                    <button
                      type="button"
                      className="rounded-lg border border-[#0000BF]/25 bg-[#0000BF]/8 px-2.5 py-1 text-xs font-bold text-[#0000BF] hover:bg-[#0000BF]/12"
                      onClick={() => openWithdraw(stock.activeLots)}
                    >
                      เบิก
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                      onClick={() => openReplace(stock.kind, stock.team)}
                    >
                      นำเข้าทดแทน
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-[#dcd8f0] bg-white px-2.5 py-1 text-xs font-medium text-[#2e2a58] hover:bg-[#0000BF]/5"
                      onClick={() => {
                        setLedgerTitle(`${stock.kind} · ${stock.team}`);
                        setLedgerLots(stock.lots);
                      }}
                    >
                      ประวัติเบิก/นำเข้า
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {tab === "guns" ? (
        <PrintA4Table
          columns={[
            { label: "รหัส" },
            { label: "ชนิด" },
            { label: "ยี่ห้อ" },
            { label: "หมายเลขเครื่อง" },
            { label: "ทะเบียน" },
            { label: "ทีม" },
            { label: "สถานะ" },
            { label: "จัดซื้อ" },
          ]}
          rows={filteredGuns.map((r) => [
            r.code,
            gunKindLabel(r.brand),
            r.brand.replace(/"/g, ""),
            r.serial || "—",
            r.registerNo || "—",
            r.team || "—",
            r.status || "—",
            formatThDate(r.purchasedAt),
          ])}
        />
      ) : (
        <PrintA4Table
          columns={[
            { label: "ชนิด" },
            { label: "ทีม" },
            { label: "รหัสล็อต" },
            { label: "จัดซื้อ" },
            { label: "หมดอายุ" },
            { label: "คงเหลือ" },
            { label: "รับเข้า" },
          ]}
          rows={ammoStocks.flatMap((s) =>
            s.activeLots.map((lot) => [
              s.kind,
              s.team,
              lot.code,
              formatThDate(lot.purchasedAt),
              formatThDate(ammoExpiryDate(lot.purchasedAt)?.toISOString()),
              lot.remainingQty.toLocaleString("th-TH"),
              lot.receivedQty.toLocaleString("th-TH"),
            ]),
          )}
        />
      )}

      <ModuleDocumentsModal
        open={docsOpen}
        categoryName={MODULE_DOCUMENT_CATEGORIES.weapons}
        onClose={() => setDocsOpen(false)}
      />
    </div>
  );
}