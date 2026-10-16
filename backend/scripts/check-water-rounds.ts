import { prisma } from "../src/lib/prisma.js";

async function main() {
  const n = await prisma.waterRound.count();
  const seed = await prisma.waterRound.count({ where: { isSeed: true } });
  const first = await prisma.waterRound.findFirst({
    orderBy: { roundAt: "asc" },
    select: { roundAt: true, isSeed: true, roundLabel: true },
  });
  const last = await prisma.waterRound.findFirst({
    orderBy: { roundAt: "desc" },
    select: { roundAt: true, isSeed: true, roundLabel: true },
  });
  console.log(JSON.stringify({ n, seed, first, last }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
