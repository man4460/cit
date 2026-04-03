import { prisma } from "./prisma.js";

export async function seedAssetMasterData() {
  const routines = ["รายวัน", "รายเดือน"];
  for (let i = 0; i < routines.length; i++) {
    const name = routines[i]!;
    await prisma.assetRoutine.upsert({
      where: { name },
      create: { name, sortOrder: i },
      update: { sortOrder: i },
    });
  }

  const statuses = ["พร้อมใช้งาน", "ซ่อมบำรุง", "เลิกใช้"];
  for (let i = 0; i < statuses.length; i++) {
    const name = statuses[i]!;
    await prisma.assetItemStatus.upsert({
      where: { name },
      create: { name, sortOrder: i },
      update: { sortOrder: i },
    });
  }

  await prisma.assetCategory.upsert({
    where: { name: "ทั่วไป" },
    create: { name: "ทั่วไป", sortOrder: 0 },
    update: { sortOrder: 0 },
  });
}
