import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFormJson, apiJson } from "../api/client";
import { ImageLightbox } from "../components/ImageLightbox";
import { ListPagination } from "../components/ListPagination";
import { Modal, ModalFormActions, ModalFormBody, ModalFormSection } from "../components/Modal";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { PrintA4Table } from "../components/PrintA4Table";
import { botPerDiemDailyRate } from "../lib/botAllowancePrint";
import { formatBaht } from "../lib/formatNumber";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { prepareImageFileForUpload } from "../lib/prepareImageFileForUpload";
import type { LoadOptions } from "../lib/loadOptions";
import { setLoadBusy } from "../lib/loadOptions";
import {
  brandGradientFillClass,
  listCardAccentClass,
  listCardClass,
  toolbarMasterBtnClass,
  toolbarMasterGroupClass,
  toolbarPrimaryBtnClass,
} from "../lib/uiTokens";
import type { Personnel, PersonnelCategory, PersonnelMissionHistory } from "../types";

const PAGE_SIZE = 24; // 3 คอลัมน์ × 8 แถว

type BeneficiaryFormRow = { fullName: string; relationship: string; phone: string; idNumber: string };

type MasterRow = { id: string; name: string; sortOrder: number };

function formatInsuranceExpiry(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.44 47.44 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"
      />
    </svg>
  );
}

