const base = import.meta.env.VITE_API_URL ?? "";

/** ประกอบ URL กับ VITE_API_URL (กันซ้ำ slash ท้าย base) — ถ้าไม่ตั้ง base ใช้ path สัมพันธ์ (proxy Vite) */
function resolveFetchUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const b = base.replace(/\/$/, "");
  return b ? `${b}${p}` : p;
}

const TOKEN_KEY = "afo_token";

/** cache GET ในหน่วยความจำ — อยู่จนรีเฟรชเบราว์เซอร์ / กดปุ่มรีเฟรชข้อมูล / มีการเขียนข้อมูล */
const getCache = new Map<string, unknown>();

export const DATA_REFRESH_EVENT = "afo:data-refresh";

export function clearApiCache() {
  getCache.clear();
}

/** ล้าง cache GET เฉพาะ module ที่เกี่ยวข้องกับ path ที่เขียน (ไม่ล้างทั้งแอป) */
export function invalidateApiCacheForMutation(path: string) {
  const clean = path.split("?")[0];
  const parts = clean.split("/").filter(Boolean);
  const prefix = parts.length >= 2 ? `/${parts[0]}/${parts[1]}` : clean;
  for (const key of [...getCache.keys()]) {
    const keyPath = key.split("?")[0];
    if (keyPath === clean || keyPath.startsWith(`${prefix}/`) || keyPath === prefix) {
      getCache.delete(key);
    }
  }
}

/** ล้าง cache แล้วให้หน้าปัจจุบันโหลดข้อมูลใหม่ */
export function refreshAppData() {
  clearApiCache();
  window.dispatchEvent(new Event(DATA_REFRESH_EVENT));
}

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

function requestMethod(init?: RequestInit): string {
  return (init?.method ?? "GET").toUpperCase();
}

function cacheKey(path: string, init?: RequestInit): string | null {
  if (requestMethod(init) !== "GET") return null;
  return path;
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const key = cacheKey(path, init);
  if (key && getCache.has(key)) {
    return getCache.get(key) as T;
  }

  const method = requestMethod(init);
  const res = await fetch(resolveFetchUrl(path), {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...authHeader(),
      ...init?.headers,
    },
  });
  if (res.status === 204) {
    if (method !== "GET") invalidateApiCacheForMutation(path);
    return undefined as T;
  }
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
    clearApiCache();
    window.dispatchEvent(new Event("afo:auth"));
  }
  if (!res.ok) throw new Error(formatApiFailure(data, res.statusText));
  if (method !== "GET") invalidateApiCacheForMutation(path);
  else if (key) getCache.set(key, data);
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
  if (res.status === 204) {
    invalidateApiCacheForMutation(path);
    return undefined as T;
  }
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
    clearApiCache();
    window.dispatchEvent(new Event("afo:auth"));
  }
  if (!res.ok) throw new Error(formatApiFailure(data, res.statusText));
  invalidateApiCacheForMutation(path);
  return data as T;
}
