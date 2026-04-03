import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { verifyUserToken } from "../lib/jwt.js";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
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
