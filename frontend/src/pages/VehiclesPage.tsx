import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiJson } from "../api/client";
import { Modal, ModalFormActions, ModalFormBody, ModalFormSection } from "../components/Modal";
import { VehiclePhotoGalleryModal } from "../components/VehiclePhotoGalleryModal";
import { VehiclePhotosModal } from "../components/VehiclePhotosModal";
import { VehicleStatusMasterModal } from "../components/VehicleStatusMasterModal";
import { VehicleTypeMasterModal } from "../components/VehicleTypeMasterModal";
import { WorkCategoryGroupMasterModal } from "../components/WorkCategoryGroupMasterModal";
import { PageFilterPrintBar } from "../components/PageFilterPrintBar";
import { rowMatchesFilter } from "../lib/searchNormalize";
import type { Vehicle, VehicleDetail, VehicleStatus, VehicleType, WorkCategoryGroup } from "../types";
import { vehicleDisplayLabel } from "../types";
import { formatVehiclePurchaseDateTh, vehicleAgeCompletedYears } from "../lib/vehicleAge";
import { parsePurchaseDdMmYyyyFromNotes, stripPurchaseLineFromNotes } from "../lib/parseVehiclePurchaseFromNotes";
import { useAuth } from "../context/AuthContext";

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
  const [rows, setRows] = useState<Vehicle[]>([]);
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
  const [galleryVehicleId, setGalleryVehicleId] = useState<string | null>(null);
  const [galleryPlate, setGalleryPlate] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [listFilter, setListFilter] = useState("");
  const [detailVehicleId, setDetailVehicleId] = useState<string | null>(null);
  const purchaseSyncAttempted = useRef(new Set<string>());

  const detailVehicle = useMemo(
    () => (detailVehicleId ? (rows.find((r) => r.id === detailVehicleId) ?? null) : null),
    [rows, detailVehicleId],
  );

  const selectedVehicleStatus = useMemo(
    () => statuses.find((s) => s.id === form.vehicleStatusId),
    [statuses, form.vehicleStatusId],
  );

  const filteredRows = useMemo(
    () =>
      rows.filter((v) =>
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
    [rows, listFilter],
  );

  const loadLists = useCallback(async () => {
    setLoading(true);
    try {
      const [v, t, w, s] = await Promise.all([
        apiJson<Vehicle[]>("/api/vehicles"),
        apiJson<VehicleType[]>("/api/vehicle-types"),
        apiJson<WorkCategoryGroup[]>("/api/work-category-groups"),
        apiJson<VehicleStatus[]>("/api/vehicle-statuses"),
      ]);
      setRows(v);
      setTypes(t);
      setWorkGroups(w);
      setStatuses(s);
    } finally {
      setLoading(false);
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
        await loadLists();
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
        await loadLists();
      } else {
        const created = await apiJson<Vehicle>("/api/vehicles", { method: "POST", body });
        closeVehicleModal();
        await loadLists();
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
      await loadLists();
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">ยานพาหนะ</h1>
          <p className="mt-1 text-slate-400">
            ทะเบียน ครุภัณฑ์ สถานะ ประเภทรถ กลุ่มงาน รูป และประวัติบำรุงรักษา — รายการนี้ไม่รวมรถที่สถานะจำหน่าย/ส่งคืน (นับเฉพาะที่ต้องตรวจและดูแล)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStatusModalOpen(true)}
            className="shrink-0 rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            จัดการสถานะ
          </button>
          <button
            type="button"
            onClick={() => setWorkModalOpen(true)}
            className="shrink-0 rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            กลุ่มประเภทการทำงาน
          </button>
          <button
            type="button"
            onClick={() => setTypeModalOpen(true)}
            className="shrink-0 rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            จัดการประเภทรถ
          </button>
          <Link
            to="/disposition-registry"
            className="inline-flex shrink-0 items-center rounded-lg border border-amber-900/50 px-4 py-2.5 text-sm font-medium text-amber-200/90 hover:bg-slate-800"
          >
            ทะเบียนจำหน่าย/ส่งคืน
          </Link>
          <Link
            to="/vehicles/weekly-inspection"
            className="inline-flex shrink-0 items-center rounded-lg border border-emerald-800/60 px-4 py-2.5 text-sm font-medium text-emerald-300 hover:bg-slate-800"
          >
            ตรวจประจำสัปดาห์
          </Link>
          <button
            type="button"
            onClick={openAdd}
            className="shrink-0 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/25 hover:bg-teal-500"
          >
            เพิ่มยานพาหนะ
          </button>
        </div>
      </div>

      <PageFilterPrintBar
        value={listFilter}
        onChange={setListFilter}
        printTitle="ยานพาหนะ"
        placeholder="กรองทะเบียน / ยี่ห้อ / รุ่น / สถานะ / ประเภท / กลุ่มงาน / ครุภัณฑ์…"
      />

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
          <>
            <ModalFormBody>
              <div className="flex flex-wrap gap-3 border-b border-slate-800 pb-4">
                <button
                  type="button"
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-teal-400 hover:bg-slate-800"
                  onClick={() => {
                    const v = detailVehicle;
                    setDetailVehicleId(null);
                    openEdit(v);
                  }}
                >
                  แก้ไข
                </button>
                {user?.role === "ADMIN" ? (
                  <button
                    type="button"
                    className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-slate-800"
                    onClick={() =>
                      void deleteVehicle(detailVehicle).then((ok) => {
                        if (ok) setDetailVehicleId(null);
                      })
                    }
                  >
                    ลบ
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                  onClick={() => openPhotoGallery(detailVehicle)}
                >
                  ดูรูป
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                  onClick={() => {
                    setPhotoVehicleId(detailVehicle.id);
                    setPhotoPlate(detailVehicle.licensePlate);
                    setPhotoOpen(true);
                  }}
                >
                  รูป ({photoCount(detailVehicle)})
                </button>
                <Link
                  to={`/vehicles/${detailVehicle.id}/maintenance`}
                  className="relative z-10 inline-flex items-center rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-teal-400 hover:bg-slate-800"
                  onClick={() => setDetailVehicleId(null)}
                >
                  ประวัติบำรุงรักษา
                </Link>
                <Link
                  to="/vehicles/weekly-inspection"
                  className="relative z-10 inline-flex items-center rounded-lg border border-emerald-800/50 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-slate-800"
                  onClick={() => setDetailVehicleId(null)}
                >
                  ตารางตรวจรายสัปดาห์
                </Link>
              </div>
              {(() => {
                const v = detailVehicle;
                const photos = vehiclePhotos(v);
                const pIso = purchaseIsoNormalized(v);
                const ageYears = vehicleAgeCompletedYears(pIso);
                return (
                  <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
                    <div className="min-w-0 flex-1 space-y-4">
                      <p className="font-mono text-sm text-teal-400/90">{v.licensePlate}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {v.vehicleStatus?.name ? (
                          <span className="rounded-md bg-teal-900/50 px-2 py-0.5 text-[11px] font-medium text-teal-300">
                            {v.vehicleStatus.name}
                          </span>
                        ) : null}
                        {v.vehicleType?.name ? (
                          <span className="rounded-md bg-slate-700/60 px-2 py-0.5 text-[11px] text-slate-300">
                            {v.vehicleType.name}
                          </span>
                        ) : null}
                      </div>
                      {!photos.length ? (
                        <p className="text-xs text-slate-600">ยังไม่มีรูป — กดปุ่ม «รูป» เพื่ออัปโหลด</p>
                      ) : null}
                      <dl className="grid gap-x-3 gap-y-2.5 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-medium text-slate-500">เลขครุภัณฑ์</dt>
                          <dd className="mt-0.5 font-mono text-slate-300">{v.assetCode?.trim() || "—"}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-xs font-medium text-slate-500">กลุ่มประเภทการทำงาน</dt>
                          <dd className="mt-0.5 text-slate-200">{v.workCategoryGroup?.name ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">เลขไมล์</dt>
                          <dd className="mt-0.5 tabular-nums text-slate-200">{v.currentMileage} km</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">วันจัดซื้อ</dt>
                          <dd className="mt-0.5 text-slate-200">
                            {pIso ? formatVehiclePurchaseDateTh(pIso) : "—"}
                            {ageYears != null ? (
                              <span className="text-slate-400"> · อายุ {ageYears} ปี</span>
                            ) : null}
                          </dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-xs font-medium text-slate-500">หมายเลขตัวถัง</dt>
                          <dd className="mt-0.5 font-mono text-slate-300">{v.chassisNumber?.trim() || "—"}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-xs font-medium text-slate-500">หมายเลขเครื่อง</dt>
                          <dd className="mt-0.5 font-mono text-slate-300">{v.engineNumber?.trim() || "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">สี</dt>
                          <dd className="mt-0.5 text-slate-200">{v.color?.trim() || "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">บันทึกบำรุงรักษา</dt>
                          <dd className="mt-0.5 text-slate-200">
                            {v._count?.maintenanceLogs != null ? `${v._count.maintenanceLogs} รายการ` : "—"}
                          </dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-xs font-medium text-slate-500">หมายเหตุ</dt>
                          <dd className="mt-0.5 whitespace-pre-wrap break-words text-slate-400">
                            {v.notes?.trim() || "—"}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    {photos.length > 0 ? (
                      <aside className="w-full shrink-0 lg:sticky lg:top-0 lg:w-64 xl:w-72">
                        <p className="mb-2 text-xs font-medium text-slate-500 lg:text-right">รูปถ่าย</p>
                        <div className="flex flex-col gap-3 lg:max-h-[min(36rem,calc(85dvh-10rem))] lg:overflow-y-auto lg:pr-1 [scrollbar-gutter:stable]">
                          {photos.map((d) => (
                            <button
                              key={d.id}
                              type="button"
                              title="ดูแกลเลอรี่"
                              className="aspect-square w-full max-w-[20rem] overflow-hidden rounded-xl border border-slate-700 bg-slate-950/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 sm:mx-auto lg:mx-0 lg:max-w-none"
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
                      </aside>
                    ) : null}
                  </div>
                );
              })()}
            </ModalFormBody>
          </>
        ) : null}
      </Modal>

      <Modal open={modalOpen} onClose={closeVehicleModal} title={editingId ? "แก้ไขยานพาหนะ" : "เพิ่มยานพาหนะ"} size="wide">
        <form onSubmit={saveVehicle}>
          <ModalFormBody>
            <ModalFormSection title="ข้อมูลหลัก">
              <p className="text-xs leading-relaxed text-slate-500">
                {editingId
                  ? "แก้ไขแล้วกดบันทึก — รูปภาพจัดการจากปุ่ม รูป (n) ในรายการ"
                  : "รูปภาพ: กดบันทึกรายการนี้ก่อน จะเปิดหน้าอัปโหลดรูป — ภายหลังใช้ปุ่ม «รูป (n)» อัปโหลด/ลบ และปุ่ม «ดูรูป» เลื่อนดูทุกรูป"}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-slate-400">ยี่ห้อ</span>
                  <input
                    required
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    value={form.brand}
                    onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-400">รุ่น</span>
                  <input
                    required
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    value={form.model}
                    onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-400">ทะเบียน</span>
                  <input
                    required
                    readOnly={Boolean(editingId)}
                    title={editingId ? "แก้ไขไม่เปลี่ยนทะเบียน (ใช้เป็นตัวเชื่อมรายการ)" : undefined}
                    className={`mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white ${
                      editingId ? "cursor-not-allowed opacity-80" : ""
                    }`}
                    value={form.licensePlate}
                    onChange={(e) => setForm((f) => ({ ...f, licensePlate: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-400">เลขรหัสครุภัณฑ์</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    placeholder="ไม่บังคับ — ห้ามซ้ำกับคันอื่น"
                    value={form.assetCode}
                    onChange={(e) => setForm((f) => ({ ...f, assetCode: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-400">สถานะ</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
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
                    <span className="text-xs font-medium text-slate-400">
                      หมายเหตุการจำหน่าย/ส่งคืน (บันทึกในประวัติทะเบียน)
                    </span>
                    <textarea
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                      placeholder="ไม่บังคับ"
                      value={form.dispositionNote}
                      onChange={(e) => setForm((f) => ({ ...f, dispositionNote: e.target.value }))}
                    />
                  </label>
                ) : null}
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-400">ประเภทรถ</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
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
                  <span className="text-xs font-medium text-slate-400">กลุ่มประเภทการทำงาน</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
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
                  <span className="text-xs font-medium text-slate-400">เลขไมล์</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    value={form.mileage}
                    onChange={(e) => setForm((f) => ({ ...f, mileage: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-400">วันจัดซื้อ</span>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    value={form.purchasedAt}
                    onChange={(e) => setForm((f) => ({ ...f, purchasedAt: e.target.value }))}
                  />
                  <span className="mt-1 block text-[11px] text-slate-500">
                    ใช้คำนวณอายุรถ (เต็มปี) แสดงในรายการอัตโนมัติ
                  </span>
                </label>
              </div>
            </ModalFormSection>
            <ModalFormSection title="รายละเอียดเพิ่มเติม">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-400">หมายเลขตัวถัง</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    value={form.chassisNumber}
                    onChange={(e) => setForm((f) => ({ ...f, chassisNumber: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-400">หมายเลขเครื่อง</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    value={form.engineNumber}
                    onChange={(e) => setForm((f) => ({ ...f, engineNumber: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-400">สี</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-400">หมายเหตุ</span>
                  <textarea
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
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
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500"
            >
              บันทึก
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              onClick={closeVehicleModal}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      <div className="mt-6">
        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 py-16 text-center text-slate-500">
            กำลังโหลด…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 py-16 text-center text-slate-500">
            ยังไม่มียานพาหนะ — กด «เพิ่มยานพาหนะ»
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 py-16 text-center text-slate-500">
            ไม่มีรายการที่ตรงกับการกรอง
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3 shadow-inner">
            <div className="max-h-[calc(100vh-16rem)] min-h-[200px] overflow-y-auto overscroll-contain rounded-xl pr-1 [scrollbar-gutter:stable]">
              <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {filteredRows.map((v) => {
                  const photos = vehiclePhotos(v);
                  const firstPhoto = photos[0];
                  const pIso = purchaseIsoNormalized(v);
                  const ageYears = vehicleAgeCompletedYears(pIso);
                  return (
                    <li key={v.id}>
                      <div className="flex overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 shadow-sm transition hover:border-teal-800/45 hover:bg-slate-900/80">
                        <button
                          type="button"
                          className="min-w-0 flex-1 px-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                          onClick={() => setDetailVehicleId(v.id)}
                        >
                          <p className="truncate text-sm font-semibold leading-snug text-white">{vehicleDisplayLabel(v)}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-teal-400/90">{v.licensePlate}</p>
                          <p className="mt-1 truncate text-[11px] text-slate-500">
                            {[
                              v.assetCode?.trim() ? `ครุภัณฑ์ ${v.assetCode.trim()}` : null,
                              v.vehicleType?.name ?? null,
                              v.workCategoryGroup?.name ?? null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </p>
                          {v.color?.trim() ? (
                            <p className="mt-0.5 truncate text-[10px] text-slate-500">สี {v.color.trim()}</p>
                          ) : null}
                          <p className="mt-1 text-[10px] text-slate-400">
                            {pIso ? (
                              <>
                                จัดซื้อ {formatVehiclePurchaseDateTh(pIso)}
                                {ageYears != null ? <span> · อายุ {ageYears} ปี</span> : null}
                              </>
                            ) : (
                              <span className="text-slate-600">ยังไม่ระบุวันจัดซื้อ</span>
                            )}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {v.vehicleStatus?.name ? (
                              <span className="rounded bg-teal-900/50 px-1.5 py-0.5 text-[10px] font-medium text-teal-300">
                                {v.vehicleStatus.name}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 tabular-nums text-[10px] text-slate-500">{v.currentMileage} km</p>
                        </button>
                        <div className="flex shrink-0 flex-col border-l border-slate-800/80">
                          {firstPhoto ? (
                            <button
                              type="button"
                              title="ดูรูปทั้งหมด"
                              className="h-full min-h-[4.5rem] w-14 overflow-hidden border-0 bg-slate-950/40 p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500"
                              onClick={() => openPhotoGallery(v)}
                            >
                              <img src={firstPhoto.fileUrl} alt="" className="h-full w-full object-cover" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              title="เพิ่ม/ดูรูป"
                              className="flex min-h-[4.5rem] w-14 items-center justify-center bg-slate-950/30 px-1 text-center text-[9px] leading-tight text-slate-500 hover:bg-slate-800/50 hover:text-teal-400"
                              onClick={() => openPhotoGallery(v)}
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
    </div>
  );
}
