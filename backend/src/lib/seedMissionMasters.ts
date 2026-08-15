import { prisma } from "./prisma.js";

export async function seedMissionMasterData() {
  const personnelRoles = [
    { name: "ผอ.เดินทาง", sortOrder: 0 },
    { name: "ผช.ผอ.เดินทาง", sortOrder: 1 },
    { name: "จนท.ฝรภ.", sortOrder: 2 },
    { name: "ตร.ทางหลวง", sortOrder: 3 },
    { name: "ตร.กองปราบ", sortOrder: 4 },
    { name: "ตร.อรินทราช", sortOrder: 5 },
    { name: "ตำรวจ / ประสาน", sortOrder: 6 },
    { name: "คนขับ", sortOrder: 7 },
    { name: "เจ้าหน้าที่รักษาความปลอดภัย", sortOrder: 8 },
    { name: "หัวหน้าทีม", sortOrder: 9 },
    { name: "อื่นๆ (บุคลากร)", sortOrder: 10 },
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
    { name: "ค่าตอบแทนบุคคลภายนอก", sortOrder: 1 },
    { name: "ค่าอาหาร / เครื่องดื่ม", sortOrder: 2 },
    { name: "ค่าที่พัก", sortOrder: 3 },
    { name: "ค่าน้ำมัน / เชื้อเพลิง", sortOrder: 4 },
  ];
  for (const r of expenseTypes) {
    await prisma.missionExpenseTypeMaster.upsert({
      where: { name: r.name },
      create: r,
      update: { sortOrder: r.sortOrder },
    });
  }
}