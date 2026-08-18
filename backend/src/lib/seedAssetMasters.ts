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

  const statuses = ["ใช้งาน", "พร้อมใช้งาน", "ซ่อมบำรุง", "จำหน่าย", "เลิกใช้"];
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
    where: { name: "วิทยุสื่อสาร" },
    create: { name: "วิทยุสื่อสาร", sortOrder: 1 },
    update: { sortOrder: 1 },
  });

  const defaultAffiliations = [
    "สำนักงานใหญ่",
    "สายออกบัตรธนาคาร",
    "งานขนส่งธนบัตร",
    "สำนักงานภาคเหนือ",
    "สำนักงานภาคตะวันออกเฉียงเหนือ",
    "สำนักงานภาคใต้",
  ];
  for (let i = 0; i < defaultAffiliations.length; i++) {
    const name = defaultAffiliations[i]!;
    await prisma.assetAffiliation.upsert({
      where: { name },
      create: { name, sortOrder: i },
      update: {},
    });
  }
  const legacyGeneral = await prisma.assetCategory.findUnique({ where: { name: "ทั่วไป" } });
  if (legacyGeneral) {
    const target = await prisma.assetCategory.findUnique({ where: { name: "วัสดุทั่วไป" } });
    if (target && legacyGeneral.id !== target.id) {
      await prisma.asset.updateMany({
        where: { assetCategoryId: legacyGeneral.id },
        data: { assetCategoryId: target.id },
      });
      await prisma.assetCategory.delete({ where: { id: legacyGeneral.id } }).catch(() => undefined);
    }
  }
}
