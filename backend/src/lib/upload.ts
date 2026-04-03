import fs from "fs";
import path from "path";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";

const uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

/**
 * เบราว์เซอร์ส่งชื่อไฟล์ UTF-8 ใน multipart แต่บ่อยครั้งถูกตีความเป็น latin1 → ข้อความเพี้ยน
 * แปลงกลับด้วย latin1→utf8 เฉพาะเมื่อสตริงมีแต่ตัวอักษรช่วง 0–255 (มิฉะนั้นถือว่า decode แล้ว)
 */
export function decodeMultipartFilename(name: string): string {
  if (!name) return name;
  const needsFix = ![...name].some((ch) => (ch.codePointAt(0) ?? 0) > 255);
  if (!needsFix) return name;
  try {
    return Buffer.from(name, "latin1").toString("utf8");
  } catch {
    return name;
  }
}

export function ensureUploadDir() {
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
}

export function publicFileUrl(filename: string) {
  const base = process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
  return `${base.replace(/\/$/, "")}/uploads/${filename}`;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDir();
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const decoded = decodeMultipartFilename(file.originalname);
    file.originalname = decoded;
    const ext = path.extname(decoded) || "";
    cb(null, `${uuidv4()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
});
