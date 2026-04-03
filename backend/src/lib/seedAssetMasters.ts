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
    const excludesFromFleetCare = /เลิกใช้|จำหน่าย|ส่งคืน/.test(name);
    await prisma.assetItemStatus.upsert({
      where: { name },
      create: { name, sortOrder: i, excludesFromFleetCare },
      update: {
        sortOrder: i,
        ...(excludesFromFleetCare ? { excludesFromFleetCare: true } : {}),
      },
    });
  }

  const extra = await prisma.assetItemStatus.findMany({ select: { id: true, name: true, excludesFromFleetCare: true } });
  for (const r of extra) {
    const want = /เลิกใช้|จำหน่าย|ส่งคืน/.test(r.name);
    if (want && !r.excludesFromFleetCare) {
      await prisma.assetItemStatus.update({ where: { id: r.id }, data: { excludesFromFleetCare: true } });
    }
  }

  await prisma.assetCategory.upsert({
    where: { name: "ทั่วไป" },
    create: { name: "ทั่วไป", sortOrder: 0 },
    update: { sortOrder: 0 },
  });
}
