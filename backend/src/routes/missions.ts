import { Router } from "express";
import { MissionStatus, MissionVehicleFuelType, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { routeParam } from "../lib/routeParam.js";
import { persistUpload, unlinkUploadFile, upload } from "../lib/upload.js";

export const missionsRouter = Router();

/** รหัสอัตโนมัติ เช่น M-20260402-0001 ต่อวัน (ตามเวลาเซิร์ฟเวอร์) */
async function generateNextMissionCode(): Promise<string> {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const prefix = `M-${y}${mo}${day}-`;
  const existing = await prisma.mission.findMany({
    where: { code: { startsWith: prefix } },
    select: { code: true },
  });
  let maxN = 0;
  for (const e of existing) {
    if (!e.code) continue;
    const suf = e.code.slice(prefix.length);
    const n = parseInt(suf, 10);
    if (!Number.isNaN(n) && n > maxN) maxN = n;
  }
  return `${prefix}${String(maxN + 1).padStart(4, "0")}`;
}

function dec(v: string | number | undefined | null) {
  if (v === undefined || v === null || v === "") return undefined;
  return new Prisma.Decimal(v);
}

function validateFuelLitersInput(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return true;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0;
}

function normalizeFuelLiters(v: unknown): Prisma.Decimal | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return new Prisma.Decimal(n);
}

function validateFuelTypeInput(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return true;
  return v === "GASOLINE" || v === "DIESEL";
}

function normalizeFuelType(v: unknown): MissionVehicleFuelType | null {
  if (v === undefined || v === null || v === "") return null;
  if (v === "GASOLINE") return MissionVehicleFuelType.GASOLINE;
  if (v === "DIESEL") return MissionVehicleFuelType.DIESEL;
  return null;
}

function serializeMissionAttachment(a: {
  id: string;
  storedFilename: string;
  originalName: string | null;
  mimeType: string | null;
  sortOrder: number;
  createdAt: Date;
}) {
  return {
    id: a.id,
    /** path สัมพันธ์กับโฮสต์ API — ฝั่ง client ใช้ apiUrl() ประกอบกับ VITE_API_URL / proxy */
    fileUrl: `/uploads/${a.storedFilename}`,
    originalName: a.originalName,
    mimeType: a.mimeType,
    sortOrder: a.sortOrder,
    createdAt: a.createdAt.toISOString(),
  };
}

function multerFilesErrorMessage(err: unknown): string | null {
  if (!err || typeof err !== "object" || !("code" in err)) return null;
  const code = String((err as { code: unknown }).code);
  if (code === "LIMIT_FILE_SIZE") return "ไฟล์ใหญ่เกิน ~15 MB ต่อไฟล์";
  if (code === "LIMIT_FILE_COUNT") return "เลือกได้ไม่เกิน 24 ไฟล์ต่อครั้ง";
  if (code === "LIMIT_UNEXPECTED_FILE") return "ฟิลด์ไฟล์ไม่ถูกต้อง — ใช้ชื่อฟิลด์ files";
  return null;
}

