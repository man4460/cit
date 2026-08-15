import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiJson } from "../api/client";
import { AssetPermitModal } from "../components/AssetPermitModal";
import { AssetQrModal } from "../components/AssetQrModal";
import { AssetPhotoGalleryModal } from "../components/AssetPhotoGalleryModal";
import { AssetPhotosModal } from "../components/AssetPhotosModal";
import { CrudNameMasterModal } from "../components/CrudNameMasterModal";
import { Modal, ModalFormActions, ModalFormBody, ModalFormSection } from "../components/Modal";
import { SearchableSelect, personnelSelectLabel } from "../components/SearchableSelect";
import type { Asset, AssetDetail, NameMasterRow, Personnel } from "../types";
import { getScanUrlForToken } from "../lib/scanUrl";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { PrintA4Table } from "../components/PrintA4Table";
import { parsePermitExpiryIsoFromNotes, stripPermitExpiryPhraseFromNotes } from "../lib/parsePermitNote";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { isRadioAsset } from "../lib/radioAsset";
import { isArmorAsset } from "../lib/armorAsset";
import {
  toolbarLinkBtnClass,
  toolbarMasterBtnClass,
  toolbarMasterGroupClass,
  toolbarPrimaryBtnClass,
} from "../lib/uiTokens";
import { useAuth } from "../context/AuthContext";

function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function formatThShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

function effectivePermitExpiresIso(a: Asset): string | null {
  const fromField = a.permitExpiresAt?.trim();
  if (fromField) return fromField.slice(0, 10);
  return parsePermitExpiryIsoFromNotes(a.notes);
}

function displayNotes(a: Asset): string {
  const stripped = stripPermitExpiryPhraseFromNotes(a.notes);
  const t = (stripped ?? a.notes ?? "").trim();
  return t || "—";
}

function assetPhotos(a: Asset) {
  return (a.documents ?? []).filter((d) => d.kind === "PHOTO");
}

function emptyForm() {
  return {
    serialNumber: "",
    itemName: "",
    location: "",
    machineSerialNumber: "",
    notes: "",
    costCenter: "",
    deviceBrand: "",
    deviceModel: "",
    assetCategoryId: "",
    assetRoutineId: "",
    assetAffiliationId: "",
    assetItemStatusId: "",
    auditorId: "",
    registryLineNo: "",
    armorLevel: "",
    armorWearStyle: "",
    armorModel: "",
    armorUnitNumber: "",
    permitDocumentNo: "",
    permitExpiresAt: "",
    purchasedAt: "",
    armorExpiresAt: "",
    dispositionNote: "",
  };
}

