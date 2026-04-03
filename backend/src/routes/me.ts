import bcrypt from "bcrypt";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const meRouter = Router();

const meSelect = { id: true, username: true, role: true, fullName: true, active: true } as const;

meRouter.get("/me", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: meSelect,
    });
    if (!user || !user.active) return res.status(401).json({ error: "บัญชีถูกปิดการใช้งาน" });
    res.json(user);
  } catch (e) {
    next(e);
  }
});

meRouter.patch("/me", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.auth!.userId;
    const row = await prisma.user.findUnique({ where: { id } });
    if (!row || !row.active) return res.status(401).json({ error: "บัญชีถูกปิดการใช้งาน" });

    const body = req.body ?? {};
    const fullNameIn = body.fullName;
    const currentPassword = body.currentPassword;
    const newPassword = body.newPassword;

    const data: { fullName?: string | null; passwordHash?: string } = {};

    if (fullNameIn !== undefined) {
      if (fullNameIn === null || fullNameIn === "") data.fullName = null;
      else {
        const s = String(fullNameIn).trim();
        data.fullName = s.length ? s : null;
      }
    }

    const wantsPw =
      newPassword !== undefined &&
      newPassword !== null &&
      String(newPassword).length > 0;

    if (wantsPw) {
      const np = String(newPassword);
      if (np.length < 8) {
        return res.status(400).json({ error: "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร" });
      }
      const cur = String(currentPassword ?? "");
      if (!cur) {
        return res.status(400).json({ error: "กรอกรหัสผ่านปัจจุบันเพื่อเปลี่ยนรหัสผ่าน" });
      }
      const match = await bcrypt.compare(cur, row.passwordHash);
      if (!match) return res.status(401).json({ error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" });
      data.passwordHash = await bcrypt.hash(np, 10);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "ไม่มีข้อมูลที่จะอัปเดต" });
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: meSelect,
    });
    res.json(user);
  } catch (e) {
    next(e);
  }
});
