import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../api/client";
import { Modal, ModalFormActions, ModalFormBody, ModalFormSection } from "../components/Modal";
import { PageFilterPrintBar } from "../components/PageFilterPrintBar";
import { SearchableSelect, personnelSelectLabel } from "../components/SearchableSelect";
import { rowMatchesFilter } from "../lib/searchNormalize";
import type { Personnel, TrainingCourse, TrainingEnrollment, TrainingResultStatus } from "../types";

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
        {err && <p className="text-sm text-rose-400">{err}</p>}
        <form onSubmit={add} className="flex gap-2">
          <input
            placeholder="ชื่อหลักสูตรใหม่"
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await loadLists();
    } finally {
      setLoading(false);
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
      await loadLists();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">ทะเบียนการอบรม</h1>
          <p className="mt-1 text-slate-400">
            เชื่อมกับบุคลากร ระบุหลักสูตร วันเริ่ม–สิ้นสุดอบรม และสถานะผ่าน/ไม่ผ่าน — รายชื่อลิงก์ไปหน้าบุคลากร
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCourseModal(true)}
            className="rounded-lg border border-slate-600 px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            จัดการหลักสูตร
          </button>
          <button
            type="button"
            onClick={() => void openAdd()}
            className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/25 hover:bg-teal-500"
          >
            เพิ่มทะเบียนอบรม
          </button>
        </div>
      </div>

      <PageFilterPrintBar
        value={listFilter}
        onChange={setListFilter}
        printTitle="ทะเบียนการอบรม"
        placeholder="กรองชื่อบุคลากร / หลักสูตร / สถานะ / วันที่…"
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
                <span className="text-xs font-medium text-slate-400">บุคลากร</span>
                <p className="mt-0.5 text-[11px] text-slate-500">คลิกช่องแล้วพิมพ์เพื่อค้นหา ยศ / ชื่อ / ตำแหน่ง / หน่วย</p>
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
                <span className="text-xs font-medium text-slate-400">หลักสูตร</span>
                <p className="mt-0.5 text-[11px] text-slate-500">คลิกช่องแล้วพิมพ์เพื่อค้นหาชื่อหลักสูตร</p>
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
                  <span className="text-xs font-medium text-slate-400">วันเริ่มอบรม</span>
                  <input
                    type="date"
                    required
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-400">วันสิ้นสุดอบรม</span>
                  <input
                    type="date"
                    required
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                  />
                </label>
              </div>
              <div className="mt-3">
                <span className="text-xs font-medium text-slate-400">สถานะ</span>
                <div className="mt-2 flex flex-wrap gap-4">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
                    <input
                      type="radio"
                      name="train-status"
                      checked={formStatus === "PASSED"}
                      onChange={() => setFormStatus("PASSED")}
                    />
                    ผ่าน
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
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
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500"
            >
              บันทึก
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              onClick={closeForm}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
            <tr>
              <th className="p-3">รายชื่อบุคคล</th>
              <th className="p-3">หลักสูตร</th>
              <th className="p-3">วันเริ่มอบรม</th>
              <th className="p-3">วันสิ้นสุดอบรม</th>
              <th className="p-3">สถานะ</th>
              <th className="w-32 p-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="p-6 text-slate-500">
                  กำลังโหลด…
                </td>
              </tr>
            ) : enrollments.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-slate-500">
                  ยังไม่มีทะเบียน — กด «เพิ่มทะเบียนอบรม» หรือเพิ่มหลักสูตรก่อน
                </td>
              </tr>
            ) : filteredEnrollments.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-slate-500">
                  ไม่มีรายการที่ตรงกับการกรอง
                </td>
              </tr>
            ) : (
              filteredEnrollments.map((row) => (
                <tr key={row.id} className="border-b border-slate-800/80">
                  <td className="p-3">
                    <Link
                      to={`/personnel?highlight=${row.personnelId}`}
                      className="font-medium text-teal-400 hover:text-teal-300 hover:underline"
                    >
                      {personnelSelectLabel(row.personnel)}
                    </Link>
                  </td>
                  <td className="p-3 text-slate-300">{row.trainingCourse.name}</td>
                  <td className="p-3 tabular-nums text-slate-300">
                    {new Date(row.trainingStartDate).toLocaleDateString("th-TH", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="p-3 tabular-nums text-slate-300">
                    {new Date(row.trainingEndDate).toLocaleDateString("th-TH", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="p-3">
                    <span
                      className={
                        row.status === "PASSED"
                          ? "inline-flex rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400"
                          : "inline-flex rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-medium text-rose-400"
                      }
                    >
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="rounded-md border border-slate-600 px-2 py-1 text-xs text-teal-400 hover:bg-slate-800"
                        onClick={() => void openEdit(row)}
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-600 px-2 py-1 text-xs text-rose-400 hover:bg-slate-800"
                        onClick={() => void removeRow(row)}
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
