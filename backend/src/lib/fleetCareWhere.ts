import type { Prisma } from "@prisma/client";

/** ยานพาหนะที่ยังต้องนับในยอดตรวจ/ดูแล */
export const vehicleFleetCareActiveWhere: Prisma.VehicleWhereInput = {
  OR: [{ vehicleStatusId: null }, { vehicleStatus: { excludesFromFleetCare: false } }],
};

/** ยานพาหนะที่ออกจากยอดตรวจ (สถานะจำหน่าย/ส่งคืน ฯลฯ) */
export const vehicleRetiredFromFleetCareWhere: Prisma.VehicleWhereInput = {
  vehicleStatusId: { not: null },
  vehicleStatus: { excludesFromFleetCare: true },
};

/** ครุภัณฑ์ที่ยังต้องนับในยอดตรวจ/ดูแล */
export const assetFleetCareActiveWhere: Prisma.AssetWhereInput = {
  OR: [{ assetItemStatusId: null }, { assetItemStatus: { excludesFromFleetCare: false } }],
};

export const assetRetiredFromFleetCareWhere: Prisma.AssetWhereInput = {
  assetItemStatusId: { not: null },
  assetItemStatus: { excludesFromFleetCare: true },
};
