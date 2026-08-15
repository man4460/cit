import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";
import { randomUUID } from "crypto";
import type { AmmoMoveKind, Prisma } from "@prisma/client";

export const ammunitionRouter = Router();

const moveInclude = {
  moves: { orderBy: [{ movedAt: "desc" }, { createdAt: "desc" }] },
} satisfies Prisma.AmmunitionInclude;

function parseDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

ammunitionRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.ammunition.findMany({
      include: moveInclude,
      orderBy: [{ sortOrder: "asc" }, { kind: "asc" }, { purchasedAt: "desc" }],
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

ammunitionRouter.get("/:id", async (req, res, next) => {
  try {
    const row = await prisma.ammunition.findUnique({
      where: { id: routeParam(req.params.id) },
      include: moveInclude,
    });
    if (!row) return res.status(404).json({ error: "ไม่พบ" });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

ammunitionRouter.post("/", async (req, res, next) => {
  try {
    const { code, kind, purchasedAt, team, detail, quantity, sortOrder } = req.body ?? {};
    if (!kind || !String(kind).trim()) return res.status(400).json({ error: "กรอกชนิดกระสุน" });
    const c = code != null && String(code).trim() ? String(code).trim() : "ไม่ทราบ";
    const t = team != null && String(team).trim() ? String(team).trim() : "";
    const qty = quantity !== undefined ? Math.max(0, Number(quantity) || 0) : 0;
    const bought = parseDate(purchasedAt) ?? null;
    const sourceKey = `${c}::${String(kind).trim()}::${t}::${bought?.toISOString() ?? ""}::${randomUUID()}`;
    const now = bought ?? new Date();
    const row = await prisma.ammunition.create({
      data: {
        sourceKey,
        code: c,
        kind: String(kind).trim(),
        purchasedAt: bought,
        team: t || null,
        detail: detail != null && String(detail).trim() ? String(detail).trim() : null,
        receivedQty: qty,
        remainingQty: qty,
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
        moves:
          qty > 0
            ? {
                create: {
                  kind: "IN",
                  quantity: qty,
                  movedAt: now,
                  note: "นำเข้าคลัง",
                  remainingAfter: qty,
                },
              }
            : undefined,
      },
      include: moveInclude,
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "รายการกระสุนซ้ำ" });
    next(e);
  }
});

ammunitionRouter.put("/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const { code, kind, purchasedAt, team, detail, sortOrder } = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (code !== undefined) data.code = String(code).trim() || "ไม่ทราบ";
    if (kind !== undefined) {
      const v = String(kind).trim();
      if (!v) return res.status(400).json({ error: "ชนิดกระสุนว่างไม่ได้" });
      data.kind = v;
    }
    if (purchasedAt !== undefined) data.purchasedAt = parseDate(purchasedAt) ?? null;
    if (team !== undefined) data.team = String(team).trim() || null;
    if (detail !== undefined) data.detail = String(detail).trim() || null;
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder);
    const row = await prisma.ammunition.update({ where: { id }, data, include: moveInclude });
    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});

ammunitionRouter.post("/:id/moves", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const { kind, quantity, movedAt, withdrawnBy, note } = req.body ?? {};
    const moveKind = String(kind ?? "").toUpperCase() as AmmoMoveKind;
    if (moveKind !== "IN" && moveKind !== "OUT") return res.status(400).json({ error: "ชนิดรายการต้องเป็น IN หรือ OUT" });
    const qty = Math.trunc(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: "จำนวนต้องมากกว่า 0" });
    if (moveKind === "OUT" && !(withdrawnBy && String(withdrawnBy).trim())) {
      return res.status(400).json({ error: "กรอกผู้เบิก" });
    }
    const when = parseDate(movedAt) ?? new Date();

    const row = await prisma.$transaction(async (tx) => {
      const lot = await tx.ammunition.findUnique({ where: { id } });
      if (!lot) return null;
      if (moveKind === "OUT" && qty > lot.remainingQty) {
        throw new Error(`คงเหลือไม่พอ (เหลือ ${lot.remainingQty} นัด)`);
      }
      const remainingAfter = moveKind === "IN" ? lot.remainingQty + qty : lot.remainingQty - qty;
      const receivedQty = moveKind === "IN" ? lot.receivedQty + qty : lot.receivedQty;
      await tx.ammoMove.create({
        data: {
          ammunitionId: id,
          kind: moveKind,
          quantity: qty,
          movedAt: when,
          withdrawnBy: moveKind === "OUT" ? String(withdrawnBy).trim() : null,
          note: note != null && String(note).trim() ? String(note).trim() : null,
          remainingAfter,
        },
      });
      return tx.ammunition.update({
        where: { id },
        data: { remainingQty: remainingAfter, receivedQty },
        include: moveInclude,
      });
    });
    if (!row) return res.status(404).json({ error: "ไม่พบ" });
    res.status(201).json(row);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("คงเหลือ")) return res.status(400).json({ error: e.message });
    next(e);
  }
});

ammunitionRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.ammunition.delete({ where: { id: routeParam(req.params.id) } });
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});
