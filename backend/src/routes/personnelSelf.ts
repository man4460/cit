import { Router, type Request } from "express";
import { writeAuditLog } from "../lib/auditLog.js";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";
import { persistUpload, upload } from "../lib/upload.js";
import { PDPA_CONSENT_VERSION } from "../lib/personnelRetention.js";
import { BLOOD_TYPES, normalizeBloodType } from "../lib/bloodType.js";

/** หน้ากรอกข้อมูลตนเองของบุคลากร — ไม่ต้องล็อกอิน ตรวจสิทธิ์ด้วยโทเคนในลิงก์ */
export const personnelSelfRouter = Router();

const MAX_ATTEMPTS = 5;
/** ลิงก์ลงทะเบียนใช้ร่วมกันหลายคน — จำกัดจำนวนการค้นเลขบัตรต่อเครื่อง กันการไล่สุ่มเลขบัตร */
const MAX_INVITE_LOOKUPS = 30;
const LOCK_MS = 15 * 60 * 1000;
const attempts = new Map<string, { n: number; until: number }>();

function lockedFor(key: string) {
  const a = attempts.get(key);
  return a && a.until > Date.now() ? Math.ceil((a.until - Date.now()) / 60000) : 0;
}

function recordFail(key: string, max = MAX_ATTEMPTS) {
  const a = attempts.get(key) ?? { n: 0, until: 0 };
  a.n += 1;
  if (a.n >= max) {
    a.until = Date.now() + LOCK_MS;
    a.n = 0;
  }
  attempts.set(key, a);
}

function attemptKey(req: Request, token: string, kind: "edit" | "new") {
  return kind === "edit" ? token : `${token}:${req.ip ?? ""}`;
}

function lockedResponse(minutes: number) {
  return { error: `ยืนยันตัวตนหลายครั้งเกินกำหนด — ลองใหม่ใน ${minutes} นาที` };
}

function digitsOnly(v: unknown) {
  return String(v ?? "").replace(/\D/g, "");
}

