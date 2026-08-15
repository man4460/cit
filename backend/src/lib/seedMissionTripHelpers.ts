import { Prisma, PrismaClient } from "@prisma/client";
import { botPerDiemDailyRate } from "./botPerDiem.js";
import {
  canonicalPoliceStationName,
  policePersonnelCategoryFromUnit,
  policeStationSortOrder,
} from "./policeCategory.js";
import {
  missionRoleFromFarabPosition,
  missionRoleFromPoliceUnit,
} from "./missionRoleFromSource.js";

export type PoliceSeedRow = {
  seq: number;
  rank: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  amount: number;
  unit: string;
  group?: string;
  isPerson: boolean;
};

export type FarabSeedRow = {
  seq: number;
  empCode: string;
  rank: string;
  firstName: string;
  lastName: string;
  position: string;
  total: number;
  gradeLevel?: string;
  /** อัตราเบี้ยเลี้ยงต่อวัน (บาท) */
  perDiemRate?: number;
  /** เงินช่วยเหลือยานพาหนะไป-กลับ (บาท/ครั้ง) */
  vehicleTravelAllowance?: number;
};

export async function ensureOrgUnit(
  prisma: PrismaClient,
  name: string,
  sortOrder: number,
): Promise<string> {
  const row = await prisma.organizationUnitType.upsert({
    where: { name },
    create: { name, sortOrder },
    update: { sortOrder },
  });
  return row.id;
}

export async function ensurePoliceStation(
  prisma: PrismaClient,
  opts: { name: string; vendorCode?: string | null; sortOrder?: number },
): Promise<string> {
  const name = canonicalPoliceStationName(opts.name.replace(/\s+/g, " ").trim());
  const existing = await prisma.policeStationMaster.findUnique({ where: { name } });
  if (existing) {
    await prisma.policeStationMaster.update({
      where: { id: existing.id },
      data: {
        vendorCode: opts.vendorCode?.trim() || existing.vendorCode,
        sortOrder: opts.sortOrder ?? existing.sortOrder ?? policeStationSortOrder(name),
      },
    });
    return existing.id;
  }
  const created = await prisma.policeStationMaster.create({
    data: {
      name,
      vendorCode: opts.vendorCode?.trim() || null,
      sortOrder: opts.sortOrder ?? policeStationSortOrder(name),
    },
  });
  return created.id;
}

