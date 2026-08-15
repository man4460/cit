import type { AuditAction, PrismaClient } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { resolveActorLabel, wasRequestAudited, writeAuditLog } from "../lib/auditLog.js";
import { prisma } from "../lib/prisma.js";

/** path ภายใต้ /api ที่ไม่ต้องเขียน audit (อ่านอย่างเดียว / คำนวณ / ตัว log เอง) */
const SKIP_PATH =
  /^\/(audit-logs|auth\/login)(\/|$)|\/estimate-distance$|\/recalculate-distances$/;

const ENTITY_LABELS: Record<string, string> = {
  vehicles: "ยานพาหนะ",
  assets: "วัสดุทั่วไป",
  personnel: "บุคลากร",
  missions: "ภารกิจ",
  tasks: "กิจกรรม",
  "library-documents": "เอกสารคลัง",
  firearms: "อาวุธปืน",
  ammunition: "กระสุน",
  "bulletproof-vests": "เสื้อเกราะ",
  "fire-extinguishers": "ถังดับเพลิง",
  "fire-hosts": "จุดอัคคีภัย",
  "security-incidents": "เหตุการณ์ความมั่นคง",
  investigation: "สืบสวนและประมวลข่าว",
  "investigation-case": "คดีสืบสวน",
  "investigation-category": "หมวดคดีสืบสวน",
  "investigation-team": "ทีมสืบสวน",
  "investigation-member": "บุคลากรสืบสวน",
  "investigation-issue": "ประเด็นย่อยคดี",
  "investigation-document": "เอกสารแนบคดี",
  "investigation-approval": "การพิจารณาอนุมัติคดี",
  "investigation-approval-link": "อนุมัติผ่านลิงก์อีเมล",
  "os-outsourcing": "งานจ้าง OS",
  "os-area-group": "กลุ่มพื้นที่งานจ้าง OS",
  "os-contract": "สัญญางานจ้าง OS",
  "os-contract-document": "เอกสารสัญญางานจ้าง OS",
  "os-monthly-acceptance": "ตรวจรับงานจ้าง OS",
  "os-acceptance-document": "เอกสารตรวจรับงานจ้าง OS",
  "route-master": "เส้นทาง",
  "training-courses": "หลักสูตรอบรม",
  "training-enrollments": "ทะเบียนอบรม",
  "armor-inspections": "ตรวจเสื้อเกราะ",
  "admin/users": "ผู้ใช้ระบบ",
  me: "โปรไฟล์",
  "vehicle-types": "ประเภทรถ",
  "vehicle-statuses": "สถานะรถ",
  "work-category-groups": "กลุ่มงานรถ",
  "asset-categories": "หมวดวัสดุ",
  "asset-routines": "วงจรวัสดุ",
  "asset-affiliations": "สังกัดวัสดุ",
  "asset-item-statuses": "สถานะวัสดุ",
  "personnel-categories": "ประเภทบุคลากร",
  "organization-unit-types": "ประเภทหน่วยงาน",
  "document-types": "ประเภทเอกสาร",
  "mission-personnel-roles": "บทบาทบุคลากรภารกิจ",
  "mission-vehicle-roles": "บทบาทรถภารกิจ",
  "mission-expense-types": "ประเภทค่าใช้จ่ายภารกิจ",
};

function methodToAction(method: string): AuditAction {
  if (method === "POST") return "CREATE";
  if (method === "DELETE") return "DELETE";
  return "UPDATE";
}

function actionWord(a: AuditAction): string {
  if (a === "CREATE") return "สร้าง";
  if (a === "DELETE") return "ลบ";
  return "แก้ไข";
}

function redact(value: unknown): unknown {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/password|passwd|secret|token|hash/i.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    out[k] = typeof v === "object" && v != null ? redact(v) : v;
  }
  return out;
}

function pathUnderApi(req: Request): string {
  const raw = (req.originalUrl || req.url || "").split("?")[0];
  return raw.replace(/^\/api/, "") || "/";
}