/** ตรวจหลักตรวจสอบเลขบัตรประชาชนไทย */
function isValidThaiId(id: string) {
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

/** เลขบัตรที่เจ้าหน้าที่บันทึกอาจมีขีดหรือช่องว่าง */
function idVariants(d: string) {
  const dashed = `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}`;
  return [d, dashed, dashed.replace(/-/g, " ")];
}

async function findByIdNumber(d: string) {
  return prisma.personnel.findFirst({
    where: { idNumber: { in: idVariants(d) }, purgedAt: null },
    select: { id: true, idNumber: true, fullName: true },
  });
}

type Resolved =
  | { kind: "edit"; personnel: { id: string; idNumber: string; fullName: string } }
  | { kind: "new"; inviteId: string }
  | null;

async function resolveToken(token: string): Promise<Resolved> {
  if (!token || token.length < 20) return null;
  const now = new Date();
  const p = await prisma.personnel.findUnique({
    where: { selfServiceToken: token },
    select: { id: true, idNumber: true, fullName: true, selfServiceTokenExpiresAt: true, purgedAt: true },
  });
  if (p) {
    if (p.purgedAt || (p.selfServiceTokenExpiresAt && p.selfServiceTokenExpiresAt < now)) return null;
    return { kind: "edit", personnel: p };
  }
  const inv = await prisma.personnelSelfInvite.findUnique({ where: { token } });
  if (inv && !inv.revokedAt && inv.expiresAt > now) return { kind: "new", inviteId: inv.id };
  return null;
}

/**
 * ยืนยันตัวตนด้วยเลขบัตรประชาชน 13 หลักของผู้ใช้เอง
 * - ลิงก์รายบุคคล: ต้องตรงกับเจ้าของลิงก์
 * - ลิงก์ลงทะเบียน: ถ้ามีในระบบ → เข้าข้อมูลของคนนั้น, ถ้าไม่มี → ลงทะเบียนใหม่
 */
type Identity =
  | { ok: true; personnelId: string | null; idNumber: string }
  | { ok: false; status: number; body: { error: string } };

async function identify(
  req: Request,
  token: string,
  r: NonNullable<Resolved>,
  input: unknown,
  countLookup: boolean,
): Promise<Identity> {
  const key = attemptKey(req, token, r.kind);
  const lock = lockedFor(key);
  if (lock) return { ok: false, status: 429, body: lockedResponse(lock) };
  const d = digitsOnly(input);
  if (!isValidThaiId(d)) {
    recordFail(key, r.kind === "edit" ? MAX_ATTEMPTS : MAX_INVITE_LOOKUPS);
    return { ok: false, status: 400, body: { error: "เลขบัตรประชาชนไม่ถูกต้อง — ตรวจสอบให้ครบ 13 หลัก" } };
  }
  if (r.kind === "edit") {
    if (digitsOnly(r.personnel.idNumber) !== d) {
      recordFail(key);
      return { ok: false, status: 403, body: { error: "เลขบัตรประชาชนไม่ตรงกับเจ้าของลิงก์นี้" } };
    }
    attempts.delete(key);
    return { ok: true, personnelId: r.personnel.id, idNumber: d };
  }
  if (countLookup) recordFail(key, MAX_INVITE_LOOKUPS);
  const found = await findByIdNumber(d);
  return { ok: true, personnelId: found?.id ?? null, idNumber: d };
}

const selfSelect = {
  id: true,
  fullName: true,
  idNumber: true,
  employeeCode: true,
  rank: true,
  position: true,
  phone: true,
  bloodType: true,
  birthDate: true,
  personnelCategoryId: true,
  photoUrl: true,
  insuranceCompany: true,
  insurancePolicyNumber: true,
  insuranceExpiry: true,
  insuranceNotes: true,
  pdpaConsentAt: true,
  beneficiaries: {
    orderBy: { sortOrder: "asc" as const },
    select: { fullName: true, relationship: true, phone: true, idNumber: true },
  },
} as const;

function maskId(id: string) {
  const d = id.replace(/\D/g, "");
  return d.length >= 4 ? `•••••••••${d.slice(-4)}` : "•••";
}

personnelSelfRouter.get("/:token", async (req, res, next) => {
  try {
    const r = await resolveToken(routeParam(req.params.token));
    if (!r) return res.status(404).json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ — ติดต่อเจ้าหน้าที่เพื่อขอลิงก์ใหม่" });
    const categories = await prisma.personnelCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    });
    res.json({ mode: r.kind, consentVersion: PDPA_CONSENT_VERSION, categories, bloodTypes: BLOOD_TYPES });
  } catch (e) {
    next(e);
  }
});

/** หน้าแรก: ยอมรับ PDPA + ยืนยันเลขบัตรประชาชน 13 หลัก แล้วคืนข้อมูลของตนเอง (หรือแจ้งว่าเป็นผู้ลงทะเบียนใหม่) */
personnelSelfRouter.post("/:token/verify", async (req, res, next) => {
  try {
    const token = routeParam(req.params.token);
    const r = await resolveToken(token);
    if (!r) return res.status(404).json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" });
    if (req.body?.pdpaConsent !== true && req.body?.pdpaConsent !== "true")
      return res.status(400).json({ error: "ต้องยอมรับการเก็บและใช้ข้อมูลส่วนบุคคล (PDPA) ก่อนเข้าสู่ข้อมูล" });
    const who = await identify(req, token, r, req.body?.idNumber, true);
    if (!who.ok) return res.status(who.status).json(who.body);
    if (!who.personnelId) return res.json({ exists: false, idNumber: maskId(who.idNumber) });
    const row = await prisma.personnel.findUnique({ where: { id: who.personnelId }, select: selfSelect });
    if (!row) return res.status(404).json({ error: "ไม่พบข้อมูล" });
    res.json({ exists: true, ...row, id: undefined, idNumber: maskId(row.idNumber) });
  } catch (e) {
    next(e);
  }
});

function str(v: unknown, max = 200): string | null {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
}

function parseBens(raw: unknown) {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .slice(0, 10)
    .map((o: Record<string, unknown>) => ({
      fullName: str(o?.fullName) ?? "",
      relationship: str(o?.relationship, 80),
      phone: str(o?.phone, 40),
      idNumber: str(o?.idNumber, 20),
    }))
    .filter((b) => b.fullName);
}

function parseDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function savePhoto(req: Request) {
  if (!req.file) return undefined;
  const saved = await persistUpload(req.file, { module: "personnel", kind: "photo", forceImage: true });
  return saved.publicPath;
}

