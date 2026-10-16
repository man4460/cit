/**
 * ดึงประวัติน้ำ/ฝนย้อนหลัง 7 วัน (รอบละ 3 ชม.) ใส่ MySQL ก่อนขึ้น server
 * ใช้: npm run seed:water-history
 *
 * ลำดับ: นำเข้า JSON ที่มีอยู่ (ถ้า DB ว่าง) → เติมรอบที่ขาดจาก สทนช. + Open-Meteo
 */
import { seedHistoryRounds } from "../src/lib/waterHistorySeed.js";
import { dbCountRounds } from "../src/lib/waterRoundsStore.js";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const before = await dbCountRounds();
  console.log(`[seed:water-history] รอบใน DB ก่อน seed: ${before}`);
  /* นำเข้า JSON ถ้า DB ว่าง แล้วเติมรอบที่ขาดจาก สทนช. + Open-Meteo */
  const result = await seedHistoryRounds();
  const after = await dbCountRounds();
  console.log(
    `[seed:water-history] เสร็จ — written=${result.written} skipped=${result.skipped} sites=${result.sites} · รวมใน DB=${after}`,
  );
  if (after < 42) {
    console.error(`[seed:water-history] คำเตือน: รอบยังน้อยกว่าเกณฑ์วิเคราะห์ 7 วัน (${after}/56)`);
    process.exitCode = 2;
  }
}

main()
  .catch((e) => {
    console.error("[seed:water-history] ล้มเหลว:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
