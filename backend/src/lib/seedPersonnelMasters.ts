import { prisma } from "./prisma.js";
import {
  POLICE_CATEGORY_ARINTHARAT,
  POLICE_CATEGORY_ARINTHARAT_LEGACY,
  POLICE_CATEGORY_CRIME_SUPPRESSION,
  POLICE_CATEGORY_HIGHWAY,
  POLICE_STATION_ARINTHARAT,
  POLICE_STATION_CRIME_SUPPRESSION,
  POLICE_STATION_HIGHWAY,
  policeStationSortOrder,
} from "./policeCategory.js";

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

  const categories = [
    { name: "ธปท.", sortOrder: 0 },
    { name: "ขับรถสินค้า", sortOrder: 1 },
    { name: POLICE_CATEGORY_HIGHWAY, sortOrder: 4 },
    { name: POLICE_CATEGORY_CRIME_SUPPRESSION, sortOrder: 5 },
    { name: POLICE_CATEGORY_ARINTHARAT, sortOrder: 6 },
  ];
  for (const c of categories) {
    await prisma.personnelCategory.upsert({
      where: { name: c.name },
      create: c,
      update: { sortOrder: c.sortOrder },
    });
  }

  // ย้ายชื่อเก่า อรินทราช → ปฏิบัติการพิเศษ
  const legacy = await prisma.personnelCategory.findUnique({
    where: { name: POLICE_CATEGORY_ARINTHARAT_LEGACY },
  });
  const special = await prisma.personnelCategory.findUnique({
    where: { name: POLICE_CATEGORY_ARINTHARAT },
  });
  if (legacy && special && legacy.id !== special.id) {
    await prisma.personnel.updateMany({
      where: { personnelCategoryId: legacy.id },
      data: { personnelCategoryId: special.id },
    });
    await prisma.personnelCategory.delete({ where: { id: legacy.id } });
  } else if (legacy && !special) {
    await prisma.personnelCategory.update({
      where: { id: legacy.id },
      data: { name: POLICE_CATEGORY_ARINTHARAT, sortOrder: 6 },
    });
  }

  const policeStations = [
    {
      name: POLICE_STATION_CRIME_SUPPRESSION,
      sortOrder: policeStationSortOrder(POLICE_STATION_CRIME_SUPPRESSION),
    },
    { name: POLICE_STATION_HIGHWAY, sortOrder: policeStationSortOrder(POLICE_STATION_HIGHWAY) },
    { name: POLICE_STATION_ARINTHARAT, sortOrder: policeStationSortOrder(POLICE_STATION_ARINTHARAT) },
    { name: "สถานีตำรวจภูธรท้องที่ต่างๆ", sortOrder: 3 },
  ];
  for (const s of policeStations) {
    await prisma.policeStationMaster.upsert({
      where: { name: s.name },
      create: s,
      update: { sortOrder: s.sortOrder },
    });
  }
}
