import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { apiJson } from "../api/client";
import { AssetQrModal } from "../components/AssetQrModal";
import { AssetPhotosModal } from "../components/AssetPhotosModal";
import { DetailField } from "../components/DetailField";
import { FitSingleLine } from "../components/FitSingleLine";
import { Modal, ModalFormActions, ModalFormBody } from "../components/Modal";
import { ModuleDocumentsModal } from "../components/ModuleDocumentsModal";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { PrintA4Table } from "../components/PrintA4Table";
import { MODULE_DOCUMENT_CATEGORIES } from "../lib/moduleDocumentCategories";
import { isRadioAsset, radioKind, radioKindLabel, RADIO_CATEGORY_NAME } from "../lib/radioAsset";
import { getScanUrlForToken } from "../lib/scanUrl";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { listCardAccentClass, listCardClass, toolbarLinkBtnClass, toolbarPrimaryBtnClass } from "../lib/uiTokens";
import type { Asset, NameMasterRow } from "../types";
import type { LoadOptions } from "../lib/loadOptions";
import { setLoadBusy } from "../lib/loadOptions";

type DashKey = "" | "all" | "handheld" | "mobile";

const KIND_OPTIONS = [
  "เครื่องวิทยุคมนาคม ชนิดมือถือ (Handheld Station)",
  "เครื่องรับ-ส่งวิทยุ ชนิดใช้มือถือ",
  "เครื่องวิทยุคมนาคม ชนิดเคลื่อนที่ (Mobile Station)",
  "เครื่องวิทยุคมนาคมชนิดเคลื่อนที่(MobileStation)",
];

function emptyForm() {
  return {
    serialNumber: "",
    itemName: KIND_OPTIONS[0]!,
    location: "",
    costCenter: "",
    deviceBrand: "",
    deviceModel: "",
    assetItemStatusId: "",
    notes: "",
  };
}

