const base = import.meta.env.VITE_API_URL ?? "";

/** ประกอบ URL กับ VITE_API_URL (กันซ้ำ slash ท้าย base) — ถ้าไม่ตั้ง base ใช้ path สัมพันธ์ (proxy Vite) */
function resolveFetchUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const b = base.replace(/\/$/, "");
  return b ? `${b}${p}` : p;
}

const TOKEN_KEY = "afo_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function authHeader(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function formatApiFailure(data: { error?: string; details?: string } | null, fallback: string): string {
  const msg = data?.error ?? fallback;
  const d = data?.details;
  return d ? `${msg}\n${d}` : msg;
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(resolveFetchUrl(path), {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...authHeader(),
      ...init?.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: { error?: string; details?: string } | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as { error?: string; details?: string };
    } catch {
      throw new Error(`คำตอบจาก API ไม่ใช่ JSON (${path}) — ตรวจสอบว่า backend รันและ VITE_API_URL ถูกต้อง`);
    }
  }
  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event("afo:auth"));
  }
  if (!res.ok) throw new Error(formatApiFailure(data, res.statusText));
  return data as T;
}

export function apiUrl(path: string) {
  return resolveFetchUrl(path);
}

/** multipart ไม่ตั้ง Content-Type — ให้เบราว์เซอร์ใส่ boundary */
export async function apiFormJson<T>(path: string, formData: FormData, method = "POST"): Promise<T> {
  const res = await fetch(resolveFetchUrl(path), {
    method,
    headers: { Accept: "application/json", ...authHeader() },
    body: formData,
  });
  const text = await res.text();
  if (res.status === 204) return undefined as T;
  let data: { error?: string; details?: string } | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as { error?: string; details?: string };
    } catch {
      throw new Error(`คำตอบจาก API ไม่ใช่ JSON (${path})`);
    }
  }
  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event("afo:auth"));
  }
  if (!res.ok) throw new Error(formatApiFailure(data, res.statusText));
  return data as T;
}
