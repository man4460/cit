import { Router } from "express";
import bcrypt from "bcrypt";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/auth.js";
import { routeParam } from "../lib/routeParam.js";

export const adminUsersRouter = Router();
adminUsersRouter.use(requireAdmin);

adminUsersRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.user.findMany({
      orderBy: { username: "asc" },
      select: {
        id: true,
        username: true,
        role: true,
        fullName: true,
        active: true,
        createdAt: true,
      },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

adminUsersRouter.post("/", async (req, res, next) => {
  try {
    const { username, password, role, fullName } = req.body ?? {};
    if (!username || !password) return res.status(400).json({ error: "username และ password จำเป็น" });
    if (String(password).length < 8) return res.status(400).json({ error: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" });
    if (role && !Object.values(UserRole).includes(role))
      return res.status(400).json({ error: "role ไม่ถูกต้อง" });

    const hash = await bcrypt.hash(String(password), 10);
    const row = await prisma.user.create({
      data: {
        username: String(username),
        passwordHash: hash,
        role: (role as UserRole) ?? "OPERATOR",
        fullName: fullName ? String(fullName) : null,
      },
      select: { id: true, username: true, role: true, fullName: true, active: true, createdAt: true },
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "ชื่อผู้ใช้ซ้ำ" });
    next(e);
  }
});

adminUsersRouter.patch("/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const selfId = req.auth!.userId;
    const { username, role, fullName, active, password } = req.body ?? {};
    const data: Record<string, unknown> = {};

    if (username !== undefined) {
      const u = String(username).trim();
      if (!u) return res.status(400).json({ error: "ชื่อผู้ใช้ว่างไม่ได้" });
      data.username = u;
    }
    if (role !== undefined) {
      if (!Object.values(UserRole).includes(role)) return res.status(400).json({ error: "role ไม่ถูกต้อง" });
      if (id === selfId && role !== "ADMIN") return res.status(400).json({ error: "ไม่สามารถลดสิทธิ์บัญชีตัวเอง" });
      data.role = role;
    }
    if (fullName !== undefined) data.fullName = fullName || null;
    if (active !== undefined) {
      if (id === selfId && !Boolean(active)) return res.status(400).json({ error: "ไม่สามารถปิดการใช้งานบัญชีตัวเอง" });
      data.active = Boolean(active);
    }
    if (password !== undefined && String(password).length > 0) {
      if (String(password).length < 8) {
        return res.status(400).json({ error: "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร" });
      }
      data.passwordHash = await bcrypt.hash(String(password), 10);
    }

    if (Object.keys(data).length === 0) return res.status(400).json({ error: "ไม่มีข้อมูลที่จะอัปเดต" });

    const row = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, username: true, role: true, fullName: true, active: true, createdAt: true },
    });
    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "ชื่อผู้ใช้ซ้ำ" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});

adminUsersRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    if (id === req.auth!.userId) return res.status(400).json({ error: "ไม่สามารถลบบัญชีตัวเอง" });
    await prisma.user.delete({ where: { id } });
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});
