/**
 * URL สำหรับสแกน QR ครุภัณฑ์
 * - ค่าเริ่มต้น: origin ของหน้าที่เปิดอยู่ (ถ้าเข้าเว็บผ่าน http://192.168.x.x:5173 จะได้ลิงก์ที่มือถือใน LAN เปิดได้)
 * - ถ้าเปิดเว็บที่ localhost แต่ต้องการให้ QR ชี้ IP ใน LAN: ตั้ง VITE_PUBLIC_ORIGIN ใน frontend/.env
 */
export function getScanUrlForToken(token: string): string {
  const raw = import.meta.env.VITE_PUBLIC_ORIGIN?.trim();
  const origin = (raw || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  return `${origin}/scan?token=${encodeURIComponent(token)}`;
}
