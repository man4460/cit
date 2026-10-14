import { Router, type Request } from "express";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";
import { persistUpload, upload } from "../lib/upload.js";

export const coordinationCategoriesRouter = Router();
export const coordinationContactsRouter = Router();

function prismaCode(e: unknown): string | null {
  return e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : null;
}

async function saveImage(req: Request, kind: string, title: string): Promise<string | null> {
  if (!req.file) return null;
  const saved = await persistUpload(req.file, {
    module: "coordination",
    userId: req.auth?.userId,
    kind,
    displayTitle: title,
    forceImage: true,
  });
  return saved.publicPath;
}

const wantsRemoveImage = (req: Request) => String(req.body?.removeImage ?? "") === "1";

// --- หมวดหมู่ ---

coordinationCategoriesRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.coordinationCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { contacts: true } } },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

coordinationCategoriesRouter.post("/", upload.single("image"), async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "กรอกชื่อหมวดหมู่" });
    let imageUrl: string | null = null;
    try {
      imageUrl = await saveImage(req, "category", name);
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ" });
    }
    const row = await prisma.coordinationCategory.create({
      data: { name, imageUrl, sortOrder: Number(req.body?.sortOrder) || 0 },
    });
    res.status(201).json(row);
  } catch (e) {
    if (prismaCode(e) === "P2002") return res.status(409).json({ error: "ชื่อหมวดหมู่ซ้ำ" });
    next(e);
  }
});

coordinationCategoriesRouter.put("/:id", upload.single("image"), async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.coordinationCategory.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "ไม่พบ" });
    const data: Record<string, unknown> = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: "ชื่อว่างไม่ได้" });
      data.name = name;
    }
    if (req.body?.sortOrder !== undefined) data.sortOrder = Number(req.body.sortOrder) || 0;
    if (req.file) {
      try {
        data.imageUrl = await saveImage(req, "category", String(data.name ?? existing.name));
      } catch (e) {
        return res.status(400).json({ error: e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ" });
      }
    } else if (wantsRemoveImage(req)) {
      data.imageUrl = null;
    }
    const row = await prisma.coordinationCategory.update({ where: { id }, data });
    res.json(row);
  } catch (e) {
    if (prismaCode(e) === "P2002") return res.status(409).json({ error: "ชื่อหมวดหมู่ซ้ำ" });
    next(e);
  }
});

coordinationCategoriesRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.coordinationCategory.delete({ where: { id: routeParam(req.params.id) } });
    res.status(204).send();
  } catch (e) {
    const code = prismaCode(e);
    if (code === "P2025") return res.status(404).json({ error: "ไม่พบ" });
    if (code === "P2003") return res.status(409).json({ error: "มีหน่วยงานในหมวดนี้อยู่ — ย้ายหรือลบหน่วยงานก่อน" });
    next(e);
  }
});

// --- หน่วยงานที่ประสาน ---

const includeCategory = { category: true };

function textFields(body: Record<string, unknown>) {
  const out: Record<string, string> = {};
  for (const k of ["agency", "contactName", "address", "phone", "note"] as const) {
    if (body[k] !== undefined) out[k] = String(body[k] ?? "").trim();
  }
  return out;
}

async function resolveCategoryId(raw: unknown): Promise<{ ok: true; id: string | null } | { ok: false }> {
  const s = raw == null ? "" : String(raw).trim();
  if (!s) return { ok: true, id: null };
  const c = await prisma.coordinationCategory.findUnique({ where: { id: s } });
  return c ? { ok: true, id: c.id } : { ok: false };
}

coordinationContactsRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.coordinationContact.findMany({
      orderBy: [{ updatedAt: "desc" }],
      include: includeCategory,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

coordinationContactsRouter.post("/", upload.single("photo"), async (req, res, next) => {
  try {
    const f = textFields(req.body ?? {});
    if (!f.agency) return res.status(400).json({ error: "กรอกชื่อหน่วยงาน" });
    const cat = await resolveCategoryId(req.body?.categoryId);
    if (!cat.ok) return res.status(400).json({ error: "หมวดหมู่ไม่ถูกต้อง" });
    let photoUrl: string | null = null;
    try {
      photoUrl = await saveImage(req, "contact", f.agency);
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ" });
    }
    const row = await prisma.coordinationContact.create({
      data: {
        agency: f.agency,
        contactName: f.contactName ?? "",
        address: f.address ?? "",
        phone: f.phone ?? "",
        note: f.note ?? "",
        photoUrl,
        categoryId: cat.id,
      },
      include: includeCategory,
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

coordinationContactsRouter.put("/:id", upload.single("photo"), async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const existing = await prisma.coordinationContact.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "ไม่พบ" });
    const data: Record<string, unknown> = textFields(req.body ?? {});
    if (data.agency !== undefined && !data.agency) return res.status(400).json({ error: "ชื่อหน่วยงานต้องไม่ว่าง" });
    if (req.body?.categoryId !== undefined) {
      const cat = await resolveCategoryId(req.body.categoryId);
      if (!cat.ok) return res.status(400).json({ error: "หมวดหมู่ไม่ถูกต้อง" });
      data.categoryId = cat.id;
    }
    if (req.file) {
      try {
        data.photoUrl = await saveImage(req, "contact", String(data.agency ?? existing.agency));
      } catch (e) {
        return res.status(400).json({ error: e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ" });
      }
    } else if (wantsRemoveImage(req)) {
      data.photoUrl = null;
    }
    const row = await prisma.coordinationContact.update({ where: { id }, data, include: includeCategory });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

coordinationContactsRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.coordinationContact.delete({ where: { id: routeParam(req.params.id) } });
    res.status(204).send();
  } catch (e) {
    if (prismaCode(e) === "P2025") return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});
