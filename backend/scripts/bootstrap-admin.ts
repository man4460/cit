/**
 * รันครั้งเดียวเมื่อ DB ว่าง: สร้าง admin จาก INITIAL_ADMIN_* ใน .env
 * ใช้: npx tsx scripts/bootstrap-admin.ts
 */
import "dotenv/config";
import { ensureBootstrapAdmin } from "../src/lib/bootstrapAdmin.js";

await ensureBootstrapAdmin();
process.exit(0);
