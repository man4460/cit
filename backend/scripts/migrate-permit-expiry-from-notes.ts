/**
 * ย้ายวันหมดอายุจากข้อความในหมายเหตุ (รูปแบบ เช่น "ใบอนุญาตหมดอายุ 28 พ.ย. 69") ไปที่ permitExpiresAt แล้วล้างส่วนที่จับได้ออกจาก notes
 * รัน: npx tsx scripts/migrate-permit-expiry-from-notes.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TH_MONTH: Record<string, number> = {
  "ม.ค.": 0,
  "ก.พ.": 1,
  "มี.ค.": 2,
  "เม.ย.": 3,
  "พ.ค.": 4,
  "มิ.ย.": 5,
  "ก.ค.": 6,
  "ส.ค.": 7,
  "ก.ย.": 8,
  "ต.ค.": 9,
  "พ.ย.": 10,
  "ธ.ค.": 11,
};

const DATE_IN_NOTE = new RegExp(
  "(\\d{1,2})\\s+(ม\\.ค\\.|ก\\.พ\\.|มี\\.ค\\.|เม\\.ย\\.|พ\\.ค\\.|มิ\\.ย\\.|ก\\.ค\\.|ส\\.ค\\.|ก\\.ย\\.|ต\\.ค\\.|พ\\.ย\\.|ธ\\.ค\\.)\\s+(\\d{2,4})",
  "u",
);

function parseThaiShortDateInText(text: string): Date | null {
  const m = text.match(DATE_IN_NOTE);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const mon = TH_MONTH[m[2]];
  if (mon === undefined || !Number.isFinite(day)) return null;
  let y = parseInt(m[3], 10);
  let ceYear: number;
  if (y < 100) ceYear = 2500 + y - 543;
  else if (y >= 2400) ceYear = y - 543;
  else ceYear = y;
  const d = new Date(Date.UTC(ceYear, mon, day, 12, 0, 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

function stripMatchedDatePhrase(notes: string): string | null {
  const cleaned = notes.replace(DATE_IN_NOTE, "").replace(/ใบอนุญาตหมดอายุ\s*/u, "").trim();
  return cleaned.length ? cleaned : null;
}

async function main() {
  const rows = await prisma.asset.findMany({
    where: { notes: { not: null } },
    select: { id: true, serialNumber: true, notes: true },
  });

  let n = 0;
  for (const r of rows) {
    if (!r.notes?.trim()) continue;
    const dt = parseThaiShortDateInText(r.notes);
    if (!dt) continue;
    const nextNotes = stripMatchedDatePhrase(r.notes);
    await prisma.asset.update({
      where: { id: r.id },
      data: {
        permitExpiresAt: dt,
        notes: nextNotes,
      },
    });
    n++;
    console.log(`อัปเดต ${r.serialNumber}: permitExpiresAt + ปรับหมายเหตุ`);
  }
  console.log(`\nเสร็จ ${n} รายการ`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
