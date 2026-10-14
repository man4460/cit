import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { verifyUserToken } from "../lib/jwt.js";

/**
 * บริการอัตโนมัติ (เช่น AI บนเซิร์ฟเวอร์) ส่ง `X-Api-Key` แทน JWT
 * ทำงานในนามผู้ใช้ SERVICE_API_USER_ID — สิทธิ์ตามที่ตั้งให้ผู้ใช้นั้น
 */
function serviceApiAuth(req: Request): boolean {
  const key = process.env.SERVICE_API_KEY?.trim();
  const userId = process.env.SERVICE_API_USER_ID?.trim();
  const sent = req.headers["x-api-key"];
  if (!key || !userId || typeof sent !== "string" || !sent) return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(key);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  req.auth = { userId, role: "OPERATOR" };
  return true;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (serviceApiAuth(req)) return next();
  const h = req.headers.authorization;
  const token = h?.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "ต้องเข้าสู่ระบบ" });
  try {
    const { sub, role } = verifyUserToken(token);
    req.auth = { userId: sub, role: role as UserRole };
    next();
  } catch {
    return res.status(401).json({ error: "โทเคนไม่ถูกต้องหรือหมดอายุ" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.role !== "ADMIN") return res.status(403).json({ error: "ต้องเป็นผู้ดูแลระบบ" });
  next();
}
