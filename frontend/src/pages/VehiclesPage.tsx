import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiJson } from "../api/client";
import { FitSingleLine } from "../components/FitSingleLine";
import { Modal, ModalFormActions, ModalFormBody, ModalFormSection } from "../components/Modal";
import { VehiclePhotoGalleryModal } from "../components/VehiclePhotoGalleryModal";
import { VehiclePhotosModal } from "../components/VehiclePhotosModal";
import { VehicleStatusMasterModal } from "../components/VehicleStatusMasterModal";
import { VehicleTypeMasterModal } from "../components/VehicleTypeMasterModal";
import { WorkCategoryGroupMasterModal } from "../components/WorkCategoryGroupMasterModal";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { ModuleDocumentsModal } from "../components/ModuleDocumentsModal";
import { PrintA4Table } from "../components/PrintA4Table";
import { MODULE_DOCUMENT_CATEGORIES } from "../lib/moduleDocumentCategories";
import type { LoadOptions } from "../lib/loadOptions";
import { setLoadBusy } from "../lib/loadOptions";
import { rowMatchesFilter } from "../lib/searchNormalize";
import {
  brandGradientFillClass,
  toolbarLinkBtnClass,
  toolbarMasterBtnClass,
  toolbarMasterGroupClass,
  toolbarPrimaryBtnClass,
} from "../lib/uiTokens";
import type { Vehicle, VehicleDetail, VehicleDispositionLogEntry, VehicleStatus, VehicleType, WorkCategoryGroup } from "../types";
import { vehicleDisplayLabel } from "../types";
import { formatVehiclePurchaseDateTh, vehicleAgeCompletedYears } from "../lib/vehicleAge";
import { parsePurchaseDdMmYyyyFromNotes, stripPurchaseLineFromNotes } from "../lib/parseVehiclePurchaseFromNotes";
import { useAuth } from "../context/AuthContext";

type FleetView = "active" | "disposed";

