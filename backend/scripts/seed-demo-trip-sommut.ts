/**
 * เติมข้อมูลตัวอย่างลงภารกิจ «สมมติ» (M-20261006-0001)
 * — ขบวนคุ้มกัน + รถสินค้า B&W + จนท.ปฏิบัติการพิเศษนั่งสินค้าขาไป / กลับยานพาหนะคุ้มกัน
 *
 *   npx tsx scripts/seed-demo-trip-sommut.ts
 */
import "dotenv/config";
import { randomUUID } from "crypto";
import { MissionStatus, MissionVehicleFuelType, Prisma, PrismaClient } from "@prisma/client";
import { botPerDiemDailyRate } from "../src/lib/botPerDiem.js";
import { seedMissionMasterData } from "../src/lib/seedMissionMasters.js";
import { seedPersonnelMasterData } from "../src/lib/seedPersonnelMasters.js";
import { ensureOrgUnit, ensureTripPersonnel } from "../src/lib/seedMissionTripHelpers.js";

const prisma = new PrismaClient();

const MISSION_CODE = "M-20261006-0001";
const BOT_SPECIAL_PER_DAY = 1400;
const DAYS = 2;

function dec(n: number) {
  return new Prisma.Decimal(Math.round(n * 100) / 100);
}

function botPay(grade: string | null | undefined, travel: number | null | undefined) {
  const perDiem = botPerDiemDailyRate(grade);
  const t = travel != null && Number.isFinite(Number(travel)) && Number(travel) > 0 ? Number(travel) : 800;
  return (BOT_SPECIAL_PER_DAY + perDiem) * DAYS + t;
}

function policePay(rank: string | null | undefined) {
  const r = rank ?? "";
  const commissioned = /พ\.ต|ร\.ต|ว่าที่/.test(r) && !/^ด\.ต/.test(r);
  return commissioned ? 4900 : 4300;
}

