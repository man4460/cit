import type { Prisma } from "@prisma/client";
import { assetFleetCareActiveWhere } from "./fleetCareWhere.js";

/** ครุภัณฑ์ที่ถือเป็นเสื้อเกราะ/ยุทธภัณฑ์ป้องกัน — ใช้ตารางตรวจรายเดือน */
export const armorAssetWhere: Prisma.AssetWhereInput = {
  AND: [
    assetFleetCareActiveWhere,
    {
      OR: [
        { armorLevel: { not: null } },
        { registryLineNo: { not: null } },
        { assetCategory: { is: { name: { contains: "เสื้อเกราะ" } } } },
      ],
    },
  ],
};
