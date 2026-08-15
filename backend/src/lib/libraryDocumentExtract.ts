import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";
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

async function extractPdfText(absPath: string): Promise<string | null> {
  const buf = fs.readFileSync(absPath);
  const parser = new PDFParse({ data: buf });
  try {
    const { text } = await parser.getText();
    const t = text?.replace(/\u00a0/g, " ").trim();
    return t && t.length > 0 ? t : null;
  } finally {
    await parser.destroy();
  }
}

async function extractImageOcr(absPath: string): Promise<string | null> {
  const stat = fs.statSync(absPath);
  if (stat.size > OCR_MAX_BYTES) return null;
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["tha", "eng"], 1, {
    logger: () => undefined,
  });
  try {
    const { data } = await worker.recognize(absPath);
    const t = data.text?.replace(/\u00a0/g, " ").trim();
    return t && t.length > 0 ? t : null;
  } finally {
    await worker.terminate();
  }
}

export async function extractTextFromLibraryFile(absPath: string, mimeType: string | null): Promise<string | null> {
  const ext = path.extname(absPath).toLowerCase();
  const mt = (mimeType || "").toLowerCase();

  try {
    if (mt === "application/pdf" || ext === ".pdf") {
      return await extractPdfText(absPath);
    }
    if (mt === "text/plain" || ext === ".txt" || ext === ".csv") {
      const raw = fs.readFileSync(absPath, "utf8").trim();
      return raw.length > 0 ? raw : null;
    }
    if (
      mt.startsWith("image/") ||
      [".png", ".jpg", ".jpeg", ".webp", ".gif", ".tif", ".tiff", ".bmp"].includes(ext)
    ) {
      return await extractImageOcr(absPath);
    }
  } catch (e) {
    console.error("extractTextFromLibraryFile", absPath, e);
  }
  return null;
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