async function main() {
  await seedPersonnelMasterData();
  await seedMissionMasterData();

  const mission = await prisma.mission.findUnique({ where: { code: MISSION_CODE } });
  if (!mission) throw new Error(`ไม่พบภารกิจ ${MISSION_CODE} — สร้างฉบับร่างชื่อ «สมมติ» ก่อน`);

  const roles = await prisma.missionPersonnelRoleMaster.findMany();
  const roleId = (name: string) => {
    const r = roles.find((x) => x.name === name);
    if (!r) throw new Error(`ไม่มีบทบาท ${name}`);
    return r.id;
  };
  const vRoles = await prisma.missionVehicleRoleMaster.findMany();
  const vRoleId = (name: string) => {
    const r = vRoles.find((x) => x.name === name);
    if (!r) throw new Error(`ไม่มีบทบาทรถ ${name}`);
    return r.id;
  };
  const cargoRoles = await prisma.missionCargoRoleMaster.findMany();
  const cargoRoleId = (name: string) => {
    const r = cargoRoles.find((x) => x.name === name);
    if (!r) throw new Error(`ไม่มีบทบาทรถสินค้า ${name}`);
    return r.id;
  };
  const expenseId = async (name: string) => {
    const r = await prisma.missionExpenseTypeMaster.findUnique({ where: { name } });
    if (!r) throw new Error(`ไม่มีประเภทค่าใช้จ่าย ${name}`);
    return r.id;
  };

  const personByName = async (fullName: string) => {
    const row = await prisma.personnel.findFirst({
      where: { fullName, purgedAt: null },
    });
    if (!row) throw new Error(`ไม่พบบุคลากร ${fullName}`);
    return row;
  };
  const vehicleByPlate = async (needle: string) => {
    const row = await prisma.vehicle.findFirst({
      where: { licensePlate: { contains: needle } },
    });
    if (!row) throw new Error(`ไม่พบรถ ${needle}`);
    return row;
  };
  const stationByName = async (name: string) => {
    const row = await prisma.policeStationMaster.findFirst({ where: { name } });
    if (!row) throw new Error(`ไม่พบสถานี ${name}`);
    return row;
  };

  const vAdvance = await vehicleByPlate("4 กน 5682");
  const vLead = await vehicleByPlate("ฮว 5804");
  const vLiaison = await vehicleByPlate("5 กธ 4933");
  const vAlpha1 = await vehicleByPlate("9 กต 2115");
  const vAlpha2 = await vehicleByPlate("5 กล 1165");
  const vTail = await vehicleByPlate("ฮล 7137");

  const ensureTractorVehicle = async (plate: string) => {
    const existing = await prisma.vehicle.findFirst({ where: { licensePlate: plate } });
    if (existing) return existing;
    const type = await prisma.vehicleType.upsert({
      where: { name: "รถบรรทุก" },
      create: { name: "รถบรรทุก", sortOrder: 3 },
      update: {},
    });
    const status = await prisma.vehicleStatus.upsert({
      where: { name: "ใช้งาน" },
      create: { name: "ใช้งาน", sortOrder: 0 },
      update: {},
    });
    return prisma.vehicle.create({
      data: {
        licensePlate: plate,
        brandModel: "หัวลากสินค้า",
        brand: "B&W",
        model: "หัวลาก",
        vehicleTypeId: type.id,
        vehicleStatusId: status.id,
      },
    });
  };
  const vCargo1 = await ensureTractorVehicle("66-9748");
  const vCargo2 = await ensureTractorVehicle("66-9752");
  const vCargoSpare = await ensureTractorVehicle("66-9801");

  const cargo1 = randomUUID();
  const cargo2 = randomUUID();
  const cargoSpare = randomUUID();

  const director = await personByName("อานนท์ แก้วเขียว");
  const assistant = await personByName("อรรถพล สิงหาจุลเกตุ");
  const advanceHead = await personByName("รัตนพงศ์ กลิ่นพันธุ์");
  const advanceAsst = await personByName("วัชระ โต๊ะขวัญแก้ว");
  const advanceDriver = await personByName("กิจภูมินทร์ จันตาวงค์");
  const alpha1Driver = await personByName("กิตติทัศน์ เอี่ยมแย้ม");
  const alpha2Driver = await personByName("ชวัติ จันต๊ะคาด");
  const tailDriver = await personByName("ธนพล ชั้นวิริยะกุล");

  const hwyLead1 = await personByName("ยอด วรรณจิตร์");
  const hwyLead2 = await personByName("ปกรณ์ บัวเรือง");
  const hwyTail1 = await personByName("ธนภัทร จันทร์ศรีชั้น");
  const hwyTail2 = await personByName("กันตภณ โชติมงคล");

  const crime1 = await personByName("ณัฐ ปาสุวรรณ");
  const crime2 = await personByName("ณัฐชนน ภูสมตา");

  const specA1 = await personByName("ชัช สัตนาโค");
  const specA2 = await personByName("กัมปนาท บาริศรี");
  const specB1 = await personByName("ธวัชชัย เสนานาม");
  const specB2 = await personByName("ทัพประชา ชัยชนะ");
  const specC1 = await personByName("พงค์ดนัย เอี่ยมองค์");
  const specC2 = await personByName("นิติพงษ์ มิลไธสง");

  const stCrime = await stationByName("กองบังคับการปราบปราม");
  const stHwy = await stationByName("กองบังคับการตำรวจทางหลวง");
  const stSpecial = await stationByName("กองกำกับการต่อต้านการก่อการร้าย");

  type PersonLink = {
    personnelId: string;
    personnelRoleId: string;
    compensationRate: Prisma.Decimal;
    assignedVehicleId?: string | null;
    assignedCargoTruckId?: string | null;
    returnVehicleSameAsGo: boolean;
    assignedVehicleReturnId?: string | null;
  };

  const bot = (
    p: typeof director,
    role: string,
    vehicleId: string,
  ): PersonLink => ({
    personnelId: p.id,
    personnelRoleId: roleId(role),
    compensationRate: dec(botPay(p.gradeLevel, p.vehicleTravelAllowance ? Number(p.vehicleTravelAllowance) : 800)),
    assignedVehicleId: vehicleId,
    returnVehicleSameAsGo: true,
    assignedVehicleReturnId: null,
  });

  const cop = (
    p: typeof crime1,
    role: string,
    goVehicleId: string | null,
    cargoId: string | null,
    returnVehicleId: string | null,
  ): PersonLink => ({
    personnelId: p.id,
    personnelRoleId: roleId(role),
    compensationRate: dec(policePay(p.rank)),
    assignedVehicleId: goVehicleId,
    assignedCargoTruckId: cargoId,
    returnVehicleSameAsGo: cargoId ? false : true,
    assignedVehicleReturnId: cargoId ? returnVehicleId : null,
  });

  const personnel: PersonLink[] = [
    bot(director, "ผู้อำนวยการเดินทาง", vAlpha1.id),
    bot(assistant, "ผู้ช่วยผู้อำนวยการเดินทาง", vAlpha2.id),
    bot(advanceHead, "หัวหน้าชุดส่วนล่วงหน้า", vAdvance.id),
    bot(advanceAsst, "ผู้ช่วยหัวหน้าส่วนล่วงหน้า และสื่อสาร", vAdvance.id),
    bot(advanceDriver, "เจ้าหน้าที่ขับรถส่วนล่วงหน้า และสื่อสาร", vAdvance.id),
    bot(alpha1Driver, "เจ้าหน้าที่ขับรถคุ้มกันหน้า และสื่อสาร", vAlpha1.id),
    bot(alpha2Driver, "เจ้าหน้าที่ขับรถคุ้มกันหลัง และสื่อสาร", vAlpha2.id),
    bot(tailDriver, "เจ้าหน้าที่ขับรถ และสื่อสาร", vTail.id),

    cop(hwyLead1, "ตำรวจทางหลวง นำขบวน", vLead.id, null, null),
    cop(hwyLead2, "ตำรวจทางหลวง นำขบวน", vLead.id, null, null),
    cop(hwyTail1, "ตำรวจทางหลวง ปิดท้ายขบวน", vTail.id, null, null),
    cop(hwyTail2, "ตำรวจทางหลวง ปิดท้ายขบวน", vTail.id, null, null),

    cop(crime1, "ตำรวจกองปราบปราม สื่อสาร / ประสานท้องที่", vLiaison.id, null, null),
    cop(crime2, "ตำรวจกองปราบปราม สื่อสาร / ประสานท้องที่", vLiaison.id, null, null),

    cop(specA1, "ตำรวจอรินทราช 26 (คุ้มกัน)", vCargo1.id, cargo1, vAlpha1.id),
    cop(specA2, "ตำรวจอรินทราช 26 (คุ้มกัน)", vCargo1.id, cargo1, vAlpha1.id),
    cop(specB1, "ตำรวจอรินทราช 26 (คุ้มกัน)", vCargo2.id, cargo2, vAlpha2.id),
    cop(specB2, "ตำรวจอรินทราช 26 (คุ้มกัน)", vCargo2.id, cargo2, vAlpha2.id),
    cop(specC1, "ตำรวจอรินทราช 26 (คุ้มกัน)", vCargoSpare.id, cargoSpare, vLiaison.id),
    cop(specC2, "ตำรวจอรินทราช 26 (คุ้มกัน)", vCargoSpare.id, cargoSpare, vLiaison.id),
  ];

  const vehicles = [
    { vehicleId: vAdvance.id, vehicleRoleId: vRoleId("ส่วนล่วงหน้า"), callSign: "อินทรี", fuelType: MissionVehicleFuelType.DIESEL, fuelLiters: 85, fuelAmount: 2805 },
    { vehicleId: vLead.id, vehicleRoleId: vRoleId("นำขบวน"), callSign: "นำขบวน", fuelType: MissionVehicleFuelType.DIESEL, fuelLiters: 70, fuelAmount: 2310 },
    { vehicleId: vLiaison.id, vehicleRoleId: vRoleId("ประสานท้องที่"), callSign: "ประสาน", fuelType: MissionVehicleFuelType.GASOLINE, fuelLiters: 55, fuelAmount: 2035 },
    { vehicleId: vAlpha1.id, vehicleRoleId: vRoleId("คุ้มกันหน้า"), callSign: "อัลฟ่า 1", fuelType: MissionVehicleFuelType.GASOLINE, fuelLiters: 60, fuelAmount: 2220 },
    { vehicleId: vAlpha2.id, vehicleRoleId: vRoleId("คุ้มกันหลัง"), callSign: "อัลฟ่า 2", fuelType: MissionVehicleFuelType.GASOLINE, fuelLiters: 58, fuelAmount: 2146 },
    { vehicleId: vTail.id, vehicleRoleId: vRoleId("ปิดท้ายขบวน"), callSign: "ปิดท้าย", fuelType: MissionVehicleFuelType.DIESEL, fuelLiters: 72, fuelAmount: 2376 },
    { vehicleId: vCargo1.id, vehicleRoleId: vRoleId("สินค้า"), callSign: "สินค้า 1", fuelType: MissionVehicleFuelType.DIESEL, fuelLiters: 0, fuelAmount: 0 },
    { vehicleId: vCargo2.id, vehicleRoleId: vRoleId("สินค้า"), callSign: "สินค้า 2", fuelType: MissionVehicleFuelType.DIESEL, fuelLiters: 0, fuelAmount: 0 },
    { vehicleId: vCargoSpare.id, vehicleRoleId: vRoleId("หัวลากสำรอง"), callSign: "หัวลากสำรอง", fuelType: MissionVehicleFuelType.DIESEL, fuelLiters: 0, fuelAmount: 0 },
  ];

  const cargoCat = await prisma.personnelCategory.findUnique({ where: { name: "ขับรถสินค้า" } });
  if (!cargoCat) throw new Error("ไม่มีประเภทบุคลากร «ขับรถสินค้า»");
  const orgLogistic = await ensureOrgUnit(prisma, "โลจิสติกส์", 1);
  const ensureDriver = async (fullName: string, idNumber: string, phone: string) => {
    const { id } = await ensureTripPersonnel(prisma, {
      fullName,
      idNumber,
      position: "พนักงานขับรถสินค้า",
      orgUnitId: orgLogistic,
      categoryId: cargoCat.id,
    });
    await prisma.personnel.update({ where: { id }, data: { phone } });
    const row = await prisma.personnel.findUniqueOrThrow({ where: { id } });
    return row;
  };
  const d1 = await ensureDriver("สมชาย แก้วมณี", "1100700123451", "081-234-1111");
  const d2 = await ensureDriver("วิชัย คำภา", "1100700123452", "081-234-1112");
  const d3 = await ensureDriver("ประยุทธ ทองดี", "1100700123453", "081-234-2221");
  const d4 = await ensureDriver("สุรชัย มีสุข", "1100700123454", "081-234-2222");
  const d5 = await ensureDriver("มานพ ใจดี", "1100700123455", "081-234-3331");
  const d6 = await ensureDriver("อนุชา สว่าง", "1100700123456", "081-234-3332");
  const driverSnap = (p: typeof d1) => ({
    personnelId: p.id,
    name: [p.rank, p.fullName].filter(Boolean).join(" ").trim(),
    idNumber: p.idNumber,
    phone: p.phone,
  });
  const a1 = driverSnap(d1);
  const a2 = driverSnap(d2);
  const b1 = driverSnap(d3);
  const b2 = driverSnap(d4);
  const c1 = driverSnap(d5);
  const c2 = driverSnap(d6);

  const cargoTrucks = [
    {
      id: cargo1,
      sortOrder: 0,
      tractorVehicleId: vCargo1.id,
      tractorPlate: vCargo1.licensePlate,
      trailerPlate: "70-3311",
      roleId: cargoRoleId("สินค้า 1"),
      role: "สินค้า 1",
      driver1PersonnelId: a1.personnelId,
      driver1Name: a1.name,
      driver1IdNumber: a1.idNumber,
      driver1Phone: a1.phone,
      driver2PersonnelId: a2.personnelId,
      driver2Name: a2.name,
      driver2IdNumber: a2.idNumber,
      driver2Phone: a2.phone,
      note: "สินค้า 1",
    },
    {
      id: cargo2,
      sortOrder: 1,
      tractorVehicleId: vCargo2.id,
      tractorPlate: vCargo2.licensePlate,
      trailerPlate: "70-3312",
      roleId: cargoRoleId("สินค้า 2"),
      role: "สินค้า 2",
      driver1PersonnelId: b1.personnelId,
      driver1Name: b1.name,
      driver1IdNumber: b1.idNumber,
      driver1Phone: b1.phone,
      driver2PersonnelId: b2.personnelId,
      driver2Name: b2.name,
      driver2IdNumber: b2.idNumber,
      driver2Phone: b2.phone,
      note: "สินค้า 2",
    },
    {
      id: cargoSpare,
      sortOrder: 2,
      tractorVehicleId: vCargoSpare.id,
      tractorPlate: vCargoSpare.licensePlate,
      trailerPlate: null as string | null,
      roleId: cargoRoleId("หัวลากสำรอง"),
      role: "หัวลากสำรอง",
      driver1PersonnelId: c1.personnelId,
      driver1Name: c1.name,
      driver1IdNumber: c1.idNumber,
      driver1Phone: c1.phone,
      driver2PersonnelId: c2.personnelId,
      driver2Name: c2.name,
      driver2IdNumber: c2.idNumber,
      driver2Phone: c2.phone,
      note: "หัวลากสำรอง",
    },
  ];

  const fuelTotal = vehicles.reduce((s, v) => s + v.fuelAmount, 0);
  const truckHire = 85000;
  const compTotal = personnel.reduce((s, p) => s + Number(p.compensationRate), 0);

  await prisma.$transaction(async (tx) => {
    await tx.missionPersonnel.deleteMany({ where: { missionId: mission.id } });
    await tx.missionCargoTruck.deleteMany({ where: { missionId: mission.id } });
    await tx.missionVehicle.deleteMany({ where: { missionId: mission.id } });
    await tx.missionExpense.deleteMany({ where: { missionId: mission.id } });
    await tx.missionPoliceStation.deleteMany({ where: { missionId: mission.id } });

    await tx.missionCargoTruck.createMany({ data: cargoTrucks.map((t) => ({ ...t, missionId: mission.id })) });
    await tx.missionPersonnel.createMany({
      data: personnel.map((p) => ({
        missionId: mission.id,
        ...p,
      })),
    });
    await tx.missionVehicle.createMany({
      data: vehicles.map((v) => ({
        missionId: mission.id,
        vehicleId: v.vehicleId,
        vehicleRoleId: v.vehicleRoleId,
        callSign: v.callSign,
        fuelType: v.fuelType,
        fuelLiters: dec(v.fuelLiters),
        fuelAmount: dec(v.fuelAmount),
      })),
    });
    await tx.missionExpense.createMany({
      data: [
        {
          missionId: mission.id,
          expenseTypeId: await expenseId("ค่าจ้างรถบรรทุก"),
          amount: dec(truckHire),
          description: "ตัวอย่างค่าจ้างหัวลาก/หางลาก B&W (2 สินค้า + 1 สำรอง)",
          incurredAt: mission.plannedStart ?? new Date(),
        },
        {
          missionId: mission.id,
          expenseTypeId: await expenseId("ค่าน้ำมัน / เชื้อเพลิง"),
          amount: dec(fuelTotal),
          description: "ตัวอย่างค่าน้ำมันยานพาหนะคุ้มกัน",
          incurredAt: mission.plannedStart ?? new Date(),
        },
        {
          missionId: mission.id,
          expenseTypeId: await expenseId("ค่าตอบแทน"),
          amount: dec(compTotal),
          description: "รวมค่าตอบแทนบุคลากรตัวอย่าง",
          incurredAt: mission.plannedStart ?? new Date(),
        },
      ],
    });
    await tx.missionPoliceStation.createMany({
      data: [
        { missionId: mission.id, policeStationId: stCrime.id, amount: dec(0), estimateItemCode: "2.4", sortOrder: 0 },
        { missionId: mission.id, policeStationId: stHwy.id, amount: dec(0), estimateItemCode: "2.5", sortOrder: 1 },
        {
          missionId: mission.id,
          policeStationId: stSpecial.id,
          amount: dec(2000),
          estimateItemCode: "2.6",
          note: "ค่าบริหารกำลังพลตัวอย่าง",
          sortOrder: 2,
        },
      ],
    });
    await tx.mission.update({
      where: { id: mission.id },
      data: {
        status: MissionStatus.PLANNED,
        title: "สมมติ · สพฐ–ศสร (ตัวอย่างนั่งสินค้า)",
      },
    });
  });

  console.log(`เติมภารกิจ ${MISSION_CODE}`);
  console.log(`  บุคลากร ${personnel.length} · รถคุ้มกัน ${vehicles.length} · รถสินค้า ${cargoTrucks.length}`);
  console.log(`  จนท.ปฏิบัติการพิเศษขาไปนั่งสินค้า 1–2 และหัวลากสำรอง · ขากลับอัลฟ่า 1/2 และประสาน`);
  console.log(`  ค่าจ้างรถบรรทุก ${truckHire.toLocaleString("th-TH")} · น้ำมัน ${fuelTotal.toLocaleString("th-TH")} · ค่าตอบแทน ${compTotal.toLocaleString("th-TH")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
