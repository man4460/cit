import { promises as fs } from "fs";
import path from "path";
import { Router } from "express";

export const waterSituationRouter = Router();

/** ไฟล์ data.json ของศูนย์เฝ้าระวังน้ำ ธปท. — ตั้ง WATER_DATA_FILE ให้ชี้ไฟล์ที่ระบบดึงข้อมูลเขียนทับทุก 3 ชม. */
function dataFile(): string {
  const env = process.env.WATER_DATA_FILE?.trim();
  return env ? path.resolve(env) : path.join(process.cwd(), "data", "water-situation.json");
}

waterSituationRouter.get("/", async (_req, res, next) => {
  try {
    const file = dataFile();
    let text: string;
    try {
      text = await fs.readFile(file, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        return res.status(404).json({ error: "ยังไม่มีไฟล์ข้อมูลสถานการณ์น้ำ — ตั้งค่า WATER_DATA_FILE ใน backend/.env" });
      throw e;
    }
    res.set("Cache-Control", "no-store");
    res.type("application/json").send(text.replace(/^\uFEFF/, ""));
  } catch (e) {
    next(e);
  }
});
