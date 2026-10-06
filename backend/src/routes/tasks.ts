import { Router } from "express";
import { WorkTaskStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";
import { persistUpload, upload } from "../lib/upload.js";

export const tasksRouter = Router();

const taskInclude = {
  category: { select: { id: true, name: true } },
  photos: { orderBy: { sortOrder: "asc" as const } },
  expenses: { orderBy: { sortOrder: "asc" as const } },
  attachments: { orderBy: { sortOrder: "asc" as const } },
  participants: {
    orderBy: { sortOrder: "asc" as const },
    include: { personnel: { select: { id: true, fullName: true, rank: true, position: true, photoUrl: true } } },
  },
};

type ParticipantInput = { personnelId: string | null; name: string; affiliation: string | null; sortOrder: number };

/** undefined = ไม่แก้รายชื่อ; array = แทนที่ทั้งหมด (ชื่อซ้ำ/บุคลากรซ้ำถูกตัดออก) */
async function parseParticipants(raw: unknown): Promise<ParticipantInput[] | undefined | { error: string }> {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return { error: "participants ต้องเป็นรายการ" };
  const rows = raw.map((p) => (p ?? {}) as Record<string, unknown>);
  const ids = [...new Set(rows.map((r) => String(r.personnelId ?? "").trim()).filter(Boolean))];
  const people = ids.length
    ? await prisma.personnel.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, rank: true } })
    : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  const out: ParticipantInput[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const pid = String(r.personnelId ?? "").trim() || null;
    const person = pid ? byId.get(pid) : undefined;
    if (pid && !person) return { error: "ไม่พบบุคลากรที่เลือกบางรายการ — รีเฟรชแล้วลองใหม่" };
    const name = (person ? [person.rank, person.fullName].filter(Boolean).join(" ") : String(r.name ?? ""))
      .replace(/\s+/g, " ")
      .trim();
    if (!name) continue;
    const key = pid ?? `n:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      personnelId: pid,
      name: name.slice(0, 191),
      affiliation: String(r.affiliation ?? "").trim().slice(0, 191) || null,
      sortOrder: out.length,
    });
  }
  return out;
}

type ExpenseInput = {
  category: string | null;
  item: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  note: string | null;
  sortOrder: number;
};

function toMoney(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

/** undefined = ไม่แก้รายการ; array = แทนที่ทั้งหมด */
function parseExpenses(raw: unknown): ExpenseInput[] | undefined | { error: string } {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return { error: "expenses ต้องเป็นรายการ" };
  const out: ExpenseInput[] = [];
  for (const [i, e] of raw.entries()) {
    const r = (e ?? {}) as Record<string, unknown>;
    const item = String(r.item ?? "").trim();
    const quantity = toMoney(r.quantity) ?? 1;
    const unitPrice = toMoney(r.unitPrice) ?? 0;
    if (!item && !unitPrice) continue;
    if (!item) return { error: `ค่าใช้จ่ายแถวที่ ${i + 1}: ต้องระบุรายการ` };
    if (Number.isNaN(quantity) || Number.isNaN(unitPrice) || quantity < 0 || unitPrice < 0)
      return { error: `ค่าใช้จ่ายแถวที่ ${i + 1}: จำนวน/ราคาไม่ถูกต้อง` };
    out.push({
      category: String(r.category ?? "").trim() || null,
      item,
      quantity,
      unitPrice,
      amount: Math.round(quantity * unitPrice * 100) / 100,
      note: String(r.note ?? "").trim() || null,
      sortOrder: out.length,
    });
  }
  return out;
}

function parseBudget(raw: unknown): number | null | undefined | { error: string } {
  if (raw === undefined) return undefined;
  const n = toMoney(raw);
  if (n === null) return null;
  if (Number.isNaN(n) || n < 0) return { error: "งบประมาณไม่ถูกต้อง" };
  return n;
}

const isErr = (v: unknown): v is { error: string } => Boolean(v && typeof v === "object" && "error" in v);

function isNotionUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname.endsWith("notion.so") || u.hostname.endsWith("notion.site"));
  } catch {
    return false;
  }
}

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"]);

function youtubeVideoId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol) || !YOUTUBE_HOSTS.has(u.hostname.toLowerCase())) return null;
  const id = u.hostname.toLowerCase().endsWith("youtu.be")
    ? u.pathname.split("/")[1]
    : u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/)?.[1];
  return id && /^[\w-]{6,20}$/.test(id) ? id : null;
}

/** undefined = ไม่แก้; null = ล้างค่า */
function parseYoutube(raw: unknown): string | null | undefined | { error: string } {
  if (raw === undefined) return undefined;
  const s = raw === null ? "" : String(raw).trim();
  if (!s) return null;
  if (!youtubeVideoId(s)) return { error: "ลิงก์ YouTube ไม่ถูกต้อง (เช่น https://www.youtube.com/watch?v=… หรือ https://youtu.be/…)" };
  return s;
}

/** undefined = ไม่แก้; null = ไม่ระบุหมวด */
async function parseCategoryId(raw: unknown): Promise<string | null | undefined | { error: string }> {
  if (raw === undefined) return undefined;
  const id = raw === null ? "" : String(raw).trim();
  if (!id) return null;
  const found = await prisma.activityCategory.findUnique({ where: { id }, select: { id: true } });
  return found ? id : { error: "ไม่พบหมวดหมู่กิจกรรม" };
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

    const budget = parseBudget(req.body?.budgetAmount);
    if (isErr(budget)) return res.status(400).json(budget);
    const expenses = parseExpenses(req.body?.expenses);
    if (isErr(expenses)) return res.status(400).json(expenses);
    const youtube = parseYoutube(req.body?.youtubeUrl);
    if (isErr(youtube)) return res.status(400).json(youtube);
    const categoryId = await parseCategoryId(req.body?.categoryId);
    if (isErr(categoryId)) return res.status(400).json(categoryId);
    const participants = await parseParticipants(req.body?.participants);
    if (isErr(participants)) return res.status(400).json(participants);

    const row = await prisma.workTask.create({
      data: {
        ...(participants?.length ? { participants: { create: participants } } : {}),
        categoryId: categoryId ?? null,
        youtubeUrl: youtube ?? null,
        budgetAmount: budget ?? null,
        ...(expenses?.length ? { expenses: { create: expenses } } : {}),
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
    const budget = parseBudget(req.body?.budgetAmount);
    if (isErr(budget)) return res.status(400).json(budget);
    if (budget !== undefined) data.budgetAmount = budget;
    const youtube = parseYoutube(req.body?.youtubeUrl);
    if (isErr(youtube)) return res.status(400).json(youtube);
    if (youtube !== undefined) data.youtubeUrl = youtube;
    const categoryId = await parseCategoryId(req.body?.categoryId);
    if (isErr(categoryId)) return res.status(400).json(categoryId);
    if (categoryId !== undefined) data.categoryId = categoryId;
    const participants = await parseParticipants(req.body?.participants);
    if (isErr(participants)) return res.status(400).json(participants);
    const expenses = parseExpenses(req.body?.expenses);
    if (isErr(expenses)) return res.status(400).json(expenses);

    const row = await prisma.$transaction(async (tx) => {
      if (expenses !== undefined) {
        await tx.workTaskExpense.deleteMany({ where: { workTaskId: id } });
        if (expenses.length) await tx.workTaskExpense.createMany({ data: expenses.map((e) => ({ ...e, workTaskId: id })) });
      }
      if (participants !== undefined) {
        await tx.workTaskParticipant.deleteMany({ where: { workTaskId: id } });
        if (participants.length)
          await tx.workTaskParticipant.createMany({ data: participants.map((p) => ({ ...p, workTaskId: id })) });
      }
      return tx.workTask.update({ where: { id }, data, include: taskInclude });
    });
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
      try {
        const saved = await persistUpload(f, {
          module: "activities",
          userId: req.auth?.userId,
          kind: "photo",
          forceImage: true,
        });
        const row = await prisma.workTaskPhoto.create({
          data: {
            workTaskId: taskId,
            fileUrl: saved.publicPath,
            mimeType: saved.mimeType,
            originalName: saved.displayName,
            sortOrder: order++,
          },
        });
        created.push(row);
      } catch {
        /* skip */
      }
    }
    if (!created.length) return res.status(400).json({ error: "อัปโหลดเฉพาะไฟล์รูปภาพ (image/*)" });
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

tasksRouter.post("/:id/attachments", upload.array("files", 20), async (req, res, next) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files?.length) return res.status(400).json({ error: "เลือกไฟล์อย่างน้อย 1 ไฟล์" });
    const taskId = routeParam(req.params.id);
    const exists = await prisma.workTask.findUnique({ where: { id: taskId }, select: { id: true } });
    if (!exists) return res.status(404).json({ error: "ไม่พบกิจกรรม" });

    const maxSort = await prisma.workTaskAttachment.aggregate({
      where: { workTaskId: taskId },
      _max: { sortOrder: true },
    });
    let order = (maxSort._max.sortOrder ?? -1) + 1;
    const created: Awaited<ReturnType<typeof prisma.workTaskAttachment.create>>[] = [];
    const failed: string[] = [];
    for (const f of files) {
      try {
        const saved = await persistUpload(f, {
          module: "activities",
          userId: req.auth?.userId,
          kind: "doc",
          allowOfficeDocs: true,
        });
        created.push(
          await prisma.workTaskAttachment.create({
            data: {
              workTaskId: taskId,
              fileUrl: saved.publicPath,
              mimeType: saved.mimeType,
              originalName: saved.displayName,
              fileSize: saved.fileSize,
              sortOrder: order++,
            },
          }),
        );
      } catch (e) {
        failed.push(`${f.originalname}: ${e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ"}`);
      }
    }
    if (!created.length) return res.status(400).json({ error: failed.join(" · ") || "อัปโหลดไม่สำเร็จ" });
    res.status(201).json({ created, failed });
  } catch (e) {
    next(e);
  }
});

tasksRouter.delete("/:id/attachments/:attachmentId", async (req, res, next) => {
  try {
    const taskId = routeParam(req.params.id);
    const attachmentId = routeParam(req.params.attachmentId);
    const row = await prisma.workTaskAttachment.findFirst({ where: { id: attachmentId, workTaskId: taskId } });
    if (!row) return res.status(404).json({ error: "ไม่พบไฟล์แนบ" });
    await prisma.workTaskAttachment.delete({ where: { id: attachmentId } });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

tasksRouter.put("/:id/photos/:photoId/cover", async (req, res, next) => {
  try {
    const taskId = routeParam(req.params.id);
    const photoId = routeParam(req.params.photoId);
    const row = await prisma.workTaskPhoto.findFirst({ where: { id: photoId, workTaskId: taskId }, select: { id: true } });
    if (!row) return res.status(404).json({ error: "ไม่พบรูป" });
    await prisma.$transaction([
      prisma.workTaskPhoto.updateMany({ where: { workTaskId: taskId, isCover: true }, data: { isCover: false } }),
      prisma.workTaskPhoto.update({ where: { id: photoId }, data: { isCover: true } }),
    ]);
    res.status(204).send();
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
