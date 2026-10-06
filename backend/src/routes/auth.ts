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
    if (!user) return res.status(401).json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });

    const ok = await bcrypt.compare(p, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    if (user.status === "PENDING")
      return res.status(403).json({ error: "บัญชีนี้รอผู้ดูแลระบบตรวจสอบและอนุมัติ — กรุณารอการอนุมัติก่อนเข้าใช้งาน" });
    if (user.status === "REJECTED")
      return res.status(403).json({
        error: `คำขอสมัครสมาชิกไม่ได้รับการอนุมัติ${user.rejectReason ? ` (${user.rejectReason})` : ""} — ติดต่อผู้ดูแลระบบ`,
      });
    if (!user.active) return res.status(401).json({ error: "บัญชีนี้ถูกปิดใช้งาน — ติดต่อผู้ดูแลระบบ" });

    const token = signUserToken(user.id, user.role);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        active: user.active,
        permissions: user.permissions,
      },
    });
  } catch (e) {
    next(e);
  }
});

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

/** สมัครสมาชิก — สร้างบัญชีสถานะ PENDING (เข้าระบบไม่ได้จนแอดมินอนุมัติ) */
authRouter.post("/register", async (req, res, next) => {
  try {
    const b = req.body ?? {};
    const s = (v: unknown) => String(v ?? "").trim();
    const username = s(b.username);
    const password = String(b.password ?? "");
    const firstName = s(b.firstName);
    const lastName = s(b.lastName);
    const employeeCode = s(b.employeeCode);
    const position = s(b.position);
    const affiliation = s(b.affiliation);

    if (!USERNAME_RE.test(username))
      return res.status(400).json({ error: "ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ ตัวเลข หรือ . _ - ความยาว 3–32 ตัว" });
    if (password.length < 8) return res.status(400).json({ error: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" });
    if (!firstName || !lastName || !employeeCode || !position || !affiliation)
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบทุกช่อง" });

    const dupCode = await prisma.user.findFirst({
      where: { employeeCode, status: { not: "REJECTED" } },
      select: { id: true },
    });
    if (dupCode) return res.status(409).json({ error: "เลขประจำตัวพนักงานนี้มีบัญชีหรือคำขอสมัครอยู่แล้ว" });

    await prisma.user.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(password, 10),
        role: "OPERATOR",
        status: "PENDING",
        active: false,
        permissions: {},
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`,
        employeeCode,
        position,
        affiliation,
      },
    });
    res.status(201).json({ ok: true });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว" });
    next(e);
  }
});
