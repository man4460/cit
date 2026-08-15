import crypto from "crypto";

export function approvalTokenTtlDays(): number {
  const raw = Number(process.env.APPROVAL_LINK_TTL_DAYS ?? 7);
  return Number.isFinite(raw) && raw > 0 ? raw : 7;
}

/** สร้าง token สำหรับลิงก์อีเมล — ส่ง plaintext ออกไป เก็บเฉพาะ hash ในฐานข้อมูล */
export function createApprovalToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + approvalTokenTtlDays() * 24 * 60 * 60 * 1000);
  return { token, tokenHash: hashApprovalToken(token), expiresAt };
}

export function hashApprovalToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
