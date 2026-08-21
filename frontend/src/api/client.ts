const base = import.meta.env.VITE_API_URL ?? "";

/** ประกอบ URL กับ VITE_API_URL (กันซ้ำ slash ท้าย base) — ถ้าไม่ตั้ง base ใช้ path สัมพันธ์ (proxy Vite) */
function resolveFetchUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const b = base.replace(/\/$/, "");
  return b ? `${b}${p}` : p;
}

const TOKEN_KEY = "afo_token";

/** cache GET ในหน่วยความจำ — ล้างเมื่อมีการเขียนข้อมูล / กดรีเฟรช / ออกจากระบบ */
const getCache = new Map<string, unknown>();

export const DATA_REFRESH_EVENT = "afo:data-refresh";

export function clearApiCache() {
  getCache.clear();
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

function isSessionExpiredError(status: number, data: { error?: string } | null): boolean {
  if (status !== 401) return false;
  const msg = String(data?.error ?? "");
  if (/รหัสผ่านปัจจุบัน/.test(msg)) return false;
  return /ต้องเข้าสู่ระบบ|โทเคน|หมดอายุ|บัญชีถูกปิด/.test(msg) || !msg;
}

function handleUnauthorized(status: number, data: { error?: string } | null) {
  if (!isSessionExpiredError(status, data)) return;
  setToken(null);
  clearApiCache();
  window.dispatchEvent(new Event("afo:auth"));
}

export type ApiJsonInit = RequestInit & { skipCache?: boolean };

export async function apiJson<T>(path: string, init?: ApiJsonInit): Promise<T> {
  const skipCache = Boolean(init?.skipCache);
  const fetchInit = init ? (({ skipCache: _s, ...rest }) => rest)(init) : undefined;
  const key = cacheKey(path, fetchInit);
  const method = requestMethod(fetchInit);
  const res = await fetch(resolveFetchUrl(path), {
    ...fetchInit,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...authHeader(),
      ...fetchInit?.headers,
    },
  });
  if (res.status === 204) {
    if (method !== "GET") clearApiCache();
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
  if (res.status === 401) handleUnauthorized(res.status, data);
  if (!res.ok) throw new Error(formatApiFailure(data, res.statusText));
  if (method !== "GET") clearApiCache();
  else if (key && !skipCache) getCache.set(key, data);
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
    clearApiCache();
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
  if (res.status === 401) handleUnauthorized(res.status, data);
  if (!res.ok) throw new Error(formatApiFailure(data, res.statusText));
  clearApiCache();
  return data as T;
}

function filenameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      return star[1];
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1] ?? fallback;
}

/** ดาวน์โหลดไฟล์จาก API (เช่น Excel) — รองรับ JSON error */
export async function apiDownload(path: string, init?: RequestInit, fallbackName = "download.xlsx"): Promise<void> {
  const fetchInit = init ?? {};
  const res = await fetch(resolveFetchUrl(path), {
    ...fetchInit,
    headers: {
      Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/json",
      ...authHeader(),
      ...fetchInit.headers,
    },
  });
  if (res.status === 401) {
    const text = await res.text();
    let data: { error?: string } | null = null;
    try {
      data = text ? (JSON.parse(text) as { error?: string }) : null;
    } catch {
      data = null;
    }
    handleUnauthorized(res.status, data);
    throw new Error(data?.error ?? "ต้องเข้าสู่ระบบ");
  }
  if (!res.ok) {
    const text = await res.text();
    let data: { error?: string; details?: string } | null = null;
    try {
      data = text ? (JSON.parse(text) as { error?: string; details?: string }) : null;
    } catch {
      data = null;
    }
    throw new Error(formatApiFailure(data, res.statusText));
  }
  const blob = await res.blob();
  const filename = filenameFromContentDisposition(res.headers.get("content-disposition"), fallbackName);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
