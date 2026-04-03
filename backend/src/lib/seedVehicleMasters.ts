import { prisma } from "./prisma.js";

const DEFAULT_TYPES = ["รถตู้", "รถกระบะ", "รถเก๋ง", "รถบรรทุก", "รถจักรยานยนต์", "อื่นๆ"];

const DEFAULT_WORK_GROUPS = ["ขนส่งเงินสด", "ประจำฐาน / สาขา", "สนับสนุนภารกิจ", "ซ่อมบำรุง / สำรอง", "อื่นๆ"];

const DEFAULT_STATUSES = ["ใช้งานปกติ", "ซ่อมบำรุง", "พักใช้ชั่วคราว", "จำหน่าย / คัดจำหน่าย", "อื่นๆ"];

/** ประเภทรถ + กลุ่มประเภทการทำงานเริ่มต้น + ย้าย brandModel เดิมไปยัง brand ถ้ายังว่าง */
export async function seedVehicleMasterData(): Promise<void> {
  const count = await prisma.vehicleType.count();
  if (count === 0) {
    let order = 0;
    for (const name of DEFAULT_TYPES) {
      await prisma.vehicleType.create({ data: { name, sortOrder: order++ } });
    }
    console.log("[seed] vehicle types created");
  }

  const wgCount = await prisma.workCategoryGroup.count();
  if (wgCount === 0) {
    let o = 0;
    for (const name of DEFAULT_WORK_GROUPS) {
      await prisma.workCategoryGroup.create({ data: { name, sortOrder: o++ } });
    }
    console.log("[seed] work category groups created");
  }

  const stCount = await prisma.vehicleStatus.count();
  if (stCount === 0) {
    let s = 0;
    for (const name of DEFAULT_STATUSES) {
      await prisma.vehicleStatus.create({ data: { name, sortOrder: s++ } });
    }
    console.log("[seed] vehicle statuses created");
  }

  const legacy = await prisma.vehicle.findMany({ where: { brand: "" } });
  for (const v of legacy) {
    if (v.brandModel?.trim()) {
      await prisma.vehicle.update({
        where: { id: v.id },
        data: { brand: v.brandModel.trim(), model: "" },
      });
    }
  }
}
