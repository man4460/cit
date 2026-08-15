/**
 * นำเข้าทะเบียนวิทยุสื่อสาร
 * รัน: npm run seed:radio
 */
import "dotenv/config";
import { seedRadioAssets } from "../src/lib/seedRadios.js";

await seedRadioAssets();
