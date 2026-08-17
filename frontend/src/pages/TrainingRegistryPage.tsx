import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../api/client";
import { DetailField } from "../components/DetailField";
import { Modal, ModalFormActions, ModalFormBody, ModalFormSection } from "../components/Modal";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { PrintA4Table } from "../components/PrintA4Table";
import { SearchableSelect, personnelSelectLabel } from "../components/SearchableSelect";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { listCardAccentClass, listCardClass, toolbarMasterBtnClass, toolbarMasterGroupClass, toolbarPrimaryBtnClass } from "../lib/uiTokens";
import type { Personnel, TrainingCourse, TrainingEnrollment, TrainingResultStatus } from "../types";
import type { LoadOptions } from "../lib/loadOptions";
import { setLoadBusy } from "../lib/loadOptions";

type MasterRow = { id: string; name: string; sortOrder: number };

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
            placeholder="ชื่อหลักสูตรใหม่"
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

function dateToInputValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function inputValueToIso(dateStr: string) {
  const [y, mo, da] = dateStr.split("-").map((x) => Number(x));
  if (!y || !mo || !da) return "";
  return new Date(y, mo - 1, da, 12, 0, 0).toISOString();
}

function statusLabel(s: TrainingResultStatus) {
  return s === "PASSED" ? "ผ่าน" : "ไม่ผ่าน";
}

function formatThDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function TrainingRegistryPage() {
  const [enrollments, setEnrollments] = useState<TrainingEnrollment[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [courseModal, setCourseModal] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formPersonnelId, setFormPersonnelId] = useState("");
  const [formCourseId, setFormCourseId] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formStatus, setFormStatus] = useState<TrainingResultStatus>("PASSED");
  const [listFilter, setListFilter] = useState("");
  const [detail, setDetail] = useState<TrainingEnrollment | null>(null);

  const filteredEnrollments = useMemo(
    () =>
      enrollments.filter((row) =>
        rowMatchesFilter(listFilter, [
          personnelSelectLabel(row.personnel),
          row.trainingCourse.name,
          statusLabel(row.status),
          new Date(row.trainingStartDate).toLocaleDateString("th-TH"),
          new Date(row.trainingEndDate).toLocaleDateString("th-TH"),
        ]),
      ),
    [enrollments, listFilter],
  );

  const personnelOptions = useMemo(
    () =>
      personnel.map((p) => ({
        value: p.id,
        label: personnelSelectLabel(p),
        keywords: `${p.position ?? ""} ${p.phone ?? ""} ${p.personnelCategory?.name ?? ""} ${p.organizationUnitType?.name ?? ""}`,
      })),
    [personnel],
  );

  const courseOptions = useMemo(
    () => courses.map((c) => ({ value: c.id, label: c.name })),
    [courses],
  );

  const loadLists = useCallback(async () => {
    const [e, p, c] = await Promise.all([
      apiJson<TrainingEnrollment[]>("/api/training-enrollments"),
      apiJson<Personnel[]>("/api/personnel"),
      apiJson<TrainingCourse[]>("/api/training-courses"),
    ]);
    setEnrollments(e);
    setPersonnel(p);
    setCourses(c);
    return { personnel: p, courses: c };
  }, []);

  const load = useCallback(async (opts?: LoadOptions) => {
    setLoadBusy(setLoading, opts, true);
    try {
      await loadLists();
    } finally {
      setLoadBusy(setLoading, opts, false);
    }
  }, [loadLists]);

  useEffect(() => {
    void load();
  }, [load]);

  function todayInput() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  async function openAdd() {
    try {
      const { personnel: p, courses: c } = await loadLists();
      setEditingId(null);
      setFormPersonnelId("");
      setFormCourseId(c[0]?.id ?? "");
      const t = todayInput();
      setFormStartDate(t);
      setFormEndDate(t);
      setFormStatus("PASSED");
      setFormOpen(true);
      if (p.length === 0) {
        alert("ยังไม่มีบุคลากรในระบบ — ไปเพิ่มที่เมนู «บุคลากร» ก่อน");
      } else if (c.length === 0) {
        alert("ยังไม่มีหลักสูตร — กด «จัดการหลักสูตร» เพื่อเพิ่มชื่อหลักสูตรก่อน");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "โหลดรายการไม่สำเร็จ");
    }
  }

  async function openEdit(row: TrainingEnrollment) {
    try {
      await loadLists();
      setDetail(null);
      setEditingId(row.id);
      setFormPersonnelId(row.personnelId);
      setFormCourseId(row.trainingCourseId);
      setFormStartDate(dateToInputValue(row.trainingStartDate));
      setFormEndDate(dateToInputValue(row.trainingEndDate));
      setFormStatus(row.status);
      setFormOpen(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "โหลดรายการไม่สำเร็จ");
    }
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
  }

  async function onSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    const startIso = inputValueToIso(formStartDate);
    const endIso = inputValueToIso(formEndDate);
    if (!startIso) {
      alert("ระบุวันเริ่มอบรม");
      return;
    }
    if (!endIso) {
      alert("ระบุวันสิ้นสุดอบรม");
      return;
    }
    if (!formPersonnelId) {
      alert("เลือกบุคลากร");
      return;
    }
    if (!formCourseId) {
      alert("เลือกหลักสูตร — หรือเพิ่มหลักสูตรจากปุ่มจัดการหลักสูตร");
      return;
    }
    const body = JSON.stringify({
      personnelId: formPersonnelId,
      trainingCourseId: formCourseId,
      trainingStartDate: startIso,
      trainingEndDate: endIso,
      status: formStatus,
    });
    try {
      if (editingId) {
        await apiJson(`/api/training-enrollments/${editingId}`, { method: "PATCH", body });
      } else {
        await apiJson("/api/training-enrollments", { method: "POST", body });
      }
      closeForm();
      await loadLists();
    } catch (err) {
      alert(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function removeRow(row: TrainingEnrollment) {
    if (!confirm(`ลบทะเบียนอบรมของ ${personnelSelectLabel(row.personnel)} ?`)) return;
    try {
      await apiJson(`/api/training-enrollments/${row.id}`, { method: "DELETE" });
      setDetail(null);
      await loadLists();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  return (
    <div>
      <PageHeaderBar
        title="ทะเบียนการอบรม"
        count={filteredEnrollments.length}
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "ทะเบียนการอบรม",
          placeholder: "กรองชื่อบุคลากร / หลักสูตร / สถานะ / วันที่…",
        }}
        masters={
          <div className={toolbarMasterGroupClass}>
            <button type="button" onClick={() => setCourseModal(true)} className={toolbarMasterBtnClass}>
              หลักสูตร
            </button>
          </div>
        }
        primary={
          <button type="button" onClick={() => void openAdd()} className={toolbarPrimaryBtnClass}>
            เพิ่มทะเบียน
          </button>
        }
      />

      <MasterDataModal
        open={courseModal}
        onClose={() => setCourseModal(false)}
        title="หลักสูตร (เพิ่ม / แก้ไข / ลบ)"
        apiPath="/api/training-courses"
        onChanged={loadLists}
      />

      <Modal open={formOpen} onClose={closeForm} title={editingId ? "แก้ไขทะเบียนอบรม" : "เพิ่มทะเบียนอบรม"}>
        <form onSubmit={onSubmitForm}>
          <ModalFormBody>
            <ModalFormSection title="ข้อมูล">
              <div className="block">
                <span className="text-xs font-medium text-slate-700">บุคลากร</span>
                <p className="mt-0.5 text-[11px] text-slate-600">คลิกช่องแล้วพิมพ์เพื่อค้นหา ยศ / ชื่อ / ตำแหน่ง / หน่วย</p>
                <SearchableSelect
                  value={formPersonnelId}
                  onChange={setFormPersonnelId}
                  options={personnelOptions}
                  emptyLabel="— เลือกบุคลากร —"
                  allowEmpty
                />
                {personnel.length === 0 ? (
                  <p className="mt-1 text-xs text-amber-400/90">ไม่มีรายชื่อบุคลากร — เพิ่มที่เมนู «บุคลากร»</p>
                ) : null}
              </div>
              <div className="mt-3 block">
                <span className="text-xs font-medium text-slate-700">หลักสูตร</span>
                <p className="mt-0.5 text-[11px] text-slate-600">คลิกช่องแล้วพิมพ์เพื่อค้นหาชื่อหลักสูตร</p>
                <SearchableSelect
                  value={formCourseId}
                  onChange={setFormCourseId}
                  options={courseOptions}
                  emptyLabel="— เลือกหลักสูตร —"
                  allowEmpty
                />
                {courses.length === 0 ? (
                  <p className="mt-1 text-xs text-amber-400/90">ไม่มีหลักสูตร — ใช้ปุ่ม «จัดการหลักสูตร» เพื่อเพิ่ม</p>
                ) : null}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">วันเริ่มอบรม</span>
                  <input
                    type="date"
                    required
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">วันสิ้นสุดอบรม</span>
                  <input
                    type="date"
                    required
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                  />
                </label>
              </div>
              <div className="mt-3">
                <span className="text-xs font-medium text-slate-700">สถานะ</span>
                <div className="mt-2 flex flex-wrap gap-4">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                    <input
                      type="radio"
                      name="train-status"
                      checked={formStatus === "PASSED"}
                      onChange={() => setFormStatus("PASSED")}
                    />
                    ผ่าน
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                    <input
                      type="radio"
                      name="train-status"
                      checked={formStatus === "FAILED"}
                      onChange={() => setFormStatus("FAILED")}
                    />
                    ไม่ผ่าน
                  </label>
                </div>
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
              onClick={closeForm}
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
        ) : enrollments.length === 0 ? (
          <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">
            ยังไม่มีทะเบียน — กด «เพิ่มทะเบียนอบรม» หรือเพิ่มหลักสูตรก่อน
          </div>
        ) : filteredEnrollments.length === 0 ? (
          <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">
            ไม่มีรายการที่ตรงกับการกรอง
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredEnrollments.map((row, idx) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setDetail(row)}
                  className={`${listCardClass} w-full cursor-pointer text-left transition hover:border-[#0000BF]/35`}
                >
                  <span className={`absolute inset-y-0 left-0 w-1 ${listCardAccentClass(idx)}`} aria-hidden />
                  <div className="min-w-0 flex-1 pl-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-bold text-[#1e1b4b]">
                        {personnelSelectLabel(row.personnel)}
                      </p>
                      <span
                        className={
                          row.status === "PASSED"
                            ? "shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700"
                            : "shrink-0 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-700"
                        }
                      >
                        {statusLabel(row.status)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs font-medium text-[#4d47b6]">{row.trainingCourse.name}</p>
                    <p className="mt-2 text-[11px] text-slate-600">
                      {formatThDate(row.trainingStartDate)}
                      <span className="mx-1 text-[#8b5cf6]">→</span>
                      {formatThDate(row.trainingEndDate)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? personnelSelectLabel(detail.personnel) : "รายละเอียดการอบรม"}
        size="form"
      >
        {detail ? (
          <>
            <ModalFormBody>
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailField label="บุคลากร" value={personnelSelectLabel(detail.personnel)} className="sm:col-span-2" />
                <DetailField
                  label="ตำแหน่ง"
                  value={detail.personnel.position || "—"}
                />
                <DetailField
                  label="หน่วยงาน"
                  value={detail.personnel.organizationUnitType?.name || "—"}
                />
                <DetailField label="หลักสูตร" value={detail.trainingCourse.name} className="sm:col-span-2" />
                <DetailField label="วันเริ่มอบรม" value={formatThDate(detail.trainingStartDate)} />
                <DetailField label="วันสิ้นสุดอบรม" value={formatThDate(detail.trainingEndDate)} />
                <DetailField
                  label="ผลการอบรม"
                  value={
                    <span
                      className={
                        detail.status === "PASSED"
                          ? "font-bold text-emerald-700"
                          : "font-bold text-rose-700"
                      }
                    >
                      {statusLabel(detail.status)}
                    </span>
                  }
                />
              </div>
            </ModalFormBody>
            <ModalFormActions>
              <Link
                to={`/personnel?highlight=${detail.personnelId}`}
                className="rounded-lg border border-[#0000BF]/25 bg-[#0000BF]/8 px-3 py-2 text-sm font-medium text-[#0000BF] hover:bg-[#0000BF]/12"
                onClick={() => setDetail(null)}
              >
                ไปหน้าบุคลากร
              </Link>
              <button
                type="button"
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
                onClick={() => void openEdit(detail)}
              >
                แก้ไข
              </button>
              <button
                type="button"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-100"
                onClick={() => void removeRow(detail)}
              >
                ลบ
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => setDetail(null)}
              >
                ปิด
              </button>
            </ModalFormActions>
          </>
        ) : null}
      </Modal>

      <PrintA4Table
        columns={[
          { label: "บุคลากร" },
          { label: "หลักสูตร" },
          { label: "เริ่ม" },
          { label: "สิ้นสุด" },
          { label: "ผล" },
        ]}
        rows={filteredEnrollments.map((row) => [
          personnelSelectLabel(row.personnel),
          row.trainingCourse.name,
          formatThDate(row.trainingStartDate),
          formatThDate(row.trainingEndDate),
          statusLabel(row.status),
        ])}
      />
    </div>
  );
}