function MasterDataModal({
  open,
  onClose,
  title,
  apiPath,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  apiPath: string;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<MasterRow | null>(null);
  const [editName, setEditName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await apiJson<MasterRow[]>(apiPath));
  }, [apiPath]);

  useEffect(() => {
    if (open) {
      setErr(null);
      setEditing(null);
      void load();
    }
  }, [open, load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await apiJson(apiPath, { method: "POST", body: JSON.stringify({ name: newName.trim() }) });
      setNewName("");
      onChanged();
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ");
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setErr(null);
    try {
      await apiJson(`${apiPath}/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editName.trim() }),
      });
      setEditing(null);
      onChanged();
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function remove(r: MasterRow) {
    if (!confirm(`ลบ "${r.name}" ?`)) return;
    setErr(null);
    try {
      await apiJson(`${apiPath}/${r.id}`, { method: "DELETE" });
      onChanged();
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <ModalFormBody className="!space-y-4">
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <form onSubmit={add} className="flex gap-2">
        <input
          placeholder="ชื่อใหม่"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="shrink-0 rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] px-3 py-2">
          เพิ่ม
        </button>
        </form>
        {editing ? (
        <form onSubmit={saveEdit} className="rounded-lg border border-[#0000BF]/25 bg-white/80 p-3">
          <p className="text-xs text-slate-600">แก้ไข</p>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <button type="submit" className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] px-3 py-1.5">
              บันทึก
            </button>
            <button type="button" className="text-sm text-slate-600" onClick={() => setEditing(null)}>
              ยกเลิก
            </button>
          </div>
        </form>
        ) : null}
        <ul className="max-h-64 space-y-2 overflow-y-auto">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white/75 px-3 py-2 text-sm"
          >
            <span className="truncate text-slate-800">{r.name}</span>
            <span className="flex shrink-0 gap-1">
              <button
                type="button"
                className="rounded px-2 py-0.5 text-xs text-[#5b61ff] hover:bg-slate-100"
                onClick={() => {
                  setEditing(r);
                  setEditName(r.name);
                }}
              >
                แก้ไข
              </button>
              <button
                type="button"
                className="rounded px-2 py-0.5 text-xs text-rose-600 hover:bg-slate-100"
                onClick={() => void remove(r)}
              >
                ลบ
              </button>
            </span>
          </li>
        ))}
        </ul>
      </ModalFormBody>
    </Modal>
  );
}

function maskIdNumber(raw: string) {
  const s = raw.trim();
  if (!s) return "—";
  return "●".repeat(s.length);
}

const emptyBeneficiary = (): BeneficiaryFormRow => ({
  fullName: "",
  relationship: "",
  phone: "",
  idNumber: "",
});

export function PersonnelPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const highlightClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [rows, setRows] = useState<Personnel[]>([]);
  const [categories, setCategories] = useState<PersonnelCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [masterModal, setMasterModal] = useState<"category" | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxTitle, setLightboxTitle] = useState<string | null>(null);
  /** แสดงเลขบัตรประชาชนจริงต่อแถว (คลิกปุ่มแสดง) */
  const [idRevealed, setIdRevealed] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailIdRevealed, setDetailIdRevealed] = useState(false);
  const [missionHistory, setMissionHistory] = useState<PersonnelMissionHistory | null>(null);
  const [missionHistoryLoading, setMissionHistoryLoading] = useState(false);
  const [listFilter, setListFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);

  const [form, setForm] = useState({
    fullName: "",
    idNumber: "",
    employeeCode: "",
    rank: "",
    position: "",
    phone: "",
    gradeLevel: "",
    perDiemRate: "",
    vehicleTravelAllowance: "",
    personnelCategoryId: "",
    insuranceCompany: "",
    insurancePolicyNumber: "",
    insuranceExpiry: "",
    insuranceNotes: "",
    remarks: "",
  });
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryFormRow[]>([emptyBeneficiary()]);

  const filteredPersonnel = useMemo(
    () =>
      rows.filter((r) => {
        if (categoryFilter && r.personnelCategoryId !== categoryFilter) return false;
        return rowMatchesFilter(listFilter, [
          r.fullName,
          r.rank,
          r.position,
          r.personnelCategory?.name,
          r.phone,
          r.idNumber,
          r.employeeCode,
          r.gradeLevel,
        ]);
      }),
    [rows, listFilter, categoryFilter],
  );

  const pageCount = Math.max(1, Math.ceil(filteredPersonnel.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pagedPersonnel = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredPersonnel.slice(start, start + PAGE_SIZE);
  }, [filteredPersonnel, safePage]);

  useEffect(() => {
    setPage(1);
  }, [listFilter, categoryFilter]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const detailPerson = useMemo(
    () => (detailId ? rows.find((r) => r.id === detailId) ?? null : null),
    [rows, detailId],
  );

  useEffect(() => {
    if (!detailId) {
      setMissionHistory(null);
      return;
    }
    let cancelled = false;
    setMissionHistoryLoading(true);
    void apiJson<PersonnelMissionHistory>(`/api/personnel/${detailId}/missions`)
      .then((data) => {
        if (!cancelled) setMissionHistory(data);
      })
      .catch(() => {
        if (!cancelled) setMissionHistory(null);
      })
      .finally(() => {
        if (!cancelled) setMissionHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detailId]);

  const loadLists = useCallback(async () => {
    const [p, c] = await Promise.all([
      apiJson<Personnel[]>("/api/personnel"),
      apiJson<PersonnelCategory[]>("/api/personnel-categories"),
    ]);
    setRows(p);
    setCategories(c);
  }, []);

  const load = useCallback(async (opts?: LoadOptions) => {
    setLoadBusy(setLoading, opts, true);
    try {
      await loadLists();
    } finally {
      setLoading(false);
    }
  }, [loadLists]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!highlightId || loading) return;
    setDetailId(highlightId);
    const el = document.getElementById(`personnel-card-${highlightId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-[#0000BF]", "ring-offset-2", "ring-offset-white");
    if (highlightClearRef.current) clearTimeout(highlightClearRef.current);
    highlightClearRef.current = setTimeout(() => {
      el.classList.remove("ring-2", "ring-[#0000BF]", "ring-offset-2", "ring-offset-white");
      highlightClearRef.current = null;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("highlight");
          return next;
        },
        { replace: true },
      );
    }, 4000);
    return () => {
      if (highlightClearRef.current) clearTimeout(highlightClearRef.current);
    };
  }, [highlightId, loading, rows, setSearchParams]);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  function revokePhotoIfBlob(url: string | null) {
    if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
  }

  function closeAddModal() {
    setLightboxUrl(null);
    setLightboxTitle(null);
    revokePhotoIfBlob(photoPreview);
    setPhotoPreview(null);
    setModalOpen(false);
    setEditingId(null);
  }

  function resetForm() {
    setForm({
      fullName: "",
      idNumber: "",
      employeeCode: "",
      rank: "",
      position: "",
      phone: "",
      gradeLevel: "",
      perDiemRate: "",
      vehicleTravelAllowance: "",
      personnelCategoryId: "",
      insuranceCompany: "",
      insurancePolicyNumber: "",
      insuranceExpiry: "",
      insuranceNotes: "",
      remarks: "",
    });
    setBeneficiaries([emptyBeneficiary()]);
    revokePhotoIfBlob(photoPreview);
    setPhotoPreview(null);
    setEditingId(null);
    const input = document.getElementById("personnel-photo-input") as HTMLInputElement | null;
    if (input) input.value = "";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const benPayload = beneficiaries
      .filter((b) => b.fullName.trim())
      .map((b) => ({
        fullName: b.fullName.trim(),
        relationship: b.relationship.trim() || null,
        phone: b.phone.trim() || null,
        idNumber: b.idNumber.trim() || null,
      }));

    const fd = new FormData();
    fd.append("fullName", form.fullName);
    fd.append("idNumber", form.idNumber);
    fd.append("employeeCode", form.employeeCode);
    fd.append("rank", form.rank);
    fd.append("position", form.position);
    fd.append("phone", form.phone);
    fd.append("gradeLevel", form.gradeLevel);
    if (form.perDiemRate !== "") fd.append("perDiemRate", form.perDiemRate);
    if (form.vehicleTravelAllowance !== "") fd.append("vehicleTravelAllowance", form.vehicleTravelAllowance);
    if (form.personnelCategoryId) fd.append("personnelCategoryId", form.personnelCategoryId);
    fd.append("insuranceCompany", form.insuranceCompany);
    fd.append("insurancePolicyNumber", form.insurancePolicyNumber);
    if (form.insuranceExpiry) fd.append("insuranceExpiry", form.insuranceExpiry);
    fd.append("insuranceNotes", form.insuranceNotes);
    fd.append("remarks", form.remarks);
    fd.append("beneficiaries", JSON.stringify(benPayload));

    const input = document.getElementById("personnel-photo-input") as HTMLInputElement | null;
    if (input?.files?.[0]) {
      const prepared = await prepareImageFileForUpload(input.files[0]);
      fd.append("photo", prepared);
    }

    const path = editingId ? `/api/personnel/${editingId}` : "/api/personnel";
    const method = editingId ? "PUT" : "POST";

    try {
      const saved = await apiFormJson<Personnel>(path, fd, method);
      setRows((prev) => {
        if (editingId) return prev.map((r) => (r.id === saved.id ? saved : r));
        return [saved, ...prev];
      });
      resetForm();
      closeAddModal();
    } catch (err) {
      alert(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    }
  }

  function onPhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    revokePhotoIfBlob(photoPreview);
    setPhotoPreview(f ? URL.createObjectURL(f) : null);
  }

  function openEditPersonnel(r: Personnel) {
    setEditingId(r.id);
    setForm({
      fullName: r.fullName,
      idNumber: r.idNumber,
      employeeCode: r.employeeCode ?? "",
      rank: r.rank ?? "",
      position: r.position ?? "",
      phone: r.phone ?? "",
      gradeLevel: r.gradeLevel ?? "",
      perDiemRate: r.perDiemRate != null && r.perDiemRate !== "" ? String(r.perDiemRate) : "",
      vehicleTravelAllowance:
        r.vehicleTravelAllowance != null && r.vehicleTravelAllowance !== ""
          ? String(r.vehicleTravelAllowance)
          : "",
      personnelCategoryId: r.personnelCategoryId ?? "",
      insuranceCompany: r.insuranceCompany ?? "",
      insurancePolicyNumber: r.insurancePolicyNumber ?? "",
      insuranceExpiry: r.insuranceExpiry ? r.insuranceExpiry.slice(0, 10) : "",
      insuranceNotes: r.insuranceNotes ?? "",
      remarks: r.remarks ?? "",
    });
    setBeneficiaries(
      r.beneficiaries?.length
        ? r.beneficiaries.map((b) => ({
            fullName: b.fullName,
            relationship: b.relationship ?? "",
            phone: b.phone ?? "",
            idNumber: b.idNumber ?? "",
          }))
        : [emptyBeneficiary()],
    );
    revokePhotoIfBlob(photoPreview);
    setPhotoPreview(r.photoUrl);
    const input = document.getElementById("personnel-photo-input") as HTMLInputElement | null;
    if (input) input.value = "";
    setModalOpen(true);
  }

  async function deletePersonnel(r: Personnel): Promise<boolean> {
    if (!confirm(`ลบบุคลากร «${r.fullName}» ? การดำเนินการนี้ไม่สามารถย้อนกลับได้`)) return false;
    try {
      await apiJson(`/api/personnel/${r.id}`, { method: "DELETE" });
      await load({ silent: true });
      return true;
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
      return false;
    }
  }

  return (
    <div>
      <PageHeaderBar
        title="บุคลากร"
        count={filteredPersonnel.length}
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "บุคลากร",
          placeholder: "กรองชื่อ / ยศ / ตำแหน่ง / ประเภท / โทร / เลขบัตรประชาชน / รหัส…",
        }}
        segments={
          <select
            aria-label="กรองประเภทบุคลากร"
            className={`${toolbarMasterBtnClass} max-w-[10rem] cursor-pointer`}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">ทุกประเภท</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        }
        masters={
          <div className={toolbarMasterGroupClass}>
            <button type="button" onClick={() => setMasterModal("category")} className={toolbarMasterBtnClass}>
              ประเภท
            </button>
          </div>
        }
        primary={
          <button
            type="button"
            onClick={() => {
              resetForm();
              setEditingId(null);
              setModalOpen(true);
            }}
            className={toolbarPrimaryBtnClass}
          >
            เพิ่มบุคลากร
          </button>
        }
      />

      <MasterDataModal
        open={masterModal === "category"}
        onClose={() => setMasterModal(null)}
        title="ประเภทบุคลากร (เพิ่ม / แก้ไข / ลบ)"
        apiPath="/api/personnel-categories"
        onChanged={loadLists}
      />

      <Modal open={modalOpen} onClose={closeAddModal} title={editingId ? "แก้ไขบุคลากร" : "เพิ่มบุคลากร"} size="wide">
        <form onSubmit={onSubmit}>
          <ModalFormBody>
          <ModalFormSection title="รูปถ่าย">
            <div className="flex flex-col items-center">
              <input
                id="personnel-photo-input"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={onPhotoPick}
              />
              {photoPreview ? (
                <div className="flex flex-col items-center">
                  <button
                    type="button"
                    title="ดูรูปใหญ่"
                    className="rounded-full border-2 border-[#0000BF]/35 shadow-lg ring-offset-2 ring-offset-white transition hover:ring-2 hover:ring-[#0000BF]/50 focus:outline-none focus:ring-2 focus:ring-[#0000BF]"
                    onClick={() => {
                      setLightboxUrl(photoPreview);
                      setLightboxTitle(form.fullName.trim() || "รูปถ่าย");
                    }}
                  >
                    <img
                      src={photoPreview}
                      alt=""
                      className="h-28 w-28 rounded-full object-cover"
                    />
                  </button>
                  <label
                    htmlFor="personnel-photo-input"
                    className="mt-4 cursor-pointer text-sm font-medium text-[#5b61ff] hover:underline"
                  >
                    เปลี่ยนรูป
                  </label>
                  <span className="mt-1 text-center text-xs text-slate-600">คลิกที่รูปเพื่อดูขนาดใหญ่ · JPG, PNG</span>
                </div>
              ) : (
                <label
                  htmlFor="personnel-photo-input"
                  className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-b from-white to-[#f7f6ff] px-8 py-10 transition hover:border-[#0000BF]/45 hover:from-[#0000BF]/5 hover:shadow-lg hover:shadow-[#0000BF]/10"
                >
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#0000BF]/15 text-[#5b61ff] ring-2 ring-[#0000BF]/30 transition group-hover:bg-[#5b61ff]/20 group-hover:text-[#4d47b6]">
                    <CameraIcon className="h-12 w-12" />
                  </div>
                  <span className="mt-4 text-center text-sm font-medium text-slate-700 group-hover:text-[#2e2a58]">
                    แตะเพื่ออัปโหลดรูป
                  </span>
                  <span className="mt-1 text-center text-xs text-slate-600">JPG, PNG — สูงสุดตามที่เซิร์ฟเวอร์กำหนด</span>
                </label>
              )}
            </div>
          </ModalFormSection>

          <ModalFormSection title="ข้อมูลทั่วไป">
            <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-700">ชื่อ–นามสกุล</span>
              <input
                required
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">เลขบัตรประชาชน</span>
              <input
                required
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={form.idNumber}
                onChange={(e) => setForm((f) => ({ ...f, idNumber: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">รหัสพนักงาน</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={form.employeeCode}
                onChange={(e) => setForm((f) => ({ ...f, employeeCode: e.target.value }))}
                placeholder="เช่น รหัส ธปท."
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">ยศ</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={form.rank}
                onChange={(e) => setForm((f) => ({ ...f, rank: e.target.value }))}
                placeholder="เช่น ร.ต.ต."
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">ตำแหน่ง</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">โทรศัพท์</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">ประเภท (บุคลากร)</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={form.personnelCategoryId}
                onChange={(e) => {
                  const personnelCategoryId = e.target.value;
                  setForm((f) => {
                    const catName = categories.find((c) => c.id === personnelCategoryId)?.name;
                    const next = { ...f, personnelCategoryId };
                    if (catName === "ธปท." && f.gradeLevel.trim()) {
                      next.perDiemRate = String(botPerDiemDailyRate(f.gradeLevel));
                    }
                    return next;
                  });
                }}
              >
                <option value="">— เลือก —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">ระดับชั้น</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={form.gradeLevel}
                onChange={(e) => {
                  const gradeLevel = e.target.value;
                  setForm((f) => {
                    const catName = categories.find((c) => c.id === f.personnelCategoryId)?.name;
                    const next = { ...f, gradeLevel };
                    if (catName === "ธปท.") {
                      next.perDiemRate = String(botPerDiemDailyRate(gradeLevel));
                    }
                    return next;
                  });
                }}
                placeholder="เช่น จรส. / จรส.(ควบ) / 4 / 5(ควบ) / 6 / 7"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">อัตราเบี้ยเลี้ยง (บาท/วัน)</span>
              <input
                type="number"
                min={0}
                step="1"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={form.perDiemRate}
                onChange={(e) => setForm((f) => ({ ...f, perDiemRate: e.target.value }))}
                placeholder="จรส. = 450 · อื่นๆ / จรส.(ควบ) = 500"
              />
              <span className="mt-0.5 block text-[10px] text-slate-500">
                ประเภท ธปท.: จรส. ได้ 450/วัน · จรส.(ควบ) และอื่นๆ ได้ 500/วัน (ใส่ระดับชั้นแล้วจะเติมให้อัตโนมัติ)
              </span>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">เงินช่วยเหลือยานพาหนะไป-กลับ (บาท)</span>
              <input
                type="number"
                min={0}
                step="1"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={form.vehicleTravelAllowance}
                onChange={(e) => setForm((f) => ({ ...f, vehicleTravelAllowance: e.target.value }))}
                placeholder="ต่อครั้งภารกิจ (ไม่คูณจำนวนวัน)"
              />
            </label>
            </div>
          </ModalFormSection>

          <ModalFormSection title="กรมธรรม์ประกันภัย">
            <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-700">บริษัทประกัน</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={form.insuranceCompany}
                onChange={(e) => setForm((f) => ({ ...f, insuranceCompany: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">เลขกรมธรรม์ / เลขกรมธรรม์หลัก</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={form.insurancePolicyNumber}
                onChange={(e) => setForm((f) => ({ ...f, insurancePolicyNumber: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">วันหมดอายุ (ถ้ามี)</span>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={form.insuranceExpiry}
                onChange={(e) => setForm((f) => ({ ...f, insuranceExpiry: e.target.value }))}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-slate-700">รายละเอียดกรมธรรม์ / หมายเหตุ</span>
              <textarea
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={form.insuranceNotes}
                onChange={(e) => setForm((f) => ({ ...f, insuranceNotes: e.target.value }))}
              />
            </label>
            </div>
          </ModalFormSection>

          <ModalFormSection title="ผู้รับผลประโยชน์">
            <div className="flex justify-end">
              <button
                type="button"
                className="text-xs text-[#5b61ff] hover:underline"
                onClick={() => setBeneficiaries((b) => [...b, emptyBeneficiary()])}
              >
                + เพิ่มคน
              </button>
            </div>
            <div className="space-y-3">
              {beneficiaries.map((b, idx) => (
                <div
                  key={idx}
                  className="grid gap-2 rounded-xl border border-slate-200 bg-white/40 p-3 sm:grid-cols-2"
                >
                  <input
                    placeholder="ชื่อ–สกุลผู้รับผลประโยชน์ *"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 sm:col-span-2"
                    value={b.fullName}
                    onChange={(e) => {
                      const next = [...beneficiaries];
                      next[idx] = { ...b, fullName: e.target.value };
                      setBeneficiaries(next);
                    }}
                  />
                  <input
                    placeholder="ความสัมพันธ์"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    value={b.relationship}
                    onChange={(e) => {
                      const next = [...beneficiaries];
                      next[idx] = { ...b, relationship: e.target.value };
                      setBeneficiaries(next);
                    }}
                  />
                  <input
                    placeholder="โทรศัพท์"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    value={b.phone}
                    onChange={(e) => {
                      const next = [...beneficiaries];
                      next[idx] = { ...b, phone: e.target.value };
                      setBeneficiaries(next);
                    }}
                  />
                  <input
                    placeholder="เลขบัตรประชาชน (ถ้ามี)"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 sm:col-span-2"
                    value={b.idNumber}
                    onChange={(e) => {
                      const next = [...beneficiaries];
                      next[idx] = { ...b, idNumber: e.target.value };
                      setBeneficiaries(next);
                    }}
                  />
                  {beneficiaries.length > 1 && (
                    <button
                      type="button"
                      className="text-left text-xs text-rose-600 sm:col-span-2"
                      onClick={() => setBeneficiaries((rows) => rows.filter((_, i) => i !== idx))}
                    >
                      ลบแถวนี้
                    </button>
                  )}
                </div>
              ))}
            </div>
          </ModalFormSection>

          <ModalFormSection title="โน้ตสำคัญ">
            <label className="block">
              <span className="text-xs font-medium text-slate-700">โน้ตสำคัญ</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={form.remarks}
                onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                placeholder="บันทึกข้อมูลสำคัญของบุคลากร"
              />
            </label>
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
              onClick={closeAddModal}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      <ImageLightbox
        url={lightboxUrl}
        title={lightboxTitle}
        open={!!lightboxUrl}
        onClose={() => {
          setLightboxUrl(null);
          setLightboxTitle(null);
        }}
      />

      <Modal
        open={Boolean(detailPerson)}
        onClose={() => {
          setDetailId(null);
          setDetailIdRevealed(false);
        }}
        title={
          detailPerson
            ? [detailPerson.rank, detailPerson.fullName].filter(Boolean).join(" ")
            : "รายละเอียดบุคลากร"
        }
        size="wide"
      >
        {detailPerson ? (
          <ModalFormBody className="space-y-3">
            {(() => {
              const p = detailPerson;
              const btnPrimary = `inline-flex h-9 items-center justify-center rounded-xl px-3.5 text-xs font-black text-white shadow-md shadow-[#0000BF]/20 ${brandGradientFillClass}`;
              const btnSoft =
                "inline-flex h-9 items-center justify-center rounded-xl border border-[#e0ddf8] bg-white px-3 text-xs font-bold text-[#4d47b6] shadow-sm transition hover:border-[#0000BF]/30 hover:bg-[#f5f3ff]";
              const btnDanger =
                "inline-flex h-9 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-600 shadow-sm transition hover:bg-rose-100";
              const Field = ({
                label,
                value,
                mono,
                span2,
              }: {
                label: string;
                value: ReactNode;
                mono?: boolean;
                span2?: boolean;
              }) => (
                <div className={span2 ? "sm:col-span-2" : "min-w-0"}>
                  <dt className="text-[10px] font-semibold tracking-wide text-slate-500">{label}</dt>
                  <dd
                    className={`mt-0.5 break-words text-[13px] font-medium text-[#1e1b4b] ${mono ? "font-mono text-xs" : ""}`}
                  >
                    {value}
                  </dd>
                </div>
              );
              const bens = p.beneficiaries ?? [];
              const hasInsurance =
                Boolean(p.insuranceCompany?.trim()) ||
                Boolean(p.insurancePolicyNumber?.trim()) ||
                Boolean(p.insuranceExpiry) ||
                Boolean(p.insuranceNotes?.trim());
              return (
                <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-white via-[#faf9ff] to-[#fdf2f8]/40">
                  <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <div className="flex flex-col gap-3 bg-[#f3f1ff]/40 p-4 sm:p-5 lg:border-r lg:border-[#ebe8f8]">
                      <div className="flex flex-col items-center gap-3">
                        {p.photoUrl ? (
                          <button
                            type="button"
                            title="ดูรูปใหญ่"
                            className="rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0000BF]"
                            onClick={() => {
                              setLightboxUrl(p.photoUrl);
                              setLightboxTitle(p.fullName);
                            }}
                          >
                            <img
                              src={p.photoUrl}
                              alt=""
                              className="h-36 w-36 rounded-2xl object-cover shadow-sm sm:h-40 sm:w-40"
                            />
                          </button>
                        ) : (
                          <div className="flex h-36 w-36 items-center justify-center rounded-2xl bg-[#0000BF]/10 text-4xl font-black text-[#4d47b6] sm:h-40 sm:w-40">
                            {(p.fullName.trim().charAt(0) || "?").toUpperCase()}
                          </div>
                        )}
                        <div className="text-center">
                          <p className="text-base font-black text-[#1e1b4b]">
                            {[p.rank, p.fullName].filter(Boolean).join(" ")}
                          </p>
                          {p.position?.trim() ? (
                            <p className="mt-0.5 text-sm text-slate-600">{p.position}</p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                            {p.personnelCategory?.name ? (
                              <span className="rounded-full bg-violet-500/15 px-2.5 py-0.5 text-[11px] font-bold text-violet-700">
                                {p.personnelCategory.name}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                        {p.phone?.trim() ? <Field label="โทรศัพท์" value={p.phone.trim()} /> : null}
                        <div className="min-w-0">
                          <dt className="text-[10px] font-semibold tracking-wide text-slate-500">เลขบัตรประชาชน</dt>
                          <dd className="mt-0.5 flex flex-wrap items-center gap-2">
                            <span
                              className={`font-mono text-xs font-medium tabular-nums tracking-wide text-[#1e1b4b] ${
                                detailIdRevealed ? "" : "select-none"
                              }`}
                            >
                              {detailIdRevealed ? p.idNumber : maskIdNumber(p.idNumber)}
                            </span>
                            <button
                              type="button"
                              className="rounded px-1 py-0.5 text-[10px] font-bold text-[#4d47b6] hover:bg-[#f5f3ff]"
                              onClick={() => setDetailIdRevealed((v) => !v)}
                            >
                              {detailIdRevealed ? "ซ่อน" : "แสดง"}
                            </button>
                          </dd>
                        </div>
                        {hasInsurance ? (
                          <>
                            {p.insuranceCompany?.trim() ? (
                              <Field label="บริษัทประกัน" value={p.insuranceCompany.trim()} span2 />
                            ) : null}
                            {p.insurancePolicyNumber?.trim() ? (
                              <Field label="เลขกรมธรรม์" value={p.insurancePolicyNumber.trim()} mono />
                            ) : null}
                            {p.insuranceExpiry ? (
                              <Field label="วันหมดอายุ" value={formatInsuranceExpiry(p.insuranceExpiry)} />
                            ) : null}
                            {p.insuranceNotes?.trim() ? (
                              <Field label="หมายเหตุประกัน" value={p.insuranceNotes.trim()} span2 />
                            ) : null}
                          </>
                        ) : null}
                      </dl>

                      {bens.length > 0 ? (
                        <div>
                          <p className="text-[10px] font-semibold tracking-wide text-slate-500">ผู้รับผลประโยชน์</p>
                          <ul className="mt-1 space-y-1">
                            {bens.map((b) => (
                              <li key={b.id} className="text-xs text-[#1e1b4b]">
                                <span className="font-semibold">{b.fullName}</span>
                                {b.relationship ? (
                                  <span className="text-slate-500"> · {b.relationship}</span>
                                ) : null}
                                {b.phone ? <span className="text-slate-500"> · {b.phone}</span> : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {p.remarks?.trim() ? (
                        <div className="rounded-lg bg-amber-50/90 px-2.5 py-2">
                          <p className="text-[10px] font-bold tracking-wide text-amber-800">โน้ตสำคัญ</p>
                          <p className="mt-0.5 max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-amber-950/90">
                            {p.remarks.trim()}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex min-w-0 flex-col gap-3 p-4 sm:p-5">
                      <div className="flex min-h-0 flex-1 flex-col">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[10px] font-semibold tracking-wide text-fuchsia-700">ประวัติภารกิจ</p>
                          {missionHistory && missionHistory.missionCount > 0 ? (
                            <p className="text-[11px] font-bold tabular-nums text-fuchsia-800">
                              {missionHistory.missionCount} ครั้ง · รวมค่าตอบแทน{" "}
                              {formatBaht(missionHistory.compensationTotal)} ฿
                            </p>
                          ) : null}
                        </div>
                        {missionHistoryLoading ? (
                          <p className="mt-2 text-xs text-slate-500">กำลังโหลดประวัติ…</p>
                        ) : !missionHistory || missionHistory.missions.length === 0 ? (
                          <p className="mt-2 text-xs text-slate-500">ยังไม่มีภารกิจที่ผูกกับบุคคลนี้</p>
                        ) : (
                          <ul className="mt-1 max-h-[min(52vh,28rem)] flex-1 divide-y divide-fuchsia-100/80 overflow-y-auto">
                            {missionHistory.missions.map((m) => (
                              <li key={m.assignmentId}>
                                <Link
                                  to={`/missions?summary=${m.missionId}`}
                                  title={[m.code, m.title, m.roleName, m.routeLabel]
                                    .filter(Boolean)
                                    .join(" · ")}
                                  className="flex items-center gap-2 px-0.5 py-1.5 transition hover:bg-fuchsia-50/70"
                                  onClick={() => {
                                    setDetailId(null);
                                    setDetailIdRevealed(false);
                                  }}
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate font-mono text-[10px] font-bold leading-tight text-fuchsia-600">
                                      {m.code ?? "—"}
                                      <span className="ml-1.5 font-sans font-semibold text-[#1e1b4b]">
                                        {m.title ?? "ภารกิจ"}
                                      </span>
                                    </p>
                                    <p className="truncate text-[10px] leading-tight text-slate-500">
                                      {m.roleName}
                                      {m.routeLabel ? ` · ${m.routeLabel}` : ""}
                                    </p>
                                  </div>
                                  <span className="shrink-0 text-[11px] font-bold tabular-nums text-fuchsia-700">
                                    {formatBaht(m.compensationRate)} ฿
                                  </span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="mt-auto flex flex-wrap gap-2 border-t border-[#ebe8f8] pt-3">
                        <button
                          type="button"
                          className={btnPrimary}
                          onClick={() => {
                            setDetailId(null);
                            setDetailIdRevealed(false);
                            openEditPersonnel(p);
                          }}
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          className={btnDanger}
                          onClick={() =>
                            void deletePersonnel(p).then((ok) => {
                              if (ok) {
                                setDetailId(null);
                                setDetailIdRevealed(false);
                              }
                            })
                          }
                        >
                          ลบ
                        </button>
                        <button
                          type="button"
                          className={btnSoft}
                          onClick={() => {
                            setDetailId(null);
                            setDetailIdRevealed(false);
                          }}
                        >
                          ปิด
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </ModalFormBody>
        ) : null}
      </Modal>

      <div className="mt-6 print:hidden">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white/75 py-16 text-center text-slate-600">
            กำลังโหลด…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#dcd8f0] bg-white/70 py-16 text-center text-slate-600">
            ยังไม่มีบุคลากร — กด «เพิ่มบุคลากร»
          </div>
        ) : filteredPersonnel.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white/75 py-16 text-center text-slate-600">
            ไม่มีรายการที่ตรงกับการกรอง
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pagedPersonnel.map((r, idx) => (
              <li key={r.id}>
                <div
                  id={`personnel-card-${r.id}`}
                  role="button"
                  tabIndex={0}
                  className={`${listCardClass} cursor-pointer`}
                  onClick={() => {
                    setDetailIdRevealed(false);
                    setDetailId(r.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setDetailIdRevealed(false);
                      setDetailId(r.id);
                    }
                  }}
                >
                  <span className={`absolute inset-y-0 left-0 w-1 ${listCardAccentClass(idx)}`} aria-hidden />
                  <div className="flex gap-3 pl-2">
                    {r.photoUrl ? (
                      <button
                        type="button"
                        title="ดูรูปใหญ่"
                        className="shrink-0 rounded-full ring-offset-2 ring-offset-white focus:outline-none focus:ring-2 focus:ring-[#0000BF]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxUrl(r.photoUrl);
                          setLightboxTitle(r.fullName);
                        }}
                      >
                        <img
                          src={r.photoUrl}
                          alt=""
                          className="h-14 w-14 rounded-full object-cover hover:opacity-90"
                        />
                      </button>
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#0000BF]/8 text-sm font-bold text-[#4d47b6]">
                        {(r.fullName.trim().charAt(0) || "?").toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[#1e1b4b]">
                        {[r.rank, r.fullName].filter(Boolean).join(" ")}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-600">{r.position ?? "—"}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {r.personnelCategory?.name ? (
                          <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                            {r.personnelCategory.name}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1 pl-2 text-[11px] text-slate-600">
                    <p>
                      <span className="text-slate-500">โทร:</span> {r.phone ?? "—"}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-slate-500">เลขบัตรประชาชน:</span>
                      <span
                        className={`font-mono tabular-nums tracking-wide ${
                          idRevealed[r.id] ? "text-slate-800" : "select-none text-slate-700"
                        }`}
                      >
                        {idRevealed[r.id] ? r.idNumber : maskIdNumber(r.idNumber)}
                      </span>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-[#5b61ff] hover:bg-slate-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIdRevealed((prev) => ({ ...prev, [r.id]: !prev[r.id] }));
                        }}
                      >
                        {idRevealed[r.id] ? "ซ่อน" : "แสดง"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-auto flex flex-wrap gap-2 border-t border-[#ecebff] pt-2.5 pl-2">
                    <button
                      type="button"
                      className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditPersonnel(r);
                      }}
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deletePersonnel(r);
                      }}
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!loading && filteredPersonnel.length > 0 ? (
          <ListPagination
            page={safePage}
            pageCount={pageCount}
            total={filteredPersonnel.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            className="print:hidden"
          />
        ) : null}
      </div>

      <PrintA4Table
        columns={[
          { label: "ชื่อ" },
          { label: "ตำแหน่ง" },
          { label: "หมวด" },
          { label: "โทร" },
        ]}
        rows={filteredPersonnel.map((r) => [
          [r.rank, r.fullName].filter(Boolean).join(" "),
          r.position || "—",
          r.personnelCategory?.name || "—",
          r.phone || "—",
        ])}
      />
    </div>
  );
}
