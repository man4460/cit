/**
 * คำนวณระยะทางทุกเส้นทางใน RouteMaster
 *   npx tsx scripts/recalculate-route-distances.ts
 */
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { computeRouteDistanceKm } from "../src/lib/routeDistance.js";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.routeMaster.findMany({ orderBy: { startLocation: "asc" } });
  console.log(`พบ ${rows.length} เส้นทาง`);
  for (const row of rows) {
    const result = await computeRouteDistanceKm(row.startLocation, row.endLocation);
    if (result.method === "none" || result.km <= 0) {
      console.log(`SKIP ${row.startLocation} → ${row.endLocation}`);
      continue;
    }
    await prisma.routeMaster.update({
      where: { id: row.id },
      data: { distanceKm: new Prisma.Decimal(result.km) },
    });
    console.log(
      `OK ${row.startLocation} → ${row.endLocation} = ${result.km} กม. (${result.method}) path=${result.path.join("-")}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
