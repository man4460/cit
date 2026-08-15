/** ตรวจชนิดรูปจาก magic bytes — เมื่อ File.type ว่างหรือไม่น่าเชื่อถือ */
export type DetectedImageKind = "jpeg" | "png" | "gif" | "webp" | "heic";

export function detectImageKind(buf: Buffer): DetectedImageKind | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "gif";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (["heic", "heix", "mif1", "msf1", "hevc", "hevx"].includes(brand)) return "heic";
  }
  return null;
}

export function extensionForImageKind(kind: Exclude<DetectedImageKind, "heic">): string {
  if (kind === "png") return "png";
  if (kind === "gif") return "gif";
  if (kind === "webp") return "webp";
  return "jpg";
}
