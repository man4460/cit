import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function trySql(label: string, sql: string) {
  try {
    await p.$executeRawUnsafe(sql);
    console.log("ok:", label);
  } catch (e) {
    console.log("skip/fail:", label, e instanceof Error ? e.message : e);
  }
}

async function main() {
  await trySql(
    "add fundingType",
    "ALTER TABLE BudgetYearLine ADD COLUMN fundingType ENUM('ANNUAL','COMMITMENT') NOT NULL DEFAULT 'ANNUAL'",
  );
  await trySql("drop old unique", "ALTER TABLE BudgetYearLine DROP INDEX BudgetYearLine_fiscalYearId_accountId_key");
  await trySql(
    "add new unique",
    "ALTER TABLE BudgetYearLine ADD UNIQUE INDEX BudgetYearLine_fiscalYearId_accountId_fundingType_key (fiscalYearId, accountId, fundingType)",
  );
  await trySql(
    "add funding idx",
    "CREATE INDEX BudgetYearLine_fundingType_idx ON BudgetYearLine (fundingType)",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await p.$disconnect();
  });
