import { prisma } from "./prisma.js";

export async function seedMissionMasterData() {
  const personnelRoles = [
    { name: "คนขับ", sortOrder: 0 },
    { name: "เจ้าหน้าที่รักษาความปลอดภัย", sortOrder: 1 },
    { name: "หัวหน้าทีม", sortOrder: 2 },
    { name: "อื่นๆ (บุคลากร)", sortOrder: 3 },
  ];
  for (const r of personnelRoles) {
    await prisma.missionPersonnelRoleMaster.upsert({
      where: { name: r.name },
      create: r,
      update: { sortOrder: r.sortOrder },
    });
  }

  const vehicleRoles = [
    { name: "รถหลัก", sortOrder: 0 },
    { name: "รถกำกับ / คุ้มกัน", sortOrder: 1 },
    { name: "รถสนับสนุน", sortOrder: 2 },
    { name: "อื่นๆ (รถ)", sortOrder: 3 },
  ];
  for (const r of vehicleRoles) {
    await prisma.missionVehicleRoleMaster.upsert({
      where: { name: r.name },
      create: r,
      update: { sortOrder: r.sortOrder },
    });
  }

  const expenseTypes = [
    { name: "ค่าตอบแทน", sortOrder: 0 },
    { name: "ค่าอาหาร / เครื่องดื่ม", sortOrder: 1 },
    { name: "ค่าที่พัก", sortOrder: 2 },
    { name: "ค่าน้ำมัน / เชื้อเพลิง", sortOrder: 3 },
  ];
  for (const r of expenseTypes) {
    await prisma.missionExpenseTypeMaster.upsert({
      where: { name: r.name },
      create: r,
      update: { sortOrder: r.sortOrder },
    });
  }
}
