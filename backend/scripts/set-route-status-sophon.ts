import { PrismaClient, RouteMasterStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.routeMaster.findMany({
    select: { id: true, name: true, startLocation: true, status: true },
    orderBy: { startLocation: "asc" },
  });

  let active = 0;
  let inactive = 0;

  for (const r of rows) {
    const start = (r.startLocation ?? "").trim();
    const next: RouteMasterStatus = start.startsWith("สพฐ") ? "ACTIVE" : "INACTIVE";
    if (r.status !== next) {
      await prisma.routeMaster.update({ where: { id: r.id }, data: { status: next } });
    }
    if (next === "ACTIVE") active += 1;
    else inactive += 1;
    console.log(`${next === "ACTIVE" ? "ใช้งาน" : "เลิกใช้"} | ${start} | ${r.name ?? "—"}`);
  }

  console.log(`\nรวม ${rows.length} เส้นทาง · ใช้งาน ${active} · เลิกใช้ ${inactive}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
