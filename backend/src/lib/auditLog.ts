import type { AuditAction, PrismaClient } from "@prisma/client";
import type { Request } from "express";

type Actor = { userId?: string | null; username?: string | null };

type AuditableRequest = Request & { __auditWritten?: boolean };

function safeJson(value: unknown): string | null {
  if (value == null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export function markRequestAudited(req: Request | null | undefined) {
  if (!req) return;
  (req as AuditableRequest).__auditWritten = true;
}

export function wasRequestAudited(req: Request | null | undefined): boolean {
  if (!req) return false;
  return Boolean((req as AuditableRequest).__auditWritten);
}

export async function writeAuditLog(
  prisma: PrismaClient,
  params: {
    entityType: string;
    entityId: string;
    action: AuditAction;
    summary: string;
    before?: unknown;
    after?: unknown;
    actor?: Actor | null;
    /** ถ้าส่งมา จะกัน middleware ไม่เขียนซ้ำ */
    req?: Request | null;
  },
) {
  const { entityType, entityId, action, summary, before, after, actor, req } = params;
  await prisma.auditLog.create({
    data: {
      entityType,
      entityId,
      action,
      summary: summary.slice(0, 500),
      beforeJson: safeJson(before),
      afterJson: safeJson(after),
      actorUserId: actor?.userId?.trim() || null,
      actorUsername: actor?.username?.trim() || null,
    },
  });
  markRequestAudited(req);
}

export async function resolveActorLabel(
  prisma: PrismaClient,
  userId: string | undefined | null,
): Promise<Actor> {
  if (!userId) return {};
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, fullName: true },
  });
  if (!u) return { userId };
  return {
    userId: u.id,
    username: u.fullName?.trim() ? `${u.username} (${u.fullName})` : u.username,
  };
}

/** สรุปฟิลด์ที่เปลี่ยนระหว่าง before/after (เฉพาะ key ที่ส่งมา) */
export function diffSummary(
  label: string,
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  keys: string[],
): string {
  if (!before) return `${label}: สร้างใหม่`;
  if (!after) return `${label}: ลบ`;
  const changed: string[] = [];
  for (const k of keys) {
    const b = before[k] ?? null;
    const a = after[k] ?? null;
    if (JSON.stringify(b) !== JSON.stringify(a)) changed.push(k);
  }
  if (!changed.length) return `${label}: บันทึก (ไม่พบฟิลด์หลักที่เปลี่ยน)`;
  return `${label}: แก้ ${changed.join(", ")}`;
}
