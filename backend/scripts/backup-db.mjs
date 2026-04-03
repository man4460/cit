/**
 * สำรองไฟล์ SQLite ก่อน db push / reset
 * ใช้: npm run db:backup
 */
import fs from "fs";
import path from "path";
import { config } from "dotenv";

config();

const schemaDir = path.join(process.cwd(), "prisma");
let raw = process.env.DATABASE_URL ?? "file:./dev.db";
raw = raw.replace(/^["']|["']$/g, "");
const withoutProtocol = raw.startsWith("file:") ? raw.slice(5) : raw;
const rel = withoutProtocol.replace(/^\.\//, "");
const dbPath = path.isAbsolute(withoutProtocol)
  ? withoutProtocol
  : path.join(schemaDir, rel);

if (!fs.existsSync(dbPath)) {
  console.error(`[db:backup] ไม่พบไฟล์: ${dbPath}`);
  process.exit(1);
}

const backupsDir = path.join(process.cwd(), "backups");
fs.mkdirSync(backupsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dest = path.join(backupsDir, `dev-${stamp}.db`);
fs.copyFileSync(dbPath, dest);
console.log(`[db:backup] คัดลอกไป ${dest}`);
