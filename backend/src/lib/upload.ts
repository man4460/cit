import fs from "fs";
import path from "path";
import multer from "multer";
import sharp from "sharp";
import { detectImageKind, extensionForImageKind } from "./upload/detectImageKind.js";
import { normalizeUploadDisplayName, suggestUploadDisplayName } from "./upload/displayName.js";
import { buildStoredUploadFileName } from "./upload/storedFilename.js";
import { resolveModuleUploadSegment, resolveUserUploadSegment } from "./upload/uploadSegments.js";

const uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

/** ขอบยาวสูงสุดหลังย่อ (สอดคล้อง Ai Cluster) */
export const PREPARED_IMAGE_MAX_DIMENSION = 1600;
/** ขนาดไฟล์เป้าหมายหลังบีบ JPEG */
export const PREPARED_IMAGE_MAX_BYTES = Math.round(1.85 * 1024 * 1024);
export const UPLOAD_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** เอกสารสัญญา / PDF / Office — สัญญา OS มักใหญ่กว่า 15MB */
export const UPLOAD_MAX_FILE_BYTES = 50 * 1024 * 1024;
export const UPLOAD_MAX_FILE_MB = Math.round(UPLOAD_MAX_FILE_BYTES / (1024 * 1024));

const HEIC_HINT_TH =
  "รูป HEIC/HEIF ยังไม่รองรับ — ตั้ง iPhone: การตั้งค่า > กล้อง > รูปแบบ เป็น “ความเข้ากันได้ดีที่สุด” (JPG)";

/**
 * เบราว์เซอร์ส่งชื่อไฟล์ UTF-8 ใน multipart แต่บ่อยครั้งถูกตีความเป็น latin1
 */
export function decodeMultipartFilename(name: string): string {
  if (!name) return name;
  const needsFix = ![...name].some((ch) => (ch.codePointAt(0) ?? 0) > 255);
  if (!needsFix) return name;
  try {
    return Buffer.from(name, "latin1").toString("utf8");
  } catch {
    return name;
  }
}

export function getUploadDir() {
  return uploadDir;
}

export function ensureUploadDir() {
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
}

function assertSafeRelativeUploadPath(rel: string): string | null {
  const cleaned = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned || cleaned.includes("..") || path.isAbsolute(cleaned)) return null;
  const full = path.resolve(uploadDir, cleaned);
  const resolvedDir = path.resolve(uploadDir);
  const relToRoot = path.relative(resolvedDir, full);
  if (!relToRoot || relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) return null;
  return cleaned;
}

/** ลบไฟล์ในโฟลเดอร์อัปโหลด — รองรับพาธย่อยเช่น vehicles/user/file.jpg */
export function unlinkUploadFile(storedPath: string) {
  const rel = assertSafeRelativeUploadPath(storedPath);
  if (!rel) return;
  const full = path.join(uploadDir, rel);
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch {
    /* ignore */
  }
}

export function publicFileUrl(relativePath: string) {
  const base = process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
  const rel = relativePath.replace(/^\/+/, "").replace(/\\/g, "/");
  return `${base.replace(/\/$/, "")}/uploads/${rel}`;
}

/** พาธสัมพัทธ์ใต้ /uploads สำหรับเก็บใน DB */
export function publicUploadPath(relativePath: string) {
  const rel = relativePath.replace(/^\/+/, "").replace(/\\/g, "/");
  return `/uploads/${rel}`;
}

function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-";
}

