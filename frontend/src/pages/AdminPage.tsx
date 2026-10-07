import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { apiJson } from "../api/client";
import { Modal, ModalFormActions, ModalFormBody } from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import { PermissionMatrix, permissionSummary } from "../components/PermissionMatrix";
import { fullPermissions, type PermissionMap } from "../lib/permissions";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { listCardAccentClass, listCardClass, toolbarPrimaryBtnClass } from "../lib/uiTokens";

type AdminUserRow = {
  id: string;
  username: string;
  role: "ADMIN" | "OPERATOR";
  fullName: string | null;
  active: boolean;
  permissions: PermissionMap | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  employeeCode: string | null;
  position: string | null;
  affiliation: string | null;
  createdAt: string;
};

function roleLabel(role: AdminUserRow["role"]) {
  return role === "ADMIN" ? "ผู้ดูแลระบบ" : "ผู้ปฏิบัติการ";
}

function formatCreatedAt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

export function AdminPage() {
  const { user, refreshMe } = useAuth();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUserRow | null>(null);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"ADMIN" | "OPERATOR">("OPERATOR");
  const [newFullName, setNewFullName] = useState("");
  const [newPerms, setNewPerms] = useState<PermissionMap>(() => fullPermissions("read"));
  const [createErr, setCreateErr] = useState<string | null>(null);

  const [editUsername, setEditUsername] = useState("");
  const [editFullName, setEditFullName] = useState("");
  const [editRole, setEditRole] = useState<"ADMIN" | "OPERATOR">("OPERATOR");
  const [editActive, setEditActive] = useState(true);
  const [editPassword, setEditPassword] = useState("");
  const [editPerms, setEditPerms] = useState<PermissionMap>(() => fullPermissions("delete"));
  const [editErr, setEditErr] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState("");

  const load = useCallback(async () => {
    setRows(await apiJson<AdminUserRow[]>("/api/admin/users"));
  }, []);

  useEffect(() => {
    if (user?.role === "ADMIN") void load();
  }, [user, load]);

  if (!user || user.role !== "ADMIN") {
    return <Navigate to="/" replace />;
  }

  const currentUser = user;

  function openEdit(r: AdminUserRow) {
    setEditErr(null);
    setEditTarget(r);
    setEditUsername(r.username);
    setEditFullName(r.fullName ?? "");
    setEditRole(r.role);
    setEditActive(r.active);
    setEditPassword("");
    setEditPerms(r.permissions ?? fullPermissions("delete"));
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreateErr(null);
    try {
      const created = await apiJson<AdminUserRow>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          role: newRole,
          fullName: newFullName || null,
          ...(newRole === "OPERATOR" ? { permissions: newPerms } : {}),
        }),
      });
      setNewUsername("");
      setNewPassword("");
      setNewFullName("");
      setNewRole("OPERATOR");
      setNewPerms(fullPermissions("read"));
      setCreateOpen(false);
      setRows((prev) => [...prev, created].sort((a, b) => a.username.localeCompare(b.username, "th")));
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "สร้างไม่สำเร็จ");
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setEditErr(null);
    try {
      const body: Record<string, unknown> = {
        username: editUsername.trim(),
        fullName: editFullName.trim() || null,
        role: editRole,
        active: editActive,
      };
      if (editRole === "OPERATOR") body.permissions = editPerms;
      if (editPassword.trim()) {
        if (editPassword.trim().length < 8) {
          setEditErr("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร");
          return;
        }
        body.password = editPassword.trim();
      }

      const updated = await apiJson<AdminUserRow>(`/api/admin/users/${editTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      if (editTarget.id === currentUser.id) await refreshMe();
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setEditTarget(null);
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function deleteUser(r: AdminUserRow) {
    if (r.id === currentUser.id) return;
    if (!confirm(`ลบผู้ใช้ "${r.username}" ถาวร? การกระทำนี้ย้อนกลับไม่ได้`)) return;
    try {
      await apiJson(`/api/admin/users/${r.id}`, { method: "DELETE" });
      setRows((prev) => prev.filter((x) => x.id !== r.id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  async function toggleActive(r: AdminUserRow) {
    if (r.id === currentUser.id) return;
    const updated = await apiJson<AdminUserRow>(`/api/admin/users/${r.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !r.active }),
    });
    setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
  }

  const editingSelf = editTarget?.id === currentUser.id;

  const pendingCount = rows.filter((r) => r.status === "PENDING").length;
  const filteredRows = useMemo(
    () =>
      rows.filter((r) => r.status === "APPROVED").filter((r) =>
        rowMatchesFilter(listFilter, [
          r.username,
          r.fullName,
          r.employeeCode,
          r.position,
          r.affiliation,
          r.role,
          roleLabel(r.role),
          r.active ? "เปิดใช้งาน" : "ปิดใช้งาน",
        ]),
      ),
    [rows, listFilter],
  );

  return (
    <div>
      <PageHeaderBar
        title="จัดการผู้ใช้"
        count={filteredRows.length}
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "จัดการผู้ใช้ (ผู้ดูแลระบบ)",
          placeholder: "กรองชื่อผู้ใช้ / ชื่อแสดง / บทบาท / สถานะ…",
        }}
        primary={
          <button
            type="button"
            onClick={() => {
              setCreateErr(null);
              setCreateOpen(true);
            }}
            className={toolbarPrimaryBtnClass}
          >
            เพิ่มผู้ใช้
          </button>
        }
      />

      {pendingCount ? (
        <Link
          to="/admin/registrations"
          className="mt-3 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-2 text-sm font-bold text-amber-800 hover:bg-amber-100"
        >
          มีคำขอสมัครสมาชิกรออนุมัติ {pendingCount} รายการ
          <span className="text-[12px]">ตรวจสอบ ›</span>
        </Link>
      ) : null}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="เพิ่มผู้ใช้" size="wide">
        <form onSubmit={createUser}>
          <ModalFormBody>
            {createErr && <p className="text-sm text-rose-600">{createErr}</p>}
            <label className="block">
              <span className="text-xs text-slate-600">ชื่อผู้ใช้</span>
              <input
                required
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">รหัสผ่าน</span>
              <input
                required
                type="password"
                minLength={8}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">ชื่อแสดง</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">บทบาท</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as "ADMIN" | "OPERATOR")}
              >
                <option value="OPERATOR">OPERATOR</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </label>
            <div>
              <p className="mb-1 text-xs font-bold text-slate-600">สิทธิ์การใช้งานข้อมูล</p>
              {newRole === "ADMIN" ? (
                <p className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-[12px] text-indigo-800">ผู้ดูแลระบบใช้งานและแก้ไขได้ทุกส่วน รวมถึงจัดการผู้ใช้</p>
              ) : (
                <PermissionMatrix value={newPerms} onChange={setNewPerms} />
              )}
            </div>
          </ModalFormBody>
          <ModalFormActions>
            <button type="submit" className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] px-4 py-2">
              สร้าง
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
              onClick={() => setCreateOpen(false)}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="แก้ไขผู้ใช้" size="wide">
        <form onSubmit={saveEdit}>
          <ModalFormBody>
            {editErr && <p className="text-sm text-rose-600">{editErr}</p>}
            <label className="block">
              <span className="text-xs text-slate-600">ชื่อผู้ใช้</span>
              <input
                required
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">ชื่อแสดง</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">บทบาท</span>
              <select
                disabled={editingSelf}
                title={editingSelf ? "ไม่สามารถเปลี่ยนบทบาทของตัวเอง" : undefined}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as "ADMIN" | "OPERATOR")}
              >
                <option value="OPERATOR">OPERATOR</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                disabled={editingSelf}
                title={editingSelf ? "ใช้ปิดบัญชีตัวเองไม่ได้" : undefined}
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
                className="rounded border-slate-200"
              />
              <span className="text-sm text-slate-700">เปิดใช้งานบัญชี</span>
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน · อย่างน้อย 8 ตัว)</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
              />
            </label>
            <div>
              <p className="mb-1 text-xs font-bold text-slate-600">สิทธิ์การใช้งานข้อมูล</p>
              {editRole === "ADMIN" ? (
                <p className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-[12px] text-indigo-800">ผู้ดูแลระบบใช้งานและแก้ไขได้ทุกส่วน รวมถึงจัดการผู้ใช้</p>
              ) : (
                <PermissionMatrix value={editPerms} onChange={setEditPerms} />
              )}
            </div>
          </ModalFormBody>
          <ModalFormActions>
            <button type="submit" className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] px-4 py-2">
              บันทึก
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
              onClick={() => setEditTarget(null)}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      <div className="mt-6">
        {rows.length === 0 ? (
          <p className="rounded-[1.25rem] border border-[#e8e6fc] bg-white/75 px-4 py-10 text-center text-sm text-slate-500">
            ยังไม่มีผู้ใช้ในระบบ
          </p>
        ) : filteredRows.length === 0 ? (
          <p className="rounded-[1.25rem] border border-[#e8e6fc] bg-white/75 px-4 py-10 text-center text-sm text-slate-500">
            ไม่มีรายการที่ตรงกับการกรอง
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredRows.map((r, i) => {
              const isSelf = r.id === currentUser.id;
              return (
                <article key={r.id} className={`${listCardClass} p-0`}>
                  <div className={`absolute inset-y-0 left-0 w-1 ${listCardAccentClass(i)}`} />
                  <div className="flex flex-1 flex-col gap-3 p-4 pl-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-black tracking-tight text-[#1e1b4b]">{r.username}</p>
                        <p className="mt-0.5 truncate text-sm text-slate-600">{r.fullName?.trim() || "—"}</p>
                        {r.employeeCode || r.position || r.affiliation ? (
                          <p className="mt-0.5 truncate text-[11.5px] text-slate-500">
                            {[r.employeeCode, r.position, r.affiliation].filter(Boolean).join(" · ")}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                          r.active
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                            : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                        }`}
                      >
                        {r.active ? "ใช้งาน" : "ปิด"}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          r.role === "ADMIN"
                            ? "bg-[#0000BF]/10 text-[#4d47b6]"
                            : "bg-white text-slate-600 ring-1 ring-[#e8e6fc]"
                        }`}
                      >
                        {roleLabel(r.role)}
                      </span>
                      {isSelf ? (
                        <span className="rounded-full bg-[#ec4899]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#be185d]">
                          บัญชีนี้
                        </span>
                      ) : null}
                    </div>

                    <p className="text-[11.5px] text-slate-600">
                      <span className="font-bold text-slate-500">สิทธิ์:</span> {permissionSummary(r.role, r.permissions)}
                    </p>
                    <p className="text-[11px] text-slate-500">สร้างเมื่อ {formatCreatedAt(r.createdAt)}</p>

                    <div className="mt-auto flex flex-wrap gap-1.5 border-t border-[#ecebff] pt-3">
                      <button
                        type="button"
                        className="inline-flex h-7 items-center rounded-lg border border-[#e0ddf8] bg-white px-3 text-[11px] font-bold text-[#4d47b6] shadow-sm transition hover:border-[#0000BF]/30 hover:bg-[#f5f3ff]"
                        onClick={() => openEdit(r)}
                      >
                        แก้ไข
                      </button>
                      {!isSelf ? (
                        <>
                          <button
                            type="button"
                            className="inline-flex h-7 items-center rounded-lg border border-[#e0ddf8] bg-white px-3 text-[11px] font-bold text-slate-600 shadow-sm transition hover:bg-slate-50"
                            onClick={() => void toggleActive(r)}
                          >
                            {r.active ? "ปิดชั่วคราว" : "เปิดใช้งาน"}
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-7 items-center rounded-lg border border-rose-200 bg-rose-50 px-3 text-[11px] font-bold text-rose-600 shadow-sm transition hover:bg-rose-100"
                            onClick={() => void deleteUser(r)}
                          >
                            ลบ
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