function resolveEntity(req: Request): { entityType: string; label: string; entityId: string } {
  const path = pathUnderApi(req);
  const parts = path.split("/").filter(Boolean);

  if (parts[0] === "admin" && parts[1] === "users") {
    const id =
      (typeof req.params.id === "string" && req.params.id) ||
      (req.body && typeof req.body === "object" && typeof (req.body as { id?: string }).id === "string"
        ? (req.body as { id: string }).id
        : "") ||
      "—";
    return { entityType: "AdminUser", label: ENTITY_LABELS["admin/users"], entityId: id };
  }

  const root = parts[0] || "unknown";
  const label = ENTITY_LABELS[root] ?? root;
  const entityType = root
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");

  const paramId =
    (typeof req.params.id === "string" && req.params.id) ||
    (typeof req.params.vehicleId === "string" && req.params.vehicleId) ||
    (typeof req.params.assetId === "string" && req.params.assetId) ||
    (typeof req.params.missionId === "string" && req.params.missionId) ||
    (typeof req.params.logId === "string" && req.params.logId) ||
    (typeof req.params.docId === "string" && req.params.docId) ||
    (typeof req.params.photoId === "string" && req.params.photoId) ||
    (typeof req.params.attachmentId === "string" && req.params.attachmentId) ||
    (typeof req.params.assignmentId === "string" && req.params.assignmentId) ||
    (typeof req.params.destId === "string" && req.params.destId) ||
    (typeof req.params.expenseId === "string" && req.params.expenseId) ||
    "";

  return { entityType, label, entityId: paramId || "—" };
}

function pickNameHint(body: unknown, json: unknown): string {
  const sources = [json, body];
  for (const src of sources) {
    if (!src || typeof src !== "object" || Array.isArray(src)) continue;
    const o = src as Record<string, unknown>;
    for (const k of [
      "fullName",
      "licensePlate",
      "serialNumber",
      "itemName",
      "code",
      "title",
      "name",
      "username",
      "fileName",
      "brandModel",
    ]) {
      const v = o[k];
      if (v != null && String(v).trim()) return String(v).trim().slice(0, 80);
    }
  }
  return "";
}

function subResourceHint(req: Request): string {
  const path = pathUnderApi(req);
  const parts = path.split("/").filter(Boolean);
  const known = [
    "photos",
    "documents",
    "permit",
    "maintenance",
    "fuel",
    "inspections",
    "weekly-inspection",
    "personnel",
    "vehicles",
    "destinations",
    "expenses",
    "attachments",
    "moves",
    "extract-text",
    "avatar",
    "monthly",
  ];
  for (const p of parts) {
    if (known.includes(p)) return p;
  }
  return "";
}

async function persistAudit(
  db: PrismaClient,
  req: Request,
  statusCode: number,
  responseBody: unknown,
) {
  if (statusCode < 200 || statusCode >= 300) return;
  const path = pathUnderApi(req);
  if (SKIP_PATH.test(path)) return;
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return;
  if (wasRequestAudited(req)) return;

  const action = methodToAction(req.method);
  const { entityType, label, entityId: paramEntityId } = resolveEntity(req);
  let entityId = paramEntityId;
  if (entityId === "—" && responseBody && typeof responseBody === "object" && !Array.isArray(responseBody)) {
    const id = (responseBody as { id?: unknown }).id;
    if (typeof id === "string" && id) entityId = id;
  }

  const hint = pickNameHint(req.body, responseBody);
  const sub = subResourceHint(req);
  const bits = [label, hint, sub ? `(${sub})` : ""].filter(Boolean);
  const summary = `${bits.join(" ")}: ${actionWord(action)}`.slice(0, 500);

  const actor = await resolveActorLabel(db, req.auth?.userId);
  const after =
    action === "DELETE"
      ? null
      : responseBody != null
        ? redact(responseBody)
        : req.body && typeof req.body === "object"
          ? redact(req.body)
          : null;
  const before =
    action === "CREATE" ? null : req.body && typeof req.body === "object" ? redact(req.body) : null;

  await writeAuditLog(db, {
    entityType,
    entityId,
    action,
    summary,
    before,
    after,
    actor,
    req,
  });
}

/**
 * บันทึก audit อัตโนมัติหลัง response สำเร็จ (2xx) สำหรับ POST/PUT/PATCH/DELETE
 */
export function auditTrailMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
    const path = pathUnderApi(req);
    if (SKIP_PATH.test(path)) return next();

    let responseBody: unknown;
    const origJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      responseBody = body;
      return origJson(body);
    }) as Response["json"];

    res.on("finish", () => {
      void persistAudit(prisma, req, res.statusCode, responseBody).catch((err) => {
        console.error("[auditTrail]", err);
      });
    });

    next();
  };
}