function formatThDateTime(iso: string) {
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

function dispositionKindLabel(k: string) {
  if (k === "RETURNED") return "ส่งคืน";
  return "จำหน่าย";
}

function vehiclePhotos(v: Vehicle) {
  return (v.documents ?? []).filter((d) => d.kind === "PHOTO");
}

function effectivePurchasedAtIso(v: Vehicle): string | null {
  const fromField = v.purchasedAt?.trim();
  if (fromField) return fromField.slice(0, 10);
  return parsePurchaseDdMmYyyyFromNotes(v.notes);
}

/** yyyy-mm-dd → ISO เที่ยง UTC สำหรับคำนวณอายุ/แสดงวันที่ให้สอดคล้อง */
function purchaseIsoNormalized(v: Vehicle): string | null {
  const d = effectivePurchasedAtIso(v);
  if (!d) return null;
  return `${d}T12:00:00.000Z`;
}

/** ค่าเลขไมล์จาก API อาจเป็นสตริงที่มีจุลภาค — เก็บในฟอร์มให้ backend แปลงได้ */
function mileageForForm(m: string | number | undefined | null): string {
  if (m == null) return "0";
  if (typeof m === "number" && Number.isFinite(m)) return String(m);
  const s = String(m).trim();
  if (!s || s === "[object Object]") return "0";
  return s.replace(/,/g, "").replace(/\u00A0/g, "").replace(/\s/g, "");
}

function mileageForApi(raw: string): string {
  return raw.replace(/,/g, "").replace(/\u00A0/g, "").replace(/\s/g, "").trim();
}

function emptyForm() {
  return {
    brand: "",
    model: "",
    chassisNumber: "",
    engineNumber: "",
    color: "",
    vehicleTypeId: "",
    licensePlate: "",
    mileage: "0",
    workCategoryGroupId: "",
    vehicleStatusId: "",
    assetCode: "",
    notes: "",
    purchasedAt: "",
    dispositionNote: "",
  };
}

export function VehiclesPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const fleetView: FleetView = searchParams.get("view") === "disposed" ? "disposed" : "active";
  const [rows, setRows] = useState<Vehicle[]>([]);
  const [retiredRows, setRetiredRows] = useState<Vehicle[]>([]);
  const [dispositionLog, setDispositionLog] = useState<VehicleDispositionLogEntry[]>([]);
  const [types, setTypes] = useState<VehicleType[]>([]);
  const [workGroups, setWorkGroups] = useState<WorkCategoryGroup[]>([]);
  const [statuses, setStatuses] = useState<VehicleStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [workModalOpen, setWorkModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoVehicleId, setPhotoVehicleId] = useState<string | null>(null);
  const [photoPlate, setPhotoPlate] = useState("");
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [galleryVehicleId, setGalleryVehicleId] = useState<string | null>(null);
  const [galleryPlate, setGalleryPlate] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [listFilter, setListFilter] = useState("");
  const [detailVehicleId, setDetailVehicleId] = useState<string | null>(null);
  const [logDetail, setLogDetail] = useState<VehicleDispositionLogEntry | null>(null);
  const purchaseSyncAttempted = useRef(new Set<string>());

  const setFleetView = (view: FleetView) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (view === "disposed") next.set("view", "disposed");
      else next.delete("view");
      return next;
    }, { replace: true });
  };

  const detailVehicle = useMemo(() => {
    const pool = fleetView === "disposed" ? retiredRows : rows;
    return detailVehicleId ? (pool.find((r) => r.id === detailVehicleId) ?? null) : null;
  }, [rows, retiredRows, detailVehicleId, fleetView]);

  const selectedVehicleStatus = useMemo(
    () => statuses.find((s) => s.id === form.vehicleStatusId),
    [statuses, form.vehicleStatusId],
  );

  const listSource = fleetView === "disposed" ? retiredRows : rows;

  const filteredRows = useMemo(
    () =>
      listSource.filter((v) =>
        rowMatchesFilter(listFilter, [
          v.licensePlate,
          v.brand,
          v.model,
          v.assetCode,
          v.currentMileage,
          v.vehicleStatus?.name,
          v.vehicleType?.name,
          v.workCategoryGroup?.name,
          v.notes,
          v.purchasedAt,
          formatVehiclePurchaseDateTh(v.purchasedAt),
          effectivePurchasedAtIso(v),
          formatVehiclePurchaseDateTh(purchaseIsoNormalized(v)),
          vehicleDisplayLabel(v),
        ]),
      ),
    [listSource, listFilter],
  );

  const filteredDispositionLog = useMemo(
    () =>
      dispositionLog.filter((row) =>
        rowMatchesFilter(listFilter, [
          row.licensePlate,
          row.brandModel,
          row.statusName,
          row.note,
          row.actorUsername,
          dispositionKindLabel(row.kind),
          formatThDateTime(row.recordedAt),
        ]),
      ),
    [dispositionLog, listFilter],
  );

  const dashStats = useMemo(() => {
    return {
      active: rows.length,
      disposed: retiredRows.length,
    };
  }, [rows, retiredRows]);

  const loadLists = useCallback(async (opts?: LoadOptions) => {
    setLoadBusy(setLoading, opts, true);
    try {
      const [v, retired, log, t, w, s] = await Promise.all([
        apiJson<Vehicle[]>("/api/vehicles"),
        apiJson<Vehicle[]>("/api/vehicles/registry/retired"),
        apiJson<VehicleDispositionLogEntry[]>("/api/vehicles/registry/disposition-log"),
        apiJson<VehicleType[]>("/api/vehicle-types"),
        apiJson<WorkCategoryGroup[]>("/api/work-category-groups"),
        apiJson<VehicleStatus[]>("/api/vehicle-statuses"),
      ]);
      setRows(v);
      setRetiredRows(retired);
      setDispositionLog(log);
      setTypes(t);
      setWorkGroups(w);
      setStatuses(s);
    } finally {
      setLoadBusy(setLoading, opts, false);
    }
  }, []);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  useEffect(() => {
    if (loading) return;
    const batch = rows.filter(
      (v) =>
        !v.purchasedAt?.trim() &&
        !purchaseSyncAttempted.current.has(v.id) &&
        parsePurchaseDdMmYyyyFromNotes(v.notes),
    );
    if (!batch.length) return;
    batch.forEach((v) => purchaseSyncAttempted.current.add(v.id));
    void (async () => {
      try {
        await Promise.all(
          batch.map((v) => {
            const iso = parsePurchaseDdMmYyyyFromNotes(v.notes);
            const nextNotes = stripPurchaseLineFromNotes(v.notes);
            return apiJson(`/api/vehicles/${v.id}`, {
              method: "PUT",
              body: JSON.stringify({
                purchasedAt: iso,
                notes: nextNotes ?? null,
              }),
            });
          }),
        );
        await loadLists({ silent: true });
      } catch {
        batch.forEach((v) => purchaseSyncAttempted.current.delete(v.id));
      }
    })();
  }, [loading, rows, loadLists]);

  function closeVehicleModal() {
    setModalOpen(false);
    setEditingId(null);
  }

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  const openEdit = useCallback((v: Vehicle) => {
    setEditingId(v.id);
    const parsedIso = !v.purchasedAt?.trim() ? parsePurchaseDdMmYyyyFromNotes(v.notes) : null;
    setForm({
      brand: (v.brand ?? "").trim(),
      model: (v.model ?? "").trim(),
      chassisNumber: v.chassisNumber ?? "",
      engineNumber: v.engineNumber ?? "",
      color: v.color ?? "",
      vehicleTypeId: v.vehicleTypeId ?? "",
      licensePlate: v.licensePlate,
      mileage: mileageForForm(v.currentMileage),
      workCategoryGroupId: v.workCategoryGroupId ?? "",
      vehicleStatusId: v.vehicleStatusId ?? "",
      assetCode: v.assetCode ?? "",
      notes: parsedIso ? (stripPurchaseLineFromNotes(v.notes) ?? "") : (v.notes ?? ""),
      purchasedAt: v.purchasedAt?.trim() ? v.purchasedAt.slice(0, 10) : parsedIso ?? "",
      dispositionNote: "",
    });
    setModalOpen(true);
  }, []);

  const editVehicleId = searchParams.get("editVehicle");
  useEffect(() => {
    if (!editVehicleId || loading) return;
    const clearParam = () => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("editVehicle");
          return next;
        },
        { replace: true },
      );
    };
    const fromList = rows.find((r) => r.id === editVehicleId);
    if (fromList) {
      openEdit(fromList);
      clearParam();
      return;
    }
    let cancelled = false;
    void apiJson<VehicleDetail>(`/api/vehicles/${editVehicleId}`)
      .then((v) => {
        if (cancelled) return;
        openEdit(v);
        clearParam();
      })
      .catch(() => {
        if (cancelled) return;
        alert("ไม่พบรถหรือโหลดไม่สำเร็จ");
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("editVehicle");
            return next;
          },
          { replace: true },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [editVehicleId, loading, rows, openEdit, setSearchParams]);

  function openPhotoGallery(v: Vehicle) {
    setGalleryVehicleId(v.id);
    setGalleryPlate(v.licensePlate);
    setGalleryOpen(true);
  }

  async function saveVehicle(e: React.FormEvent) {
    e.preventDefault();
    const body = JSON.stringify({
      brand: form.brand.trim(),
      model: form.model.trim(),
      licensePlate: form.licensePlate.trim(),
      assetCode: form.assetCode.trim() || null,
      chassisNumber: form.chassisNumber.trim() || null,
      engineNumber: form.engineNumber.trim() || null,
      color: form.color.trim() || null,
      vehicleTypeId: form.vehicleTypeId || null,
      workCategoryGroupId: form.workCategoryGroupId || null,
      vehicleStatusId: form.vehicleStatusId || null,
      currentMileage: mileageForApi(form.mileage),
      notes: form.notes.trim() || null,
      purchasedAt: form.purchasedAt.trim() || null,
      dispositionNote: form.dispositionNote.trim() || null,
    });
    try {
      if (editingId) {
        await apiJson(`/api/vehicles/${editingId}`, { method: "PUT", body });
        closeVehicleModal();
        await loadLists({ silent: true });
      } else {
        const created = await apiJson<Vehicle>("/api/vehicles", { method: "POST", body });
        closeVehicleModal();
        await loadLists({ silent: true });
        setPhotoVehicleId(created.id);
        setPhotoPlate(created.licensePlate);
        setPhotoOpen(true);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    }
  }

  async function deleteVehicle(v: Vehicle): Promise<boolean> {
    if (!confirm(`ลบยานพาหนะทะเบียน «${v.licensePlate}» ? รูปและประวัติที่เกี่ยวข้องจะถูกลบด้วย`)) return false;
    try {
      await apiJson(`/api/vehicles/${v.id}`, { method: "DELETE" });
      await loadLists({ silent: true });
      return true;
    } catch (err) {
      alert(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
      return false;
    }
  }

  function photoCount(v: Vehicle) {
    return vehiclePhotos(v).length;
  }

  return (
    <div>
      <PageHeaderBar
        title="ยานพาหนะ"
        count={filteredRows.length}
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "ยานพาหนะ",
          placeholder: "กรองทะเบียน / ยี่ห้อ / รุ่น / สถานะ / ประเภท / กลุ่มงาน / ครุภัณฑ์…",
        }}
        segments={
          <div className={toolbarMasterGroupClass}>
            {(
              [
                ["active", "ใช้งาน"],
                ["disposed", "จำหน่าย"],
              ] as const
            ).map(([id, label]) => {
              const active = fleetView === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFleetView(id)}
                  className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[11px] font-black transition sm:h-9 sm:px-3 sm:text-xs ${
                    active ? `${brandGradientFillClass} text-white shadow-md` : toolbarMasterBtnClass
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        }
        masters={
          <div className={toolbarMasterGroupClass}>
            <button type="button" onClick={() => setStatusModalOpen(true)} className={toolbarMasterBtnClass}>
              สถานะ
            </button>
            <button type="button" onClick={() => setWorkModalOpen(true)} className={toolbarMasterBtnClass}>
              กลุ่มงาน
            </button>
            <button type="button" onClick={() => setTypeModalOpen(true)} className={toolbarMasterBtnClass}>
              ประเภทรถ
            </button>
          </div>
        }
        extras={
          <button type="button" className={toolbarLinkBtnClass} onClick={() => setDocsOpen(true)}>
            เอกสาร
          </button>
        }
        primary={
          fleetView === "active" ? (
            <button type="button" onClick={openAdd} className={toolbarPrimaryBtnClass}>
              เพิ่มยานพาหนะ
            </button>
          ) : undefined
        }
      />

      {!loading ? (
        <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
          {(
            [
              {
                key: "active",
                label: "ใช้งาน",
                value: dashStats.active,
                tone: "from-emerald-50 to-emerald-100/70",
                onClick: () => setFleetView("active"),
                pressed: fleetView === "active",
              },
              {
                key: "disposed",
                label: "จำหน่าย",
                value: dashStats.disposed,
                tone: "from-amber-50 to-orange-100/70",
                onClick: () => setFleetView("disposed"),
                pressed: fleetView === "disposed",
              },
              {
                key: "total",
                label: "รวมทั้งหมด",
                value: dashStats.active + dashStats.disposed,
                tone: "from-[#0000BF]/8 via-[#8b5cf6]/8 to-[#ec4899]/10",
                onClick: undefined,
                pressed: false,
              },
            ] as const
          ).map((c) => {
            const className = `min-w-0 rounded-[1.25rem] border px-3 py-2.5 text-left shadow-[0_10px_30px_-18px_rgba(30,27,75,0.28)] transition bg-gradient-to-br ${c.tone} ${
              c.pressed ? "border-[#0000BF]/45 ring-2 ring-[#0000BF]/20" : "border-[#e8e6fc]/80"
            } ${c.onClick ? "hover:border-[#0000BF]/30" : ""}`;
            const inner = (
              <>
                <FitSingleLine className="font-semibold text-[#66638c]" maxPx={11} minPx={8} title={c.label}>
                  {c.label}
                </FitSingleLine>
                <FitSingleLine className="mt-1 font-black tabular-nums text-[#1e1b4b]" maxPx={26} minPx={13} title={String(c.value)}>
                  {c.value.toLocaleString("th-TH")}
                </FitSingleLine>
              </>
            );
            return c.onClick ? (
              <button key={c.key} type="button" onClick={c.onClick} aria-pressed={c.pressed} className={className}>
                {inner}
              </button>
            ) : (
              <div key={c.key} className={className}>
                {inner}
              </div>
            );
          })}
        </div>
      ) : null}

      <VehicleTypeMasterModal open={typeModalOpen} onClose={() => setTypeModalOpen(false)} onChanged={loadLists} />
      <VehicleStatusMasterModal open={statusModalOpen} onClose={() => setStatusModalOpen(false)} onChanged={loadLists} />
      <WorkCategoryGroupMasterModal open={workModalOpen} onClose={() => setWorkModalOpen(false)} onChanged={loadLists} />

      <VehiclePhotosModal
        vehicleId={photoVehicleId}
        licensePlate={photoPlate}
        open={photoOpen}
        onClose={() => {
          setPhotoOpen(false);
          setPhotoVehicleId(null);
        }}
        onUpdated={loadLists}
      />
      <VehiclePhotoGalleryModal
        vehicleId={galleryVehicleId}
        licensePlate={galleryPlate}
        open={galleryOpen}
        onClose={() => {
          setGalleryOpen(false);
          setGalleryVehicleId(null);
        }}
      />

      <Modal
        open={Boolean(detailVehicle)}
        onClose={() => setDetailVehicleId(null)}
        title={detailVehicle ? vehicleDisplayLabel(detailVehicle) : "รายละเอียดยานพาหนะ"}
        size="wide"
      >
        {detailVehicle ? (
          <ModalFormBody className="space-y-3">
            {(() => {
              const v = detailVehicle;
              const photos = vehiclePhotos(v);
              const hero = photos[0] ?? null;
              const pIso = purchaseIsoNormalized(v);
              const ageYears = vehicleAgeCompletedYears(pIso);
              const btnPrimary =
                `inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3.5 text-xs font-black text-white shadow-md shadow-[#0000BF]/20 ${brandGradientFillClass}`;
              const btnSoft =
                "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#e0ddf8] bg-white px-3 text-xs font-bold text-[#4d47b6] shadow-sm transition hover:border-[#0000BF]/30 hover:bg-[#f5f3ff]";
              const btnDanger =
                "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-600 shadow-sm transition hover:bg-rose-100";
              const Field = ({
                label,
                value,
                mono,
              }: {
                label: string;
                value: ReactNode;
                mono?: boolean;
              }) => (
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold tracking-wide text-slate-500">{label}</dt>
                  <dd
                    className={`mt-0.5 truncate text-[13px] font-medium text-[#1e1b4b] ${mono ? "font-mono text-xs" : ""}`}
                    title={typeof value === "string" ? value : undefined}
                  >
                    {value}
                  </dd>
                </div>
              );
              return (
                <div className="overflow-hidden rounded-2xl border border-[#e8e6fc] bg-gradient-to-br from-white via-[#faf9ff] to-[#fdf2f8]/40">
                  <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
                    <div className="min-w-0 border-[#e8e6fc] bg-[#f3f1ff]/50 lg:border-r">
                      <button
                        type="button"
                        disabled={!hero}
                        title={hero ? "เปิดแกลเลอรี่" : undefined}
                        className="relative aspect-[16/10] w-full overflow-hidden bg-[#ecebff] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0000BF] disabled:cursor-default"
                        onClick={() => {
                          if (!hero) return;
                          setGalleryVehicleId(v.id);
                          setGalleryPlate(v.licensePlate);
                          setGalleryOpen(true);
                        }}
                      >
                        {hero ? (
                          <img src={hero.fileUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-slate-500">
                            ยังไม่มีรูป
                          </div>
                        )}
                        {photos.length > 0 ? (
                          <span className="absolute bottom-2 right-2 rounded-lg bg-[#1e1b3a]/75 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                            {photos.length} รูป
                          </span>
                        ) : null}
                      </button>
                      {photos.length > 1 ? (
                        <div className="flex gap-1.5 overflow-x-auto border-t border-[#e8e6fc] bg-white/60 p-2 [scrollbar-gutter:stable]">
                          {photos.map((d, i) => (
                            <button
                              key={d.id}
                              type="button"
                              title={`รูปที่ ${i + 1}`}
                              className={`h-12 w-[4.25rem] shrink-0 overflow-hidden rounded-lg border-2 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0000BF] ${
                                i === 0 ? "border-[#0000BF]/50" : "border-transparent hover:border-[#e8e6fc]"
                              }`}
                              onClick={() => {
                                setGalleryVehicleId(v.id);
                                setGalleryPlate(v.licensePlate);
                                setGalleryOpen(true);
                              }}
                            >
                              <img src={d.fileUrl} alt="" className="h-full w-full object-cover" />
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex min-w-0 flex-col gap-3 p-4 sm:p-5">
                      <div>
                        <p className="font-mono text-lg font-black tracking-tight text-[#0000BF] sm:text-xl">
                          {v.licensePlate}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-[#1e1b4b]">
                          {v.brand} {v.model}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {v.vehicleStatus?.name ? (
                            <span className="rounded-full bg-[#0000BF]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#4d47b6]">
                              {v.vehicleStatus.name}
                            </span>
                          ) : null}
                          {v.vehicleType?.name ? (
                            <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-[#e8e6fc]">
                              {v.vehicleType.name}
                            </span>
                          ) : null}
                          {v.color?.trim() ? (
                            <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-[#e8e6fc]">
                              สี {v.color.trim()}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-xl border border-[#e8e6fc] bg-white/80 p-3">
                        <Field label="เลขครุภัณฑ์" value={v.assetCode?.trim() || "—"} mono />
                        <Field
                          label="เลขไมล์"
                          value={<span className="tabular-nums">{v.currentMileage} km</span>}
                        />
                        <Field
                          label="วันจัดซื้อ"
                          value={
                            <>
                              {pIso ? formatVehiclePurchaseDateTh(pIso) : "—"}
                              {ageYears != null ? (
                                <span className="font-normal text-slate-500"> · {ageYears} ปี</span>
                              ) : null}
                            </>
                          }
                        />
                        <Field label="กลุ่มงาน" value={v.workCategoryGroup?.name ?? "—"} />
                        <Field label="หมายเลขตัวถัง" value={v.chassisNumber?.trim() || "—"} mono />
                        <Field label="หมายเลขเครื่อง" value={v.engineNumber?.trim() || "—"} mono />
                      </dl>

                      {v.notes?.trim() ? (
                        <div className="rounded-xl border border-[#e8e6fc] bg-white/70 px-3 py-2">
                          <p className="text-[10px] font-semibold tracking-wide text-slate-500">หมายเหตุ</p>
                          <p className="mt-0.5 max-h-20 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">
                            {v.notes.trim()}
                          </p>
                        </div>
                      ) : null}

                      <div className="mt-auto flex flex-wrap gap-2 border-t border-[#e8e6fc] pt-3">
                        <button
                          type="button"
                          className={btnPrimary}
                          onClick={() => {
                            setDetailVehicleId(null);
                            openEdit(v);
                          }}
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          className={btnSoft}
                          onClick={() => {
                            setPhotoVehicleId(v.id);
                            setPhotoPlate(v.licensePlate);
                            setPhotoOpen(true);
                          }}
                        >
                          จัดการรูป ({photoCount(v)})
                        </button>
                        {photos.length > 0 ? (
                          <button type="button" className={btnSoft} onClick={() => openPhotoGallery(v)}>
                            แกลเลอรี่
                          </button>
                        ) : null}
                        <Link
                          to={`/vehicles/${v.id}/maintenance`}
                          className={btnSoft}
                          onClick={() => setDetailVehicleId(null)}
                        >
                          บำรุงรักษา
                          {v._count?.maintenanceLogs != null ? ` (${v._count.maintenanceLogs})` : ""}
                        </Link>
                        <Link
                          to="/vehicles/weekly-inspection"
                          className={btnSoft}
                          onClick={() => setDetailVehicleId(null)}
                        >
                          ตรวจรายสัปดาห์
                        </Link>
                        {user?.role === "ADMIN" ? (
                          <button
                            type="button"
                            className={btnDanger}
                            onClick={() =>
                              void deleteVehicle(v).then((ok) => {
                                if (ok) setDetailVehicleId(null);
                              })
                            }
                          >
                            ลบ
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </ModalFormBody>
        ) : null}
      </Modal>

      <Modal open={modalOpen} onClose={closeVehicleModal} title={editingId ? "แก้ไขยานพาหนะ" : "เพิ่มยานพาหนะ"} size="wide">
        <form onSubmit={saveVehicle}>
          <ModalFormBody>
            <ModalFormSection title="ข้อมูลหลัก">
              <p className="text-xs leading-relaxed text-slate-700">
                {editingId
                  ? "แก้ไขแล้วกดบันทึก — รูปภาพจัดการจากปุ่ม รูป (n) ในรายการ"
                  : "รูปภาพ: กดบันทึกรายการนี้ก่อน จะเปิดหน้าอัปโหลดรูป — ภายหลังใช้ปุ่ม «รูป (n)» อัปโหลด/ลบ และปุ่ม «ดูรูป» เลื่อนดูทุกรูป"}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">ยี่ห้อ</span>
                  <input
                    required
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.brand}
                    onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">รุ่น</span>
                  <input
                    required
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.model}
                    onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">ทะเบียน</span>
                  <input
                    required
                    readOnly={Boolean(editingId)}
                    title={editingId ? "แก้ไขไม่เปลี่ยนทะเบียน (ใช้เป็นตัวเชื่อมรายการ)" : undefined}
                    className={`mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 ${
                      editingId ? "cursor-not-allowed opacity-80" : ""
                    }`}
                    value={form.licensePlate}
                    onChange={(e) => setForm((f) => ({ ...f, licensePlate: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">เลขรหัสครุภัณฑ์</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    placeholder="ไม่บังคับ — ห้ามซ้ำกับคันอื่น"
                    value={form.assetCode}
                    onChange={(e) => setForm((f) => ({ ...f, assetCode: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">สถานะ</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.vehicleStatusId}
                    onChange={(e) => setForm((f) => ({ ...f, vehicleStatusId: e.target.value }))}
                  >
                    <option value="">— เลือก —</option>
                    {statuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.excludesFromFleetCare ? " (นอกยอดตรวจ)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedVehicleStatus?.excludesFromFleetCare ? (
                  <label className="block sm:col-span-2">
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
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">ประเภทรถ</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.vehicleTypeId}
                    onChange={(e) => setForm((f) => ({ ...f, vehicleTypeId: e.target.value }))}
                  >
                    <option value="">— เลือก —</option>
                    {types.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">กลุ่มประเภทการทำงาน</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.workCategoryGroupId}
                    onChange={(e) => setForm((f) => ({ ...f, workCategoryGroupId: e.target.value }))}
                  >
                    <option value="">— เลือก —</option>
                    {workGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">เลขไมล์</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.mileage}
                    onChange={(e) => setForm((f) => ({ ...f, mileage: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">วันจัดซื้อ</span>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.purchasedAt}
                    onChange={(e) => setForm((f) => ({ ...f, purchasedAt: e.target.value }))}
                  />
                  <span className="mt-1 block text-[11px] text-slate-600">
                    ใช้คำนวณอายุรถ (เต็มปี) แสดงในรายการอัตโนมัติ
                  </span>
                </label>
              </div>
            </ModalFormSection>
            <ModalFormSection title="รายละเอียดเพิ่มเติม">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">หมายเลขตัวถัง</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.chassisNumber}
                    onChange={(e) => setForm((f) => ({ ...f, chassisNumber: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">หมายเลขเครื่อง</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.engineNumber}
                    onChange={(e) => setForm((f) => ({ ...f, engineNumber: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">สี</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">หมายเหตุ</span>
                  <textarea
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    placeholder="ข้อมูลเสริมจากทะเบียน ฯลฯ"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </label>
              </div>
            </ModalFormSection>
          </ModalFormBody>
          <ModalFormActions>
            <button
              type="submit"
              className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] px-4 py-2"
            >
              บันทึก
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              onClick={closeVehicleModal}
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
        ) : listSource.length === 0 && fleetView === "active" ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/90/30 py-16 text-center text-slate-600">
            ยังไม่มียานพาหนะ — กด «เพิ่มยานพาหนะ»
          </div>
        ) : listSource.length === 0 && fleetView === "disposed" ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/90/30 py-16 text-center text-slate-600">
            ยังไม่มีรถในสถานะจำหน่าย/ส่งคืน
          </div>
        ) : filteredRows.length === 0 && fleetView === "active" ? (
          <div className="rounded-2xl border border-slate-200 bg-white/75 py-16 text-center text-slate-600">
            ไม่มีรายการที่ตรงกับการกรอง
          </div>
        ) : (
          <div className="space-y-5">
            {filteredRows.length > 0 ? (
              <div className="max-h-[calc(100vh-15rem)] min-h-[200px] overflow-y-auto overscroll-contain pr-0.5 [scrollbar-gutter:stable]">
                <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {filteredRows.map((v) => {
                    const photos = vehiclePhotos(v);
                    const firstPhoto = photos[0];
                    const pIso = purchaseIsoNormalized(v);
                    const ageYears = vehicleAgeCompletedYears(pIso);
                    const metaBits = [
                      v.vehicleType?.name ?? null,
                      v.color?.trim() || null,
                      ageYears != null ? `อายุ ${ageYears} ปี` : null,
                    ].filter(Boolean);
                    return (
                      <li key={v.id}>
                        <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-[#e8e6fc]/90 bg-white/90 shadow-[0_8px_24px_-18px_rgba(30,27,75,0.35)] transition hover:border-[#0000BF]/35 hover:shadow-[0_12px_28px_-16px_rgba(30,27,75,0.4)]">
                          <button
                            type="button"
                            title={firstPhoto ? "ดูรูปใหญ่" : "เพิ่ม/ดูรูป"}
                            className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-gradient-to-br from-[#f5f3ff] via-white to-[#fdf2f8] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0000BF]"
                            onClick={() => openPhotoGallery(v)}
                          >
                            {firstPhoto ? (
                              <img
                                src={firstPhoto.fileUrl}
                                alt=""
                                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-[#66638c]">
                                ไม่มีรูป
                              </span>
                            )}
                            {photos.length > 1 ? (
                              <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-white">
                                {photos.length} รูป
                              </span>
                            ) : null}
                          </button>
                          <button
                            type="button"
                            className="flex min-h-0 flex-1 flex-col gap-1 px-2.5 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0000BF]"
                            onClick={() => setDetailVehicleId(v.id)}
                          >
                            <p className="truncate font-mono text-[12px] font-black leading-tight text-[#4d47b6]">
                              {v.licensePlate}
                            </p>
                            <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-[#1e1b3a]">
                              {vehicleDisplayLabel(v)}
                            </p>
                            <div className="mt-auto flex flex-wrap items-center gap-1 pt-0.5">
                              {v.vehicleStatus?.name ? (
                                <span className="max-w-full truncate rounded bg-[#0000BF]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#4d47b6]">
                                  {v.vehicleStatus.name}
                                </span>
                              ) : null}
                              <span className="tabular-nums text-[9px] font-medium text-slate-500">
                                {v.currentMileage} km
                              </span>
                            </div>
                            {metaBits.length ? (
                              <p className="truncate text-[9px] leading-tight text-slate-500">{metaBits.join(" · ")}</p>
                            ) : null}
                          </button>
                        </article>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : fleetView === "disposed" ? (
              <div className="rounded-2xl border border-slate-200 bg-white/75 py-10 text-center text-slate-600">
                ไม่มีรายการจำหน่ายที่ตรงกับการกรอง
              </div>
            ) : null}

            {fleetView === "disposed" ? (
              <section className="overflow-hidden rounded-[1.25rem] border border-[#e8e6fc]/90 bg-white/75 shadow-[0_12px_36px_-24px_rgba(30,27,75,0.28)]">
                <div className="flex items-center justify-between gap-2 border-b border-[#e8e6fc] px-4 py-3">
                  <h2 className="text-sm font-black text-[#1e1b4b]">ประวัติจำหน่าย / ส่งคืน</h2>
                  <span className="rounded-full bg-[#ec4899]/10 px-2.5 py-0.5 text-[10px] font-black text-[#be185d]">
                    {filteredDispositionLog.length}/{dispositionLog.length}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-[#e8e6fc] bg-gradient-to-r from-[#f5f3ff]/95 via-white/90 to-[#fdf2f8]/80 text-[11px] font-bold uppercase tracking-wide text-[#66638c]">
                      <tr>
                        <th className="px-4 py-2.5">วันที่</th>
                        <th className="px-4 py-2.5">ประเภท</th>
                        <th className="px-4 py-2.5">ทะเบียน</th>
                        <th className="px-4 py-2.5">ยี่ห้อ / รุ่น</th>
                        <th className="px-4 py-2.5">สถานะ</th>
                        <th className="px-4 py-2.5">ผู้บันทึก</th>
                        <th className="px-4 py-2.5">หมายเหตุ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDispositionLog.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                            {dispositionLog.length ? "ไม่ตรงกับการกรอง" : "ยังไม่มีประวัติ"}
                          </td>
                        </tr>
                      ) : (
                        filteredDispositionLog.map((row) => (
                          <tr
                            key={row.id}
                            role="button"
                            tabIndex={0}
                            className="cursor-pointer border-b border-[#ecebff] last:border-0 bg-white/50 transition hover:bg-[#0000BF]/[0.04]"
                            onClick={() => setLogDetail(row)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setLogDetail(row);
                              }
                            }}
                          >
                            <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">{formatThDateTime(row.recordedAt)}</td>
                            <td className="px-4 py-2.5">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${
                                  row.kind === "RETURNED"
                                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                    : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                                }`}
                              >
                                {dispositionKindLabel(row.kind)}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-sm font-bold text-[#4d47b6]">{row.licensePlate}</td>
                            <td className="px-4 py-2.5 text-slate-800">{row.brandModel}</td>
                            <td className="px-4 py-2.5 text-slate-600">{row.statusName}</td>
                            <td className="px-4 py-2.5 text-slate-600">{row.actorUsername ?? "—"}</td>
                            <td className="max-w-[14rem] truncate px-4 py-2.5 text-slate-600">{row.note ?? "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>

      <Modal open={Boolean(logDetail)} onClose={() => setLogDetail(null)} title="รายละเอียดประวัติจำหน่าย" size="form">
        {logDetail ? (
          <ModalFormBody>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-slate-600">วันที่</dt>
                <dd className="mt-0.5 text-slate-800">{formatThDateTime(logDetail.recordedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-600">ประเภท</dt>
                <dd className="mt-0.5 text-slate-800">{dispositionKindLabel(logDetail.kind)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-600">ทะเบียน</dt>
                <dd className="mt-0.5 font-mono text-[#4d47b6]">{logDetail.licensePlate}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-600">ยี่ห้อ / รุ่น</dt>
                <dd className="mt-0.5 text-slate-800">{logDetail.brandModel}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-600">สถานะ</dt>
                <dd className="mt-0.5 text-slate-800">{logDetail.statusName}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-600">ผู้บันทึก</dt>
                <dd className="mt-0.5 text-slate-800">{logDetail.actorUsername ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-slate-600">หมายเหตุ</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-slate-800">{logDetail.note ?? "—"}</dd>
              </div>
            </dl>
          </ModalFormBody>
        ) : null}
      </Modal>

      <PrintA4Table
        columns={[
          { label: "ทะเบียน" },
          { label: "ยี่ห้อ / รุ่น" },
          { label: "เลขครุภัณฑ์" },
          { label: "ประเภท" },
          { label: "กลุ่มงาน" },
          { label: "สถานะ" },
          { label: "จัดซื้อ" },
          { label: "อายุ" },
          { label: "กม." },
        ]}
        rows={filteredRows.map((v) => {
          const pIso = purchaseIsoNormalized(v);
          const ageYears = vehicleAgeCompletedYears(pIso);
          const mileage = String(v.currentMileage ?? "").trim();
          const mileageNum = Number(mileage.replace(/,/g, ""));
          return [
            v.licensePlate,
            vehicleDisplayLabel(v),
            v.assetCode?.trim() || "—",
            v.vehicleType?.name || "—",
            v.workCategoryGroup?.name || "—",
            v.vehicleStatus?.name || "—",
            pIso ? formatVehiclePurchaseDateTh(pIso) : "—",
            ageYears != null ? `${ageYears} ปี` : "—",
            mileage ? (Number.isFinite(mileageNum) ? mileageNum.toLocaleString("th-TH") : mileage) : "—",
          ];
        })}
      />

      <ModuleDocumentsModal
        open={docsOpen}
        categoryName={MODULE_DOCUMENT_CATEGORIES.vehicles}
        onClose={() => setDocsOpen(false)}
      />
    </div>
  );
}
