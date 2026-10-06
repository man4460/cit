import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { levelFor, levelRank, moduleForApiPath, type PermissionLevel } from "../lib/permissions.js";

type CachedUser = { role: UserRole; active: boolean; status: string; permissions: unknown; at: number };
const CACHE_MS = 15_000;
const cache = new Map<string, CachedUser>();

export function invalidatePermissionCache(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
}

async function loadUser(userId: string): Promise<CachedUser | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, active: true, status: true, permissions: true } });
  if (!u) {
    cache.delete(userId);
    return null;
  }
  const row = { ...u, at: Date.now() };
  cache.set(userId, row);
  return row;
}

function requiredLevel(method: string): PermissionLevel {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return "read";
  if (method === "DELETE") return "delete";
  return "edit";
}

const LEVEL_ERROR: Record<PermissionLevel, string> = {
  none: "",
  read: "ไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้",
  edit: "สิทธิ์ของคุณเป็นแบบอ่านอย่างเดียว — ไม่สามารถเพิ่ม/แก้ไขข้อมูลส่วนนี้",
  delete: "ไม่มีสิทธิ์ลบข้อมูลส่วนนี้",
};

/**
 * ตรวจสิทธิ์รายโมดูลจากฐานข้อมูล (role / active / permissions ล่าสุด ไม่รอ token ใหม่)
 * GET ไม่ถูกบล็อก เพราะหลายหน้าดึงข้อมูลอ้างอิงข้ามโมดูล (เช่น ภารกิจดึงบุคลากร/ยานพาหนะ) — การซ่อนเมนูทำที่ frontend
 */
export async function permissionMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth?.userId;
    if (!userId) return next();
    const u = await loadUser(userId);
    if (!u || !u.active || u.status !== "APPROVED") return res.status(401).json({ error: "บัญชีถูกปิดใช้งานหรือไม่พบผู้ใช้" });
    req.auth = { userId, role: u.role };
    if (u.role === "ADMIN") return next();

    const need = requiredLevel(req.method);
    if (need === "read") return next();
    const moduleKey = moduleForApiPath(req.path);
    if (!moduleKey) return next();
    const have = levelFor(u.permissions, moduleKey);
    if (levelRank(have) >= levelRank(need)) return next();
    return res.status(403).json({ error: have === "none" ? LEVEL_ERROR.read : LEVEL_ERROR[need] });
  } catch (e) {
    next(e);
  }
}
