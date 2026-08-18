import bcrypt from "bcrypt";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { persistUpload, unlinkUploadFile, upload } from "../lib/upload.js";
import { uploadRelativePathFromFileUrl } from "../lib/libraryDocumentExtract.js";

export const meRouter = Router();

const meSelect = {
  id: true,
  username: true,
  role: true,
  fullName: true,
  avatarUrl: true,
  active: true,
} as const;

function storedUploadRelPath(avatarUrl: string | null | undefined): string | null {
  return uploadRelativePathFromFileUrl(avatarUrl ?? "");
}

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
      newPassword !== undefined && newPassword !== null && String(newPassword).length > 0;

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
      if (!match) return res.status(400).json({ error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" });
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

meRouter.post("/me/avatar", upload.single("photo"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "เลือกไฟล์รูป" });

    const id = req.auth!.userId;
    const existing = await prisma.user.findUnique({ where: { id }, select: { id: true, active: true, avatarUrl: true } });
    if (!existing || !existing.active) return res.status(401).json({ error: "บัญชีถูกปิดการใช้งาน" });

    let saved;
    try {
      saved = await persistUpload(req.file, {
        module: "profile",
        userId: id,
        kind: "avatar",
        forceImage: true,
      });
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ" });
    }

    const old = storedUploadRelPath(existing.avatarUrl);
    const avatarUrl = saved.publicPath;
    const user = await prisma.user.update({
      where: { id },
      data: { avatarUrl },
      select: meSelect,
    });
    if (old && old !== saved.relativePath) unlinkUploadFile(old);
    res.json(user);
  } catch (e) {
    next(e);
  }
});

meRouter.delete("/me/avatar", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.auth!.userId;
    const existing = await prisma.user.findUnique({ where: { id }, select: { id: true, active: true, avatarUrl: true } });
    if (!existing || !existing.active) return res.status(401).json({ error: "บัญชีถูกปิดการใช้งาน" });
    const old = storedUploadRelPath(existing.avatarUrl);
    const user = await prisma.user.update({
      where: { id },
      data: { avatarUrl: null },
      select: meSelect,
    });
    if (old) unlinkUploadFile(old);
    res.json(user);
  } catch (e) {
    next(e);
  }
});