export function AssetsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<NameMasterRow[]>([]);
  const [routines, setRoutines] = useState<NameMasterRow[]>([]);
  const [affiliations, setAffiliations] = useState<NameMasterRow[]>([]);
  const [statuses, setStatuses] = useState<NameMasterRow[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [catModal, setCatModal] = useState(false);
  const [routineModal, setRoutineModal] = useState(false);
  const [affModal, setAffModal] = useState(false);
  const [statusModal, setStatusModal] = useState(false);

  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoAssetId, setPhotoAssetId] = useState<string | null>(null);
  const [photoLabel, setPhotoLabel] = useState("");

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryAssetId, setGalleryAssetId] = useState<string | null>(null);
  const [galleryLabel, setGalleryLabel] = useState("");

  const [permitOpen, setPermitOpen] = useState(false);
  const [permitAssetId, setPermitAssetId] = useState<string | null>(null);
  const [permitLabel, setPermitLabel] = useState("");

  const [qrOpen, setQrOpen] = useState(false);
  const [qrCtx, setQrCtx] = useState<{ token: string; itemName: string; serialNumber: string } | null>(null);
  const [listFilter, setListFilter] = useState("");
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null);
  const permitSyncAttempted = useRef(new Set<string>());

  const selectedAssetItemStatus = useMemo(
    () => statuses.find((s) => s.id === form.assetItemStatusId),
    [statuses, form.assetItemStatusId],
  );

  const materialRows = useMemo(() => rows.filter((a) => !isRadioAsset(a) && !isArmorAsset(a)), [rows]);

  const filteredRows = useMemo(
    () =>
      materialRows.filter((a) =>
        rowMatchesFilter(listFilter, [
          a.serialNumber,
          a.itemName,
          a.location,
          a.machineSerialNumber,
          a.notes,
          a.costCenter,
          a.deviceBrand,
          a.deviceModel,
          a.registryLineNo,
          a.armorLevel,
          a.armorWearStyle,
          a.armorModel,
          a.armorUnitNumber,
          a.permitDocumentNo,
          formatThShortDate(effectivePermitExpiresIso(a)),
          a.purchasedAt,
          a.armorExpiresAt,
          a.assetCategory?.name,
          a.assetRoutine?.name,
          a.assetAffiliation?.name,
          a.assetItemStatus?.name,
          a.auditor?.fullName,
        ]),
      ),
    [materialRows, listFilter],
  );

  const detailAsset = useMemo(
    () => (detailAssetId ? (rows.find((r) => r.id === detailAssetId) ?? null) : null),
    [rows, detailAssetId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, c, r, f, s, p] = await Promise.all([
        apiJson<Asset[]>("/api/assets"),
        apiJson<NameMasterRow[]>("/api/asset-categories"),
        apiJson<NameMasterRow[]>("/api/asset-routines"),
        apiJson<NameMasterRow[]>("/api/asset-affiliations"),
        apiJson<NameMasterRow[]>("/api/asset-item-statuses"),
        apiJson<Personnel[]>("/api/personnel"),
      ]);
      setRows(a);
      setCategories(c);
      setRoutines(r);
      setAffiliations(f);
      setStatuses(s);
      setPersonnel(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    const batch = rows.filter(
      (a) =>
        !a.permitExpiresAt?.trim() &&
        !permitSyncAttempted.current.has(a.id) &&
        parsePermitExpiryIsoFromNotes(a.notes),
    );
    if (!batch.length) return;
    batch.forEach((a) => permitSyncAttempted.current.add(a.id));
    void (async () => {
      try {
        await Promise.all(
          batch.map((a) => {
            const iso = parsePermitExpiryIsoFromNotes(a.notes);
            const nextNotes = stripPermitExpiryPhraseFromNotes(a.notes);
            return apiJson(`/api/assets/${a.id}`, {
              method: "PUT",
              body: JSON.stringify({
                permitExpiresAt: iso,
                notes: nextNotes ?? null,
              }),
            });
          }),
        );
        await load();
      } catch {
        batch.forEach((a) => permitSyncAttempted.current.delete(a.id));
      }
    })();
  }, [loading, rows, load]);

  const personnelSearchOptions = useMemo(
    () =>
      personnel.map((p) => ({
        value: p.id,
        label: personnelSelectLabel(p),
        keywords: `${p.position ?? ""} ${p.phone ?? ""} ${p.idNumber ?? ""}`,
      })),
    [personnel],
  );

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  const openEdit = useCallback((a: Asset) => {
    setEditingId(a.id);
    let notes = a.notes ?? "";
    let permitExpiresAt = isoToDateInput(a.permitExpiresAt);
    const parsedPermit = parsePermitExpiryIsoFromNotes(notes);
    if (!permitExpiresAt && parsedPermit) {
      permitExpiresAt = parsedPermit;
      notes = stripPermitExpiryPhraseFromNotes(notes) ?? "";
    }
    setForm({
      serialNumber: a.serialNumber,
      itemName: a.itemName,
      location: a.location,
      machineSerialNumber: a.machineSerialNumber ?? "",
      notes,
      costCenter: a.costCenter ?? "",
      deviceBrand: a.deviceBrand ?? "",
      deviceModel: a.deviceModel ?? "",
      assetCategoryId: a.assetCategoryId ?? "",
      assetRoutineId: a.assetRoutineId ?? "",
      assetAffiliationId: a.assetAffiliationId ?? "",
      assetItemStatusId: a.assetItemStatusId ?? "",
      auditorId: a.auditorId ?? "",
      registryLineNo: a.registryLineNo != null ? String(a.registryLineNo) : "",
      armorLevel: a.armorLevel ?? "",
      armorWearStyle: a.armorWearStyle ?? "",
      armorModel: a.armorModel ?? "",
      armorUnitNumber: a.armorUnitNumber ?? "",
      permitDocumentNo: a.permitDocumentNo ?? "",
      permitExpiresAt,
      purchasedAt: isoToDateInput(a.purchasedAt),
      armorExpiresAt: isoToDateInput(a.armorExpiresAt),
      dispositionNote: "",
    });
    setModalOpen(true);
  }, []);

  const editAssetId = searchParams.get("editAsset");
  useEffect(() => {
    if (!editAssetId || loading) return;
    const clearParam = () => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("editAsset");
          return next;
        },
        { replace: true },
      );
    };
    const fromList = rows.find((r) => r.id === editAssetId);
    if (fromList) {
      openEdit(fromList);
      clearParam();
      return;
    }
    let cancelled = false;
    void apiJson<AssetDetail>(`/api/assets/${editAssetId}`)
      .then((a) => {
        if (cancelled) return;
        openEdit(a);
        clearParam();
      })
      .catch(() => {
        if (cancelled) return;
        alert("ไม่พบครุภัณฑ์หรือโหลดไม่สำเร็จ");
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("editAsset");
            return next;
          },
          { replace: true },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [editAssetId, loading, rows, openEdit, setSearchParams]);

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      serialNumber: form.serialNumber.trim(),
      itemName: form.itemName.trim(),
      location: form.location.trim(),
      machineSerialNumber: form.machineSerialNumber.trim() || null,
      notes: form.notes.trim() || null,
      costCenter: form.costCenter.trim() || null,
      deviceBrand: form.deviceBrand.trim() || null,
      deviceModel: form.deviceModel.trim() || null,
      assetCategoryId: form.assetCategoryId || null,
      assetRoutineId: form.assetRoutineId || null,
      assetAffiliationId: form.assetAffiliationId || null,
      assetItemStatusId: form.assetItemStatusId || null,
      auditorId: form.auditorId || null,
      registryLineNo: form.registryLineNo.trim() ? form.registryLineNo.trim() : null,
      armorLevel: form.armorLevel.trim() || null,
      armorWearStyle: form.armorWearStyle.trim() || null,
      armorModel: form.armorModel.trim() || null,
      armorUnitNumber: form.armorUnitNumber.trim() || null,
      permitDocumentNo: form.permitDocumentNo.trim() || null,
      permitExpiresAt: form.permitExpiresAt.trim() || null,
      purchasedAt: form.purchasedAt.trim() || null,
      armorExpiresAt: form.armorExpiresAt.trim() || null,
      dispositionNote: form.dispositionNote.trim() || null,
    };
    try {
      if (editingId) {
        await apiJson(`/api/assets/${editingId}`, { method: "PUT", body: JSON.stringify(body) });
        closeModal();
        await load();
      } else {
        const created = await apiJson<Asset>("/api/assets", {
          method: "POST",
          body: JSON.stringify(body),
        });
        closeModal();
        await load();
        setPhotoAssetId(created.id);
        setPhotoLabel(created.itemName);
        setPhotoOpen(true);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function deleteAsset(a: Asset): Promise<boolean> {
    if (!confirm(`ลบวัสดุ «${a.itemName}» (${a.serialNumber}) ? รูปและ QR เดิมจะถูกลบ`)) return false;
    try {
      await apiJson(`/api/assets/${a.id}`, { method: "DELETE" });
      await load();
      return true;
    } catch (err) {
      alert(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
      return false;
    }
  }

  function photoCount(a: Asset) {
    return (a.documents ?? []).filter((d) => d.kind === "PHOTO").length;
  }

  function permitDoc(a: Asset) {
    return (a.documents ?? []).find((d) => d.kind === "PERMIT");
  }

  return (
    <div>
      <PageHeaderBar
        title="วัสดุทั่วไป"
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "วัสดุทั่วไป",
          placeholder: "กรองเลขวัสดุ / ชื่อ / ที่ตั้ง / ประเภท / สังกัด / สถานะ…",
        }}
        masters={
          <div className={toolbarMasterGroupClass}>
            <button type="button" onClick={() => setCatModal(true)} className={toolbarMasterBtnClass}>
              ประเภท
            </button>
            <button type="button" onClick={() => setRoutineModal(true)} className={toolbarMasterBtnClass}>
              ประจำ
            </button>
            <button type="button" onClick={() => setAffModal(true)} className={toolbarMasterBtnClass}>
              สังกัด
            </button>
            <button type="button" onClick={() => setStatusModal(true)} className={toolbarMasterBtnClass}>
              สถานะ
            </button>
          </div>
        }
        extras={
          <>
            <Link to="/vehicles?view=disposed" className={toolbarLinkBtnClass}>
              จำหน่าย (รถ)
            </Link>
            {user?.role === "ADMIN" ? (
              <Link to="/audit-trail?entityType=Asset" className={toolbarLinkBtnClass}>
                ความเคลื่อนไหว
              </Link>
            ) : null}
            <Link to="/reports" className={toolbarLinkBtnClass}>
              รายงาน
            </Link>
          </>
        }
        primary={
          <button type="button" onClick={openAdd} className={toolbarPrimaryBtnClass}>
            เพิ่มวัสดุ
          </button>
        }
      />

      <CrudNameMasterModal
        title="ประเภทวัสดุ (เพิ่ม / แก้ไข / ลบ)"
        apiPath="/api/asset-categories"
        open={catModal}
        onClose={() => setCatModal(false)}
        onChanged={load}
      />
      <CrudNameMasterModal
        title="ประจำ (เพิ่ม / แก้ไข / ลบ)"
        apiPath="/api/asset-routines"
        open={routineModal}
        onClose={() => setRoutineModal(false)}
        onChanged={load}
      />
      <CrudNameMasterModal
        title="สังกัด (เพิ่ม / แก้ไข / ลบ)"
        apiPath="/api/asset-affiliations"
        open={affModal}
        onClose={() => setAffModal(false)}
        onChanged={load}
      />
      <CrudNameMasterModal
        title="สถานะวัสดุ (เพิ่ม / แก้ไข / ลบ)"
        apiPath="/api/asset-item-statuses"
        open={statusModal}
        onClose={() => setStatusModal(false)}
        onChanged={load}
        fleetCareExcludeField
      />

      <AssetPhotosModal
        assetId={photoAssetId}
        itemLabel={photoLabel}
        open={photoOpen}
        onClose={() => {
          setPhotoOpen(false);
          setPhotoAssetId(null);
        }}
        onUpdated={load}
      />
      <AssetPhotoGalleryModal
        assetId={galleryAssetId}
        itemLabel={galleryLabel}
        open={galleryOpen}
        onClose={() => {
          setGalleryOpen(false);
          setGalleryAssetId(null);
        }}
      />
      <AssetPermitModal
        assetId={permitAssetId}
        itemLabel={permitLabel}
        open={permitOpen}
        onClose={() => {
          setPermitOpen(false);
          setPermitAssetId(null);
        }}
        onUpdated={load}
      />
      {qrCtx && (
        <AssetQrModal
          open={qrOpen}
          onClose={() => {
            setQrOpen(false);
            setQrCtx(null);
          }}
          scanUrl={getScanUrlForToken(qrCtx.token)}
          itemName={qrCtx.itemName}
          serialNumber={qrCtx.serialNumber}
        />
      )}

      <Modal
        open={Boolean(detailAsset)}
        onClose={() => setDetailAssetId(null)}
        title={detailAsset ? detailAsset.itemName : "รายละเอียดวัสดุ"}
        size="wide"
      >
        {detailAsset ? (
          <>
            <ModalFormBody>
              <div className="flex flex-wrap gap-3 border-b border-slate-200 pb-4">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-[#5b61ff] hover:bg-slate-100"
                  onClick={() => {
                    const a = detailAsset;
                    setDetailAssetId(null);
                    openEdit(a);
                  }}
                >
                  แก้ไข
                </button>
                {user?.role === "ADMIN" ? (
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-slate-100"
                    onClick={() =>
                      void deleteAsset(detailAsset).then((ok) => {
                        if (ok) setDetailAssetId(null);
                      })
                    }
                  >
                    ลบ
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-violet-400 hover:bg-slate-100"
                  onClick={() => {
                    setQrCtx({
                      token: detailAsset.qrToken,
                      itemName: detailAsset.itemName,
                      serialNumber: detailAsset.serialNumber,
                    });
                    setQrOpen(true);
                  }}
                >
                  QR
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                  onClick={() => {
                    setPhotoAssetId(detailAsset.id);
                    setPhotoLabel(detailAsset.itemName);
                    setPhotoOpen(true);
                  }}
                >
                  รูป ({photoCount(detailAsset)})
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                  onClick={() => {
                    setPermitAssetId(detailAsset.id);
                    setPermitLabel(detailAsset.itemName);
                    setPermitOpen(true);
                  }}
                >
                  ใบอนุญาต
                </button>
              </div>
              {(() => {
                const photos = assetPhotos(detailAsset);
                return (
                  <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
                    <div className="min-w-0 flex-1 space-y-4">
                      <p className="font-mono text-sm text-[#5b61ff]">{detailAsset.serialNumber}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {detailAsset.assetCategory?.name ? (
                          <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                            {detailAsset.assetCategory.name}
                          </span>
                        ) : null}
                        {detailAsset.assetItemStatus?.name ? (
                          <span className="rounded-md bg-slate-700/60 px-2 py-0.5 text-[11px] text-slate-700">
                            {detailAsset.assetItemStatus.name}
                          </span>
                        ) : null}
                      </div>
                      {!photos.length ? (
                        <p className="text-xs text-slate-600">
                          ยังไม่มีรูปถ่าย — กดปุ่ม «รูป» เพื่ออัปโหลด
                        </p>
                      ) : null}
                      <dl className="grid gap-x-3 gap-y-2.5 text-sm sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-slate-700">ที่ตั้ง</dt>
                  <dd className="mt-0.5 text-slate-800">{detailAsset.location}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-700">ศูนย์ต้นทุน</dt>
                  <dd className="mt-0.5 font-mono text-slate-700">{detailAsset.costCenter?.trim() || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-700">ยี่ห้อ (อุปกรณ์)</dt>
                  <dd className="mt-0.5 text-slate-800">{detailAsset.deviceBrand?.trim() || "—"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-slate-700">รุ่น (อุปกรณ์)</dt>
                  <dd className="mt-0.5 text-slate-800">{detailAsset.deviceModel?.trim() || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-700">เลขเครื่อง</dt>
                  <dd className="mt-0.5 font-mono text-slate-700">
                    {detailAsset.machineSerialNumber?.trim() || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-700">ประจำ</dt>
                  <dd className="mt-0.5 text-slate-700">{detailAsset.assetRoutine?.name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-700">สังกัด</dt>
                  <dd className="mt-0.5 text-slate-700">{detailAsset.assetAffiliation?.name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-700">ผู้ตรวจ</dt>
                  <dd className="mt-0.5 text-slate-700">{detailAsset.auditor?.fullName ?? "—"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-slate-700">ไฟล์ใบอนุญาต</dt>
                  <dd className="mt-0.5">
                    {permitDoc(detailAsset) ? (
                      <button
                        type="button"
                        className="text-left text-sm text-[#5b61ff] underline-offset-2 hover:text-[#4d47b6] hover:underline"
                        onClick={() =>
                          window.open(permitDoc(detailAsset)!.fileUrl, "_blank", "noopener,noreferrer")
                        }
                      >
                        เปิดดูใบอนุญาต
                      </button>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-700">หมดอายุใบอนุญาต</dt>
                  <dd className="mt-0.5 text-slate-800">
                    {formatThShortDate(effectivePermitExpiresIso(detailAsset))}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-slate-700">หมายเหตุ</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap break-words text-slate-700">
                    {displayNotes(detailAsset)}
                  </dd>
                </div>
              </dl>
                    </div>
                    {photos.length > 0 ? (
                      <aside className="w-full shrink-0 lg:sticky lg:top-0 lg:w-64 xl:w-72">
                        <p className="mb-2 text-xs font-medium text-slate-700 lg:text-right">รูปถ่าย</p>
                        <div className="flex flex-col gap-3 lg:max-h-[min(36rem,calc(85dvh-10rem))] lg:overflow-y-auto lg:pr-1 [scrollbar-gutter:stable]">
                          {photos.map((d) => (
                            <button
                              key={d.id}
                              type="button"
                              title="ดูแกลเลอรี่"
                              className="aspect-square w-full max-w-[20rem] overflow-hidden rounded-xl border border-slate-200 bg-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0000BF] sm:mx-auto lg:mx-0 lg:max-w-none"
                              onClick={() => {
                                setGalleryAssetId(detailAsset.id);
                                setGalleryLabel(detailAsset.itemName);
                                setGalleryOpen(true);
                              }}
                            >
                              <img src={d.fileUrl} alt="" className="h-full w-full object-cover" />
                            </button>
                          ))}
                        </div>
                      </aside>
                    ) : null}
                  </div>
                );
              })()}
            </ModalFormBody>
          </>
        ) : null}
      </Modal>

      <Modal open={modalOpen} onClose={closeModal} title={editingId ? "แก้ไขวัสดุ" : "เพิ่มวัสดุ"} size="wide">
        <form onSubmit={submit}>
          <ModalFormBody>
            <ModalFormSection title="ข้อมูลหลัก">
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="text-xs font-medium text-slate-700">เลขครุภัณฑ์</span>
                  <input
                    required
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.serialNumber}
                    onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))}
                  />
                </label>
                <label>
                  <span className="text-xs font-medium text-slate-700">ชื่อรายการ</span>
                  <input
                    required
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.itemName}
                    onChange={(e) => setForm((f) => ({ ...f, itemName: e.target.value }))}
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">ที่ตั้ง</span>
                  <input
                    required
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">เลขประจำตัวเครื่อง</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.machineSerialNumber}
                    onChange={(e) => setForm((f) => ({ ...f, machineSerialNumber: e.target.value }))}
                  />
                </label>
                <label>
                  <span className="text-xs font-medium text-slate-700">ศูนย์ต้นทุน (Cost center)</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    placeholder="เช่น 103801"
                    value={form.costCenter}
                    onChange={(e) => setForm((f) => ({ ...f, costCenter: e.target.value }))}
                  />
                </label>
                <label>
                  <span className="text-xs font-medium text-slate-700">ยี่ห้อ (วิทยุ/อุปกรณ์)</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    placeholder="เช่น Icom, Hytera"
                    value={form.deviceBrand}
                    onChange={(e) => setForm((f) => ({ ...f, deviceBrand: e.target.value }))}
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">รุ่น (วิทยุ/อุปกรณ์)</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    placeholder="ไม่บังคับ"
                    value={form.deviceModel}
                    onChange={(e) => setForm((f) => ({ ...f, deviceModel: e.target.value }))}
                  />
                </label>
                <label>
                  <span className="text-xs font-medium text-slate-700">ประเภท</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.assetCategoryId}
                    onChange={(e) => setForm((f) => ({ ...f, assetCategoryId: e.target.value }))}
                  >
                    <option value="">—</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-xs font-medium text-slate-700">ประจำ</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.assetRoutineId}
                    onChange={(e) => setForm((f) => ({ ...f, assetRoutineId: e.target.value }))}
                  >
                    <option value="">—</option>
                    {routines.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-xs font-medium text-slate-700">สังกัด</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.assetAffiliationId}
                    onChange={(e) => setForm((f) => ({ ...f, assetAffiliationId: e.target.value }))}
                  >
                    <option value="">—</option>
                    {affiliations.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-xs font-medium text-slate-700">สถานะ</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.assetItemStatusId}
                    onChange={(e) => setForm((f) => ({ ...f, assetItemStatusId: e.target.value }))}
                  >
                    <option value="">—</option>
                    {statuses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.excludesFromFleetCare ? " (นอกยอดตรวจ)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedAssetItemStatus?.excludesFromFleetCare ? (
                  <label className="sm:col-span-2">
                    <span className="text-xs font-medium text-slate-700">
                      หมายเหตุการจำหน่าย/ส่งคืน (บันทึกในประวัติทะเบียน)
                    </span>
                    <textarea
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                      placeholder="ไม่บังคับ"
                      value={form.dispositionNote}
                      onChange={(e) => setForm((f) => ({ ...f, dispositionNote: e.target.value }))}
                    />
                  </label>
                ) : null}
                <label className="sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">ผู้ตรวจสอบ</span>
                  <SearchableSelect
                    value={form.auditorId}
                    onChange={(v) => setForm((f) => ({ ...f, auditorId: v }))}
                    options={personnelSearchOptions}
                    emptyLabel="—"
                    allowEmpty
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">หมายเหตุ</span>
                  <textarea
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </label>
              </div>
            </ModalFormSection>

            {!editingId && (
              <p className="text-xs text-slate-600">
                หลังบันทึกจะเปิดหน้าต่างอัปโหลดรูป (หลายไฟล์ได้) เช่นเดียวกับยานพาหนะ — ใบอนุญาตจัดการจากตารางด้านล่าง
              </p>
            )}
          </ModalFormBody>
          <ModalFormActions>
            <button type="submit" className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] px-4 py-2">
              บันทึก
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

      <div className="mt-6 print:hidden">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white/75 py-16 text-center text-slate-600">
            กำลังโหลด…
          </div>
        ) : materialRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/90/30 py-16 text-center text-slate-600">
            ยังไม่มีวัสดุทั่วไป — กด «เพิ่มวัสดุ»
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white/75 py-16 text-center text-slate-600">
            ไม่มีรายการที่ตรงกับการกรอง
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-inner">
            <div className="max-h-[calc(100vh-16rem)] min-h-[200px] overflow-y-auto overscroll-contain rounded-xl pr-1 [scrollbar-gutter:stable]">
              <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {filteredRows.map((a) => {
                  const photos = (a.documents ?? []).filter((d) => d.kind === "PHOTO");
                  const firstPhoto = photos[0];
                  const permitIso = effectivePermitExpiresIso(a);
                  return (
                    <li key={a.id}>
                      <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white/85 shadow-sm transition hover:border-[#0000BF]/35 hover:bg-white/90">
                        <button
                          type="button"
                          className="min-w-0 flex-1 px-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0000BF]"
                          onClick={() => setDetailAssetId(a.id)}
                        >
                          <p className="truncate text-sm font-semibold leading-snug text-[#1e1b3a]">{a.itemName}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-[#5b61ff]">{a.serialNumber}</p>
                          <p className="mt-1 truncate text-[11px] text-slate-600">{a.location}</p>
                          {a.costCenter?.trim() || a.deviceBrand?.trim() || a.deviceModel?.trim() ? (
                            <p className="mt-0.5 truncate text-[10px] text-slate-600">
                              {[
                                a.costCenter?.trim() ? `Cctr ${a.costCenter.trim()}` : null,
                                [a.deviceBrand?.trim(), a.deviceModel?.trim()].filter(Boolean).join(" ") || null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          ) : null}
                          {permitIso ? (
                            <p className="mt-1 text-[10px] text-amber-700/90">
                              ใบอนุญาตหมด {formatThShortDate(permitIso)}
                            </p>
                          ) : null}
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {a.assetCategory?.name ? (
                              <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                                {a.assetCategory.name}
                              </span>
                            ) : null}
                            {a.assetItemStatus?.name ? (
                              <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] text-slate-700">
                                {a.assetItemStatus.name}
                              </span>
                            ) : null}
                          </div>
                        </button>
                        <div className="flex shrink-0 flex-col border-l border-slate-200">
                          {firstPhoto ? (
                            <button
                              type="button"
                              title="ดูรูปทั้งหมด"
                              className="h-full min-h-[4.5rem] w-14 overflow-hidden border-0 bg-white/40 p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0000BF]"
                              onClick={() => {
                                setGalleryAssetId(a.id);
                                setGalleryLabel(a.itemName);
                                setGalleryOpen(true);
                              }}
                            >
                              <img src={firstPhoto.fileUrl} alt="" className="h-full w-full object-cover" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              title="เพิ่ม/ดูรูป"
                              className="flex min-h-[4.5rem] w-14 items-center justify-center bg-white/30 px-1 text-center text-[9px] leading-tight text-slate-700 hover:bg-slate-100/50 hover:text-[#0000BF]"
                              onClick={() => {
                                setGalleryAssetId(a.id);
                                setGalleryLabel(a.itemName);
                                setGalleryOpen(true);
                              }}
                            >
                              ไม่มีรูป
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </div>

      <PrintA4Table
        columns={[
          { label: "เลขวัสดุ" },
          { label: "ชื่อ" },
          { label: "ที่ตั้ง" },
          { label: "ประเภท" },
          { label: "สถานะ" },
          { label: "ยี่ห้อ" },
        ]}
        rows={filteredRows.map((a) => [
          a.serialNumber,
          a.itemName,
          a.location || "—",
          a.assetCategory?.name || "—",
          a.assetItemStatus?.name || "—",
          [a.deviceBrand, a.deviceModel].filter(Boolean).join(" ") || "—",
        ])}
      />
    </div>
  );
}
