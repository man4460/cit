import { Router } from "express";
import { runLibraryDocumentExtract } from "../lib/libraryDocumentExtract.js";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";
import { persistUpload, upload } from "../lib/upload.js";
import { documentCategorySlugFromName } from "../lib/upload/documentCategorySlug.js";

export const libraryDocumentsRouter = Router();

const includeType = { documentType: true };

async function resolveDocumentType(raw: unknown): Promise<{ id: string; name: string } | null> {
  const s = raw == null ? "" : String(raw).trim();
  if (!s) return null;
  const t = await prisma.documentType.findUnique({ where: { id: s } });
  return t ? { id: t.id, name: t.name } : null;
}

libraryDocumentsRouter.get("/", async (req, res, next) => {
  try {
    const documentTypeId = String(req.query.documentTypeId ?? "").trim();
    const typeName = String(req.query.typeName ?? "").trim();
    let typeFilter: string | undefined;
    if (documentTypeId) {
      typeFilter = documentTypeId;
    } else if (typeName) {
      const t = await prisma.documentType.findUnique({ where: { name: typeName } });
      if (!t) return res.json([]);
      typeFilter = t.id;
    }
    const rows = await prisma.libraryDocument.findMany({
      where: typeFilter ? { documentTypeId: typeFilter } : undefined,
      orderBy: [{ updatedAt: "desc" }],
      include: includeType,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

libraryDocumentsRouter.get("/:id", async (req, res, next) => {
  try {
    const row = await prisma.libraryDocument.findUnique({
      where: { id: routeParam(req.params.id) },
      include: includeType,
    });
    if (!row) return res.status(404).json({ error: "ไม่พบ" });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

libraryDocumentsRouter.post("/", upload.single("file"), async (req, res, next) => {
  try {
    const title = String(req.body.title ?? "").trim();
    if (!title) return res.status(400).json({ error: "กรอกชื่อรายการ" });
    const details = String(req.body.details ?? "");
    const docType = await resolveDocumentType(req.body.documentTypeId);
    if (req.body.documentTypeId && String(req.body.documentTypeId).trim() && !docType) {
      return res.status(400).json({ error: "ประเภทเอกสารไม่ถูกต้อง" });
    }
    const file = req.file;
    let fileUrl: string | null = null;
    let mimeType: string | null = null;
    let originalName: string | null = null;
    if (file) {
      try {
        const categoryLabel = docType?.name ?? null;
        const saved = await persistUpload(file, {
          module: "library",
          userId: req.auth?.userId,
          kind: "doc",
          categorySlug: documentCategorySlugFromName(categoryLabel),
          categoryLabel: categoryLabel ?? undefined,
          displayTitle: title,
          allowPdf: true,
          allowOfficeDocs: true,
        });
        fileUrl = saved.fileUrl;
        mimeType = saved.mimeType;
        originalName = saved.displayName;
      } catch (e) {
        return res.status(400).json({ error: e instanceof Error ? e.message : "อัปโหลดไฟล์ไม่สำเร็จ" });
      }
    }
    const row = await prisma.libraryDocument.create({
      data: {
        title,
        details,
        documentTypeId: docType?.id ?? null,
        fileUrl,
        mimeType,
        originalName,
        extractedText: file ? null : undefined,
      },
      include: includeType,
    });
    if (file) {
      const id = row.id;
      setImmediate(() => {
        void runLibraryDocumentExtract(id);
      });
    }
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

libraryDocumentsRouter.put("/:id", upload.single("file"), async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.libraryDocument.findUnique({
      where: { id },
      include: includeType,
    });
    if (!existing) return res.status(404).json({ error: "ไม่พบ" });

    const data: Record<string, unknown> = {};
    let nextTitle = existing.title;
    if (req.body.title !== undefined) {
      const t = String(req.body.title).trim();
      if (!t) return res.status(400).json({ error: "ชื่อรายการต้องไม่ว่าง" });
      data.title = t;
      nextTitle = t;
    }
    if (req.body.details !== undefined) data.details = String(req.body.details);

    let docType =
      existing.documentTypeId && existing.documentType
        ? { id: existing.documentTypeId, name: existing.documentType.name }
        : null;
    if (req.body.documentTypeId !== undefined) {
      docType = await resolveDocumentType(req.body.documentTypeId);
      if (req.body.documentTypeId && String(req.body.documentTypeId).trim() && !docType) {
        return res.status(400).json({ error: "ประเภทเอกสารไม่ถูกต้อง" });
      }
      data.documentTypeId = docType?.id ?? null;
    }
    if (req.file) {
      try {
        const categoryLabel = docType?.name ?? null;
        const saved = await persistUpload(req.file, {
          module: "library",
          userId: req.auth?.userId,
          kind: "doc",
          categorySlug: documentCategorySlugFromName(categoryLabel),
          categoryLabel: categoryLabel ?? undefined,
          displayTitle: nextTitle,
          allowPdf: true,
          allowOfficeDocs: true,
        });
        data.fileUrl = saved.fileUrl;
        data.mimeType = saved.mimeType;
        data.originalName = saved.displayName;
        data.extractedText = null;
      } catch (e) {
        return res.status(400).json({ error: e instanceof Error ? e.message : "อัปโหลดไฟล์ไม่สำเร็จ" });
      }
    }

    const row = await prisma.libraryDocument.update({
      where: { id },
      data,
      include: includeType,
    });
    if (req.file) {
      const updatedId = row.id;
      setImmediate(() => {
        void runLibraryDocumentExtract(updatedId);
      });
    }
    res.json(row);
  } catch (e) {
    next(e);
  }
});

libraryDocumentsRouter.post("/:id/extract-text", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.libraryDocument.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "ไม่พบ" });
    await runLibraryDocumentExtract(id);
    const row = await prisma.libraryDocument.findUnique({
      where: { id },
      include: includeType,
    });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

libraryDocumentsRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.libraryDocument.delete({ where: { id: routeParam(req.params.id) } });
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});