function RadioIcon({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const gradId = `radioGrad-${uid}`;
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden>
      <rect x="14" y="14" width="20" height="26" rx="4" stroke={`url(#${gradId})`} strokeWidth="2.2" />
      <path d="M24 14V8M18 22h12M18 28h8" stroke={`url(#${gradId})`} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="30" cy="33" r="2.2" fill="#ec4899" />
      <defs>
        <linearGradient id={gradId} x1="14" y1="8" x2="34" y2="40" gradientUnits="userSpaceOnUse">
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

export function RadiosPage() {
  const [rows, setRows] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<NameMasterRow[]>([]);
  const [statuses, setStatuses] = useState<NameMasterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listFilter, setListFilter] = useState("");
  const [dashKey, setDashKey] = useState<DashKey>("");
  const [brandFilter, setBrandFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrCtx, setQrCtx] = useState<{ token: string; itemName: string; serialNumber: string } | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [detail, setDetail] = useState<Asset | null>(null);
  const [photoAssetId, setPhotoAssetId] = useState<string | null>(null);
  const [photoLabel, setPhotoLabel] = useState("");

  const radioCategoryId = categories.find((c) => c.name === RADIO_CATEGORY_NAME)?.id ?? "";

  const load = useCallback(async (opts?: LoadOptions) => {
    setLoadBusy(setLoading, opts, true);
    try {
      const [a, c, s] = await Promise.all([
        apiJson<Asset[]>("/api/assets"),
        apiJson<NameMasterRow[]>("/api/asset-categories"),
        apiJson<NameMasterRow[]>("/api/asset-item-statuses"),
      ]);
      setRows(a.filter(isRadioAsset));
      setCategories(c);
      setStatuses(s);
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
          r.serialNumber,
          r.itemName,
          r.location,
          r.costCenter,
          r.deviceBrand,
          r.deviceModel,
          r.notes,
          r.assetItemStatus?.name,
          radioKindLabel(r.itemName),
        ]),
      ),
    [rows, listFilter],
  );

  const scoped = useMemo(
    () => searchRows.filter((r) => !brandFilter || (r.deviceBrand || "ไม่ระบุยี่ห้อ") === brandFilter),
    [searchRows, brandFilter],
  );

  const dashStats = useMemo(() => {
    let handheld = 0;
    let mobile = 0;
    const brands = new Map<string, number>();
    for (const r of searchRows) {
      const b = r.deviceBrand || "ไม่ระบุยี่ห้อ";
      brands.set(b, (brands.get(b) || 0) + 1);
    }
    for (const r of scoped) {
      const k = radioKind(r.itemName);
      if (k === "handheld") handheld += 1;
      else if (k === "mobile") mobile += 1;
    }
    return {
      total: scoped.length,
      handheld,
      mobile,
      brands: [...brands.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [searchRows, scoped]);

  const filtered = useMemo(
    () =>
      scoped.filter((r) => {
        if (!dashKey || dashKey === "all") return true;
        const k = radioKind(r.itemName);
        if (dashKey === "handheld") return k === "handheld";
        if (dashKey === "mobile") return k === "mobile";
        return true;
      }),
    [scoped, dashKey],
  );

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(r: Asset) {
    setDetail(null);
    setEditingId(r.id);
    setForm({
      serialNumber: r.serialNumber,
      itemName: r.itemName,
      location: r.location,
      costCenter: r.costCenter ?? "",
      deviceBrand: r.deviceBrand ?? "",
      deviceModel: r.deviceModel ?? "",
      assetItemStatusId: r.assetItemStatusId ?? "",
      notes: r.notes ?? "",
    });
    setModalOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body = JSON.stringify({
      serialNumber: form.serialNumber.trim(),
      itemName: form.itemName.trim(),
      location: form.location.trim() || "—",
      costCenter: form.costCenter.trim() || null,
      deviceBrand: form.deviceBrand.trim() || null,
      deviceModel: form.deviceModel.trim() || null,
      assetCategoryId: radioCategoryId || null,
      assetItemStatusId: form.assetItemStatusId || null,
      notes: form.notes.trim() || null,
    });
    try {
      if (editingId) await apiJson(`/api/assets/${editingId}`, { method: "PUT", body });
      else await apiJson("/api/assets", { method: "POST", body });
      setModalOpen(false);
      setEditingId(null);
      await load({ silent: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: Asset) {
    if (!confirm(`ลบวิทยุ «${r.serialNumber}» ?`)) return;
    try {
      await apiJson(`/api/assets/${r.id}`, { method: "DELETE" });
      setDetail(null);
      await load({ silent: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  const dashCards = [
    { key: "all" as DashKey, label: "วิทยุทั้งหมด", value: dashStats.total, tone: "from-[#0000BF]/8 via-[#8b5cf6]/8 to-[#ec4899]/10" },
    { key: "handheld" as DashKey, label: "มือถือ", value: dashStats.handheld, tone: "from-emerald-50 to-emerald-100/70" },
    { key: "mobile" as DashKey, label: "เคลื่อนที่", value: dashStats.mobile, tone: "from-sky-50 to-sky-100/70" },
  ];

  return (
    <div>
      <PageHeaderBar
        title="วิทยุสื่อสาร"
        count={filtered.length}
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "วิทยุสื่อสาร",
          placeholder: "กรองเลขครุภัณฑ์ / ชนิด / ยี่ห้อ / ที่ตั้ง…",
        }}
        extras={
          <button type="button" className={toolbarLinkBtnClass} onClick={() => setDocsOpen(true)}>
            เอกสาร
          </button>
        }
        primary={
          <button type="button" onClick={openAdd} className={toolbarPrimaryBtnClass}>
            เพิ่มวิทยุ
          </button>
        }
      />

      <div className="mt-4 grid gap-2 print:hidden sm:grid-cols-3">
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

      {dashStats.brands.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5 print:hidden">
          {dashStats.brands.map(([name, n]) => {
            const active = brandFilter === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setBrandFilter((cur) => (cur === name ? "" : name))}
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

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditingId(null); }} title={editingId ? "แก้ไขวิทยุ" : "เพิ่มวิทยุ"} size="form">
        <form onSubmit={(e) => void save(e)}>
          <ModalFormBody>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-slate-700">เลขครุภัณฑ์</span>
                <input required className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm" value={form.serialNumber} onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">สถานะ</span>
                <select className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={form.assetItemStatusId} onChange={(e) => setForm((f) => ({ ...f, assetItemStatusId: e.target.value }))}>
                  <option value="">ไม่ระบุ</option>
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">ชนิด</span>
                <select className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={KIND_OPTIONS.includes(form.itemName) ? form.itemName : ""} onChange={(e) => setForm((f) => ({ ...f, itemName: e.target.value || f.itemName }))}>
                  {KIND_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                  {!KIND_OPTIONS.includes(form.itemName) && form.itemName ? <option value={form.itemName}>{form.itemName}</option> : null}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">ยี่ห้อ</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={form.deviceBrand} onChange={(e) => setForm((f) => ({ ...f, deviceBrand: e.target.value }))} placeholder="Hytera / Icom / DRC…" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">รุ่น</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={form.deviceModel} onChange={(e) => setForm((f) => ({ ...f, deviceModel: e.target.value }))} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">ที่ตั้ง</span>
                <input required className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">ศูนย์ต้นทุน</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={form.costCenter} onChange={(e) => setForm((f) => ({ ...f, costCenter: e.target.value }))} />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-slate-700">หมายเหตุ</span>
                <textarea rows={2} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
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

      <AssetQrModal
        open={qrOpen}
        onClose={() => { setQrOpen(false); setQrCtx(null); }}
        scanUrl={qrCtx ? getScanUrlForToken(qrCtx.token) : ""}
        itemName={qrCtx?.itemName ?? ""}
        serialNumber={qrCtx?.serialNumber ?? ""}
      />
      <AssetPhotosModal
        assetId={photoAssetId}
        itemLabel={photoLabel}
        open={photoOpen}
        onClose={() => { setPhotoOpen(false); setPhotoAssetId(null); }}
        onUpdated={() => void load({ silent: true })}
      />

      <div className="mt-6 print:hidden">
        {loading ? (
          <div className="rounded-[1.15rem] border border-[#e8e6fc] bg-white/70 px-4 py-10 text-center text-slate-600">กำลังโหลด…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">
            ยังไม่มีวิทยุสื่อสาร — กด «เพิ่มวิทยุ» หรือรีสตาร์ท API เพื่อซิงก์ทะเบียน
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">ไม่มีรายการที่ตรงกับการกรอง</div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((r, idx) => (
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
                        <RadioIcon className="h-8 w-8" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-bold text-[#1e1b4b]">{r.serialNumber}</p>
                            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8b5cf6]">{radioKindLabel(r.itemName)}</p>
                          </div>
                          {r.assetItemStatus?.name ? (
                            <span className="shrink-0 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-800">{r.assetItemStatus.name}</span>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-xs font-medium text-[#2e2a58]">{r.itemName}</p>
                      </div>
                    </div>
                    <dl className="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
                      <div>
                        <dt className="text-slate-500">ยี่ห้อ</dt>
                        <dd className="font-semibold text-[#4d47b6]">{[r.deviceBrand, r.deviceModel].filter(Boolean).join(" ") || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">ที่ตั้ง</dt>
                        <dd className="font-medium text-[#2e2a58]">{r.location || "—"}</dd>
                      </div>
                    </dl>
                  </div>
                  <div
                    className="mt-3 flex flex-wrap gap-1.5 border-t border-[#ecebff] pt-2.5 pl-2"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="rounded-lg border border-[#0000BF]/25 bg-[#0000BF]/8 px-2.5 py-1 text-xs font-bold text-[#0000BF] hover:bg-[#0000BF]/12"
                      onClick={() => {
                        setQrCtx({ token: r.qrToken, itemName: r.itemName, serialNumber: r.serialNumber });
                        setQrOpen(true);
                      }}
                    >
                      QR
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-[#dcd8f0] bg-white px-2.5 py-1 text-xs font-medium text-[#2e2a58] hover:bg-[#0000BF]/5"
                      onClick={() => {
                        setPhotoAssetId(r.id);
                        setPhotoLabel(r.serialNumber);
                        setPhotoOpen(true);
                      }}
                    >
                      รูป
                    </button>
                    <button type="button" className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100" onClick={() => openEdit(r)}>แก้ไข</button>
                    <button type="button" className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100" onClick={() => void remove(r)}>ลบ</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? detail.serialNumber : "รายละเอียดวิทยุ"} size="form">
        {detail ? (
          <>
            <ModalFormBody>
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailField label="เลขครุภัณฑ์" value={detail.serialNumber} mono />
                <DetailField label="ประเภท" value={radioKindLabel(detail.itemName)} />
                <DetailField label="ชนิด" value={detail.itemName} className="sm:col-span-2" />
                <DetailField label="ยี่ห้อ / รุ่น" value={[detail.deviceBrand, detail.deviceModel].filter(Boolean).join(" ") || "—"} />
                <DetailField label="สถานะ" value={detail.assetItemStatus?.name || "—"} />
                <DetailField label="ที่ตั้ง" value={detail.location || "—"} />
                <DetailField label="ศูนย์ต้นทุน" value={detail.costCenter || "—"} mono />
                <DetailField label="หมายเหตุ" value={detail.notes || "—"} className="sm:col-span-2" />
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
          { label: "เลขครุภัณฑ์" },
          { label: "ประเภท" },
          { label: "ชนิด" },
          { label: "ยี่ห้อ / รุ่น" },
          { label: "ที่ตั้ง" },
          { label: "สถานะ" },
        ]}
        rows={filtered.map((r) => [
          r.serialNumber,
          radioKindLabel(r.itemName),
          r.itemName,
          [r.deviceBrand, r.deviceModel].filter(Boolean).join(" ") || "—",
          r.location || "—",
          r.assetItemStatus?.name || "—",
        ])}
      />

      <ModuleDocumentsModal
        open={docsOpen}
        categoryName={MODULE_DOCUMENT_CATEGORIES.radios}
        onClose={() => setDocsOpen(false)}
      />
    </div>
  );
}