personnelSelfRouter.post("/:token", upload.single("photo"), async (req, res, next) => {
  try {
    const token = routeParam(req.params.token);
    const r = await resolveToken(token);
    if (!r) return res.status(404).json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" });
    const b = req.body ?? {};
    if (String(b.pdpaConsent) !== "true")
      return res.status(400).json({ error: "ต้องยอมรับการเก็บและใช้ข้อมูลส่วนบุคคล (PDPA) ก่อนบันทึก" });

    const fullName = str(b.fullName);
    if (!fullName) return res.status(400).json({ error: "กรุณากรอกชื่อ–นามสกุล" });
    const bloodType = normalizeBloodType(b.bloodType);
    if (bloodType === undefined) return res.status(400).json({ error: "กรุ๊ปเลือดไม่ถูกต้อง" });
    const categoryId = str(b.personnelCategoryId, 64);
    if (!categoryId) return res.status(400).json({ error: "กรุณาเลือกสังกัด / ประเภทบุคลากร" });
    if (!(await prisma.personnelCategory.findUnique({ where: { id: categoryId }, select: { id: true } })))
      return res.status(400).json({ error: "สังกัด / ประเภทบุคลากรไม่ถูกต้อง" });
    const common = {
      fullName,
      bloodType,
      birthDate: parseDate(b.birthDate),
      personnelCategoryId: categoryId,
      employeeCode: str(b.employeeCode, 50),
      rank: str(b.rank, 50),
      position: str(b.position),
      phone: str(b.phone, 40),
      insuranceCompany: str(b.insuranceCompany),
      insurancePolicyNumber: str(b.insurancePolicyNumber, 100),
      insuranceExpiry: parseDate(b.insuranceExpiry),
      insuranceNotes: str(b.insuranceNotes, 1000),
      pdpaConsentAt: new Date(),
      pdpaConsentVersion: PDPA_CONSENT_VERSION,
      selfUpdatedAt: new Date(),
      lastActivityAt: new Date(),
      archivedAt: null,
    };
    const bens = parseBens(b.beneficiaries);
    let photoUrl: string | undefined;
    try {
      photoUrl = await savePhoto(req);
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ" });
    }

    const who = await identify(req, token, r, b.idNumber, false);
    if (!who.ok) return res.status(who.status).json(who.body);

    if (who.personnelId) {
      const id = who.personnelId;
      await prisma.$transaction([
        prisma.personnelBeneficiary.deleteMany({ where: { personnelId: id } }),
        prisma.personnel.update({
          where: { id },
          data: {
            ...common,
            ...(photoUrl ? { photoUrl } : {}),
            beneficiaries: { create: bens.map((x, i) => ({ ...x, sortOrder: i })) },
          },
        }),
      ]);
      await writeAuditLog(prisma, {
        entityType: "Personnel",
        entityId: id,
        action: "UPDATE",
        summary: `บุคลากร ${fullName}: แก้ไขข้อมูลตนเองผ่านลิงก์ (ยอมรับ PDPA ${PDPA_CONSENT_VERSION})`,
        actor: { userId: null, username: "self-service" },
        req,
      });
      return res.json({ ok: true, mode: "edit" });
    }

    if (r.kind !== "new") return res.status(404).json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" });
    const idNumber = who.idNumber;
    const row = await prisma.personnel.create({
      data: {
        ...common,
        idNumber,
        photoUrl: photoUrl ?? null,
        beneficiaries: { create: bens.map((x, i) => ({ ...x, sortOrder: i })) },
      },
      select: { id: true },
    });
    await prisma.personnelSelfInvite.update({ where: { id: r.inviteId }, data: { usedCount: { increment: 1 } } });
    await writeAuditLog(prisma, {
      entityType: "Personnel",
      entityId: row.id,
      action: "CREATE",
      summary: `บุคลากร ${fullName}: ลงทะเบียนตนเองผ่านลิงก์ (ยอมรับ PDPA ${PDPA_CONSENT_VERSION})`,
      actor: { userId: null, username: "self-service" },
      req,
    });
    res.status(201).json({ ok: true, mode: "new" });
  } catch (e) {
    next(e);
  }
});
