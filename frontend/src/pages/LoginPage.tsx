import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

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
    <div className="flex min-h-screen min-h-[100dvh] flex-col items-center justify-center bg-slate-950 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl sm:p-8">
        <p className="text-center text-xs font-semibold uppercase tracking-wider text-teal-500">all for one</p>
        <h1 className="mt-2 text-center text-xl font-bold text-white">เข้าสู่ระบบ</h1>
        <p className="mt-1 text-center text-sm text-slate-500">ใช้บัญชีที่ผู้ดูแลระบบสร้างให้</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          {err && <p className="rounded-lg bg-rose-950/50 px-3 py-2 text-sm text-rose-300">{err}</p>}
          <label className="block">
            <span className="text-xs text-slate-400">ชื่อผู้ใช้</span>
            <input
              autoComplete="username"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">รหัสผ่าน</span>
            <input
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
          >
            {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
          </button>
        </form>
      </div>
    </div>
  );
}
