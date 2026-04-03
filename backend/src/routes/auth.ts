import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma.js";
import { signUserToken } from "../lib/jwt.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {};
    const u = String(username ?? "").trim();
    const p = String(password ?? "");
    if (!u || !p) return res.status(400).json({ error: "กรอกชื่อผู้ใช้และรหัสผ่าน" });

    const userCount = await prisma.user.count();
    if (userCount === 0) {
      return res.status(503).json({
        error:
          "ยังไม่มีบัญชีในระบบ — ที่โฟลเดอร์ backend ตั้ง INITIAL_ADMIN_PASSWORD (และถ้าต้องการ INITIAL_ADMIN_USERNAME) ใน .env แล้วรัน npm run bootstrap:admin จากนั้นรีสตาร์ท API",
      });
    }

    const user = await prisma.user.findUnique({ where: { username: u } });
    if (!user || !user.active) return res.status(401).json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });

    const ok = await bcrypt.compare(p, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });

    const token = signUserToken(user.id, user.role);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.fullName,
        active: user.active,
      },
    });
  } catch (e) {
    next(e);
  }
});
