/**
 * ชื่อไฟล์ที่แสดงให้ผู้ใช้ — ตั้งเอง ไม่ผูกกับชื่อบนดิสก์
 */

export const UPLOAD_DISPLAY_NAME_MAX = 160;

export function normalizeUploadDisplayName(raw: string | null | undefined): string {
  return (raw ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, UPLOAD_DISPLAY_NAME_MAX);
}

export function suggestUploadDisplayName(
  originalFileName: string | null | undefined,
  options?: { preferEmpty?: boolean },
): string {
  if (options?.preferEmpty) return "";
  const base = (originalFileName ?? "").replace(/\\/g, "/").split("/").pop() ?? "";
  const withoutExt = base.replace(/\.[^.]+$/, "");
  return normalizeUploadDisplayName(withoutExt || base);
}
