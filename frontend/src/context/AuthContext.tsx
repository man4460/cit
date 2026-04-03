import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiJson, getToken, setToken } from "../api/client";

export type AuthUser = {
  id: string;
  username: string;
  role: "ADMIN" | "OPERATOR";
  fullName: string | null;
  active: boolean;
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    const t = getToken();
    if (!t) {
      setUser(null);
      setLoading(false);
      return;
    }
    const timeoutMs = 15_000;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error("timeout")), timeoutMs);
    });
    try {
      const me = await Promise.race([apiJson<AuthUser>("/api/me"), timeoutPromise]);
      setUser(me);
    } catch {
      setUser(null);
      setToken(null);
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    const onAuth = () => void refreshMe();
    window.addEventListener("afo:auth", onAuth);
    return () => window.removeEventListener("afo:auth", onAuth);
  }, [refreshMe]);

  const login = useCallback(async (username: string, password: string) => {
    const base = import.meta.env.VITE_API_URL ?? "";
    const url = `${base}/api/auth/login`.replace(/([^:]\/)\/+/g, "$1");
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
    } catch {
      throw new Error(
        "เชื่อมต่อ API ไม่ได้ — เปิด backend ที่พอร์ต 4000 ก่อน (โฟลเดอร์ backend: npm run dev) หรือตั้ง VITE_API_URL ใน frontend/.env ให้ชี้ URL เต็มของ API (เช่น http://localhost:4000)",
      );
    }
    const data = (await res.json().catch(() => null)) as { error?: string; token?: string; user?: AuthUser } | null;
    if (!res.ok) {
      throw new Error(data?.error ?? `เข้าสู่ระบบไม่สำเร็จ (${res.status})`);
    }
    if (!data?.token || !data.user) {
      throw new Error("คำตอบจากเซิร์ฟเวอร์ไม่สมบูรณ์ — ตรวจสอบว่า backend เป็นเวอร์ชันล่าสุด");
    }
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshMe }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
