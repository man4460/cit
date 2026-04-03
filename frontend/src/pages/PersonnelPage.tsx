import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiJson, apiUrl, authHeader } from "../api/client";
import { ImageLightbox } from "../components/ImageLightbox";
import { Modal, ModalFormActions, ModalFormBody, ModalFormSection } from "../components/Modal";
import { PageFilterPrintBar } from "../components/PageFilterPrintBar";
import { rowMatchesFilter } from "../lib/searchNormalize";
import type { OrganizationUnitType, Personnel, PersonnelCategory } from "../types";

type BeneficiaryFormRow = { fullName: string; relationship: string; phone: string; idNumber: string };

type MasterRow = { id: string; name: string; sortOrder: number };

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
        {err && <p className="text-sm text-rose-400">{err}</p>}
        <form onSubmit={add} className="flex gap-2">
        <input
          placeholder="ชื่อใหม่"
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="shrink-0 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white">
          เพิ่ม
        </button>
        </form>
        {editing ? (
        <form onSubmit={saveEdit} className="rounded-lg border border-teal-900/40 bg-slate-950/50 p-3">
          <p className="text-xs text-slate-500">แก้ไข</p>
          <input
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <button type="submit" className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm text-white">
              บันทึก
            </button>
            <button type="button" className="text-sm text-slate-400" onClick={() => setEditing(null)}>
              ยกเลิก
            </button>
          </div>
        </form>
        ) : null}
        <ul className="max-h-64 space-y-2 overflow-y-auto">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm"
          >
            <span className="truncate text-slate-200">{r.name}</span>
            <span className="flex shrink-0 gap-1">
              <button
                type="button"
                className="rounded px-2 py-0.5 text-xs text-teal-400 hover:bg-slate-800"
                onClick={() => {
                  setEditing(r);
                  setEditName(r.name);
                }}
              >
                แก้ไข
              </button>
              <button
                type="button"
                className="rounded px-2 py-0.5 text-xs text-rose-400 hover:bg-slate-800"
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
  const [orgUnits, setOrgUnits] = useState<OrganizationUnitType[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [masterModal, setMasterModal] = useState<"category" | "org" | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxTitle, setLightboxTitle] = useState<string | null>(null);
  /** แสดงเลขประจำตัวจริงต่อแถว (คลิกปุ่มแสดง) */
  const [idRevealed, setIdRevealed] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState("");

  const [form, setForm] = useState({
    fullName: "",
    idNumber: "",
    rank: "",
    position: "",
    phone: "",
    personnelCategoryId: "",
    organizationUnitTypeId: "",
    insuranceCompany: "",
    insurancePolicyNumber: "",
    insuranceExpiry: "",
    insuranceNotes: "",
    remarks: "",
  });
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryFormRow[]>([emptyBeneficiary()]);

  const filteredPersonnel = useMemo(
    () =>
      rows.filter((r) =>
        rowMatchesFilter(listFilter, [
          r.fullName,
          r.rank,
          r.position,
          r.organizationUnitType?.name,
          r.personnelCategory?.name,
          r.phone,
          r.idNumber,
        ]),
      ),
    [rows, listFilter],
  );

  const loadLists = useCallback(async () => {
    const [p, c, o] = await Promise.all([
      apiJson<Personnel[]>("/api/personnel"),
      apiJson<PersonnelCategory[]>("/api/personnel-categories"),
      apiJson<OrganizationUnitType[]>("/api/organization-unit-types"),
    ]);
    setRows(p);
    setCategories(c);
    setOrgUnits(o);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
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
    const el = document.getElementById(`personnel-row-${highlightId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-teal-500", "ring-offset-2", "ring-offset-slate-950", "rounded-lg");
    if (highlightClearRef.current) clearTimeout(highlightClearRef.current);
    highlightClearRef.current = setTimeout(() => {
      el.classList.remove("ring-2", "ring-teal-500", "ring-offset-2", "ring-offset-slate-950", "rounded-lg");
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
      rank: "",
      position: "",
      phone: "",
      personnelCategoryId: "",
      organizationUnitTypeId: orgUnits[0]?.id ?? "",
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

  useEffect(() => {
    if (modalOpen && orgUnits.length && !form.organizationUnitTypeId) {
      setForm((f) => ({ ...f, organizationUnitTypeId: orgUnits[0].id }));
    }
  }, [modalOpen, orgUnits, form.organizationUnitTypeId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.organizationUnitTypeId) {
      alert("เลือกประเภทหน่วยงาน หรือเพิ่มรายการในจัดการข้อมูล master");
      return;
    }

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
    fd.append("rank", form.rank);
    fd.append("position", form.position);
    fd.append("phone", form.phone);
    if (form.personnelCategoryId) fd.append("personnelCategoryId", form.personnelCategoryId);
    fd.append("organizationUnitTypeId", form.organizationUnitTypeId);
    fd.append("insuranceCompany", form.insuranceCompany);
    fd.append("insurancePolicyNumber", form.insurancePolicyNumber);
    if (form.insuranceExpiry) fd.append("insuranceExpiry", form.insuranceExpiry);
    fd.append("insuranceNotes", form.insuranceNotes);
    fd.append("remarks", form.remarks);
    fd.append("beneficiaries", JSON.stringify(benPayload));

    const input = document.getElementById("personnel-photo-input") as HTMLInputElement | null;
    if (input?.files?.[0]) fd.append("photo", input.files[0]);

    const url = editingId ? apiUrl(`/api/personnel/${editingId}`) : apiUrl("/api/personnel");
    const method = editingId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { ...authHeader() },
      body: fd,
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? res.statusText);
      return;
    }
    resetForm();
    closeAddModal();
    load();
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
      rank: r.rank ?? "",
      position: r.position ?? "",
      phone: r.phone ?? "",
      personnelCategoryId: r.personnelCategoryId ?? "",
      organizationUnitTypeId: r.organizationUnitTypeId ?? orgUnits[0]?.id ?? "",
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

  async function deletePersonnel(r: Personnel) {
    if (!confirm(`ลบบุคลากร «${r.fullName}» ? การดำเนินการนี้ไม่สามารถย้อนกลับได้`)) return;
    try {
      await apiJson(`/api/personnel/${r.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">บุคลากร</h1>
          <p className="mt-1 text-slate-400">ข้อมูล ยศ ตำแหน่ง ประเภท ประกัน และผู้รับผลประโยชน์</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMasterModal("category")}
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            จัดการประเภทบุคลากร
          </button>
          <button
            type="button"
            onClick={() => setMasterModal("org")}
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            จัดการประเภทหน่วยงาน
          </button>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setEditingId(null);
              setModalOpen(true);
            }}
            className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/25 hover:bg-teal-500"
          >
            เพิ่มบุคลากร
          </button>
        </div>
      </div>

      <PageFilterPrintBar
        value={listFilter}
        onChange={setListFilter}
        printTitle="บุคลากร"
        placeholder="กรองชื่อ / ยศ / ตำแหน่ง / หน่วย / ประเภท / โทร / เลขประจำตัว…"
      />

      <MasterDataModal
        open={masterModal === "category"}
        onClose={() => setMasterModal(null)}
        title="ประเภทบุคลากร (เพิ่ม / แก้ไข / ลบ)"
        apiPath="/api/personnel-categories"
        onChanged={loadLists}
      />
      <MasterDataModal
        open={masterModal === "org"}
        onClose={() => setMasterModal(null)}
        title="ประเภทหน่วยงาน (เพิ่ม / แก้ไข / ลบ)"
        apiPath="/api/organization-unit-types"
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
                    className="rounded-full border-2 border-teal-600/40 shadow-lg ring-offset-2 ring-offset-slate-900 transition hover:ring-2 hover:ring-teal-500/50 focus:outline-none focus:ring-2 focus:ring-teal-500"
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
                    className="mt-4 cursor-pointer text-sm font-medium text-teal-400 hover:underline"
                  >
                    เปลี่ยนรูป
                  </label>
                  <span className="mt-1 text-center text-xs text-slate-500">คลิกที่รูปเพื่อดูขนาดใหญ่ · JPG, PNG</span>
                </div>
              ) : (
                <label
                  htmlFor="personnel-photo-input"
                  className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-600 bg-gradient-to-b from-slate-900/80 to-slate-950 px-8 py-10 transition hover:border-teal-500/60 hover:from-slate-800/50 hover:shadow-lg hover:shadow-teal-900/10"
                >
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-teal-600/15 text-teal-400 ring-2 ring-teal-500/30 transition group-hover:bg-teal-500/20 group-hover:text-teal-300">
                    <CameraIcon className="h-12 w-12" />
                  </div>
                  <span className="mt-4 text-center text-sm font-medium text-slate-300 group-hover:text-white">
                    แตะเพื่ออัปโหลดรูป
                  </span>
                  <span className="mt-1 text-center text-xs text-slate-500">JPG, PNG — สูงสุดตามที่เซิร์ฟเวอร์กำหนด</span>
                </label>
              )}
            </div>
          </ModalFormSection>

          <ModalFormSection title="ข้อมูลทั่วไป">
            <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-400">ชื่อ–นามสกุล</span>
              <input
                required
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-400">เลขประจำตัว</span>
              <input
                required
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={form.idNumber}
                onChange={(e) => setForm((f) => ({ ...f, idNumber: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-400">ยศ</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={form.rank}
                onChange={(e) => setForm((f) => ({ ...f, rank: e.target.value }))}
                placeholder="เช่น ร.ต.ต."
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-400">ตำแหน่ง</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-400">โทรศัพท์</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-400">ประเภท (บุคลากร)</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={form.personnelCategoryId}
                onChange={(e) => setForm((f) => ({ ...f, personnelCategoryId: e.target.value }))}
              >
                <option value="">— เลือก —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-slate-400">ประเภทหน่วยงาน</span>
              <select
                required
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={form.organizationUnitTypeId}
                onChange={(e) => setForm((f) => ({ ...f, organizationUnitTypeId: e.target.value }))}
              >
                <option value="">— เลือก —</option>
                {orgUnits.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            </div>
          </ModalFormSection>

          <ModalFormSection title="กรมธรรม์ประกันภัย">
            <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-400">บริษัทประกัน</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={form.insuranceCompany}
                onChange={(e) => setForm((f) => ({ ...f, insuranceCompany: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-400">เลขกรมธรรม์ / เลขกรมธรรม์หลัก</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={form.insurancePolicyNumber}
                onChange={(e) => setForm((f) => ({ ...f, insurancePolicyNumber: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-400">วันหมดอายุ (ถ้ามี)</span>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={form.insuranceExpiry}
                onChange={(e) => setForm((f) => ({ ...f, insuranceExpiry: e.target.value }))}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-slate-400">รายละเอียดกรมธรรม์ / หมายเหตุ</span>
              <textarea
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
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
                className="text-xs text-teal-400 hover:underline"
                onClick={() => setBeneficiaries((b) => [...b, emptyBeneficiary()])}
              >
                + เพิ่มคน
              </button>
            </div>
            <div className="space-y-3">
              {beneficiaries.map((b, idx) => (
                <div
                  key={idx}
                  className="grid gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3 sm:grid-cols-2"
                >
                  <input
                    placeholder="ชื่อ–สกุลผู้รับผลประโยชน์ *"
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white sm:col-span-2"
                    value={b.fullName}
                    onChange={(e) => {
                      const next = [...beneficiaries];
                      next[idx] = { ...b, fullName: e.target.value };
                      setBeneficiaries(next);
                    }}
                  />
                  <input
                    placeholder="ความสัมพันธ์"
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    value={b.relationship}
                    onChange={(e) => {
                      const next = [...beneficiaries];
                      next[idx] = { ...b, relationship: e.target.value };
                      setBeneficiaries(next);
                    }}
                  />
                  <input
                    placeholder="โทรศัพท์"
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    value={b.phone}
                    onChange={(e) => {
                      const next = [...beneficiaries];
                      next[idx] = { ...b, phone: e.target.value };
                      setBeneficiaries(next);
                    }}
                  />
                  <input
                    placeholder="เลขประจำตัว (ถ้ามี)"
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white sm:col-span-2"
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
                      className="text-left text-xs text-rose-400 sm:col-span-2"
                      onClick={() => setBeneficiaries((rows) => rows.filter((_, i) => i !== idx))}
                    >
                      ลบแถวนี้
                    </button>
                  )}
                </div>
              ))}
            </div>
          </ModalFormSection>

          <ModalFormSection title="หมายเหตุ">
            <label className="block">
              <span className="text-xs font-medium text-slate-400">หมายเหตุทั่วไป</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={form.remarks}
                onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
              />
            </label>
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

      <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
            <tr>
              <th className="p-3">รูป</th>
              <th className="p-3">ยศ</th>
              <th className="p-3">ชื่อ</th>
              <th className="p-3">ตำแหน่ง</th>
              <th className="p-3">หน่วยงาน</th>
              <th className="p-3">ประเภท</th>
              <th className="p-3">โทร</th>
              <th className="min-w-[200px] p-3">เลขประจำตัว</th>
              <th className="w-32 p-3">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="p-6 text-slate-500">
                  กำลังโหลด…
                </td>
              </tr>
            ) : filteredPersonnel.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-6 text-slate-500">
                  ไม่มีรายการที่ตรงกับการกรอง
                </td>
              </tr>
            ) : (
              filteredPersonnel.map((r) => (
                <tr key={r.id} id={`personnel-row-${r.id}`} className="border-b border-slate-800/80">
                  <td className="p-3">
                    {r.photoUrl ? (
                      <button
                        type="button"
                        title="ดูรูปใหญ่"
                        className="rounded-full ring-offset-2 ring-offset-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        onClick={() => {
                          setLightboxUrl(r.photoUrl);
                          setLightboxTitle(r.fullName);
                        }}
                      >
                        <img src={r.photoUrl} alt="" className="h-10 w-10 rounded-full object-cover hover:opacity-90" />
                      </button>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="p-3 text-slate-400">{r.rank ?? "—"}</td>
                  <td className="p-3 font-medium text-white">{r.fullName}</td>
                  <td className="p-3 text-slate-400">{r.position ?? "—"}</td>
                  <td className="p-3 text-slate-400">{r.organizationUnitType?.name ?? "—"}</td>
                  <td className="p-3 text-slate-400">{r.personnelCategory?.name ?? "—"}</td>
                  <td className="p-3 text-slate-400">{r.phone ?? "—"}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`min-w-[6rem] font-mono text-sm tabular-nums tracking-wide ${
                          idRevealed[r.id] ? "text-slate-200" : "text-slate-500"
                        } ${idRevealed[r.id] ? "" : "select-none"}`}
                      >
                        {idRevealed[r.id] ? r.idNumber : maskIdNumber(r.idNumber)}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 rounded-md border border-slate-600 px-2 py-1 text-[11px] font-medium text-teal-400 hover:bg-slate-800 hover:text-teal-300"
                        onClick={() =>
                          setIdRevealed((prev) => ({ ...prev, [r.id]: !prev[r.id] }))
                        }
                      >
                        {idRevealed[r.id] ? "ซ่อน" : "แสดง"}
                      </button>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        className="text-left text-xs font-medium text-teal-400 hover:text-teal-300"
                        onClick={() => openEditPersonnel(r)}
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        className="text-left text-xs text-rose-400 hover:text-rose-300"
                        onClick={() => void deletePersonnel(r)}
                      >
                        ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
