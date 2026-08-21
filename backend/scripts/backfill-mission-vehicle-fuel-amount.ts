/**
 * กระจายค่าน้ำมันจาก MissionExpense («ค่าน้ำมัน / เชื้อเพลิง»)
 * ไปยัง MissionVehicle.fuelAmount ตามสัดส่วนลิตร (เหมือนที่เฉลี่ยลิตรรายคัน)
 *
 *   npx tsx scripts/backfill-mission-vehicle-fuel-amount.ts
 */
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const fuelType = await prisma.missionExpenseTypeMaster.findUnique({
    where: { name: "ค่าน้ำมัน / เชื้อเพลิง" },
  });
  if (!fuelType) throw new Error("ไม่พบประเภทค่าใช้จ่าย ค่าน้ำมัน / เชื้อเพลิง");

  const missions = await prisma.mission.findMany({
    select: {
      id: true,
      code: true,
      vehicles: { select: { id: true, fuelLiters: true, fuelAmount: true } },
      expenses: {
        where: { expenseTypeId: fuelType.id },
        select: { amount: true },
      },
    },
    orderBy: { code: "asc" },
  });

  let updated = 0;
  for (const m of missions) {
    const fuelTotal = m.expenses.reduce((s, e) => s + Number(e.amount), 0);
    if (!(fuelTotal > 0)) {
      console.log(`${m.code}: ไม่มียอดค่าน้ำมัน — ข้าม`);
      continue;
    }

    const withLiters = m.vehicles.filter((v) => v.fuelLiters != null && Number(v.fuelLiters) > 0);
    if (!withLiters.length) {
      console.log(`${m.code}: ไม่มีลิตร — ข้าม`);
      continue;
    }

    const litersSum = withLiters.reduce((s, v) => s + Number(v.fuelLiters), 0);
    if (!(litersSum > 0)) continue;

    // ปัดเศษทีละคัน แล้วปรับคันสุดท้ายให้รวมตรงยอด
    const shares: { id: string; amount: number }[] = [];
    let allocated = 0;
    for (let i = 0; i < withLiters.length; i++) {
      const v = withLiters[i]!;
      let amount: number;
      if (i === withLiters.length - 1) {
        amount = Math.round((fuelTotal - allocated) * 100) / 100;
      } else {
        amount = Math.round((fuelTotal * Number(v.fuelLiters) / litersSum) * 100) / 100;
        allocated += amount;
      }
      shares.push({ id: v.id, amount });
    }

    await prisma.$transaction(
      shares.map((s) =>
        prisma.missionVehicle.update({
          where: { id: s.id },
          data: { fuelAmount: new Prisma.Decimal(s.amount) },
        }),
      ),
    );

    const sum = shares.reduce((s, x) => s + x.amount, 0);
    console.log(
      `${m.code}: กระจาย ${fuelTotal.toLocaleString("th-TH")} บาท → ${shares.length} คัน (รวม ${sum.toLocaleString("th-TH")})`,
    );
    updated += shares.length;
  }

  console.log(`\nอัปเดต fuelAmount แล้ว ${updated} แถว`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
