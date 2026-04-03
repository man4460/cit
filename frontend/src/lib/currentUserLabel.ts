import type { AuthUser } from "../context/AuthContext";

/** ชื่อแสดงสำหรับเติมฟอร์ม (เช่น ผู้ตรวจ) — fullName หรือ username */
export function currentUserLabel(user: AuthUser | null | undefined): string {
  if (!user) return "";
  return user.fullName?.trim() || user.username?.trim() || "";
}
