import type { DispositionKind } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

/** RETURNED ถ้าชื่อสถานะมีคำว่า «ส่งคืน» มิฉะนั้น DISPOSED (จำหน่าย/คัดจำหน่าย) */
export function dispositionKindFromStatusName(statusName: string): DispositionKind {
  return /ส่งคืน/i.test(statusName) ? "RETURNED" : "DISPOSED";
}

type ActorFields = { actorUserId?: string | null; actorUsername?: string | null };

export async function logVehicleDispositionIfNeeded(
  prisma: PrismaClient,
  params: {
    wasExcluded: boolean;
    vehicleId: string;
    licensePlate: string;
    brandModel: string;
    nextStatus: { name: string; excludesFromFleetCare: boolean } | null;
    note?: string | null;
    actor?: ActorFields | null;
  },
) {
  const { wasExcluded, vehicleId, licensePlate, brandModel, nextStatus, note, actor } = params;
  if (wasExcluded || !nextStatus?.excludesFromFleetCare) return;
  await prisma.vehicleDispositionLog.create({
    data: {
      vehicleId,
      kind: dispositionKindFromStatusName(nextStatus.name),
      statusName: nextStatus.name,
      licensePlate,
      brandModel,
      note: note?.trim() ? note.trim() : null,
      actorUserId: actor?.actorUserId ?? null,
      actorUsername: actor?.actorUsername ?? null,
    },
  });
}

export async function logAssetDispositionIfNeeded(
  prisma: PrismaClient,
  params: {
    wasExcluded: boolean;
    assetId: string;
    serialNumber: string;
    itemName: string;
    nextStatus: { name: string; excludesFromFleetCare: boolean } | null;
    note?: string | null;
    actor?: ActorFields | null;
  },
) {
  const { wasExcluded, assetId, serialNumber, itemName, nextStatus, note, actor } = params;
  if (wasExcluded || !nextStatus?.excludesFromFleetCare) return;
  await prisma.assetDispositionLog.create({
    data: {
      assetId,
      kind: dispositionKindFromStatusName(nextStatus.name),
      statusName: nextStatus.name,
      serialNumber,
      itemName,
      note: note?.trim() ? note.trim() : null,
      actorUserId: actor?.actorUserId ?? null,
      actorUsername: actor?.actorUsername ?? null,
    },
  });
}
