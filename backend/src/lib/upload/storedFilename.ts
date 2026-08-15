import { randomBytes } from "node:crypto";
import { resolveModuleUploadSegment, resolveUserUploadSegment } from "./uploadSegments.js";

/**
 * ชื่อไฟล์บนดิสก์ (มาตรฐาน Ai Cluster):
 * `{module}-[{category}-]{user}-[{kind}-]{timestamp}-{rand}.{ext}`
 * ชื่อที่แสดงแยกเก็บใน DB
 */
export function buildStoredUploadFileName(input: {
  moduleSlug: string;
  ownerUserId: string;
  ext: string;
  kind?: string;
  categorySlug?: string;
}): string {
  const moduleSeg = resolveModuleUploadSegment(input.moduleSlug);
  const userSeg = resolveUserUploadSegment(input.ownerUserId);
  const catSeg = input.categorySlug ? resolveModuleUploadSegment(input.categorySlug) : "";
  const ext = (input.ext || "bin").replace(/^\./, "").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const kind = input.kind ? resolveModuleUploadSegment(input.kind).slice(0, 16) : "";
  const rand = randomBytes(4).toString("hex");
  const ts = Date.now();
  const parts = [moduleSeg, catSeg || null, userSeg, kind || null, String(ts), rand].filter(
    (p): p is string => Boolean(p),
  );
  return `${parts.join("-")}.${ext}`;
}
