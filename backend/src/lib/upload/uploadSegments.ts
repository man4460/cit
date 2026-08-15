/**
 * Segment ชื่อโฟลเดอร์/ส่วนในชื่อไฟล์ — ASCII slug ปลอดภัยกับ filesystem + URL
 */

const MAX_SEGMENT_LEN = 40;

export function sanitizeUploadSegment(raw: string, maxLen = MAX_SEGMENT_LEN): string {
  const slug = (raw ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen);
  return slug;
}

export function resolveModuleUploadSegment(moduleSlug: string): string {
  return sanitizeUploadSegment(moduleSlug) || "module";
}

export function resolveUserUploadSegment(ownerUserId: string): string {
  return sanitizeUploadSegment(ownerUserId) || "user";
}
