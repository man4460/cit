import bcrypt from "bcrypt";
import { prisma } from "./prisma.js";

/** สร้าง admin คนแรกถ้ายังไม่มี user และตั้ง INITIAL_ADMIN_PASSWORD */
export async function ensureBootstrapAdmin() {
  const count = await prisma.user.count();
  if (count > 0) return;

  let pass = process.env.INITIAL_ADMIN_PASSWORD?.trim();
  if (pass?.startsWith('"') && pass.endsWith('"')) pass = pass.slice(1, -1);
  if (pass?.startsWith("'") && pass.endsWith("'")) pass = pass.slice(1, -1);
  if (!pass) {
    console.warn(
      "[auth] ยังไม่มีผู้ใช้ — ตั้ง INITIAL_ADMIN_PASSWORD ใน .env แล้วรีสตาร์ทเซิร์ฟเวอร์เพื่อสร้าง admin อัตโนมัติ",
    );
    return;
  }

  const username = process.env.INITIAL_ADMIN_USERNAME?.trim() || "Rohman";
  const hash = await bcrypt.hash(pass, 10);
  await prisma.user.create({
    data: {
      username,
      passwordHash: hash,
      role: "ADMIN",
      fullName: "Administrator",
    },
  });
  console.log(`[auth] สร้างผู้ดูแลระบบแรก: username="${username}"`);
}
