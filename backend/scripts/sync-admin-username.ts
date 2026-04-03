/**
 * เปลี่ยนชื่อผู้ใช้จาก admin → ค่า INITIAL_ADMIN_USERNAME (เช่น Rohman) เมื่อยังไม่มีชื่อปลายทาง
 * ใช้: npm run bootstrap:sync-username
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

const target = process.env.INITIAL_ADMIN_USERNAME?.trim() || "Rohman";
const taken = await prisma.user.findUnique({ where: { username: target } });
if (taken) {
  console.log(`[auth] มีผู้ใช้ "${target}" อยู่แล้ว — ไม่ต้องเปลี่ยนชื่อ`);
  await prisma.$disconnect();
  process.exit(0);
}

const legacy = await prisma.user.findUnique({ where: { username: "admin" } });
if (legacy) {
  await prisma.user.update({ where: { id: legacy.id }, data: { username: target } });
  console.log(`[auth] เปลี่ยนชื่อผู้ใช้ admin → "${target}"`);
} else {
  console.log(`[auth] ไม่พบผู้ใช้ชื่อ "admin" — ข้าม (สร้างผู้ใช้แรกด้วย npm run bootstrap:admin)`);
}

await prisma.$disconnect();
process.exit(0);