async function missionSummary(missionId: string) {
  const masters = await prisma.missionExpenseTypeMaster.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const byType: Record<string, string> = Object.fromEntries(masters.map((m) => [m.name, "0"]));

  const mission = await prisma.mission.findUnique({
    where: { id: missionId },
    include: {
      route: true,
      expenses: { include: { expenseType: true }, orderBy: { incurredAt: "asc" } },
      destinations: { orderBy: { sortOrder: "asc" } },
      personnel: {
        include: {
          personnel: { include: { personnelCategory: true, policeStation: true } },
          personnelRole: true,
        },
        orderBy: { personnel: { fullName: "asc" } },
      },
      vehicles: {
        include: { vehicle: true, vehicleRole: true },
      },
      policeStations: {
        include: { policeStation: true },
        orderBy: [{ sortOrder: "asc" }, { policeStation: { name: "asc" } }],
      },
    },
  });
  if (!mission) return null;

  let totalCargo = new Prisma.Decimal(0);
  for (const d of mission.destinations) {
    totalCargo = totalCargo.add(d.cargoValue);
  }

  let total = new Prisma.Decimal(0);
  for (const e of mission.expenses) {
    const amt = e.amount;
    total = total.add(amt);
    const key = e.expenseType.name;
    const prev = new Prisma.Decimal(byType[key] ?? "0");
    byType[key] = prev.add(amt).toString();
  }

  let personnelCompensationTotal = new Prisma.Decimal(0);
  for (const p of mission.personnel) {
    personnelCompensationTotal = personnelCompensationTotal.add(p.compensationRate ?? 0);
  }

  /** แสดงยอดค่าตอบแทนจากรายคน (ไม่บวกซ้ำเข้ารวมรายจ่าย ถ้ามีหมวดอื่นครอบอยู่แล้ว) */
  const compensationMaster =
    masters.find((m) => m.name === "ค่าตอบแทน") ??
    masters.find((m) => m.name.includes("ค่าตอบแทน") && !m.name.includes("บุคคลภายนอก"));
  if (compensationMaster && personnelCompensationTotal.gt(0)) {
    const cur = new Prisma.Decimal(byType[compensationMaster.name] ?? "0");
    if (cur.eq(0)) {
      byType[compensationMaster.name] = personnelCompensationTotal.toString();
    }
  }

  /** ตัดหมวดที่ยอดเป็น 0 ออกจากรายการแสดง */
  const expensesByType: Record<string, string> = {};
  for (const [k, v] of Object.entries(byType)) {
    if (new Prisma.Decimal(v).gt(0)) expensesByType[k] = v;
  }

  const budget = mission.budgetAmount;
  const totalStr = total.toString();
  const totalCargoStr = totalCargo.toString();
  /** รายจ่ายเป็นกี่ % ของมูลค่าทรัพย์สิน (รวมมูลค่าสินค้าตามจุดส่ง) */
  let expenseToCargoPercent: number | null = null;
  if (totalCargo.gt(0)) {
    expenseToCargoPercent = Number(total.div(totalCargo).mul(100));
  }

  let variance: string | null = null;
  let overBudget = false;
  if (budget != null) {
    const v = budget.sub(total);
    variance = v.toString();
    overBudget = total.gt(budget);
  }

  const attRows = await prisma.missionAttachment.findMany({
    where: { missionId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return {
    missionId: mission.id,
    code: mission.code,
    title: mission.title,
    status: mission.status,
    plannedStart: mission.plannedStart?.toISOString() ?? null,
    plannedEnd: mission.plannedEnd?.toISOString() ?? null,
    route: mission.route
      ? {
          id: mission.route.id,
          name: mission.route.name,
          startLocation: mission.route.startLocation,
          endLocation: mission.route.endLocation,
        }
      : null,
    budgetAmount: budget?.toString() ?? null,
    totalExpenses: totalStr,
    totalCargoValue: totalCargoStr,
    expenseToCargoPercent,
    expensesByType,
    personnelCompensationTotal: personnelCompensationTotal.toString(),
    variance,
    overBudget,
    personnel: mission.personnel.map((p) => ({
      personnelId: p.personnelId,
      fullName: p.personnel.fullName,
      rank: p.personnel.rank,
      position: p.personnel.position,
      idNumber: p.personnel.idNumber,
      employeeCode: p.personnel.employeeCode,
      gradeLevel: p.personnel.gradeLevel,
      perDiemRate: p.personnel.perDiemRate?.toString() ?? null,
      vehicleTravelAllowance: p.personnel.vehicleTravelAllowance?.toString() ?? null,
      personnelCategoryName: p.personnel.personnelCategory?.name ?? null,
      policeStationId: p.personnel.policeStationId ?? null,
      policeStationName: p.personnel.policeStation?.name ?? null,
      policeStationVendorCode: p.personnel.policeStation?.vendorCode ?? null,
      roleName: p.personnelRole.name,
      compensationRate: p.compensationRate.toString(),
    })),
    policeStations: mission.policeStations.map((s) => ({
      policeStationId: s.policeStationId,
      name: s.policeStation.name,
      vendorCode: s.policeStation.vendorCode,
      amount: s.amount.toString(),
      note: s.note,
      sortOrder: s.sortOrder,
    })),
    vehicles: mission.vehicles.map((v) => ({
      vehicleId: v.vehicleId,
      licensePlate: v.vehicle.licensePlate,
      roleName: v.vehicleRole.name,
      fuelLiters: v.fuelLiters?.toString() ?? null,
      fuelType: v.fuelType,
    })),
    destinations: mission.destinations.map((d) => ({
      address: d.address,
      cargoValue: d.cargoValue.toString(),
      containerCount: d.containerCount,
      sortOrder: d.sortOrder,
    })),
    attachments: attRows.map(serializeMissionAttachment),
  };
}

async function allIdsExist(
  model: "personnelRole" | "vehicleRole" | "expenseType" | "policeStation",
  ids: string[],
) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return true;
  let count = 0;
  if (model === "personnelRole")
    count = await prisma.missionPersonnelRoleMaster.count({ where: { id: { in: uniq } } });
  else if (model === "vehicleRole")
    count = await prisma.missionVehicleRoleMaster.count({ where: { id: { in: uniq } } });
  else if (model === "policeStation")
    count = await prisma.policeStationMaster.count({ where: { id: { in: uniq } } });
  else count = await prisma.missionExpenseTypeMaster.count({ where: { id: { in: uniq } } });
  return count === uniq.length;
}

const MONTH_LABELS_TH = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

/** ปี ค.ศ. ที่มีข้อมูลในฐาน (ภารกิจตาม plannedStart + บันทึกบำรุงรักษารถ) — เรียงใหม่ → เก่า */
async function getDashboardYears(): Promise<number[]> {
  const years = new Set<number>();
  const missions = await prisma.mission.findMany({
    select: { plannedStart: true, code: true },
  });
  for (const m of missions) {
    if (m.plannedStart) {
      years.add(m.plannedStart.getUTCFullYear());
      continue;
    }
    const fromCode = m.code?.match(/TRIP-(\d{4})/i);
    if (fromCode) {
      const be = Number(fromCode[1]);
      if (Number.isFinite(be) && be >= 2400) years.add(be - 543);
    }
  }
  const maint = await prisma.maintenanceLog.findMany({ select: { date: true } });
  for (const r of maint) years.add(r.date.getFullYear());
  return [...years].sort((a, b) => b - a);
}

/** รายการปีที่มีในฐานข้อมูล — ใช้เติมตัวเลือกบนแดชบอร์ด */
missionsRouter.get("/stats/years", async (_req, res, next) => {
  try {
    const years = await getDashboardYears();
    res.json({ years });
  } catch (e) {
    next(e);
  }
});

/** สถิติภารกิจรายเดือนในปีที่เลือก — ต้องประกาศก่อน GET /:id */
missionsRouter.get("/stats/year", async (req, res, next) => {
  try {
    const y = parseInt(String(req.query.year ?? ""), 10);
    const year = Number.isFinite(y) && y >= 2000 && y <= 2100 ? y : new Date().getFullYear();
    const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));

    const availableYears = await getDashboardYears();

    const missions = await prisma.mission.findMany({
      where: {
        plannedStart: { gte: start, lt: end },
      },
      include: {
        destinations: true,
        expenses: true,
        vehicles: { select: { fuelLiters: true, fuelType: true } },
      },
    });

    const cargo: Prisma.Decimal[] = Array.from({ length: 12 }, () => new Prisma.Decimal(0));
    const expenses: Prisma.Decimal[] = Array.from({ length: 12 }, () => new Prisma.Decimal(0));
    const containers: number[] = Array(12).fill(0);
    const missionCount: number[] = Array(12).fill(0);
    const fuelGasolineLiters: Prisma.Decimal[] = Array.from({ length: 12 }, () => new Prisma.Decimal(0));
    const fuelDieselLiters: Prisma.Decimal[] = Array.from({ length: 12 }, () => new Prisma.Decimal(0));

    for (const m of missions) {
      const ref = m.plannedStart;
      if (!ref || ref < start || ref >= end) continue;
      const mo = ref.getUTCMonth();
      missionCount[mo] += 1;
      for (const d of m.destinations) {
        cargo[mo] = cargo[mo].add(d.cargoValue);
        containers[mo] += d.containerCount;
      }
      // ใช้ budgetAmount (= คอลัมน์ «รวมค่าใช้จ่าย» ใน Excel) เป็นหลัก
      // ถ้าไม่มีค่อยรวมรายการ expenses — กันยอดเพี้ยนจากหมวดย่อยซ้ำ
      if (m.budgetAmount != null) {
        expenses[mo] = expenses[mo].add(m.budgetAmount);
      } else {
        for (const e of m.expenses) {
          expenses[mo] = expenses[mo].add(e.amount);
        }
      }
      for (const v of m.vehicles) {
        if (v.fuelLiters == null) continue;
        if (v.fuelType === "GASOLINE") fuelGasolineLiters[mo] = fuelGasolineLiters[mo].add(v.fuelLiters);
        else if (v.fuelType === "DIESEL") fuelDieselLiters[mo] = fuelDieselLiters[mo].add(v.fuelLiters);
      }
    }

    const maintenanceRows = await prisma.maintenanceLog.findMany({
      where: { date: { gte: start, lt: end } },
      select: { date: true, cost: true },
    });
    const maintenanceCost: Prisma.Decimal[] = Array.from({ length: 12 }, () => new Prisma.Decimal(0));
    for (const r of maintenanceRows) {
      if (r.date < start || r.date >= end) continue;
      maintenanceCost[r.date.getMonth()] = maintenanceCost[r.date.getMonth()].add(r.cost);
    }

    const sumDec = (arr: Prisma.Decimal[]) =>
      arr.reduce((a, b) => a.add(b), new Prisma.Decimal(0));

    const yearTotals = {
      cargoValue: sumDec(cargo).toString(),
      expenses: sumDec(expenses).toString(),
      containers: containers.reduce((a, b) => a + b, 0),
      missionCount: missionCount.reduce((a, b) => a + b, 0),
      fuelGasolineLiters: sumDec(fuelGasolineLiters).toString(),
      fuelDieselLiters: sumDec(fuelDieselLiters).toString(),
      maintenanceCost: sumDec(maintenanceCost).toString(),
    };

    const months = MONTH_LABELS_TH.map((label, i) => ({
      month: i + 1,
      label,
      cargoValue: cargo[i].toString(),
      containers: containers[i],
      expenses: expenses[i].toString(),
      missionCount: missionCount[i],
      fuelGasolineLiters: fuelGasolineLiters[i].toString(),
      fuelDieselLiters: fuelDieselLiters[i].toString(),
      maintenanceCost: maintenanceCost[i].toString(),
    }));

    res.json({ year, availableYears, months, yearTotals });
  } catch (e) {
    next(e);
  }
});

missionsRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.mission.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        route: true,
        _count: {
          select: { personnel: true, vehicles: true, destinations: true, expenses: true, attachments: true },
        },
      },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

missionsRouter.get("/:id/summary", async (req, res, next) => {
  try {
    const s = await missionSummary(req.params.id);
    if (!s) return res.status(404).json({ error: "Not found" });
    res.json(s);
  } catch (e) {
    next(e);
  }
});

missionsRouter.get("/:id/attachments", async (req, res, next) => {
  try {
    const missionId = routeParam(req.params.id);
    const m = await prisma.mission.findUnique({ where: { id: missionId }, select: { id: true } });
    if (!m) return res.status(404).json({ error: "Not found" });
    const rows = await prisma.missionAttachment.findMany({
      where: { missionId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    res.json(rows.map(serializeMissionAttachment));
  } catch (e) {
    next(e);
  }
});

missionsRouter.post(
  "/:id/attachments",
  (req, res, next) => {
    upload.array("files", 24)(req, res, (err: unknown) => {
      if (err) {
        const msg = multerFilesErrorMessage(err);
        if (msg) return res.status(400).json({ error: msg });
        return next(err);
      }
      next();
    });
  },
  async (req, res, next) => {
    try {
      const missionId = routeParam(req.params.id);
      const m = await prisma.mission.findUnique({ where: { id: missionId }, select: { id: true } });
      if (!m) return res.status(404).json({ error: "ไม่พบภารกิจ" });
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files?.length)
        return res.status(400).json({
          error: "ไม่ได้รับไฟล์ — ลองเลือกไฟล์อีกครั้ง หรือรีเฟรชหน้าแล้วลองใหม่",
        });

      const maxSort = await prisma.missionAttachment.aggregate({
        where: { missionId },
        _max: { sortOrder: true },
      });
      let order = (maxSort._max.sortOrder ?? -1) + 1;
      const created = [];
      for (const f of files) {
        try {
          const saved = await persistUpload(f, {
            module: "missions",
            userId: req.auth?.userId,
            kind: "attach",
            allowPdf: true,
          });
          const row = await prisma.missionAttachment.create({
            data: {
              missionId,
              storedFilename: saved.relativePath,
              mimeType: saved.mimeType,
              originalName: saved.displayName,
              sortOrder: order++,
            },
          });
          created.push(serializeMissionAttachment(row));
        } catch (e) {
          return res.status(400).json({
            error: e instanceof Error ? e.message : "อัปโหลดไฟล์ไม่สำเร็จ",
          });
        }
      }
      if (!created.length)
        return res.status(400).json({
          error: "ไม่ได้รับไฟล์ — ลองเลือกไฟล์อีกครั้ง หรือรีเฟรชหน้าแล้วลองใหม่",
        });
      res.status(201).json(created);
    } catch (e) {
      next(e);
    }
  },
);

missionsRouter.delete("/:id/attachments/:attachmentId", async (req, res, next) => {
  try {
    const missionId = routeParam(req.params.id);
    const attachmentId = routeParam(req.params.attachmentId);
    const existing = await prisma.missionAttachment.findFirst({
      where: { id: attachmentId, missionId },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });
    await prisma.missionAttachment.delete({ where: { id: existing.id } });
    unlinkUploadFile(existing.storedFilename);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

missionsRouter.get("/:id", async (req, res, next) => {
  try {
    const row = await prisma.mission.findUnique({
      where: { id: req.params.id },
      include: {
        route: true,
        personnel: { include: { personnel: true, personnelRole: true } },
        vehicles: { include: { vehicle: true, vehicleRole: true } },
        destinations: { orderBy: { sortOrder: "asc" } },
        expenses: { include: { expenseType: true }, orderBy: { incurredAt: "desc" } },
        policeStations: {
          include: { policeStation: true },
          orderBy: [{ sortOrder: "asc" }, { policeStation: { name: "asc" } }],
        },
        attachments: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!row) return res.status(404).json({ error: "Not found" });
    const { attachments, policeStations, ...rest } = row;
    res.json({
      ...rest,
      policeStations: policeStations.map((s) => ({
        id: s.id,
        policeStationId: s.policeStationId,
        amount: s.amount.toString(),
        note: s.note,
        sortOrder: s.sortOrder,
        policeStation: s.policeStation,
      })),
      attachments: attachments.map(serializeMissionAttachment),
    });
  } catch (e) {
    next(e);
  }
});

type PersonnelIn = { personnelId: string; personnelRoleId: string; compensationRate?: string | number };
type VehicleIn = {
  vehicleId: string;
  vehicleRoleId: string;
  fuelLiters?: string | number | null;
  fuelType?: string | null;
};
type DestIn = { address: string; cargoValue?: string | number; containerCount?: number; sortOrder?: number };
type ExpIn = {
  expenseTypeId: string;
  amount: string | number;
  description?: string;
  incurredAt?: string;
};
type PoliceStationIn = {
  policeStationId: string;
  amount?: string | number;
  note?: string | null;
  sortOrder?: number;
};

missionsRouter.post("/", async (req, res, next) => {
  try {
    const {
      title,
      code,
      status,
      routeId,
      budgetAmount,
      plannedStart,
      plannedEnd,
      personnel,
      vehicles,
      destinations,
      expenses,
      policeStations,
    } = req.body;

    if (status && !Object.values(MissionStatus).includes(status))
      return res.status(400).json({ error: "Invalid status" });

    const personnelArr: PersonnelIn[] = Array.isArray(personnel) ? personnel : [];
    const vehiclesArr: VehicleIn[] = Array.isArray(vehicles) ? vehicles : [];
    const destArr: DestIn[] = Array.isArray(destinations) ? destinations : [];
    const expArr: ExpIn[] = Array.isArray(expenses) ? expenses : [];
    const policeStationArr: PoliceStationIn[] = Array.isArray(policeStations) ? policeStations : [];

    for (const p of personnelArr) {
      if (!p.personnelId || !p.personnelRoleId)
        return res.status(400).json({ error: "Invalid personnel entry" });
    }
    for (const v of vehiclesArr) {
      if (!v.vehicleId || !v.vehicleRoleId) return res.status(400).json({ error: "Invalid vehicle entry" });
      if (!validateFuelLitersInput(v.fuelLiters))
        return res.status(400).json({ error: "fuelLiters must be a non-negative number" });
      if (!validateFuelTypeInput(v.fuelType))
        return res.status(400).json({ error: "fuelType must be GASOLINE, DIESEL, or empty" });
    }
    for (const d of destArr) {
      if (!d.address) return res.status(400).json({ error: "Each destination needs address" });
    }
    for (const e of expArr) {
      if (!e.expenseTypeId || e.amount === undefined)
        return res.status(400).json({ error: "Invalid expense entry" });
    }
    for (const s of policeStationArr) {
      if (!s.policeStationId) return res.status(400).json({ error: "Invalid police station entry" });
    }

    if (!(await allIdsExist("personnelRole", personnelArr.map((p) => p.personnelRoleId))))
      return res.status(400).json({ error: "Invalid personnel role" });
    if (!(await allIdsExist("vehicleRole", vehiclesArr.map((v) => v.vehicleRoleId))))
      return res.status(400).json({ error: "Invalid vehicle role" });
    if (!(await allIdsExist("expenseType", expArr.map((e) => e.expenseTypeId))))
      return res.status(400).json({ error: "Invalid expense type" });
    if (!(await allIdsExist("policeStation", policeStationArr.map((s) => s.policeStationId))))
      return res.status(400).json({ error: "Invalid police station" });

    const codeIn = code == null || code === "" ? "" : String(code).trim();
    const finalCode = codeIn ? codeIn : await generateNextMissionCode();

    const row = await prisma.mission.create({
      data: {
        title: title || null,
        code: finalCode,
        status: status ?? MissionStatus.DRAFT,
        routeId: routeId || null,
        budgetAmount: dec(budgetAmount),
        plannedStart: plannedStart ? new Date(plannedStart) : null,
        plannedEnd: plannedEnd ? new Date(plannedEnd) : null,
        personnel: {
          create: personnelArr.map((p) => ({
            personnelId: p.personnelId,
            personnelRoleId: p.personnelRoleId,
            compensationRate: dec(p.compensationRate) ?? new Prisma.Decimal(0),
          })),
        },
        vehicles: {
          create: vehiclesArr.map((v) => ({
            vehicleId: v.vehicleId,
            vehicleRoleId: v.vehicleRoleId,
            fuelLiters: normalizeFuelLiters(v.fuelLiters),
            fuelType: normalizeFuelType(v.fuelType),
          })),
        },
        destinations: {
          create: destArr.map((d, i) => ({
            address: d.address,
            cargoValue: dec(d.cargoValue) ?? new Prisma.Decimal(0),
            containerCount: d.containerCount ?? 0,
            sortOrder: d.sortOrder ?? i,
          })),
        },
        expenses: {
          create: expArr.map((e) => ({
            expenseTypeId: e.expenseTypeId,
            amount: dec(e.amount)!,
            description: e.description || null,
            incurredAt: e.incurredAt ? new Date(e.incurredAt) : undefined,
          })),
        },
        policeStations: {
          create: policeStationArr.map((s, i) => ({
            policeStationId: s.policeStationId,
            amount: dec(s.amount) ?? new Prisma.Decimal(0),
            note: s.note ? String(s.note) : null,
            sortOrder: s.sortOrder ?? i,
          })),
        },
      },
      include: {
        route: true,
        personnel: { include: { personnel: true, personnelRole: true } },
        vehicles: { include: { vehicle: true, vehicleRole: true } },
        destinations: true,
        expenses: { include: { expenseType: true } },
        policeStations: { include: { policeStation: true } },
        attachments: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    });
    const { attachments, ...rest } = row;
    res.status(201).json({ ...rest, attachments: attachments.map(serializeMissionAttachment) });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "code must be unique" });
    next(e);
  }
});

/** แทนที่บุคลากร/รถ/จุดส่ง/ค่าใช้จ่ายทั้งหมด — รหัสภารกิจและงบเดิมคงอยู่ */
missionsRouter.put("/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await prisma.mission.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Not found" });

    const {
      title,
      status,
      routeId,
      plannedStart,
      plannedEnd,
      personnel,
      vehicles,
      destinations,
      expenses,
      policeStations,
    } = req.body;

    if (status && !Object.values(MissionStatus).includes(status))
      return res.status(400).json({ error: "Invalid status" });

    const personnelArr: PersonnelIn[] = Array.isArray(personnel) ? personnel : [];
    const vehiclesArr: VehicleIn[] = Array.isArray(vehicles) ? vehicles : [];
    const destArr: DestIn[] = Array.isArray(destinations) ? destinations : [];
    const expArr: ExpIn[] = Array.isArray(expenses) ? expenses : [];
    const policeStationArr: PoliceStationIn[] = Array.isArray(policeStations) ? policeStations : [];

    for (const p of personnelArr) {
      if (!p.personnelId || !p.personnelRoleId)
        return res.status(400).json({ error: "Invalid personnel entry" });
    }
    for (const v of vehiclesArr) {
      if (!v.vehicleId || !v.vehicleRoleId) return res.status(400).json({ error: "Invalid vehicle entry" });
      if (!validateFuelLitersInput(v.fuelLiters))
        return res.status(400).json({ error: "fuelLiters must be a non-negative number" });
      if (!validateFuelTypeInput(v.fuelType))
        return res.status(400).json({ error: "fuelType must be GASOLINE, DIESEL, or empty" });
    }
    for (const d of destArr) {
      if (!d.address) return res.status(400).json({ error: "Each destination needs address" });
    }
    for (const e of expArr) {
      if (!e.expenseTypeId || e.amount === undefined)
        return res.status(400).json({ error: "Invalid expense entry" });
    }
    for (const s of policeStationArr) {
      if (!s.policeStationId) return res.status(400).json({ error: "Invalid police station entry" });
    }

    if (!(await allIdsExist("personnelRole", personnelArr.map((p) => p.personnelRoleId))))
      return res.status(400).json({ error: "Invalid personnel role" });
    if (!(await allIdsExist("vehicleRole", vehiclesArr.map((v) => v.vehicleRoleId))))
      return res.status(400).json({ error: "Invalid vehicle role" });
    if (!(await allIdsExist("expenseType", expArr.map((e) => e.expenseTypeId))))
      return res.status(400).json({ error: "Invalid expense type" });
    if (!(await allIdsExist("policeStation", policeStationArr.map((s) => s.policeStationId))))
      return res.status(400).json({ error: "Invalid police station" });

    const row = await prisma.$transaction(async (tx) => {
      await tx.missionPersonnel.deleteMany({ where: { missionId: id } });
      await tx.missionVehicle.deleteMany({ where: { missionId: id } });
      await tx.missionDestination.deleteMany({ where: { missionId: id } });
      await tx.missionExpense.deleteMany({ where: { missionId: id } });
      await tx.missionPoliceStation.deleteMany({ where: { missionId: id } });

      return tx.mission.update({
        where: { id },
        data: {
          title: title !== undefined ? title || null : existing.title,
          status: status ?? existing.status,
          routeId: routeId !== undefined ? routeId || null : existing.routeId,
          plannedStart:
            plannedStart !== undefined
              ? plannedStart
                ? new Date(plannedStart)
                : null
              : existing.plannedStart,
          plannedEnd:
            plannedEnd !== undefined
              ? plannedEnd
                ? new Date(plannedEnd)
                : null
              : existing.plannedEnd,
          personnel: {
            create: personnelArr.map((p) => ({
              personnelId: p.personnelId,
              personnelRoleId: p.personnelRoleId,
              compensationRate: dec(p.compensationRate) ?? new Prisma.Decimal(0),
            })),
          },
          vehicles: {
            create: vehiclesArr.map((v) => ({
              vehicleId: v.vehicleId,
              vehicleRoleId: v.vehicleRoleId,
              fuelLiters: normalizeFuelLiters(v.fuelLiters),
              fuelType: normalizeFuelType(v.fuelType),
            })),
          },
          destinations: {
            create: destArr.map((d, i) => ({
              address: d.address,
              cargoValue: dec(d.cargoValue) ?? new Prisma.Decimal(0),
              containerCount: d.containerCount ?? 0,
              sortOrder: d.sortOrder ?? i,
            })),
          },
          expenses: {
            create: expArr.map((e) => ({
              expenseTypeId: e.expenseTypeId,
              amount: dec(e.amount)!,
              description: e.description || null,
              incurredAt: e.incurredAt ? new Date(e.incurredAt) : undefined,
            })),
          },
          policeStations: {
            create: policeStationArr.map((s, i) => ({
              policeStationId: s.policeStationId,
              amount: dec(s.amount) ?? new Prisma.Decimal(0),
              note: s.note ? String(s.note) : null,
              sortOrder: s.sortOrder ?? i,
            })),
          },
        },
        include: {
          route: true,
          personnel: { include: { personnel: true, personnelRole: true } },
          vehicles: { include: { vehicle: true, vehicleRole: true } },
          destinations: true,
          expenses: { include: { expenseType: true } },
          policeStations: { include: { policeStation: true } },
          attachments: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        },
      });
    });

    const { attachments, ...rest } = row;
    res.json({ ...rest, attachments: attachments.map(serializeMissionAttachment) });
  } catch (e) {
    next(e);
  }
});

missionsRouter.patch("/:id", async (req, res, next) => {
  try {
    const {
      title,
      code,
      status,
      routeId,
      budgetAmount,
      plannedStart,
      plannedEnd,
      actualStart,
      actualEnd,
    } = req.body;
    if (status !== undefined && !Object.values(MissionStatus).includes(status))
      return res.status(400).json({ error: "Invalid status" });

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title || null;
    if (code !== undefined) data.code = code || null;
    if (status !== undefined) data.status = status;
    if (routeId !== undefined) data.routeId = routeId || null;
    if (budgetAmount !== undefined) data.budgetAmount = dec(budgetAmount);
    if (plannedStart !== undefined) data.plannedStart = plannedStart ? new Date(plannedStart) : null;
    if (plannedEnd !== undefined) data.plannedEnd = plannedEnd ? new Date(plannedEnd) : null;
    if (actualStart !== undefined) data.actualStart = actualStart ? new Date(actualStart) : null;
    if (actualEnd !== undefined) data.actualEnd = actualEnd ? new Date(actualEnd) : null;

    const row = await prisma.mission.update({
      where: { id: req.params.id },
      data,
      include: {
        route: true,
        personnel: { include: { personnel: true, personnelRole: true } },
        vehicles: { include: { vehicle: true, vehicleRole: true } },
        destinations: true,
        expenses: { include: { expenseType: true } },
        policeStations: { include: { policeStation: true } },
        attachments: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    });
    const { attachments, ...rest } = row;
    res.json({ ...rest, attachments: attachments.map(serializeMissionAttachment) });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "Not found" });
    next(e);
  }
});

missionsRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const att = await prisma.missionAttachment.findMany({ where: { missionId: id }, select: { storedFilename: true } });
    await prisma.mission.delete({ where: { id } });
    for (const a of att) unlinkUploadFile(a.storedFilename);
    res.status(204).send();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025")
      return res.status(404).json({ error: "Not found" });
    next(e);
  }
});

