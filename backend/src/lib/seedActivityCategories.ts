import { prisma } from "./prisma.js";

const DEFAULT_ACTIVITY_CATEGORIES = ["ฝึกอบรมขับรถยุทธวิธี", "ฝึกซ้อมแผนฉุกเฉิน", "อื่นๆ"] as const;

/** สร้างค่าเริ่มต้นเฉพาะตอนยังไม่มีหมวดเลย — ผู้ใช้ลบ/แก้ได้โดยไม่ถูกสร้างกลับ */
export async function seedActivityCategories(): Promise<void> {
  if ((await prisma.activityCategory.count()) > 0) return;
  await prisma.activityCategory.createMany({
    data: DEFAULT_ACTIVITY_CATEGORIES.map((name, sortOrder) => ({ name, sortOrder })),
    skipDuplicates: true,
  });
  console.log(`[seed] activity categories: +${DEFAULT_ACTIVITY_CATEGORIES.length}`);
}
