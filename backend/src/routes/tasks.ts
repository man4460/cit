import { Router } from "express";
import { WorkTaskStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";
import { publicFileUrl, upload } from "../lib/upload.js";

export const tasksRouter = Router();

const taskInclude = { photos: { orderBy: { sortOrder: "asc" as const } } };

function isNotionUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname.endsWith("notion.so") || u.hostname.endsWith("notion.site"));
  } catch {
    return false;
  }
}

type ParsedDate =
  | { kind: "omit" }
  | { kind: "null" }
  | { kind: "date"; value: Date }
  | { kind: "invalid" };

function parseBodyDate(v: unknown): ParsedDate {
  if (v === undefined) return { kind: "omit" };
  if (v === null || v === "") return { kind: "null" };
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return { kind: "invalid" };
  return { kind: "date", value: d };
}

function parsedDateToValue(p: ParsedDate): Date | null {
  return p.kind === "date" ? p.value : null;
}

tasksRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.workTask.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: taskInclude,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

tasksRouter.post("/", async (req, res, next) => {
  try {
    const { title, notionUrl, description, status, sortOrder, startsAt, endsAt, location, recordedBy } =
      req.body ?? {};
    if (!title) return res.status(400).json({ error: "ต้องระบุหัวข้อกิจกรรม" });

    let url: string | null = null;
    if (notionUrl !== undefined && notionUrl !== null && String(notionUrl).trim() !== "") {
      const trimmed = String(notionUrl).trim();
      if (!isNotionUrl(trimmed)) return res.status(400).json({ error: "ลิงก์ Notion ไม่ถูกต้อง (https://…notion.so หรือ notion.site)" });
      url = trimmed;
    }

    const sd = parseBodyDate(startsAt);
    const ed = parseBodyDate(endsAt);
    if (sd.kind === "invalid") return res.status(400).json({ error: "รูปแบบเวลาเริ่มไม่ถูกต้อง" });
    if (ed.kind === "invalid") return res.status(400).json({ error: "รูปแบบเวลาสิ้นสุดไม่ถูกต้อง" });

    if (status && !Object.values(WorkTaskStatus).includes(status))
      return res.status(400).json({ error: "status ไม่ถูกต้อง" });

    const row = await prisma.workTask.create({
      data: {
        title: String(title),
        notionUrl: url,
        description: description ? String(description) : null,
        startsAt: parsedDateToValue(sd),
        endsAt: parsedDateToValue(ed),
        location: location ? String(location) : null,
        recordedBy: recordedBy ? String(recordedBy) : null,
        status: status ?? "TODO",
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
      },
      include: taskInclude,
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

tasksRouter.patch("/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const {
      title,
      notionUrl,
      description,
      status,
      sortOrder,
      startsAt,
      endsAt,
      location,
      recordedBy,
    } = req.body ?? {};
    const data: Record<string, unknown> = {};

    if (title !== undefined) data.title = String(title);
    if (notionUrl !== undefined) {
      if (notionUrl === null || String(notionUrl).trim() === "") data.notionUrl = null;
      else {
        const trimmed = String(notionUrl).trim();
        if (!isNotionUrl(trimmed)) return res.status(400).json({ error: "ลิงก์ Notion ไม่ถูกต้อง" });
        data.notionUrl = trimmed;
      }
    }
    if (description !== undefined) data.description = description ? String(description) : null;
    if (startsAt !== undefined) {
      const p = parseBodyDate(startsAt);
      if (p.kind === "invalid") return res.status(400).json({ error: "รูปแบบเวลาเริ่มไม่ถูกต้อง" });
      data.startsAt = parsedDateToValue(p);
    }
    if (endsAt !== undefined) {
      const p = parseBodyDate(endsAt);
      if (p.kind === "invalid") return res.status(400).json({ error: "รูปแบบเวลาสิ้นสุดไม่ถูกต้อง" });
      data.endsAt = parsedDateToValue(p);
    }
    if (location !== undefined) data.location = location ? String(location) : null;
    if (recordedBy !== undefined) data.recordedBy = recordedBy ? String(recordedBy) : null;
    if (status !== undefined) {
      if (!Object.values(WorkTaskStatus).includes(status)) return res.status(400).json({ error: "status ไม่ถูกต้อง" });
      data.status = status;
    }
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder);

    const row = await prisma.workTask.update({ where: { id }, data, include: taskInclude });
    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});

tasksRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.workTask.delete({ where: { id: routeParam(req.params.id) } });
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});

tasksRouter.post("/:id/photos", upload.array("photos", 24), async (req, res, next) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files?.length) return res.status(400).json({ error: "เลือกรูปอย่างน้อย 1 ไฟล์" });
    const taskId = routeParam(req.params.id);
    const exists = await prisma.workTask.findUnique({ where: { id: taskId }, select: { id: true } });
    if (!exists) return res.status(404).json({ error: "ไม่พบกิจกรรม" });

    const maxSort = await prisma.workTaskPhoto.aggregate({
      where: { workTaskId: taskId },
      _max: { sortOrder: true },
    });
    let order = (maxSort._max.sortOrder ?? -1) + 1;
    const created: Awaited<ReturnType<typeof prisma.workTaskPhoto.create>>[] = [];
    for (const f of files) {
      const mime = f.mimetype ?? "";
      if (!mime.startsWith("image/")) continue;
      const row = await prisma.workTaskPhoto.create({
        data: {
          workTaskId: taskId,
          fileUrl: publicFileUrl(f.filename),
          mimeType: mime,
          originalName: f.originalname,
          sortOrder: order++,
        },
      });
      created.push(row);
    }
    if (!created.length) return res.status(400).json({ error: "อัปโหลดเฉพาะไฟล์รูปภาพ (image/*)" });
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

tasksRouter.delete("/:id/photos/:photoId", async (req, res, next) => {
  try {
    const taskId = routeParam(req.params.id);
    const photoId = routeParam(req.params.photoId);
    const row = await prisma.workTaskPhoto.findFirst({
      where: { id: photoId, workTaskId: taskId },
    });
    if (!row) return res.status(404).json({ error: "ไม่พบรูป" });
    await prisma.workTaskPhoto.delete({ where: { id: photoId } });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
