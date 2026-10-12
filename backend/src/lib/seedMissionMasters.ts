import { prisma } from "./prisma.js";

export async function seedMissionMasterData() {
  const personnelRoles = [
    { name: "ผู้อำนวยการเดินทาง", sortOrder: 0 },
    { name: "ผู้ช่วยผู้อำนวยการเดินทาง", sortOrder: 1 },
    { name: "หัวหน้าชุดส่วนล่วงหน้า", sortOrder: 2 },
    { name: "ผู้ช่วยหัวหน้าส่วนล่วงหน้า และสื่อสาร", sortOrder: 3 },
    { name: "เจ้าหน้าที่ขับรถส่วนล่วงหน้า และสื่อสาร", sortOrder: 4 },
    { name: "เจ้าหน้าที่ขับรถคุ้มกันหน้า และสื่อสาร", sortOrder: 5 },
    { name: "เจ้าหน้าที่ขับรถคุ้มกันหลัง และสื่อสาร", sortOrder: 6 },
    { name: "เจ้าหน้าที่ขับรถ และสื่อสาร", sortOrder: 7 },
    { name: "เจ้าหน้าที่สื่อสาร", sortOrder: 8 },
    { name: "ตำรวจทางหลวง นำขบวน", sortOrder: 9 },
    { name: "ตำรวจทางหลวง ปิดท้ายขบวน", sortOrder: 10 },
    { name: "ตำรวจกองปราบปราม สื่อสาร / ประสานท้องที่", sortOrder: 11 },
    { name: "ตำรวจอรินทราช 26 (คุ้มกัน)", sortOrder: 12 },
    { name: "พนักงานขับรถสินค้า", sortOrder: 13 },
  ];
  for (const r of personnelRoles) {
    await prisma.missionPersonnelRoleMaster.upsert({
      where: { name: r.name },
      create: r,
      update: { sortOrder: r.sortOrder },
    });
  }

  const vehicleRoles = [
    { name: "ส่วนล่วงหน้า", sortOrder: 0 },
    { name: "นำขบวน", sortOrder: 1 },
    { name: "ประสานท้องที่", sortOrder: 2 },
    { name: "คุ้มกันหน้า", sortOrder: 3 },
    { name: "คุ้มกันหลัง", sortOrder: 4 },
    { name: "ปิดท้ายขบวน", sortOrder: 5 },
    { name: "รถสื่อสาร", sortOrder: 6 },
    { name: "รถกำกับ / คุ้มกัน", sortOrder: 7 },
    { name: "รถหลัก", sortOrder: 8 },
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
    { name: "ค่ารับรอง", sortOrder: 5 },
    { name: "ค่าธรรมเนียมอื่นๆ", sortOrder: 6 },
    { name: "เบ็ดเตล็ด/ล้างรถ", sortOrder: 7 },
    { name: "ค่าเงินช่วยเหลือ", sortOrder: 8 },
    { name: "ประกันภัย", sortOrder: 9 },
    { name: "ค่าจ้างรถบรรทุก", sortOrder: 10 },
  ];
  for (const r of expenseTypes) {
    await prisma.missionExpenseTypeMaster.upsert({
      where: { name: r.name },
      create: r,
      update: { sortOrder: r.sortOrder },
    });
  }
}