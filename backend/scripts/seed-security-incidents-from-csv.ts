/**
 * นำเข้าเหตุการณ์ไม่ปกติจาก Security Incident Report List.csv
 *
 *   npm run seed:security-incidents
 *   หรือตั้ง SECURITY_INCIDENT_CSV=พาธไฟล์
 */
import "dotenv/config";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_CSV =
  process.env.SECURITY_INCIDENT_CSV ??
  path.join(__dirname, "..", "data", "security-incident-report-list.csv");

type RawRow = {
  externalId: number;
  title: string;
  location: string;
  incidentAt: string;
  timeOfIncident: string;
  incidentType: string;
  impactLevel: string;
  statusResolved: boolean;
  impactTypes: string;
  damageValue: string;
  cause: string;
  details: string;
  actionExecuted: string;
  preventiveSolutions: string;
  commanderOrder: string;
  linkBotShare: string;
  reportingOfficer: string;
  createdBy: string;
  sourceCreatedAt: string;
  sourceModifiedBy: string;
  sourceModifiedAt: string;
  attachmentsCount: number;
};

function extractViaPython(csvPath: string): RawRow[] {
  const py = `
import csv, json, sys
from datetime import datetime

path = sys.argv[1]

def parse_dt(raw):
    s = (raw or "").strip()
    if not s:
        return None
    for fmt in (
        "%m/%d/%Y %I:%M:%S %p",
        "%m/%d/%Y %I:%M %p",
        "%m/%d/%Y %H:%M:%S",
        "%m/%d/%Y %H:%M",
        "%m/%d/%Y",
    ):
        try:
            return datetime.strptime(s, fmt).isoformat() + "Z"
        except ValueError:
            pass
    return None

def g(row, *keys):
    for k in keys:
        if k in row and row[k] is not None and str(row[k]).strip() != "":
            return str(row[k]).strip()
    # fuzzy trimmed headers
    norm = {str(hk).strip().lower(): hv for hk, hv in row.items()}
    for k in keys:
        v = norm.get(k.strip().lower())
        if v is not None and str(v).strip() != "":
            return str(v).strip()
    return ""

rows = []
with open(path, "r", encoding="utf-8-sig", newline="") as f:
    reader = csv.DictReader(f)
    for row in reader:
        id_raw = g(row, "ID")
        try:
            external_id = int(float(id_raw))
        except Exception:
            continue
        if external_id <= 0:
            continue
        status = g(row, "Incident Status").lower()
        rows.append({
            "externalId": external_id,
            "title": g(row, "Title") or f"เหตุการณ์ #{external_id}",
            "location": g(row, "Location of Incident"),
            "incidentAt": parse_dt(g(row, "Date of Incident")) or "",
            "timeOfIncident": parse_dt(g(row, "Time of Incident")) or "",
            "incidentType": g(row, "Incident Type"),
            "impactLevel": g(row, "Level of  Incident impact", "Level of Incident impact"),
            "statusResolved": status in ("true", "1", "yes"),
            "impactTypes": g(row, "Type of impact ", "Type of impact"),
            "damageValue": g(row, "Damage Value"),
            "cause": g(row, "Cause of Incident"),
            "details": g(row, "Incident Detials", "Incident Details"),
            "actionExecuted": g(row, "Action executed"),
            "preventiveSolutions": g(row, "Preventive solutions"),
            "commanderOrder": g(row, "Commander order"),
            "linkBotShare": g(row, "Link BotShare"),
            "reportingOfficer": g(row, "Reporting officer"),
            "createdBy": g(row, "Created By"),
            "sourceCreatedAt": parse_dt(g(row, "Created")) or "",
            "sourceModifiedBy": g(row, "Modified By"),
            "sourceModifiedAt": parse_dt(g(row, "Modified")) or "",
            "attachmentsCount": int(float(g(row, "Attachments") or "0") or 0),
        })
print(json.dumps(rows, ensure_ascii=False))
`.trim();

  const scriptPath = path.join(os.tmpdir(), `seed-security-incidents-${Date.now()}.py`);
  fs.writeFileSync(scriptPath, py, "utf8");
  try {
    const out = execFileSync("python", [scriptPath, csvPath], {
      encoding: "utf8",
      maxBuffer: 80 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    return JSON.parse(out) as RawRow[];
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      /* */
    }
  }
}

function toDate(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function emptyToNull(s: string): string | null {
  const t = s.trim();
  return t ? t : null;
}

async function main() {
  if (!fs.existsSync(DEFAULT_CSV)) {
    throw new Error(`ไม่พบไฟล์: ${DEFAULT_CSV}`);
  }
  console.log("อ่าน CSV…");
  const rows = extractViaPython(DEFAULT_CSV);
  console.log(`พบ ${rows.length} รายการ`);

  let upserted = 0;
  for (const r of rows) {
    const data = {
      title: r.title,
      location: emptyToNull(r.location),
      incidentAt: toDate(r.incidentAt),
      timeOfIncident: toDate(r.timeOfIncident),
      incidentType: emptyToNull(r.incidentType),
      impactLevel: emptyToNull(r.impactLevel),
      statusResolved: r.statusResolved,
      impactTypes: emptyToNull(r.impactTypes),
      damageValue: emptyToNull(r.damageValue),
      cause: emptyToNull(r.cause),
      details: emptyToNull(r.details),
      actionExecuted: emptyToNull(r.actionExecuted),
      preventiveSolutions: emptyToNull(r.preventiveSolutions),
      commanderOrder: emptyToNull(r.commanderOrder),
      linkBotShare: emptyToNull(r.linkBotShare),
      reportingOfficer: emptyToNull(r.reportingOfficer),
      createdBy: emptyToNull(r.createdBy),
      sourceCreatedAt: toDate(r.sourceCreatedAt),
      sourceModifiedBy: emptyToNull(r.sourceModifiedBy),
      sourceModifiedAt: toDate(r.sourceModifiedAt),
      attachmentsCount: r.attachmentsCount || 0,
    };
    await prisma.securityIncident.upsert({
      where: { externalId: r.externalId },
      create: { externalId: r.externalId, ...data },
      update: data,
    });
    upserted++;
    if (upserted % 200 === 0) console.log(`  … ${upserted}`);
  }
  console.log(`เสร็จ: upsert ${upserted} รายการ`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
