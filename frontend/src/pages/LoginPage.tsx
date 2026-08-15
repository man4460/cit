import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { brandCtaButtonClass } from "../lib/uiTokens";

export function LoginPage() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from ?? "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (user) nav(from, { replace: true });
  }, [user, from, nav]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    try {
      await login(username.trim(), password);
      nav(from, { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เข้าสู่ระบบไม่สำเร็จ");
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
      <div className="app-card-surface w-full max-w-md rounded-3xl border border-white/80 p-6 sm:p-8">
        <div className="flex justify-center">
          <img
            src="/logo-login.png"
            alt="ALL FOR ONE"
            decoding="async"
            draggable={false}
            className="h-auto w-full max-w-[18rem] object-contain object-center sm:max-w-[20rem]"
          />
        </div>
        <h1 className="mt-4 text-center text-xl font-black tracking-tight text-[#1e1b3a]">เข้าสู่ระบบ</h1>
        <p className="mt-1 text-center text-sm font-medium text-slate-700">ใช้บัญชีที่ผู้ดูแลระบบสร้างให้</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          {err && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>
          )}
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">ชื่อผู้ใช้</span>
            <input
              autoComplete="username"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm outline-none focus:border-[#0000BF] focus:ring-2 focus:ring-[#0000BF]/20"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">รหัสผ่าน</span>
            <input
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm outline-none focus:border-[#0000BF] focus:ring-2 focus:ring-[#0000BF]/20"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className={`w-full rounded-full py-2.5 text-sm font-bold disabled:opacity-50 ${brandCtaButtonClass}`}
          >
            {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
          </button>
        </form>
      </div>
    </div>
  );
}