// --- Sub-resources ---

missionsRouter.post("/:id/personnel", async (req, res, next) => {
  try {
    const { personnelId, personnelRoleId, compensationRate } = req.body;
    if (!personnelId || !personnelRoleId)
      return res.status(400).json({ error: "personnelId, personnelRoleId required" });
    if (!(await allIdsExist("personnelRole", [personnelRoleId])))
      return res.status(400).json({ error: "Invalid personnel role" });
    const row = await prisma.missionPersonnel.create({
      data: {
        missionId: req.params.id,
        personnelId,
        personnelRoleId,
        compensationRate: dec(compensationRate) ?? new Prisma.Decimal(0),
      },
      include: { personnel: true, personnelRole: true },
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "Person already on mission" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2003")
      return res.status(404).json({ error: "Mission or personnel not found" });
    next(e);
  }
});

missionsRouter.delete("/:missionId/personnel/:assignmentId", async (req, res, next) => {
  try {
    const existing = await prisma.missionPersonnel.findFirst({
      where: { id: req.params.assignmentId, missionId: req.params.missionId },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });
    await prisma.missionPersonnel.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

missionsRouter.post("/:id/vehicles", async (req, res, next) => {
  try {
    const { vehicleId, vehicleRoleId, fuelLiters, fuelType } = req.body;
    if (!vehicleId || !vehicleRoleId) return res.status(400).json({ error: "vehicleId, vehicleRoleId required" });
    if (!validateFuelLitersInput(fuelLiters))
      return res.status(400).json({ error: "fuelLiters must be a non-negative number" });
    if (!validateFuelTypeInput(fuelType))
      return res.status(400).json({ error: "fuelType must be GASOLINE, DIESEL, or empty" });
    if (!(await allIdsExist("vehicleRole", [vehicleRoleId])))
      return res.status(400).json({ error: "Invalid vehicle role" });
    const row = await prisma.missionVehicle.create({
      data: {
        missionId: req.params.id,
        vehicleId,
        vehicleRoleId,
        fuelLiters: normalizeFuelLiters(fuelLiters),
        fuelType: normalizeFuelType(fuelType),
      },
      include: { vehicle: true, vehicleRole: true },
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002")
      return res.status(409).json({ error: "Vehicle already on mission" });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2003")
      return res.status(404).json({ error: "Mission or vehicle not found" });
    next(e);
  }
});

missionsRouter.delete("/:missionId/vehicles/:assignmentId", async (req, res, next) => {
  try {
    const existing = await prisma.missionVehicle.findFirst({
      where: { id: req.params.assignmentId, missionId: req.params.missionId },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });
    await prisma.missionVehicle.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

missionsRouter.post("/:id/destinations", async (req, res, next) => {
  try {
    const { address, cargoValue, containerCount, sortOrder } = req.body;
    if (!address) return res.status(400).json({ error: "address required" });
    const row = await prisma.missionDestination.create({
      data: {
        missionId: req.params.id,
        address,
        cargoValue: dec(cargoValue) ?? new Prisma.Decimal(0),
        containerCount: containerCount ?? 0,
        sortOrder: sortOrder ?? 0,
      },
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2003")
      return res.status(404).json({ error: "Mission not found" });
    next(e);
  }
});

missionsRouter.patch("/:missionId/destinations/:destId", async (req, res, next) => {
  try {
    const existing = await prisma.missionDestination.findFirst({
      where: { id: req.params.destId, missionId: req.params.missionId },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });
    const { address, cargoValue, containerCount, sortOrder } = req.body;
    const data: Record<string, unknown> = {};
    if (address !== undefined) data.address = address;
    if (cargoValue !== undefined) data.cargoValue = dec(cargoValue);
    if (containerCount !== undefined) data.containerCount = containerCount;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    const row = await prisma.missionDestination.update({ where: { id: existing.id }, data });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

missionsRouter.delete("/:missionId/destinations/:destId", async (req, res, next) => {
  try {
    const existing = await prisma.missionDestination.findFirst({
      where: { id: req.params.destId, missionId: req.params.missionId },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });
    await prisma.missionDestination.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

missionsRouter.post("/:id/expenses", async (req, res, next) => {
  try {
    const { expenseTypeId, amount, description, incurredAt } = req.body;
    if (!expenseTypeId || amount === undefined) return res.status(400).json({ error: "expenseTypeId, amount required" });
    if (!(await allIdsExist("expenseType", [expenseTypeId])))
      return res.status(400).json({ error: "Invalid expense type" });
    const row = await prisma.missionExpense.create({
      data: {
        missionId: req.params.id,
        expenseTypeId,
        amount: dec(amount)!,
        description: description || null,
        incurredAt: incurredAt ? new Date(incurredAt) : undefined,
      },
      include: { expenseType: true },
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2003")
      return res.status(404).json({ error: "Mission not found" });
    next(e);
  }
});

missionsRouter.patch("/:missionId/expenses/:expenseId", async (req, res, next) => {
  try {
    const existing = await prisma.missionExpense.findFirst({
      where: { id: req.params.expenseId, missionId: req.params.missionId },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });
    const { expenseTypeId, amount, description, incurredAt } = req.body;
    const data: Record<string, unknown> = {};
    if (expenseTypeId !== undefined) {
      if (!(await allIdsExist("expenseType", [expenseTypeId])))
        return res.status(400).json({ error: "Invalid expense type" });
      data.expenseTypeId = expenseTypeId;
    }
    if (amount !== undefined) data.amount = dec(amount);
    if (description !== undefined) data.description = description || null;
    if (incurredAt !== undefined) data.incurredAt = new Date(incurredAt);
    const row = await prisma.missionExpense.update({
      where: { id: existing.id },
      data,
      include: { expenseType: true },
    });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

missionsRouter.delete("/:missionId/expenses/:expenseId", async (req, res, next) => {
  try {
    const existing = await prisma.missionExpense.findFirst({
      where: { id: req.params.expenseId, missionId: req.params.missionId },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });
    await prisma.missionExpense.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
