import { prisma } from "./prisma.js";
import { unlinkUploadFile } from "./upload.js";

export const PDPA_CONSENT_VERSION = "2026-10-v4";
export const RETENTION_YEARS = 2;
/** ช่วงพักให้แอดมินตรวจก่อนทำลายจริง — ถ้าถูกจัดเข้าภารกิจในช่วงนี้ ข้อมูลกลับมาแสดงตามเดิม */
export const PURGE_GRACE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

function maxDate(...ds: (Date | null | undefined)[]): Date | null {
  let best: Date | null = null;
  for (const d of ds) if (d && (!best || d > best)) best = d;
  return best;
}

export function retentionCutoff(now = new Date()) {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - RETENTION_YEARS);
  return d;
}

/**
 * ความเคลื่อนไหวล่าสุดจากภารกิจ อบรม และกิจกรรม
 * (ภารกิจที่วางแผนไว้ในอนาคตนับเป็นความเคลื่อนไหว ณ วันนี้)
 */
async function latestRecordedActivity(personnelId: string) {
  const [mission, training, participation] = await Promise.all([
    prisma.missionPersonnel.findFirst({
      where: { personnelId },
      orderBy: { mission: { plannedStart: "desc" } },
      select: { mission: { select: { createdAt: true, plannedStart: true, plannedEnd: true } } },
    }),
    prisma.trainingEnrollment.findFirst({
      where: { personnelId },
      orderBy: { trainingEndDate: "desc" },
      select: { trainingEndDate: true, updatedAt: true },
    }),
    prisma.workTaskParticipant.findFirst({
      where: { personnelId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  const now = new Date();
  const capped = (d: Date | null | undefined) => (d && d > now ? now : d);
  return maxDate(
    mission?.mission.createdAt,
    capped(mission?.mission.plannedEnd ?? mission?.mission.plannedStart),
    capped(training?.trainingEndDate),
    training?.updatedAt,
    participation?.createdAt,
  );
}

async function logRetention(personnelId: string, summary: string) {
  await prisma.auditLog.create({
    data: { entityType: "Personnel", entityId: personnelId, action: "UPDATE", summary, actorUsername: "system" },
  });
}

/**
 * นำบุคลากรที่ถูกพักการแสดงผลกลับมาแสดงเมื่อถูกจัดเข้าภารกิจ
 * missionDate = วันภารกิจ — แก้ไขภารกิจเก่าที่เกิน 2 ปีจะไม่ดึงกลับมา
 */
export async function reactivatePersonnel(personnelIds: string[], missionDate: Date | null | undefined) {
  if (!personnelIds.length) return 0;
  const now = new Date();
  const when = missionDate ?? now;
  if (when < retentionCutoff(now)) return 0;
  const archived = await prisma.personnel.findMany({
    where: { id: { in: personnelIds }, archivedAt: { not: null }, purgedAt: null },
    select: { id: true },
  });
  for (const p of archived) {
    await prisma.personnel.update({
      where: { id: p.id },
      data: { archivedAt: null, lastActivityAt: when > now ? now : when },
    });
    await logRetention(p.id, "นำข้อมูลบุคลากรกลับมาแสดง — มีการจัดเข้าปฏิบัติภารกิจ");
  }
  return archived.length;
}

export function purgeDueAt(archivedAt: Date) {
  return new Date(archivedAt.getTime() + PURGE_GRACE_DAYS * DAY_MS);
}

/** ทำลายข้อมูลส่วนบุคคล — คงแถวไว้แบบไม่ระบุตัวตน เพื่อไม่ให้ประวัติภารกิจ/ค่าตอบแทนเดิมเสียหาย */
export async function purgePersonnel(personnelId: string, reason: string) {
  const p = await prisma.personnel.findUnique({ where: { id: personnelId }, select: { photoUrl: true, purgedAt: true } });
  if (!p || p.purgedAt) return false;
  if (p.photoUrl?.startsWith("/uploads/")) unlinkUploadFile(p.photoUrl.slice("/uploads/".length));
  await prisma.$transaction([
    prisma.personnelBeneficiary.deleteMany({ where: { personnelId } }),
    prisma.personnel.update({
      where: { id: personnelId },
      data: {
        fullName: "ข้อมูลถูกทำลายตาม PDPA",
        idNumber: `PURGED-${personnelId}`,
        employeeCode: null,
        rank: null,
        position: null,
        phone: null,
        bloodType: null,
        birthDate: null,
        photoUrl: null,
        insuranceCompany: null,
        insurancePolicyNumber: null,
        insuranceExpiry: null,
        annualTravelInsurance: false,
        insuranceNotes: null,
        remarks: null,
        selfServiceToken: null,
        selfServiceTokenExpiresAt: null,
        pdpaConsentAt: null,
        pdpaConsentVersion: null,
        purgedAt: new Date(),
      },
    }),
    prisma.auditLog.updateMany({
      where: { entityType: "Personnel", entityId: personnelId },
      data: { beforeJson: null, afterJson: null, summary: "บุคลากร (ข้อมูลถูกทำลายตาม PDPA)" },
    }),
    prisma.auditLog.create({
      data: {
        entityType: "Personnel",
        entityId: personnelId,
        action: "DELETE",
        summary: `ทำลายข้อมูลส่วนบุคคลอัตโนมัติ — ${reason}`,
        actorUsername: "system",
      },
    }),
  ]);
  return true;
}

export async function runPersonnelRetention(now = new Date()) {
  const cutoff = retentionCutoff(now);

  // ข้อมูลที่ถูกพักไว้แต่มีภารกิจ/อบรม/กิจกรรมใหม่ภายใน 2 ปี → แสดงตามเดิม
  const archived = await prisma.personnel.findMany({
    where: { archivedAt: { not: null }, purgedAt: null },
    select: { id: true, archivedAt: true },
  });
  let restored = 0;
  let purged = 0;
  for (const a of archived) {
    const last = await latestRecordedActivity(a.id);
    if (last && last >= cutoff) {
      await prisma.personnel.update({ where: { id: a.id }, data: { archivedAt: null, lastActivityAt: last } });
      await logRetention(a.id, "นำข้อมูลบุคลากรกลับมาแสดง — มีความเคลื่อนไหวภายใน 2 ปี");
      restored += 1;
      continue;
    }
    if (a.archivedAt && purgeDueAt(a.archivedAt) <= now) {
      const reason = `ไม่มีความเคลื่อนไหวครบ ${RETENTION_YEARS} ปี และพ้นช่วงตรวจสอบ ${PURGE_GRACE_DAYS} วัน`;
      if (await purgePersonnel(a.id, reason)) purged += 1;
    }
  }

  const candidates = await prisma.personnel.findMany({
    where: { archivedAt: null, purgedAt: null, lastActivityAt: { lt: cutoff } },
    select: { id: true, lastActivityAt: true },
  });
  let hidden = 0;
  for (const c of candidates) {
    const last = maxDate(c.lastActivityAt, await latestRecordedActivity(c.id)) ?? c.lastActivityAt;
    if (last >= cutoff) {
      await prisma.personnel.update({ where: { id: c.id }, data: { lastActivityAt: last } });
      continue;
    }
    await prisma.personnel.update({ where: { id: c.id }, data: { archivedAt: now } });
    await logRetention(
      c.id,
      `พักการแสดงผลข้อมูลบุคลากร (เห็นเฉพาะแอดมิน) รอทำลายใน ${PURGE_GRACE_DAYS} วัน — ไม่มีความเคลื่อนไหวตั้งแต่ ${last.toISOString().slice(0, 10)}`,
    );
    hidden += 1;
  }
  return { restored, hidden, purged };
}

export function schedulePersonnelRetention() {
  const run = () =>
    runPersonnelRetention()
      .then((r) => {
        if (r.hidden || r.restored || r.purged)
          console.log(
            `[pdpa] พักการแสดงผล ${r.hidden} ราย, นำกลับมาแสดง ${r.restored} ราย, ทำลายข้อมูล ${r.purged} ราย`,
          );
      })
      .catch((e) => console.error("[pdpa] retention job failed", e));
  setTimeout(run, 60_000);
  setInterval(run, DAY_MS);
}
