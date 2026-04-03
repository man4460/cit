import { useCallback, useEffect, useState } from "react";
import { apiJson } from "../api/client";
import { useAuth, type AuthUser } from "../context/AuthContext";

export function ProfilePage() {
  const { user, refreshMe } = useAuth();
  const [fullName, setFullName] = useState("");
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [profileOk, setProfileOk] = useState<string | null>(null);
  const [profilePending, setProfilePending] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState<string | null>(null);
  const [pwPending, setPwPending] = useState(false);

  useEffect(() => {
    setFullName(user?.fullName ?? "");
  }, [user?.fullName]);

  const saveProfile = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setProfileErr(null);
      setProfileOk(null);
      setProfilePending(true);
      try {
        await apiJson<AuthUser>("/api/me", {
          method: "PATCH",
          body: JSON.stringify({ fullName: fullName.trim() || null }),
        });
        await refreshMe();
        setProfileOk("บันทึกชื่อที่แสดงแล้ว");
      } catch (err) {
        setProfileErr(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      } finally {
        setProfilePending(false);
      }
    },
    [fullName, refreshMe],
  );

  const changePassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setPwErr(null);
      setPwOk(null);
      if (newPassword !== confirmPassword) {
        setPwErr("รหัสผ่านใหม่กับยืนยันไม่ตรงกัน");
        return;
      }
      setPwPending(true);
      try {
        await apiJson<AuthUser>("/api/me", {
          method: "PATCH",
          body: JSON.stringify({
            currentPassword,
            newPassword,
          }),
        });
        await refreshMe();
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setPwOk("เปลี่ยนรหัสผ่านแล้ว");
      } catch (err) {
        setPwErr(err instanceof Error ? err.message : "เปลี่ยนรหัสผ่านไม่สำเร็จ");
      } finally {
        setPwPending(false);
      }
    },
    [currentPassword, newPassword, confirmPassword, refreshMe],
  );

  if (!user) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white sm:text-2xl">โปรไฟล์</h1>
        <p className="mt-1 text-sm text-slate-500">จัดการชื่อที่แสดงและรหัสผ่านของบัญชีคุณ</p>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-slate-200">ข้อมูลบัญชี</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">ชื่อผู้ใช้</dt>
            <dd className="mt-0.5 font-mono text-slate-200">{user.username}</dd>
          </div>
          <div>
            <dt className="text-slate-500">บทบาท</dt>
            <dd className="mt-0.5 uppercase text-slate-200">{user.role}</dd>
          </div>
        </dl>

        <form onSubmit={saveProfile} className="mt-6 space-y-4 border-t border-slate-800 pt-6">
          <div>
            <label htmlFor="profile-fullName" className="block text-sm font-medium text-slate-300">
              ชื่อที่แสดง
            </label>
            <input
              id="profile-fullName"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1.5 w-full max-w-md rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
              placeholder="เช่น ชื่อ–นามสกุล"
            />
            <p className="mt-1 text-xs text-slate-500">ใช้แสดงในเมนูและส่วนหัวของระบบ</p>
          </div>
          {profileErr && <p className="text-sm text-red-400 whitespace-pre-line">{profileErr}</p>}
          {profileOk && <p className="text-sm text-teal-400">{profileOk}</p>}
          <button
            type="submit"
            disabled={profilePending}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50"
          >
            {profilePending ? "กำลังบันทึก…" : "บันทึกชื่อที่แสดง"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-slate-200">เปลี่ยนรหัสผ่าน</h2>
        <p className="mt-1 text-xs text-slate-500">รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร</p>
        <form onSubmit={changePassword} className="mt-6 max-w-md space-y-4">
          <div>
            <label htmlFor="pw-current" className="block text-sm font-medium text-slate-300">
              รหัสผ่านปัจจุบัน
            </label>
            <input
              id="pw-current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
          </div>
          <div>
            <label htmlFor="pw-new" className="block text-sm font-medium text-slate-300">
              รหัสผ่านใหม่
            </label>
            <input
              id="pw-new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
          </div>
          <div>
            <label htmlFor="pw-confirm" className="block text-sm font-medium text-slate-300">
              ยืนยันรหัสผ่านใหม่
            </label>
            <input
              id="pw-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
          </div>
          {pwErr && <p className="text-sm text-red-400 whitespace-pre-line">{pwErr}</p>}
          {pwOk && <p className="text-sm text-teal-400">{pwOk}</p>}
          <button
            type="submit"
            disabled={pwPending}
            className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-50"
          >
            {pwPending ? "กำลังเปลี่ยน…" : "เปลี่ยนรหัสผ่าน"}
          </button>
        </form>
      </section>
    </div>
  );
}
