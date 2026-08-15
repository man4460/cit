/**
 * จัดประเภทบุคลากรตำรวจเป็น ทางหลวง / กองปราบ / อรินทราช ตามสถานี+ตำแหน่ง
 * รวมสถานีซ้ำ (เช่น กองบังคับการกองปราบปราม → กองบังคับการปราบปราม)
 *
 *   npm run seed:personnel:remap-police-categories
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  POLICE_CATEGORY_ARINTHARAT,
  POLICE_CATEGORY_CRIME_SUPPRESSION,
  POLICE_CATEGORY_HIGHWAY,
  POLICE_PERSONNEL_CATEGORY_NAMES,
  POLICE_STATION_ARINTHARAT,
  POLICE_STATION_CRIME_SUPPRESSION,
  POLICE_STATION_HIGHWAY,
  canonicalPoliceStationName,
  policePersonnelCategoryFromUnit,
  policeStationSortOrder,
} from "../src/lib/policeCategory.js";
import { seedPersonnelMasterData } from "../src/lib/seedPersonnelMasters.js";

const prisma = new PrismaClient();

async function ensureCategory(name: string, sortOrder: number): Promise<string> {
  const row = await prisma.personnelCategory.upsert({
    where: { name },
    create: { name, sortOrder },
    update: { sortOrder },
  });
  return row.id;
}

async function ensureStation(name: string): Promise<string> {
  const row = await prisma.policeStationMaster.upsert({
    where: { name },
    create: { name, sortOrder: policeStationSortOrder(name) },
    update: { sortOrder: policeStationSortOrder(name) },
  });
  return row.id;
}

async function mergeStationInto(fromName: string, toId: string, toName: string) {
  const from = await prisma.policeStationMaster.findUnique({ where: { name: fromName } });
  if (!from || from.id === toId) return;

  const people = await prisma.personnel.updateMany({
    where: { policeStationId: from.id },
    data: { policeStationId: toId },
  });

  const missionLinks = await prisma.missionPoliceStation.findMany({
    where: { policeStationId: from.id },
  });
  for (const link of missionLinks) {
    const existing = await prisma.missionPoliceStation.findFirst({
      where: { missionId: link.missionId, policeStationId: toId },
    });
    if (existing) {
      await prisma.missionPoliceStation.delete({ where: { id: link.id } });
    } else {
      await prisma.missionPoliceStation.update({
        where: { id: link.id },
        data: { policeStationId: toId },
      });
    }
  }

  await prisma.policeStationMaster.delete({ where: { id: from.id } });
  console.log(`  รวมสถานี «${fromName}» → «${toName}» (บุคลากร ${people.count})`);
}

async function main() {
  await seedPersonnelMasterData();

  const catIds = {
    [POLICE_CATEGORY_HIGHWAY]: await ensureCategory(POLICE_CATEGORY_HIGHWAY, 4),
    [POLICE_CATEGORY_CRIME_SUPPRESSION]: await ensureCategory(POLICE_CATEGORY_CRIME_SUPPRESSION, 5),
    [POLICE_CATEGORY_ARINTHARAT]: await ensureCategory(POLICE_CATEGORY_ARINTHARAT, 6),
  };

  const highwayId = await ensureStation(POLICE_STATION_HIGHWAY);
  const crimeId = await ensureStation(POLICE_STATION_CRIME_SUPPRESSION);
  const arinId = await ensureStation(POLICE_STATION_ARINTHARAT);

  console.log("รวมสถานีซ้ำ…");
  await mergeStationInto("กองบังคับการกองปราบปราม", crimeId, POLICE_STATION_CRIME_SUPPRESSION);
  await mergeStationInto("กองปราบปราม", crimeId, POLICE_STATION_CRIME_SUPPRESSION);
  await mergeStationInto("อรินทราช 26", arinId, POLICE_STATION_ARINTHARAT);
  await mergeStationInto("อรินทราช", arinId, POLICE_STATION_ARINTHARAT);

  const policeCats = await prisma.personnelCategory.findMany({
    where: {
      OR: [
        { name: { in: [...POLICE_PERSONNEL_CATEGORY_NAMES, "ตำรวจ"] } },
        { name: { contains: "ตำรวจ" } },
      ],
    },
  });
  const policeCatIds = policeCats.map((c) => c.id);

  const people = await prisma.personnel.findMany({
    where: {
      OR: [
        { personnelCategoryId: { in: policeCatIds } },
        { policeStationId: { not: null } },
        { position: { contains: "ทางหลวง" } },
        { position: { contains: "ปราบ" } },
        { position: { contains: "อรินทราช" } },
        { position: { contains: "ก่อการร้าย" } },
        { position: { contains: "ตำรวจ" } },
      ],
    },
    include: { policeStation: true, personnelCategory: true },
  });

  const counts: Record<string, number> = {
    [POLICE_CATEGORY_HIGHWAY]: 0,
    [POLICE_CATEGORY_CRIME_SUPPRESSION]: 0,
    [POLICE_CATEGORY_ARINTHARAT]: 0,
    skip: 0,
  };

  console.log(`\nจัดประเภทบุคลากร ${people.length} คน…`);
  for (const p of people) {
    const hint = [p.policeStation?.name, p.position].filter(Boolean).join(" ");
    const cat = policePersonnelCategoryFromUnit(hint);
    if (!cat) {
      counts.skip++;
      console.log(`  ข้าม (ไม่ชัด): ${p.fullName} · ${hint || "—"}`);
      continue;
    }

    const stationName = canonicalPoliceStationName(p.policeStation?.name || hint);
    const stationId =
      stationName === POLICE_STATION_HIGHWAY
        ? highwayId
        : stationName === POLICE_STATION_CRIME_SUPPRESSION
          ? crimeId
          : stationName === POLICE_STATION_ARINTHARAT
            ? arinId
            : p.policeStationId
              ? (
                  await (async () => {
                    const canon = canonicalPoliceStationName(p.policeStation!.name);
                    if (canon !== p.policeStation!.name) return ensureStation(canon);
                    return p.policeStationId!;
                  })()
                )
              : await ensureStation(stationName);

    const changed =
      p.personnelCategoryId !== catIds[cat] || p.policeStationId !== stationId;
    if (changed) {
      await prisma.personnel.update({
        where: { id: p.id },
        data: {
          personnelCategoryId: catIds[cat],
          policeStationId: stationId,
        },
      });
      console.log(
        `  → ${p.fullName}: ${p.personnelCategory?.name ?? "—"} → ${cat} · ${stationName}`,
      );
    }
    counts[cat]++;
  }

  // ลบประเภท «ตำรวจ» ว่างถ้าไม่มีคนแล้ว
  const legacy = await prisma.personnelCategory.findUnique({ where: { name: "ตำรวจ" } });
  if (legacy) {
    const left = await prisma.personnel.count({ where: { personnelCategoryId: legacy.id } });
    if (left === 0) {
      await prisma.personnelCategory.delete({ where: { id: legacy.id } });
      console.log("\nลบประเภทว่าง «ตำรวจ»");
    }
  }

  console.log("\nสรุป:");
  console.log(`  ${POLICE_CATEGORY_HIGHWAY}: ${counts[POLICE_CATEGORY_HIGHWAY]}`);
  console.log(`  ${POLICE_CATEGORY_CRIME_SUPPRESSION}: ${counts[POLICE_CATEGORY_CRIME_SUPPRESSION]}`);
  console.log(`  ${POLICE_CATEGORY_ARINTHARAT}: ${counts[POLICE_CATEGORY_ARINTHARAT]}`);
  console.log(`  ข้าม: ${counts.skip}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
