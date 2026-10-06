import { Router } from "express";
import bcrypt from "bcrypt";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/auth.js";
import { invalidatePermissionCache } from "../middleware/permission.js";
import { parsePermissions } from "../lib/permissions.js";
import { routeParam } from "../lib/routeParam.js";

export const adminUsersRouter = Router();
adminUsersRouter.use(requireAdmin);

const userSelect = {
  id: true,
  username: true,
  role: true,
  fullName: true,
  active: true,
  permissions: true,
  status: true,
  firstName: true,
  lastName: true,
  employeeCode: true,
  position: true,
  affiliation: true,
  reviewedAt: true,
  reviewedBy: true,
  rejectReason: true,
  createdAt: true,
} as const;

const PROFILE_FIELDS = ["firstName", "lastName", "employeeCode", "position", "affiliation"] as const;

function prismaCode(e: unknown): string | null {
  return e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : null;
}

async function reviewerName(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, username: true } });
  return u?.fullName?.trim() || u?.username || null;
}

adminUsersRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.user.findMany({
      orderBy: { username: "asc" },
      select: userSelect,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

adminUsersRouter.post("/", async (req, res, next) => {
  try {
    const { username, password, role, fullName, permissions } = req.body ?? {};
    if (!username || !password) return res.status(400).json({ error: "username และ password จำเป็น" });
    if (String(password).length < 8) return res.status(400).json({ error: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" });
    if (role && !Object.values(UserRole).includes(role))
      return res.status(400).json({ error: "role ไม่ถูกต้อง" });
    let perms: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
    if (permissions !== undefined) {
      const p = parsePermissions(permissions);
      if (!p.ok) return res.status(400).json({ error: p.error });
      perms = p.value ?? Prisma.DbNull;
    }

    const hash = await bcrypt.hash(String(password), 10);
    const row = await prisma.user.create({
      data: {
        username: String(username),
        passwordHash: hash,
        role: (role as UserRole) ?? "OPERATOR",
        fullName: fullName ? String(fullName) : null,
        permissions: perms,
      },
      select: userSelect,
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
    const { username, role, fullName, active, password, permissions } = req.body ?? {};
    const data: Prisma.UserUpdateInput = {};

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
    if (permissions !== undefined) {
      const p = parsePermissions(permissions);
      if (!p.ok) return res.status(400).json({ error: p.error });
      data.permissions = p.value ?? Prisma.DbNull;
    }
    for (const f of PROFILE_FIELDS) {
      if (req.body?.[f] !== undefined) data[f] = String(req.body[f] ?? "").trim() || null;
    }
    if (req.body?.firstName !== undefined || req.body?.lastName !== undefined) {
      const cur = await prisma.user.findUnique({ where: { id }, select: { firstName: true, lastName: true } });
      const fn = (data.firstName as string | null | undefined) ?? cur?.firstName ?? "";
      const ln = (data.lastName as string | null | undefined) ?? cur?.lastName ?? "";
      if (fullName === undefined && (fn || ln)) data.fullName = `${fn} ${ln}`.trim();
    }

    if (Object.keys(data).length === 0) return res.status(400).json({ error: "ไม่มีข้อมูลที่จะอัปเดต" });

    const row = await prisma.user.update({
      where: { id },
      data,
      select: userSelect,
    });
    invalidatePermissionCache(id);
    res.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "ชื่อผู้ใช้ซ้ำ" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});

/** อนุมัติคำขอสมัคร — กำหนดบทบาทและสิทธิ์รายโมดูลพร้อมกัน */
adminUsersRouter.post("/:id/approve", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const { role, permissions } = req.body ?? {};
    const r = (role ?? "OPERATOR") as UserRole;
    if (!Object.values(UserRole).includes(r)) return res.status(400).json({ error: "role ไม่ถูกต้อง" });
    const p = parsePermissions(permissions ?? {});
    if (!p.ok) return res.status(400).json({ error: p.error });

    const cur = await prisma.user.findUnique({ where: { id }, select: { status: true } });
    if (!cur) return res.status(404).json({ error: "ไม่พบ" });
    if (cur.status === "APPROVED") return res.status(400).json({ error: "บัญชีนี้อนุมัติแล้ว" });

    const row = await prisma.user.update({
      where: { id },
      data: {
        status: "APPROVED",
        active: true,
        role: r,
        permissions: r === "ADMIN" ? Prisma.DbNull : p.value ?? Prisma.DbNull,
        reviewedAt: new Date(),
        reviewedBy: await reviewerName(req.auth!.userId),
        rejectReason: null,
      },
      select: userSelect,
    });
    invalidatePermissionCache(id);
    res.json(row);
  } catch (e) {
    if (prismaCode(e) === "P2025") return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});

adminUsersRouter.post("/:id/reject", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    if (id === req.auth!.userId) return res.status(400).json({ error: "ไม่สามารถปฏิเสธบัญชีตัวเอง" });
    const reason = String(req.body?.reason ?? "").trim() || null;
    const row = await prisma.user.update({
      where: { id },
      data: {
        status: "REJECTED",
        active: false,
        reviewedAt: new Date(),
        reviewedBy: await reviewerName(req.auth!.userId),
        rejectReason: reason,
      },
      select: userSelect,
    });
    invalidatePermissionCache(id);
    res.json(row);
  } catch (e) {
    if (prismaCode(e) === "P2025") return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});

adminUsersRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    if (id === req.auth!.userId) return res.status(400).json({ error: "ไม่สามารถลบบัญชีตัวเอง" });
    await prisma.user.delete({ where: { id } });
    invalidatePermissionCache(id);
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "ไม่พบ" });
    next(e);
  }
});
