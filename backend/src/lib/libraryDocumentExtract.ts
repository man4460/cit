import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { detectImageKind } from "./upload/detectImageKind.js";
import { prisma } from "./prisma.js";

const OCR_MAX_BYTES = 12 * 1024 * 1024;

export function uploadRelativePathFromFileUrl(fileUrl: string): string | null {
  try {
    const u = new URL(fileUrl);
    const idx = u.pathname.toLowerCase().indexOf("/uploads/");
    if (idx >= 0) {
      const rel = u.pathname.slice(idx + "/uploads/".length).replace(/^\/+/, "");
      if (rel && !rel.includes("..")) return decodeURIComponent(rel);
    }
  } catch {
    /* relative path */
  }
  const m = fileUrl.match(/\/uploads\/(.+?)(?:\?|#|$)/i);
  if (!m?.[1]) return null;
  const rel = decodeURIComponent(m[1]).replace(/^\/+/, "");
  if (!rel || rel.includes("..")) return null;
  return rel;
}

/** @deprecated ใช้ uploadRelativePathFromFileUrl — รองรับโฟลเดอร์ย่อย */
export function uploadFilenameFromFileUrl(fileUrl: string): string | null {
  return uploadRelativePathFromFileUrl(fileUrl);
}

async function extractPdfTextFromBuffer(buf: Buffer): Promise<string | null> {
  const parser = new PDFParse({ data: buf });
  try {
    const { text } = await parser.getText();
    const t = text?.replace(/\u00a0/g, " ").trim();
    return t && t.length > 0 ? t : null;
  } finally {
    await parser.destroy();
  }
}

async function extractImageOcrFromBuffer(buf: Buffer): Promise<string | null> {
  if (buf.length > OCR_MAX_BYTES) return null;
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["tha", "eng"], 1, {
    logger: () => undefined,
  });
  try {
    const { data } = await worker.recognize(buf);
    const t = data.text?.replace(/\u00a0/g, " ").trim();
    return t && t.length > 0 ? t : null;
  } finally {
    await worker.terminate();
  }
}

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".tif", ".tiff", ".bmp"];

export async function extractTextFromBuffer(
  buf: Buffer,
  mimeType: string | null,
  originalName?: string,
): Promise<string | null> {
  const ext = path.extname(originalName ?? "").toLowerCase();
  const mt = (mimeType || "").toLowerCase();
  const looksPdf = mt === "application/pdf" || ext === ".pdf" || buf.slice(0, 5).toString("ascii") === "%PDF-";
  const looksText = mt === "text/plain" || ext === ".txt" || ext === ".csv";
  const looksImage =
    mt.startsWith("image/") || IMAGE_EXTS.includes(ext) || Boolean(detectImageKind(buf));

  try {
    if (looksPdf) return await extractPdfTextFromBuffer(buf);
    if (looksText) {
      const raw = buf.toString("utf8").trim();
      return raw.length > 0 ? raw : null;
    }
    if (looksImage) return await extractImageOcrFromBuffer(buf);
  } catch (e) {
    console.error("extractTextFromBuffer", originalName, e);
  }
  return null;
}

export async function extractTextFromLibraryFile(absPath: string, mimeType: string | null): Promise<string | null> {
  try {
    const buf = fs.readFileSync(absPath);
    return await extractTextFromBuffer(buf, mimeType, absPath);
  } catch (e) {
    console.error("extractTextFromLibraryFile", absPath, e);
    return null;
  }
}

/** อ่านไฟล์จาก uploads แล้วอัปเดต extractedText */
export async function runLibraryDocumentExtract(documentId: string): Promise<string | null> {
  const row = await prisma.libraryDocument.findUnique({ where: { id: documentId } });
  if (!row?.fileUrl) {
    await prisma.libraryDocument.update({
      where: { id: documentId },
      data: { extractedText: null },
    });
    return null;
  }
  const name = uploadRelativePathFromFileUrl(row.fileUrl);
  if (!name) {
    await prisma.libraryDocument.update({
      where: { id: documentId },
      data: { extractedText: null },
    });
    return null;
  }
  const uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
  const abs = path.join(uploadDir, name);
  if (!fs.existsSync(abs)) {
    await prisma.libraryDocument.update({
      where: { id: documentId },
      data: { extractedText: null },
    });
    return null;
  }

  const text = await extractTextFromLibraryFile(abs, row.mimeType);
  await prisma.libraryDocument.update({
    where: { id: documentId },
    data: { extractedText: text },
  });
  return text;
}
