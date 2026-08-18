import { useCallback, useEffect, useRef, useState } from "react";
import { apiFormJson, apiJson } from "../api/client";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { useAuth, type AuthUser } from "../context/AuthContext";
import { mediaUrl, primaryButtonClass, secondaryButtonClass } from "../lib/uiTokens";
import { prepareImageFileForUpload } from "../lib/prepareImageFileForUpload";

export function ProfilePage() {
  const { user, refreshMe } = useAuth();
  const [fullName, setFullName] = useState("");
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [profileOk, setProfileOk] = useState<string | null>(null);
  const [profilePending, setProfilePending] = useState(false);

  const [avatarPending, setAvatarPending] = useState(false);
  const [avatarErr, setAvatarErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const uploadAvatar = useCallback(
    async (file: File) => {
      setAvatarErr(null);
      setAvatarPending(true);
      try {
        const prepared = await prepareImageFileForUpload(file);
        const fd = new FormData();
        fd.append("photo", prepared);
        await apiFormJson<AuthUser>("/api/me/avatar", fd);
        await refreshMe();
      } catch (err) {
        setAvatarErr(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ");
      } finally {
        setAvatarPending(false);
      }
    },
    [refreshMe],
  );

  const removeAvatar = useCallback(async () => {
    if (!user?.avatarUrl || !confirm("ลบรูปโปรไฟล์?")) return;
    setAvatarErr(null);
    setAvatarPending(true);
    try {
      await apiJson<AuthUser>("/api/me/avatar", { method: "DELETE" });
      await refreshMe();
    } catch (err) {
      setAvatarErr(err instanceof Error ? err.message : "ลบรูปไม่สำเร็จ");
    } finally {
      setAvatarPending(false);
    }
  }, [user?.avatarUrl, refreshMe]);

  const changePassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setPwErr(null);
      setPwOk(null);
      if (newPassword.length < 8) {
        setPwErr("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร");
        return;
      }
      if (newPassword !== confirmPassword) {
        setPwErr("รหัสผ่านใหม่กับยืนยันไม่ตรงกัน");
        return;
      }
      if (!currentPassword) {
        setPwErr("กรอกรหัสผ่านปัจจุบัน");
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
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setPwOk("เปลี่ยนรหัสผ่านแล้ว — ใช้รหัสใหม่เมื่อเข้าสู่ระบบครั้งถัดไป");
      } catch (err) {
        setPwErr(err instanceof Error ? err.message : "เปลี่ยนรหัสผ่านไม่สำเร็จ");
      } finally {
        setPwPending(false);
      }
    },
    [currentPassword, newPassword, confirmPassword],
  );

  if (!user) return null;

  const avatarSrc = mediaUrl(user.avatarUrl);
  const initials = (user.fullName?.trim() || user.username).slice(0, 1).toUpperCase();

  return (
    <div className="space-y-8">
      <PageHeaderBar title="โปรไฟล์" />

      <section className="rounded-2xl border border-white/80 bg-white/85 p-5 shadow-[0_10px_40px_-20px_rgba(76,58,180,0.22)] sm:p-6">
        <h2 className="text-sm font-bold text-[#1e1b3a]">รูปโปรไฟล์</h2>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#0000BF]/25 bg-gradient-to-br from-[#0000BF]/10 via-[#8b5cf6]/10 to-[#ec4899]/10 text-2xl font-black text-[#0000BF] shadow-sm">
            {avatarSrc ? (
              <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="min-w-0 space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void uploadAvatar(f);
              }}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={avatarPending}
                className={primaryButtonClass}
                onClick={() => fileRef.current?.click()}
              >
                {avatarPending ? "กำลังอัปโหลด…" : avatarSrc ? "เปลี่ยนรูป" : "เพิ่มรูป"}
              </button>
              {avatarSrc ? (
                <button type="button" disabled={avatarPending} className={secondaryButtonClass} onClick={() => void removeAvatar()}>
                  ลบรูป
                </button>
              ) : null}
            </div>
            <p className="text-xs text-slate-600">รองรับ JPG / PNG — แนะนำรูปสี่เหลี่ยมจัตุรัส</p>
            {avatarErr ? <p className="text-sm text-rose-600">{avatarErr}</p> : null}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/80 bg-white/85 p-5 shadow-[0_10px_40px_-20px_rgba(76,58,180,0.22)] sm:p-6">
        <h2 className="text-sm font-bold text-[#1e1b3a]">ข้อมูลบัญชี</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-700">ชื่อผู้ใช้</dt>
            <dd className="mt-0.5 font-mono text-slate-900">{user.username}</dd>
          </div>
          <div>
            <dt className="text-slate-700">บทบาท</dt>
            <dd className="mt-0.5 uppercase text-slate-900">{user.role}</dd>
          </div>
        </dl>

        <form onSubmit={saveProfile} className="mt-6 space-y-4 border-t border-[#d8d9ff]/90 pt-6">
          <div>
            <label htmlFor="profile-fullName" className="block text-sm font-semibold text-slate-700">
              ชื่อที่แสดง
            </label>
            <input
              id="profile-fullName"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1.5 w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#0000BF] focus:ring-2 focus:ring-[#0000BF]/20"
              placeholder="เช่น ชื่อ–นามสกุล"
            />
            <p className="mt-1 text-xs text-slate-600">ใช้แสดงในเมนูและส่วนหัวของระบบ</p>
          </div>
          {profileErr && <p className="text-sm text-rose-600 whitespace-pre-line">{profileErr}</p>}
          {profileOk && <p className="text-sm font-medium text-[#0000BF]">{profileOk}</p>}
          <button type="submit" disabled={profilePending} className={primaryButtonClass}>
            {profilePending ? "กำลังบันทึก…" : "บันทึกชื่อที่แสดง"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-white/80 bg-white/85 p-5 shadow-[0_10px_40px_-20px_rgba(76,58,180,0.22)] sm:p-6">
        <h2 className="text-sm font-bold text-[#1e1b3a]">เปลี่ยนรหัสผ่าน</h2>
        <p className="mt-1 text-xs text-slate-600">รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร</p>
        <form onSubmit={changePassword} className="mt-6 max-w-md space-y-4">
          <div>
            <label htmlFor="pw-current" className="block text-sm font-semibold text-slate-700">
              รหัสผ่านปัจจุบัน
            </label>
            <input
              id="pw-current"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0000BF] focus:ring-2 focus:ring-[#0000BF]/20"
            />
          </div>
          <div>
            <label htmlFor="pw-new" className="block text-sm font-semibold text-slate-700">
              รหัสผ่านใหม่
            </label>
            <input
              id="pw-new"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0000BF] focus:ring-2 focus:ring-[#0000BF]/20"
            />
          </div>
          <div>
            <label htmlFor="pw-confirm" className="block text-sm font-semibold text-slate-700">
              ยืนยันรหัสผ่านใหม่
            </label>
            <input
              id="pw-confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0000BF] focus:ring-2 focus:ring-[#0000BF]/20"
            />
          </div>
          {pwErr && <p className="text-sm text-rose-600 whitespace-pre-line">{pwErr}</p>}
          {pwOk && <p className="text-sm font-medium text-[#0000BF]">{pwOk}</p>}
          <button type="submit" disabled={pwPending} className={primaryButtonClass}>
            {pwPending ? "กำลังเปลี่ยน…" : "เปลี่ยนรหัสผ่าน"}
          </button>
        </form>
      </section>
    </div>
  );
}
