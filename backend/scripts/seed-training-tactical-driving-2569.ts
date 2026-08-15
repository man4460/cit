/**
 * นำเข้าทะเบียนรายชื่อผ่านอบรมการขับรถทางยุทธวิธี ปี 2569
 *
 *   npx tsx scripts/seed-training-tactical-driving-2569.ts
 *   หรือตั้ง TRAINING_XLSX=พาธไฟล์
 */
import "dotenv/config";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { PrismaClient, TrainingResultStatus } from "@prisma/client";
import { seedPersonnelMasterData } from "../src/lib/seedPersonnelMasters.js";

const prisma = new PrismaClient();

const DEFAULT_XLSX =
  process.env.TRAINING_XLSX ??
  String.raw`C:\Users\LENOVO\Downloads\Telegram Desktop\ทะเบียนรายชื่ออบรมการขับรถทางยุทธวิธี_2569.xlsx`;

const COURSE_NAME = "หลักสูตรขับรถทางยุทธวิธีและรูปแบบขบวน";
const YEAR_BE = 2569;
const YEAR_CE = YEAR_BE - 543;
const TAG = `[อบรมขับรถยุทธวิธี ${YEAR_BE}]`;

type Row = {
  seq: number;
  rank: string;
  fullName: string;
  team: string;
  center: string;
};

function normalizeName(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function extractViaPython(xlsxPath: string): Row[] {
  const py = `
import json, openpyxl, sys
path = sys.argv[1]
wb = openpyxl.load_workbook(path, data_only=True)
ws = wb.active
rows = []
for r in range(5, ws.max_row + 1):
    seq = ws.cell(r, 1).value
    name = ws.cell(r, 3).value
    if seq is None or name is None:
        continue
    try:
        seq_n = int(seq)
    except Exception:
        continue
    rows.append({
        "seq": seq_n,
        "rank": str(ws.cell(r, 2).value or "").strip(),
        "fullName": str(name).strip(),
        "team": str(ws.cell(r, 4).value or "").strip(),
        "center": str(ws.cell(r, 5).value or "").strip(),
    })
print(json.dumps(rows, ensure_ascii=False))
`.trim();
  const scriptPath = path.join(os.tmpdir(), `export-training-${Date.now()}.py`);
  fs.writeFileSync(scriptPath, py, "utf8");
  try {
    const out = execFileSync("python", [scriptPath, xlsxPath], {
      encoding: "utf8",
      maxBuffer: 5 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    return JSON.parse(out) as Row[];
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      /* ignore */
    }
  }
}

async function ensureOrgUnit(name: string, sortOrder: number): Promise<string> {
  const row = await prisma.organizationUnitType.upsert({
    where: { name },
    create: { name, sortOrder },
    update: { sortOrder },
  });
  return row.id;
}

async function ensureCourse(): Promise<string> {
  const existing = await prisma.trainingCourse.findFirst({
    where: {
      OR: [
        { name: COURSE_NAME },
        { name: { contains: "ขับรถทางยุทธวิธี" } },
      ],
    },
  });
  if (existing) {
    if (existing.name !== COURSE_NAME) {
      // keep existing name if already used
      return existing.id;
    }
    return existing.id;
  }
  const created = await prisma.trainingCourse.create({
    data: { name: COURSE_NAME, sortOrder: 10 },
  });
  return created.id;
}

async function ensurePersonnel(row: Row, orgUnitId: string | null): Promise<string> {
  const fullName = normalizeName(row.fullName);
  const existing = await prisma.personnel.findFirst({
    where: { fullName },
  });
  const affiliation = [row.team, row.center].filter(Boolean).join(" / ");
  const remarkLine = `${TAG} สังกัด ${affiliation || "—"}`;

  if (existing) {
    const remarks = existing.remarks?.includes(TAG)
      ? existing.remarks
      : [remarkLine, existing.remarks].filter(Boolean).join("\n").slice(0, 2000);
    await prisma.personnel.update({
      where: { id: existing.id },
      data: {
        rank: row.rank || existing.rank,
        organizationUnitTypeId: orgUnitId ?? existing.organizationUnitTypeId,
        remarks,
      },
    });
    return existing.id;
  }

  const created = await prisma.personnel.create({
    data: {
      fullName,
      idNumber: `SEED-TRAIN-TACT-${YEAR_BE}-${String(row.seq).padStart(2, "0")}`,
      rank: row.rank || null,
      position: affiliation || null,
      organizationUnitTypeId: orgUnitId,
      remarks: remarkLine,
    },
  });
  return created.id;
}

async function main() {
  const xlsxPath = DEFAULT_XLSX;
  if (!fs.existsSync(xlsxPath)) throw new Error(`ไม่พบไฟล์: ${xlsxPath}`);

  await seedPersonnelMasterData();
  const rows = extractViaPython(xlsxPath);
  console.log(`อ่านรายชื่อ ${rows.length} คน จาก Excel`);

  const courseId = await ensureCourse();
  const course = await prisma.trainingCourse.findUniqueOrThrow({ where: { id: courseId } });
  console.log(`หลักสูตร: ${course.name}`);

  // ศูนย์ ศปภ. เป็นหน่วยงานหลักในไฟล์
  const orgByCenter = new Map<string, string>();
  for (const r of rows) {
    const key = r.center || r.team || "อื่นๆ";
    if (!orgByCenter.has(key)) {
      orgByCenter.set(key, await ensureOrgUnit(key === "ศปภ." ? "ศปภ." : key, 20));
    }
  }

  const start = new Date(Date.UTC(YEAR_CE, 0, 1, 12, 0, 0));
  const end = new Date(Date.UTC(YEAR_CE, 11, 31, 12, 0, 0));

  let createdPeople = 0;
  let linkedPeople = 0;
  let createdEnroll = 0;
  let updatedEnroll = 0;

  for (const row of rows) {
    const orgId = orgByCenter.get(row.center || row.team || "อื่นๆ") ?? null;
    const before = await prisma.personnel.findFirst({
      where: { fullName: normalizeName(row.fullName) },
    });
    const personnelId = await ensurePersonnel(row, orgId);
    if (before) linkedPeople++;
    else createdPeople++;

    const existingEnroll = await prisma.trainingEnrollment.findFirst({
      where: {
        personnelId,
        trainingCourseId: courseId,
        trainingStartDate: { gte: new Date(Date.UTC(YEAR_CE, 0, 1)), lt: new Date(Date.UTC(YEAR_CE + 1, 0, 1)) },
      },
    });

    if (existingEnroll) {
      await prisma.trainingEnrollment.update({
        where: { id: existingEnroll.id },
        data: {
          trainingStartDate: start,
          trainingEndDate: end,
          status: TrainingResultStatus.PASSED,
        },
      });
      updatedEnroll++;
    } else {
      await prisma.trainingEnrollment.create({
        data: {
          personnelId,
          trainingCourseId: courseId,
          trainingStartDate: start,
          trainingEndDate: end,
          status: TrainingResultStatus.PASSED,
        },
      });
      createdEnroll++;
    }
    console.log(`  ${row.seq}. ${row.rank} ${normalizeName(row.fullName)} · ${row.team}/${row.center} → ผ่าน`);
  }

  console.log(
    `\nเสร็จ: บุคคลใหม่ ${createdPeople} · เชื่อมของเดิม ${linkedPeople} · ลงทะเบียนใหม่ ${createdEnroll} · อัปเดต ${updatedEnroll}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