async function processImageBuffer(buf: Buffer): Promise<{ buffer: Buffer; ext: string; mimeType: string }> {
  const kind = detectImageKind(buf);
  if (kind === "heic") throw new Error(HEIC_HINT_TH);
  if (!kind) {
    try {
      await sharp(buf).metadata();
    } catch {
      throw new Error("รองรับ JPG PNG WEBP GIF");
    }
  }

  const meta = await sharp(buf).rotate().metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const needsResize = w > PREPARED_IMAGE_MAX_DIMENSION || h > PREPARED_IMAGE_MAX_DIMENSION;

  const makePipeline = () => {
    let p = sharp(buf).rotate();
    if (needsResize) {
      p = p.resize({
        width: PREPARED_IMAGE_MAX_DIMENSION,
        height: PREPARED_IMAGE_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    return p;
  };

  let quality = 85;
  let out = await makePipeline().jpeg({ quality, mozjpeg: true }).toBuffer();
  while (out.length > PREPARED_IMAGE_MAX_BYTES && quality > 45) {
    quality -= 10;
    out = await makePipeline().jpeg({ quality, mozjpeg: true }).toBuffer();
  }

  return { buffer: out, ext: "jpg", mimeType: "image/jpeg" };
}

const OFFICE_DOC_EXTS = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"]);

const OFFICE_DOC_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/octet-stream",
]);

function extFromName(name: string): string {
  return path.extname(name).replace(/^\./, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type PersistUploadOptions = {
  module: string;
  userId?: string | null;
  kind?: string;
  /** slug หมวด เช่น budget / armor — ใช้แยกโฟลเดอร์และชื่อไฟล์ */
  categorySlug?: string;
  /** ชื่อหมวดภาษาไทย สำหรับประกอบชื่อที่แสดง */
  categoryLabel?: string;
  /** ชื่อรายการที่ผู้ใช้ตั้ง — ใช้เป็นชื่อแสดงแทนชื่อไฟล์เดิม */
  displayTitle?: string;
  /** บังคับประมวลผลเป็นรูป (ย่อ/JPEG) — ถ้าไม่ใช่รูปจะ error */
  forceImage?: boolean;
  /** อนุญาต PDF ด้วย (เอกสาร) */
  allowPdf?: boolean;
  /** อนุญาต Word / Excel / PowerPoint / PDF */
  allowOfficeDocs?: boolean;
};

export type PersistedUpload = {
  /** พาธสัมพัทธ์ใต้ uploads เช่น vehicles/userxxx/file.jpg */
  relativePath: string;
  storedFileName: string;
  fileUrl: string;
  publicPath: string;
  displayName: string;
  mimeType: string;
  fileSize: number;
};

/**
 * บันทึกไฟล์จาก multer memoryStorage:
 * พาธ `/uploads/{module}/[{category}/]{user}/{module}-[{category}-]{user}-[{kind}-]{ts}-{rand}.{ext}`
 * รูปจะถูกย่อขอบยาวไม่เกิน 1600 และบีบ JPEG
 */
export async function persistUpload(
  file: Express.Multer.File,
  opts: PersistUploadOptions,
): Promise<PersistedUpload> {
  const originalDecoded = decodeMultipartFilename(file.originalname || "file");
  const buf = file.buffer;
  if (!buf?.length) throw new Error("ไฟล์ว่าง");

  const userId = opts.userId?.trim() || "system";
  const moduleSeg = resolveModuleUploadSegment(opts.module);
  const userSeg = resolveUserUploadSegment(userId);
  const categorySlug = opts.categorySlug?.trim()
    ? resolveModuleUploadSegment(opts.categorySlug)
    : "";
  const rawType = (file.mimetype || "").trim().toLowerCase();
  const looksPdf = rawType === "application/pdf" || isPdfBuffer(buf);
  const looksImage =
    rawType.startsWith("image/") || Boolean(detectImageKind(buf)) || opts.forceImage === true;

  let outBuf: Buffer;
  let ext: string;
  let mimeType: string;

  const allowDocs = Boolean(opts.allowPdf || opts.allowOfficeDocs);

  if (looksPdf && allowDocs && !opts.forceImage) {
    if (!isPdfBuffer(buf)) throw new Error("ไฟล์ PDF ไม่ถูกต้อง");
    if (buf.length > UPLOAD_MAX_FILE_BYTES) throw new Error(`PDF ใหญ่เกิน ${UPLOAD_MAX_FILE_MB}MB`);
    outBuf = buf;
    ext = "pdf";
    mimeType = "application/pdf";
  } else if (looksImage || opts.forceImage) {
    if (buf.length > UPLOAD_MAX_IMAGE_BYTES) throw new Error("ไฟล์ใหญ่เกิน 8MB");
    const processed = await processImageBuffer(buf);
    outBuf = processed.buffer;
    ext = processed.ext;
    mimeType = processed.mimeType;
  } else if (opts.allowOfficeDocs) {
    if (buf.length > UPLOAD_MAX_FILE_BYTES) throw new Error(`ไฟล์ใหญ่เกิน ${UPLOAD_MAX_FILE_MB}MB`);
    const fromName = extFromName(originalDecoded);
    if (!OFFICE_DOC_EXTS.has(fromName)) {
      throw new Error("รองรับเฉพาะ Word Excel PowerPoint PDF (.doc .docx .xls .xlsx .ppt .pptx .pdf)");
    }
    if (rawType && !OFFICE_DOC_MIMES.has(rawType) && rawType !== "application/octet-stream") {
      // บางเบราว์เซอร์ส่ง MIME แปลก — ถ้านามสกุลถูกต้องให้ผ่าน
    }
    outBuf = buf;
    ext = fromName;
    mimeType = rawType && OFFICE_DOC_MIMES.has(rawType) ? rawType : "application/octet-stream";
  } else if (opts.allowPdf) {
    // ไฟล์ทั่วไป (เอกสาร) — เก็บนามสกุลเดิมแบบปลอดภัย
    if (buf.length > UPLOAD_MAX_FILE_BYTES) throw new Error(`ไฟล์ใหญ่เกิน ${UPLOAD_MAX_FILE_MB}MB`);
    const detected = detectImageKind(buf);
    if (detected === "heic") throw new Error(HEIC_HINT_TH);
    if (detected) {
      const processed = await processImageBuffer(buf);
      outBuf = processed.buffer;
      ext = processed.ext;
      mimeType = processed.mimeType;
    } else {
      outBuf = buf;
      const fromName = extFromName(originalDecoded);
      ext = fromName || "bin";
      mimeType = rawType || "application/octet-stream";
    }
  } else {
    throw new Error("รองรับเฉพาะไฟล์รูปภาพ");
  }

  const storedFileName = buildStoredUploadFileName({
    moduleSlug: opts.module,
    ownerUserId: userId,
    ext,
    kind: opts.kind,
    categorySlug: categorySlug || undefined,
  });

  const dir = categorySlug
    ? path.join(uploadDir, moduleSeg, categorySlug, userSeg)
    : path.join(uploadDir, moduleSeg, userSeg);
  ensureUploadDir();
  fs.mkdirSync(dir, { recursive: true });
  const full = path.join(dir, storedFileName);
  fs.writeFileSync(full, outBuf);

  const relativePath = categorySlug
    ? `${moduleSeg}/${categorySlug}/${userSeg}/${storedFileName}`
    : `${moduleSeg}/${userSeg}/${storedFileName}`;

  const fromOriginal = suggestUploadDisplayName(originalDecoded) || normalizeUploadDisplayName(originalDecoded);
  const fromTitle = normalizeUploadDisplayName(opts.displayTitle ?? "");
  const label = (opts.categoryLabel ?? "").trim();
  const baseName = fromTitle || fromOriginal || storedFileName;
  const displayName = normalizeUploadDisplayName(label ? `[${label}] ${baseName}` : baseName) || baseName;

  return {
    relativePath,
    storedFileName,
    fileUrl: publicFileUrl(relativePath),
    publicPath: publicUploadPath(relativePath),
    displayName,
    mimeType,
    fileSize: outBuf.length,
  };
}

/** multer เก็บใน memory — persistUpload เขียนลงดิสก์หลังตรวจ/ย่อรูป */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_FILE_BYTES },
});

// re-export helpers ที่อาจใช้จากที่อื่น
export { detectImageKind, extensionForImageKind } from "./upload/detectImageKind.js";
export { normalizeUploadDisplayName, suggestUploadDisplayName } from "./upload/displayName.js";
