/**
 * สำรองฐานข้อมูล
 * - MySQL: mysqldump (ต้องมี mysql ใน PATH หรือ MYSQL_BIN)
 * - SQLite (legacy): คัดลอกไฟล์ .db
 * ใช้: npm run db:backup
 */
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { config } from "dotenv";

config();

const backupsDir = path.join(process.cwd(), "backups");
fs.mkdirSync(backupsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

let raw = (process.env.DATABASE_URL ?? "").replace(/^["']|["']$/g, "");

if (!raw) {
  console.error("[db:backup] ไม่มี DATABASE_URL ใน .env");
  process.exit(1);
}

if (raw.startsWith("mysql://") || raw.startsWith("mysql:")) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    console.error("[db:backup] DATABASE_URL ไม่ถูกต้อง");
    process.exit(1);
  }
  const user = decodeURIComponent(url.username || "root");
  const password = decodeURIComponent(url.password || "");
  const host = url.hostname || "127.0.0.1";
  const port = url.port || "3306";
  const database = url.pathname.replace(/^\//, "").split("?")[0];
  if (!database) {
    console.error("[db:backup] ไม่พบชื่อฐานข้อมูลใน DATABASE_URL");
    process.exit(1);
  }

  const dumpCandidates = [
    process.env.MYSQL_BIN,
    "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe",
    "C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe",
    "mysqldump",
  ].filter(Boolean);

  let dumpBin = null;
  for (const c of dumpCandidates) {
    if (c === "mysqldump") {
      dumpBin = c;
      break;
    }
    if (fs.existsSync(c)) {
      dumpBin = c;
      break;
    }
  }
  if (!dumpBin) {
    console.error("[db:backup] ไม่พบ mysqldump — ติดตั้ง MySQL client หรือตั้ง MYSQL_BIN");
    process.exit(1);
  }

  const dest = path.join(backupsDir, `cit_mission-${stamp}.sql`);
  const args = [
    `-h${host}`,
    `-P${port}`,
    `-u${user}`,
    `--result-file=${dest}`,
    "--single-transaction",
    "--routines",
    "--triggers",
    database,
  ];
  const env = { ...process.env };
  if (password) env.MYSQL_PWD = password;

  try {
    execFileSync(dumpBin, args, { stdio: "inherit", env });
    console.log(`[db:backup] MySQL dump → ${dest}`);
  } catch (e) {
    console.error("[db:backup] mysqldump ล้มเหลว", e instanceof Error ? e.message : e);
    process.exit(1);
  }
  process.exit(0);
}

// --- SQLite fallback ---
const withoutProtocol = raw.startsWith("file:") ? raw.slice(5) : raw;
const schemaDir = path.join(process.cwd(), "prisma");
const rel = withoutProtocol.replace(/^\.\//, "");
const dbPath = path.isAbsolute(withoutProtocol) ? withoutProtocol : path.join(schemaDir, rel);

if (!fs.existsSync(dbPath)) {
  console.error(`[db:backup] ไม่พบไฟล์: ${dbPath}`);
  process.exit(1);
}

const dest = path.join(backupsDir, `dev-${stamp}.db`);
fs.copyFileSync(dbPath, dest);
console.log(`[db:backup] คัดลอกไป ${dest}`);
