import { prisma } from "./prisma.js";

const DEFAULT_TYPES = ["รถตู้", "รถกระบะ", "รถเก๋ง", "รถบรรทุก", "รถจักรยานยนต์", "อื่นๆ"];

const DEFAULT_WORK_GROUPS = ["ขนส่งเงินสด", "ประจำฐาน / สาขา", "สนับสนุนภารกิจ", "ซ่อมบำรุง / สำรอง", "อื่นๆ"];

/** สถานะหลักที่ต้องการให้มีเสมอ — รวม «ใช้งาน» และ «จำหน่าย» */
const DEFAULT_STATUSES = ["ใช้งาน", "ซ่อมบำรุง", "พักใช้ชั่วคราว", "จำหน่าย", "อื่นๆ"];

/** สถานะเก่าที่ยัง upsert ไว้เพื่อข้อมูลเดิมไม่พัง */
const LEGACY_STATUSES = ["ใช้งานปกติ", "จำหน่าย / คัดจำหน่าย"];

function vehicleStatusExcludesFromFleetCare(name: string): boolean {
  return /จำหน่าย|ส่งคืน/.test(name);
}

async function upsertStatuses(names: string[], startOrder: number): Promise<number> {
  let order = startOrder;
  for (const name of names) {
    const excludesFromFleetCare = vehicleStatusExcludesFromFleetCare(name);
    await prisma.vehicleStatus.upsert({
      where: { name },
      create: { name, sortOrder: order, excludesFromFleetCare },
      update: {
        sortOrder: order,
        ...(excludesFromFleetCare ? { excludesFromFleetCare: true } : {}),
      },
    });
    order++;
  }
  return order;
}

async function syncVehicleStatusExcludesFlags(): Promise<void> {
  const rows = await prisma.vehicleStatus.findMany({ select: { id: true, name: true, excludesFromFleetCare: true } });
  for (const r of rows) {
    const want = vehicleStatusExcludesFromFleetCare(r.name);
    if (want && !r.excludesFromFleetCare) {
      await prisma.vehicleStatus.update({ where: { id: r.id }, data: { excludesFromFleetCare: true } });
    }
  }
}

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

  let nextOrder = await upsertStatuses(DEFAULT_STATUSES, 0);
  await upsertStatuses(LEGACY_STATUSES, nextOrder);
  await syncVehicleStatusExcludesFlags();

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
