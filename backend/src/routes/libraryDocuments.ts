import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";
import { publicFileUrl, upload } from "../lib/upload.js";

export const libraryDocumentsRouter = Router();

const includeType = { documentType: true };

libraryDocumentsRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.libraryDocument.findMany({
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

async function resolveDocumentTypeId(raw: unknown): Promise<string | null> {
  const s = raw == null ? "" : String(raw).trim();
  if (!s) return null;
  const t = await prisma.documentType.findUnique({ where: { id: s } });
  return t ? s : null;
}

libraryDocumentsRouter.post("/", upload.single("file"), async (req, res, next) => {
  try {
    const title = String(req.body.title ?? "").trim();
    if (!title) return res.status(400).json({ error: "กรอกชื่อรายการ" });
    const details = String(req.body.details ?? "");
    const documentTypeId = await resolveDocumentTypeId(req.body.documentTypeId);
    if (req.body.documentTypeId && String(req.body.documentTypeId).trim() && !documentTypeId) {
      return res.status(400).json({ error: "ประเภทเอกสารไม่ถูกต้อง" });
    }
    const file = req.file;
    const row = await prisma.libraryDocument.create({
      data: {
        title,
        details,
        documentTypeId,
        fileUrl: file ? publicFileUrl(file.filename) : null,
        mimeType: file?.mimetype ?? null,
        originalName: file?.originalname ?? null,
      },
      include: includeType,
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

libraryDocumentsRouter.put("/:id", upload.single("file"), async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.libraryDocument.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "ไม่พบ" });

    const data: Record<string, unknown> = {};
    if (req.body.title !== undefined) {
      const t = String(req.body.title).trim();
      if (!t) return res.status(400).json({ error: "ชื่อรายการต้องไม่ว่าง" });
      data.title = t;
    }
    if (req.body.details !== undefined) data.details = String(req.body.details);
    if (req.body.documentTypeId !== undefined) {
      const documentTypeId = await resolveDocumentTypeId(req.body.documentTypeId);
      if (req.body.documentTypeId && String(req.body.documentTypeId).trim() && !documentTypeId) {
        return res.status(400).json({ error: "ประเภทเอกสารไม่ถูกต้อง" });
      }
      data.documentTypeId = documentTypeId;
    }
    if (req.file) {
      data.fileUrl = publicFileUrl(req.file.filename);
      data.mimeType = req.file.mimetype;
      data.originalName = req.file.originalname;
    }

    const row = await prisma.libraryDocument.update({
      where: { id },
      data,
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