export async function ensureTripPersonnel(
  prisma: PrismaClient,
  opts: {
    fullName: string;
    idNumber: string;
    rank?: string;
    position?: string;
    orgUnitId?: string | null;
    categoryId?: string | null;
    policeStationId?: string | null;
    employeeCode?: string | null;
    gradeLevel?: string | null;
    perDiemRate?: number | null;
    vehicleTravelAllowance?: number | null;
  },
): Promise<{ id: string; reused: boolean }> {
  const fullName = opts.fullName.replace(/\s+/g, " ").trim();
  const resolvedGrade = opts.gradeLevel?.trim() || undefined;
  const fromGrade = resolvedGrade ? botPerDiemDailyRate(resolvedGrade) : undefined;
  const botFields = {
    employeeCode: opts.employeeCode?.trim() || undefined,
    gradeLevel: resolvedGrade,
    perDiemRate:
      fromGrade != null
        ? fromGrade
        : opts.perDiemRate != null && Number.isFinite(opts.perDiemRate)
          ? opts.perDiemRate
          : undefined,
    vehicleTravelAllowance:
      opts.vehicleTravelAllowance != null && Number.isFinite(opts.vehicleTravelAllowance)
        ? opts.vehicleTravelAllowance
        : undefined,
  };

  const byId = await prisma.personnel.findUnique({ where: { idNumber: opts.idNumber } });
  if (byId) {
    await prisma.personnel.update({
      where: { id: byId.id },
      data: {
        fullName: byId.fullName || fullName,
        rank: opts.rank || byId.rank,
        position: opts.position || byId.position,
        organizationUnitTypeId: opts.orgUnitId ?? byId.organizationUnitTypeId,
        personnelCategoryId: opts.categoryId ?? byId.personnelCategoryId,
        policeStationId: opts.policeStationId ?? byId.policeStationId,
        employeeCode: botFields.employeeCode ?? byId.employeeCode,
        gradeLevel: botFields.gradeLevel ?? byId.gradeLevel,
        perDiemRate: botFields.perDiemRate ?? byId.perDiemRate,
        vehicleTravelAllowance: botFields.vehicleTravelAllowance ?? byId.vehicleTravelAllowance,
      },
    });
    return { id: byId.id, reused: true };
  }

  const byEmp =
    opts.employeeCode?.trim()
      ? await prisma.personnel.findFirst({ where: { employeeCode: opts.employeeCode.trim() } })
      : null;
  if (byEmp) {
    await prisma.personnel.update({
      where: { id: byEmp.id },
      data: {
        fullName: byEmp.fullName || fullName,
        rank: opts.rank || byEmp.rank,
        position: opts.position || byEmp.position,
        organizationUnitTypeId: opts.orgUnitId ?? byEmp.organizationUnitTypeId,
        personnelCategoryId: opts.categoryId ?? byEmp.personnelCategoryId,
        policeStationId: opts.policeStationId ?? byEmp.policeStationId,
        employeeCode: botFields.employeeCode ?? byEmp.employeeCode,
        gradeLevel: botFields.gradeLevel ?? byEmp.gradeLevel,
        perDiemRate: botFields.perDiemRate ?? byEmp.perDiemRate,
        vehicleTravelAllowance: botFields.vehicleTravelAllowance ?? byEmp.vehicleTravelAllowance,
      },
    });
    return { id: byEmp.id, reused: true };
  }

  const byName = await prisma.personnel.findFirst({ where: { fullName } });
  if (byName) {
    await prisma.personnel.update({
      where: { id: byName.id },
      data: {
        rank: opts.rank || byName.rank,
        position: opts.position || byName.position,
        organizationUnitTypeId: opts.orgUnitId ?? byName.organizationUnitTypeId,
        personnelCategoryId: opts.categoryId ?? byName.personnelCategoryId,
        policeStationId: opts.policeStationId ?? byName.policeStationId,
        idNumber: byName.idNumber || opts.idNumber,
        employeeCode: botFields.employeeCode ?? byName.employeeCode,
        gradeLevel: botFields.gradeLevel ?? byName.gradeLevel,
        perDiemRate: botFields.perDiemRate ?? byName.perDiemRate,
        vehicleTravelAllowance: botFields.vehicleTravelAllowance ?? byName.vehicleTravelAllowance,
      },
    });
    return { id: byName.id, reused: true };
  }
  const created = await prisma.personnel.create({
    data: {
      fullName,
      idNumber: opts.idNumber,
      rank: opts.rank || null,
      position: opts.position || null,
      organizationUnitTypeId: opts.orgUnitId ?? null,
      personnelCategoryId: opts.categoryId ?? null,
      policeStationId: opts.policeStationId ?? null,
      employeeCode: botFields.employeeCode || null,
      gradeLevel: botFields.gradeLevel || null,
      perDiemRate: botFields.perDiemRate ?? null,
      vehicleTravelAllowance: botFields.vehicleTravelAllowance ?? null,
    },
  });
  return { id: created.id, reused: false };
}

export type MissionPersonLink = {
  personnelId: string;
  personnelRoleId: string;
  compensationRate: Prisma.Decimal;
};

export type MissionStationLink = {
  policeStationId: string;
  amount: Prisma.Decimal;
  note: string | null;
  sortOrder: number;
};

