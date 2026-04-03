import { prisma } from "./prisma.js";

/** ค่าเริ่มต้นสำหรับประเภทบุคลากรและประเภทหน่วยงาน (เมื่อตารางว่าง) */
export async function seedPersonnelMasterData() {
  if ((await prisma.organizationUnitType.count()) === 0) {
    await prisma.organizationUnitType.createMany({
      data: [
        { name: "ฝ่ายรักษาความปลอดภัย", sortOrder: 0 },
        { name: "โลจิสติกส์", sortOrder: 1 },
        { name: "ตำรวจ / ประสาน", sortOrder: 2 },
        { name: "อื่นๆ", sortOrder: 3 },
      ],
    });
  }
  if ((await prisma.personnelCategory.count()) === 0) {
    await prisma.personnelCategory.createMany({
      data: [
        { name: "ประจำ", sortOrder: 0 },
        { name: "สัญญาจ้าง", sortOrder: 1 },
        { name: "ชั่วคราว", sortOrder: 2 },
      ],
    });
  }
}
