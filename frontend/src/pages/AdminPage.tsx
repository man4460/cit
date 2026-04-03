import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiJson } from "../api/client";
import { Modal, ModalFormActions, ModalFormBody } from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import { PageFilterPrintBar } from "../components/PageFilterPrintBar";
import { rowMatchesFilter } from "../lib/searchNormalize";

type AdminUserRow = {
  id: string;
  username: string;
  role: "ADMIN" | "OPERATOR";
  fullName: string | null;
  active: boolean;
  createdAt: string;
};

export function AdminPage() {
  const { user, refreshMe } = useAuth();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUserRow | null>(null);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"ADMIN" | "OPERATOR">("OPERATOR");
  const [newFullName, setNewFullName] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);

  const [editUsername, setEditUsername] = useState("");
  const [editFullName, setEditFullName] = useState("");
  const [editRole, setEditRole] = useState<"ADMIN" | "OPERATOR">("OPERATOR");
  const [editActive, setEditActive] = useState(true);
  const [editPassword, setEditPassword] = useState("");
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
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreateErr(null);
    try {
      await apiJson("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          role: newRole,
          fullName: newFullName || null,
        }),
      });
      setNewUsername("");
      setNewPassword("");
      setNewFullName("");
      setNewRole("OPERATOR");
      setCreateOpen(false);
      load();
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
      if (editPassword.trim()) body.password = editPassword.trim();

      await apiJson(`/api/admin/users/${editTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      if (editTarget.id === currentUser.id) await refreshMe();
      setEditTarget(null);
      load();
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function deleteUser(r: AdminUserRow) {
    if (r.id === currentUser.id) return;
    if (!confirm(`ลบผู้ใช้ "${r.username}" ถาวร? การกระทำนี้ย้อนกลับไม่ได้`)) return;
    try {
      await apiJson(`/api/admin/users/${r.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  async function toggleActive(r: AdminUserRow) {
    if (r.id === currentUser.id) return;
    await apiJson(`/api/admin/users/${r.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !r.active }),
    });
    load();
  }

  const editingSelf = editTarget?.id === currentUser.id;

  const filteredRows = useMemo(
    () =>
      rows.filter((r) =>
        rowMatchesFilter(listFilter, [
          r.username,
          r.fullName,
          r.role,
          r.active ? "เปิดใช้งาน" : "ปิดใช้งาน",
        ]),
      ),
    [rows, listFilter],
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">จัดการผู้ใช้ (Admin)</h1>
          <p className="mt-1 text-slate-400">สร้าง แก้ไข ลบบัญชี และเปิด/ปิดการใช้งาน</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateErr(null);
            setCreateOpen(true);
          }}
          className="shrink-0 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/25 hover:bg-teal-500"
        >
          เพิ่มผู้ใช้
        </button>
      </div>

      <PageFilterPrintBar
        value={listFilter}
        onChange={setListFilter}
        printTitle="จัดการผู้ใช้ (Admin)"
        placeholder="กรองชื่อผู้ใช้ / ชื่อแสดง / บทบาท / สถานะ…"
      />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="เพิ่มผู้ใช้">
        <form onSubmit={createUser}>
          <ModalFormBody>
            {createErr && <p className="text-sm text-rose-400">{createErr}</p>}
            <label className="block">
              <span className="text-xs text-slate-400">ชื่อผู้ใช้</span>
              <input
                required
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">รหัสผ่าน</span>
              <input
                required
                type="password"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">ชื่อแสดง</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">บทบาท</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as "ADMIN" | "OPERATOR")}
              >
                <option value="OPERATOR">OPERATOR</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </label>
          </ModalFormBody>
          <ModalFormActions>
            <button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white">
              สร้าง
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300"
              onClick={() => setCreateOpen(false)}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="แก้ไขผู้ใช้">
        <form onSubmit={saveEdit}>
          <ModalFormBody>
            {editErr && <p className="text-sm text-rose-400">{editErr}</p>}
            <label className="block">
              <span className="text-xs text-slate-400">ชื่อผู้ใช้</span>
              <input
                required
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">ชื่อแสดง</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">บทบาท</span>
              <select
                disabled={editingSelf}
                title={editingSelf ? "ไม่สามารถเปลี่ยนบทบาทของตัวเอง" : undefined}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
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
                className="rounded border-slate-600"
              />
              <span className="text-sm text-slate-300">เปิดใช้งานบัญชี</span>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)</span>
              <input
                type="password"
                autoComplete="new-password"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
              />
            </label>
          </ModalFormBody>
          <ModalFormActions>
            <button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white">
              บันทึก
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300"
              onClick={() => setEditTarget(null)}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
            <tr>
              <th className="p-3">ชื่อผู้ใช้</th>
              <th className="p-3">ชื่อ</th>
              <th className="p-3">บทบาท</th>
              <th className="p-3">สถานะ</th>
              <th className="p-3 text-right min-w-[200px]">การจัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-500">
                  ยังไม่มีผู้ใช้ในระบบ
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-500">
                  ไม่มีรายการที่ตรงกับการกรอง
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => (
              <tr key={r.id} className="border-b border-slate-800/80">
                <td className="p-3 font-medium text-white">{r.username}</td>
                <td className="p-3 text-slate-300">{r.fullName ?? "—"}</td>
                <td className="p-3 text-slate-400">{r.role}</td>
                <td className="p-3">
                  <span className={r.active ? "text-emerald-400" : "text-slate-500"}>
                    {r.active ? "ใช้งาน" : "ปิด"}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-md px-2 py-1 text-xs text-teal-400 hover:bg-slate-800"
                      onClick={() => openEdit(r)}
                    >
                      แก้ไข
                    </button>
                    {r.id !== currentUser.id && (
                      <>
                        <button
                          type="button"
                          className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-800"
                          onClick={() => void toggleActive(r)}
                        >
                          {r.active ? "ปิดชั่วคราว" : "เปิดใช้งาน"}
                        </button>
                        <button
                          type="button"
                          className="rounded-md px-2 py-1 text-xs text-rose-400 hover:bg-slate-800"
                          onClick={() => void deleteUser(r)}
                        >
                          ลบ
                        </button>
                      </>
                    )}
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