/** สร้างลิงก์บุคลากรฝรภ. + ตำรวจ + แถวสถานี/Vendor สำหรับภารกิจ */
export async function buildTripPersonnelLinks(
  prisma: PrismaClient,
  opts: {
    farab: FarabSeedRow[];
    police: PoliceSeedRow[];
    roleId: (name: string) => string;
    idPrefix: string;
  },
): Promise<{
  personnelLinks: MissionPersonLink[];
  missionStationLinks: MissionStationLink[];
  reusedCount: number;
  createdCount: number;
  policePayTotal: number;
}> {
  const orgFarab = await ensureOrgUnit(prisma, "ฝ่ายรักษาความปลอดภัย", 0);
  const orgPolice = await ensureOrgUnit(prisma, "ตำรวจ / ประสาน", 2);
  const categoryIds = new Map<string, string>();
  async function categoryIdFor(name: string, sortOrder: number): Promise<string> {
    let id = categoryIds.get(name);
    if (id) return id;
    const row = await prisma.personnelCategory.upsert({
      where: { name },
      create: { name, sortOrder },
      update: { sortOrder },
    });
    categoryIds.set(name, row.id);
    return row.id;
  }
  const botCategoryId = await categoryIdFor("ธปท.", 0);
  await categoryIdFor("ขับรถสินค้า", 1);
  await categoryIdFor("ทางหลวง", 4);
  await categoryIdFor("กองปราบ", 5);
  await categoryIdFor("ปฏิบัติการพิเศษ", 6);

  const personnelLinks: MissionPersonLink[] = [];
  const missionStationLinks: MissionStationLink[] = [];
  const seenPersonnel = new Set<string>();
  const seenMissionStation = new Set<string>();
  let reusedCount = 0;
  let createdCount = 0;
  let stationSort = 0;

  for (const row of opts.farab) {
    const fullName = `${row.firstName} ${row.lastName}`.replace(/\s+/g, " ").trim();
    const empCode = String(row.empCode || "").trim();
    const idNumber = empCode || `SEED-FARAB-${opts.idPrefix}-${row.seq}`;
    const gradeLevel = row.gradeLevel || null;
    const perDiemRate = gradeLevel
      ? botPerDiemDailyRate(gradeLevel)
      : (row.perDiemRate ?? null);
    const { id: personnelId, reused } = await ensureTripPersonnel(prisma, {
      fullName,
      idNumber,
      rank: row.rank,
      position: row.position,
      orgUnitId: orgFarab,
      categoryId: botCategoryId,
      employeeCode: empCode || null,
      gradeLevel,
      perDiemRate,
      vehicleTravelAllowance: row.vehicleTravelAllowance ?? null,
    });
    if (reused) reusedCount++;
    else createdCount++;
    if (seenPersonnel.has(personnelId)) {
      console.warn(`  ข้ามซ้ำในทริปนี้: ${fullName}`);
      continue;
    }
    seenPersonnel.add(personnelId);
    personnelLinks.push({
      personnelId,
      personnelRoleId: opts.roleId(missionRoleFromFarabPosition(row.position)),
      compensationRate: new Prisma.Decimal(row.total),
    });
    console.log(
      `  ฝรภ. ${row.seq}. ${row.rank} ${fullName} · รหัส ${empCode || "—"} · ชั้น ${gradeLevel || "—"} · เบี้ย ${perDiemRate ?? "—"}/วัน · ยาน ${row.vehicleTravelAllowance ?? "—"} · รวม ${row.total}${reused ? " (มีอยู่แล้ว)" : " (สร้างใหม่)"}`,
    );
  }

  for (const row of opts.police) {
    const groupName = (row.group || row.unit || "ตำรวจ").replace(/\s+/g, " ").trim();
    if (row.isPerson) {
      const fullName = `${row.firstName} ${row.lastName}`.replace(/\s+/g, " ").trim();
      const idNumber =
        row.idNumber.length >= 12
          ? row.idNumber
          : `SEED-POLICE-${opts.idPrefix}-${row.seq}-${row.idNumber}`;
      const unitHint = row.unit || groupName;
      const stationId = await ensurePoliceStation(prisma, {
        name: groupName,
        sortOrder: stationSort++,
      });
      const catName = policePersonnelCategoryFromUnit(unitHint) ?? "ปฏิบัติการพิเศษ";
      const catSort = catName === "ทางหลวง" ? 4 : catName === "กองปราบ" ? 5 : 6;
      const { id: personnelId, reused } = await ensureTripPersonnel(prisma, {
        fullName,
        idNumber,
        rank: row.rank,
        position: unitHint,
        orgUnitId: orgPolice,
        categoryId: await categoryIdFor(catName, catSort),
        policeStationId: stationId,
      });
      if (reused) reusedCount++;
      else createdCount++;
      if (seenPersonnel.has(personnelId)) {
        console.warn(`  ข้ามซ้ำในทริปนี้: ${fullName}`);
        continue;
      }
      seenPersonnel.add(personnelId);
      personnelLinks.push({
        personnelId,
        personnelRoleId: opts.roleId(missionRoleFromPoliceUnit(unitHint)),
        compensationRate: new Prisma.Decimal(row.amount),
      });
      console.log(
        `  ตร.${catName} ${row.seq}. ${row.rank} ${fullName} · ${row.amount}${reused ? " (มีอยู่แล้ว)" : " (สร้างใหม่)"}`,
      );
      continue;
    }

    const entityName = (row.firstName || row.rank || groupName).replace(/\s+/g, " ").trim();
    const vendorCode = row.idNumber.length >= 6 && row.idNumber.length <= 10 ? row.idNumber : null;
    const stationId = await ensurePoliceStation(prisma, {
      name: entityName,
      vendorCode,
      sortOrder: stationSort++,
    });
    if (!seenMissionStation.has(stationId)) {
      seenMissionStation.add(stationId);
      missionStationLinks.push({
        policeStationId: stationId,
        amount: new Prisma.Decimal(row.amount),
        note: row.unit && row.unit !== entityName ? row.unit : null,
        sortOrder: missionStationLinks.length,
      });
      console.log(`  หน่วยงาน ${row.seq}. ${entityName} · Vendor ${vendorCode ?? "—"} · ${row.amount}`);
    }
  }

  const policePayTotal = opts.police.reduce((s, p) => s + (p.amount || 0), 0);
  return { personnelLinks, missionStationLinks, reusedCount, createdCount, policePayTotal };
}

