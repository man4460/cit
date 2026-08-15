/**
 * สร้าง database cit_mission บน MySQL ในเครื่อง แล้ว prisma db push
 * อ่าน DATABASE_URL จาก .env
 * ใช้: npm run db:setup-mysql
 */
import { execFileSync } from "child_process";
import fs from "fs";
import { config } from "dotenv";

config();

const raw = (process.env.DATABASE_URL ?? "").replace(/^["']|["']$/g, "");
if (!raw.startsWith("mysql")) {
  console.error("[db:setup-mysql] DATABASE_URL ต้องเป็น mysql://...");
  process.exit(1);
}

let url;
try {
  url = new URL(raw);
} catch {
  console.error("[db:setup-mysql] DATABASE_URL ไม่ถูกต้อง");
  process.exit(1);
}

const user = decodeURIComponent(url.username || "root");
const password = decodeURIComponent(url.password || "");
const host = url.hostname || "127.0.0.1";
const port = url.port || "3306";
const database = url.pathname.replace(/^\//, "").split("?")[0] || "cit_mission";

if (!password || password === "YOUR_MYSQL_PASSWORD") {
  console.error(
    "[db:setup-mysql] ใส่รหัสผ่าน MySQL จริงใน backend/.env (DATABASE_URL) ก่อน แล้วรันใหม่",
  );
  process.exit(1);
}

const mysqlCandidates = [
  process.env.MYSQL_BIN,
  "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe",
  "C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysql.exe",
  "mysql",
].filter(Boolean);

let mysqlBin = null;
for (const c of mysqlCandidates) {
  if (c === "mysql" || fs.existsSync(c)) {
    mysqlBin = c;
    break;
  }
}
if (!mysqlBin) {
  console.error("[db:setup-mysql] ไม่พบ mysql.exe");
  process.exit(1);
}

const sql = [
  `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
  `ALTER DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
].join("\n");

const env = { ...process.env, MYSQL_PWD: password };
try {
  execFileSync(
    mysqlBin,
    [`-h${host}`, `-P${port}`, `-u${user}`, "-e", sql],
    { stdio: "inherit", env },
  );
  console.log(`[db:setup-mysql] database ready: ${database} @ ${host}:${port}`);
} catch {
  console.error("[db:setup-mysql] สร้าง database ไม่สำเร็จ — ตรวจ user/password/พอร์ตใน DATABASE_URL");
  process.exit(1);
}

try {
  execFileSync("npx", ["prisma", "db", "push"], { stdio: "inherit", shell: true });
  console.log("[db:setup-mysql] prisma db push เสร็จ");
} catch {
  console.error("[db:setup-mysql] prisma db push ล้มเหลว");
  process.exit(1);
}
