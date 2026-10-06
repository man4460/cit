import { useState } from "react";
import { Link } from "react-router-dom";
import { brandCtaButtonClass } from "../lib/uiTokens";

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm outline-none focus:border-[#0000BF] focus:ring-2 focus:ring-[#0000BF]/20";
const labelClass = "text-xs font-semibold text-slate-600";

type Form = {
  username: string;
  password: string;
  confirm: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  position: string;
  affiliation: string;
};

const EMPTY: Form = { username: "", password: "", confirm: "", firstName: "", lastName: "", employeeCode: "", position: "", affiliation: "" };

export function RegisterPage() {
  const [f, setF] = useState<Form>(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setF((v) => ({ ...v, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (f.password !== f.confirm) return setErr("ยืนยันรหัสผ่านไม่ตรงกัน");
    setPending(true);
    try {
      const base = import.meta.env.VITE_API_URL ?? "";
      const url = `${base}/api/auth/register`.replace(/([^:]\/)\/+/g, "$1");
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ...f, confirm: undefined }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? `สมัครไม่สำเร็จ (${res.status})`);
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "สมัครไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="app-shell flex min-h-screen min-h-[100dvh] flex-col items-center justify-center px-4 py-8"
      style={{
        paddingTop: "max(2rem, env(safe-area-inset-top, 0px))",
        paddingBottom: "max(2rem, env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div className="app-card-surface w-full max-w-xl rounded-3xl border border-white/80 p-6 sm:p-8">
        <div className="flex justify-center">
          <img src="/logo-login.png" alt="ALL FOR ONE" decoding="async" draggable={false} className="h-auto w-full max-w-[14rem] object-contain" />
        </div>
        <h1 className="mt-4 text-center text-xl font-black tracking-tight text-[#1e1b3a]">สมัครสมาชิก</h1>

        {done ? (
          <div className="mt-6 space-y-4 text-center">
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              ส่งคำขอสมัครเรียบร้อยแล้ว — รอผู้ดูแลระบบตรวจสอบและอนุมัติสิทธิ์ จากนั้นเข้าสู่ระบบด้วยชื่อผู้ใช้ <b>{f.username}</b>
            </p>
            <Link to="/login" className={`inline-block rounded-full px-6 py-2.5 text-sm font-bold ${brandCtaButtonClass}`}>
              กลับไปหน้าเข้าสู่ระบบ
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-1 text-center text-sm font-medium text-slate-600">กรอกข้อมูลให้ครบ ผู้ดูแลระบบจะตรวจสอบและกำหนดสิทธิ์ก่อนใช้งาน</p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              {err && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}

              <fieldset className="space-y-3 rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
                <legend className="px-1 text-xs font-black text-sky-800">บัญชีผู้ใช้</legend>
                <label className="block">
                  <span className={labelClass}>ชื่อผู้ใช้ (ภาษาอังกฤษ/ตัวเลข)</span>
                  <input
                    required
                    autoComplete="username"
                    pattern="[a-zA-Z0-9._\-]{3,32}"
                    title="ภาษาอังกฤษ ตัวเลข หรือ . _ - ความยาว 3–32 ตัว"
                    className={inputClass}
                    value={f.username}
                    onChange={set("username")}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className={labelClass}>รหัสผ่าน (อย่างน้อย 8 ตัว)</span>
                    <input required type="password" minLength={8} autoComplete="new-password" className={inputClass} value={f.password} onChange={set("password")} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>ยืนยันรหัสผ่าน</span>
                    <input required type="password" minLength={8} autoComplete="new-password" className={inputClass} value={f.confirm} onChange={set("confirm")} />
                  </label>
                </div>
              </fieldset>

              <fieldset className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
                <legend className="px-1 text-xs font-black text-emerald-800">ข้อมูลผู้สมัคร</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className={labelClass}>ชื่อ</span>
                    <input required autoComplete="given-name" className={inputClass} value={f.firstName} onChange={set("firstName")} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>นามสกุล</span>
                    <input required autoComplete="family-name" className={inputClass} value={f.lastName} onChange={set("lastName")} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>เลขประจำตัวพนักงาน</span>
                    <input required className={inputClass} value={f.employeeCode} onChange={set("employeeCode")} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>ตำแหน่ง</span>
                    <input required className={inputClass} value={f.position} onChange={set("position")} />
                  </label>
                </div>
                <label className="block">
                  <span className={labelClass}>สังกัด</span>
                  <input required className={inputClass} value={f.affiliation} onChange={set("affiliation")} />
                </label>
              </fieldset>

              <button type="submit" disabled={pending} className={`w-full rounded-full py-2.5 text-sm font-bold disabled:opacity-50 ${brandCtaButtonClass}`}>
                {pending ? "กำลังส่งคำขอ…" : "ส่งคำขอสมัครสมาชิก"}
              </button>
              <p className="text-center text-sm text-slate-600">
                มีบัญชีแล้ว?{" "}
                <Link to="/login" className="font-bold text-[#0000BF] hover:underline">
                  เข้าสู่ระบบ
                </Link>
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