/** ชิ้นส่วน Python อ่านแถวตำรวจ (รวม group + แถว Vendor) */
export const POLICE_EXTRACT_PYTHON = `
police = []
unit = ""
group = ""
for r in range(1, ws.max_row + 1):
    a = ws.cell(r, 1).value
    b = ws.cell(r, 2).value
    c = ws.cell(r, 3).value
    if isinstance(a, str) and a.strip() and not str(a).strip().isdigit() and a.strip() not in ("ลำดับ", "รวมเงินทั้งหมด"):
        if "กอง" in a or "สถานี" in a:
            group = a.strip()
            unit = group
        continue
    if a == "ลำดับ" or b == "ยศ":
        continue
    try:
        seq_n = int(a)
    except Exception:
        continue
    rank = str(b or "").strip()
    first = str(c or "").strip()
    last = str(ws.cell(r, 4).value or "").strip()
    idraw = ws.cell(r, 5).value
    amount = float(ws.cell(r, 6).value or 0)
    u = str(ws.cell(r, 7).value or unit).strip()
    id_digits = digits(idraw)
    is_person = bool(first and last and len(id_digits) >= 12)
    if not last and first and ("สถานี" in first or "กอง" in first):
        is_person = False
    if first and not last and len(id_digits) < 12:
        is_person = False
    if ("กอง" in rank or "สถานี" in rank) and not last:
        is_person = False
        if not first:
            first = rank
    police.append({
        "seq": seq_n,
        "rank": rank if is_person else "",
        "firstName": first,
        "lastName": last,
        "idNumber": id_digits or str(idraw or "").strip(),
        "amount": amount,
        "unit": u,
        "group": group or u,
        "isPerson": is_person,
    })
`.trim();
