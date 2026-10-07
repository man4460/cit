import XLSX from "xlsx-js-style";
import { withExcelFont } from "./excelFont.js";
import { prisma } from "./prisma.js";
import { loadLocationCodes, locationTextToProvinces } from "./routeDistance.js";

/** ค่าที่ผู้ใช้กรอกในหน้าต่างส่งออก (จำค่าไว้ในเบราว์เซอร์) */
export type InsuranceExportSettings = {
  agencyName?: string;
  operatorName?: string;
  operatorIdNumber?: string;
  taxId?: string;
  department?: string;
  address?: string;
  phone?: string;
  note?: string;
  insurerName?: string;
  insurerContact?: string;
  insurerDepartment?: string;
  insurerTel?: string;
  insurerFax?: string;
  insurerEmail?: string;
  policyType?: string;
  sumInsured?: string;
  medicalExpense?: string;
  discountLabel?: string;
  rates?: { days: number; rate: number }[];
  tax?: number | string | null;
  travelLabel?: string;
  routeLabel?: string;
};

type BenName = { title: string; first: string; last: string };

export type InsurancePersonRow = {
  title: string;
  first: string;
  last: string;
  birthDate: Date | null;
  age: number | null;
  idNumber: string;
  unit: string;
  bens: BenName[];
  missing: string[];
  /** มีประกันรายปีแต่หมดอายุก่อนวันเดินทางสิ้นสุด (วันที่ พ.ศ.) */
  annualExpired: string | null;
};

const TZ = "Asia/Bangkok";
const TH_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const UNIT_BY_CATEGORY: Record<string, string> = {
  "ธปท.": "พนักงานฝ่ายรักษาความปลอดภัย",
  ทางหลวง: "เจ้าหน้าที่ตำรวจทางหลวง",
  กองปราบ: "เจ้าหน้าที่ตำรวจกองบังคับการปราบปราม",
  ปฏิบัติการพิเศษ: "เจ้าหน้าที่ตำรวจปฏิบัติการพิเศษ",
};

/** เรียงจากยาวไปสั้น เพื่อให้ "นางสาว" ถูกจับก่อน "นาง" */
const NAME_PREFIXES = ["ว่าที่ร้อยตรี", "เด็กหญิง", "เด็กชาย", "นางสาว", "ด.ญ.", "ด.ช.", "น.ส.", "นาง", "นาย"];

function bkkParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric" })
    .formatToParts(d)
    .reduce<Record<string, number>>((acc, p) => (p.type === "literal" ? acc : { ...acc, [p.type]: Number(p.value) }), {});
  return { y: parts.year, m: parts.month, d: parts.day };
}

function dayNumber(d: Date) {
  const p = bkkParts(d);
  return Date.UTC(p.y, p.m - 1, p.d) / 86_400_000;
}

export function travelDays(start: Date | null, end: Date | null) {
  if (!start) return 1;
  return Math.max(1, dayNumber(end ?? start) - dayNumber(start) + 1);
}

export function travelLabel(start: Date | null, end: Date | null) {
  if (!start) return "";
  const a = bkkParts(start);
  const b = bkkParts(end ?? start);
  const yA = a.y + 543;
  const yB = b.y + 543;
  if (a.y === b.y && a.m === b.m)
    return a.d === b.d ? `วันที่ ${a.d} ${TH_MONTHS[a.m - 1]} ${yA}` : `วันที่ ${a.d}-${b.d} ${TH_MONTHS[a.m - 1]} ${yA}`;
  if (a.y === b.y) return `วันที่ ${a.d} ${TH_MONTHS[a.m - 1]} - ${b.d} ${TH_MONTHS[b.m - 1]} ${yA}`;
  return `วันที่ ${a.d} ${TH_MONTHS[a.m - 1]} ${yA} - ${b.d} ${TH_MONTHS[b.m - 1]} ${yB}`;
}

function thaiShortDate(d: Date | null) {
  if (!d) return "";
  const p = bkkParts(d);
  return `${p.d}/${p.m}/${p.y + 543}`;
}

function ageAt(birth: Date | null, at: Date) {
  if (!birth) return null;
  const b = bkkParts(birth);
  const t = bkkParts(at);
  let age = t.y - b.y;
  if (t.m < b.m || (t.m === b.m && t.d < b.d)) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

function formatThaiId(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 13) return raw.trim();
  return `${d[0]} ${d.slice(1, 5)} ${d.slice(5, 10)} ${d.slice(10, 12)} ${d[12]}`;
}

/** แยกคำนำหน้า / ชื่อ / สกุล จากชื่อเต็ม */
export function splitThaiName(fullName: string, knownTitle?: string | null): BenName {
  let rest = fullName.replace(/\s+/g, " ").trim();
  let title = (knownTitle ?? "").trim();
  if (!title) {
    const firstToken = rest.split(" ")[0] ?? "";
    const prefix = NAME_PREFIXES.find((p) => rest.startsWith(p));
    if (prefix) {
      title = prefix;
      rest = rest.slice(prefix.length).trim();
    } else if (firstToken.includes(".") && rest.includes(" ")) {
      title = firstToken;
      rest = rest.slice(firstToken.length).trim();
    }
  } else if (rest.startsWith(title)) {
    rest = rest.slice(title.length).trim();
  }
  const sp = rest.indexOf(" ");
  return sp < 0 ? { title, first: rest, last: "" } : { title, first: rest.slice(0, sp), last: rest.slice(sp + 1) };
}

function premiumFor(days: number, rates: { days: number; rate: number }[]) {
  const tiers = rates.filter((r) => r.days > 0 && r.rate >= 0).sort((a, b) => a.days - b.days);
  if (!tiers.length) return null;
  return (tiers.find((t) => t.days >= days) ?? tiers[tiers.length - 1]).rate;
}

export async function loadInsuranceMission(missionId: string) {
  const m = await prisma.mission.findUnique({
    where: { id: missionId },
    include: {
      route: true,
      destinations: { orderBy: { sortOrder: "asc" } },
      personnel: {
        include: {
          personnel: {
            include: { personnelCategory: true, beneficiaries: { orderBy: { sortOrder: "asc" } } },
          },
        },
      },
    },
  });
  if (!m) return null;

  const start = m.plannedStart;
  const end = m.plannedEnd;
  const locations = await loadLocationCodes();
  const stops = [m.route?.startLocation, ...m.destinations.map((d) => d.address), m.route?.endLocation]
    .flatMap((s) => locationTextToProvinces(s ?? "", locations).split(" / "))
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s, i, arr) => arr.indexOf(s) === i);

  const assigned = m.personnel
    .map((mp) => mp.personnel)
    .filter((p) => !p.purgedAt)
    .sort(
      (a, b) =>
        (a.personnelCategory?.sortOrder ?? 999) - (b.personnelCategory?.sortOrder ?? 999) ||
        (a.personnelCategory?.name ?? "").localeCompare(b.personnelCategory?.name ?? "", "th") ||
        a.fullName.localeCompare(b.fullName, "th"),
    );

  const lastDay = dayNumber(end ?? start ?? new Date());
  const coveredByAnnual = (p: (typeof assigned)[number]) =>
    p.annualTravelInsurance && (!p.insuranceExpiry || dayNumber(p.insuranceExpiry) >= lastDay);
  const annualCovered = assigned.filter(coveredByAnnual).map((p) => ({
    name: [p.rank, p.fullName].filter(Boolean).join(" "),
    company: p.insuranceCompany?.trim() || null,
    policyNumber: p.insurancePolicyNumber?.trim() || null,
    expiry: p.insuranceExpiry ? thaiShortDate(p.insuranceExpiry) : null,
  }));

  const people: InsurancePersonRow[] = assigned.filter((p) => !coveredByAnnual(p)).map((p) => {
    const name = splitThaiName(p.fullName, p.rank);
    const missing: string[] = [];
    if (!p.birthDate) missing.push("วันเกิด");
    if (p.idNumber.replace(/\D/g, "").length !== 13) missing.push("เลขบัตรประชาชน");
    if (!p.beneficiaries.length) missing.push("ผู้รับผลประโยชน์");
    const cat = p.personnelCategory?.name ?? "";
    return {
      ...name,
      birthDate: p.birthDate,
      age: ageAt(p.birthDate, start ?? new Date()),
      idNumber: formatThaiId(p.idNumber),
      unit: UNIT_BY_CATEGORY[cat] ?? (p.position?.trim() || cat),
      bens: p.beneficiaries.slice(0, 2).map((b) => splitThaiName(b.fullName)),
      missing,
      annualExpired: p.annualTravelInsurance && p.insuranceExpiry ? thaiShortDate(p.insuranceExpiry) : null,
    };
  });

  return {
    mission: m,
    days: travelDays(start, end),
    travelLabel: travelLabel(start, end),
    routeLabel: stops.join(" - "),
    people,
    annualCovered,
    purgedCount: m.personnel.length - assigned.length,
  };
}

// ---------------- workbook ----------------

type CellStyle = XLSX.CellObject["s"];

const COLS = 15;
const C = {
  navy: "1E1B4B",
  blue: "0000BF",
  band: "EEF2FF",
  soft: "F8FAFC",
  zebra: "F5F7FF",
  border: "C7CBE8",
  label: "475569",
  total: "E0E7FF",
  white: "FFFFFF",
};

const border = (rgb = C.border) => ({
  top: { style: "thin", color: { rgb } },
  bottom: { style: "thin", color: { rgb } },
  left: { style: "thin", color: { rgb } },
  right: { style: "thin", color: { rgb } },
});

function style(opts: {
  bold?: boolean;
  sz?: number;
  color?: string;
  fill?: string;
  h?: "left" | "center" | "right";
  wrap?: boolean;
  border?: boolean;
  numFmt?: string;
}): CellStyle {
  return {
    font: withExcelFont({ sz: opts.sz ?? 14, bold: opts.bold, color: opts.color ? { rgb: opts.color } : undefined }),
    alignment: { horizontal: opts.h ?? "left", vertical: "center", wrapText: opts.wrap ?? true },
    ...(opts.fill ? { fill: { patternType: "solid", fgColor: { rgb: opts.fill } } } : {}),
    ...(opts.border ? { border: border() } : {}),
    ...(opts.numFmt ? { numFmt: opts.numFmt } : {}),
  } as CellStyle;
}

class Sheet {
  ws: XLSX.WorkSheet = {};
  merges: XLSX.Range[] = [];
  heights: Record<number, number> = {};

  set(r: number, c: number, v: string | number | null | undefined, s?: CellStyle) {
    const value = v ?? "";
    this.ws[XLSX.utils.encode_cell({ r, c })] = { v: value, t: typeof value === "number" ? "n" : "s", s };
  }

  /** เติม style ให้ทุกช่องในช่วง merge เพื่อให้เส้นขอบ/สีพื้นครบ */
  block(r: number, c1: number, c2: number, v: string | number | null | undefined, s: CellStyle, r2 = r) {
    for (let rr = r; rr <= r2; rr++) for (let cc = c1; cc <= c2; cc++) this.set(rr, cc, rr === r && cc === c1 ? v : "", s);
    if (c2 > c1 || r2 > r) this.merges.push({ s: { r, c: c1 }, e: { r: r2, c: c2 } });
  }

  height(r: number, h: number) {
    this.heights[r] = h;
  }
}

function money(n: number | null | undefined) {
  return n == null ? "" : n;
}

export function buildInsuranceWorkbook(
  data: NonNullable<Awaited<ReturnType<typeof loadInsuranceMission>>>,
  s: InsuranceExportSettings,
) {
  const sh = new Sheet();
  const rates = (s.rates ?? []).filter((r) => Number(r.days) > 0).map((r) => ({ days: Number(r.days), rate: Number(r.rate) }));
  const perPerson = premiumFor(data.days, rates);
  const count = data.people.length;
  const net = perPerson != null ? perPerson * count : null;
  const tax = s.tax === "" || s.tax == null ? null : Number(s.tax);
  const grand = net != null ? net + (Number.isFinite(tax) && tax != null ? tax : 0) : null;

  const title = style({ bold: true, sz: 20, color: C.white, fill: C.blue, h: "center" });
  const subtitle = style({ bold: true, sz: 15, color: C.navy, fill: C.band, h: "center" });
  const boxHead = style({ bold: true, sz: 15, color: C.white, fill: C.navy, border: true });
  const label = style({ bold: true, color: C.label, fill: C.soft, border: true });
  const value = style({ color: C.navy, border: true });
  const valueBold = style({ bold: true, color: C.navy, border: true });
  const moneyCell = style({ bold: true, color: C.navy, border: true, h: "right", numFmt: "#,##0.00" });

  let r = 0;
  sh.block(r, 0, COLS - 1, "แบบแจ้งรายชื่อผู้เอาประกันภัยอุบัติเหตุการเดินทาง", title);
  sh.height(r, 34);
  r += 1;
  const missionName = [data.mission.code, data.mission.title].filter(Boolean).join(" — ");
  sh.block(r, 0, COLS - 1, missionName ? `ภารกิจ ${missionName}` : "ภารกิจขนส่งธนบัตร", subtitle);
  sh.height(r, 24);
  r += 2;

  // กล่องซ้าย A:H (label A:B, value C:H) — กล่องขวา I:O (label I:J, value K:O)
  const twoBoxes = (
    leftTitle: string,
    left: [string, string | number | null | undefined, CellStyle?][],
    rightTitle: string,
    right: [string, string | number | null | undefined, CellStyle?][],
  ) => {
    sh.block(r, 0, 7, leftTitle, boxHead);
    sh.block(r, 8, 14, rightTitle, boxHead);
    sh.height(r, 24);
    r += 1;
    const n = Math.max(left.length, right.length);
    for (let i = 0; i < n; i++) {
      const L = left[i];
      const R = right[i];
      if (L) {
        sh.block(r, 0, 1, L[0], label);
        sh.block(r, 2, 7, L[1], L[2] ?? value);
      } else sh.block(r, 0, 7, "", value);
      if (R) {
        sh.block(r, 8, 9, R[0], label);
        sh.block(r, 10, 14, R[1], R[2] ?? value);
      } else sh.block(r, 8, 14, "", value);
      const longest = Math.max(String(L?.[1] ?? "").length, String(R?.[1] ?? "").length);
      sh.height(r, longest > 70 ? 40 : 22);
      r += 1;
    }
    r += 1;
  };

  twoBoxes(
    "ข้อมูลผู้ขอเอาประกันภัย",
    [
      ["หน่วยงาน", s.agencyName, valueBold],
      ["ผู้ดำเนินการ", s.operatorName],
      ["เลขบัตรประชาชน", s.operatorIdNumber ? formatThaiId(s.operatorIdNumber) : ""],
      ["เลขผู้เสียภาษี", s.taxId],
      ["ส่วนงาน", s.department],
      ["ที่อยู่", s.address],
      ["เบอร์ติดต่อ", s.phone],
      ["หมายเหตุ", s.note],
    ],
    "บริษัทประกันภัย",
    [
      ["บริษัท", s.insurerName, valueBold],
      ["ผู้ดำเนินการ", s.insurerContact],
      ["ฝ่าย / แผนก", s.insurerDepartment],
      ["โทรศัพท์", s.insurerTel],
      ["โทรสาร", s.insurerFax],
      ["E-mail", s.insurerEmail],
    ],
  );

  const rateRows: [string, string | number | null | undefined, CellStyle?][] = rates
    .sort((a, b) => a.days - b.days)
    .map((t) => [
      `${t.days} วัน`,
      t.rate,
      perPerson != null && t.rate === perPerson
        ? style({ bold: true, color: C.blue, fill: C.band, border: true, h: "right", numFmt: '#,##0.00" บาท"' })
        : style({ color: C.navy, border: true, h: "right", numFmt: '#,##0.00" บาท"' }),
    ]);

  twoBoxes(
    "รายละเอียดความคุ้มครอง",
    [
      ["ประเภทกรมธรรม์", s.policyType, valueBold],
      ["ทุนประกัน", s.sumInsured],
      ["ค่ารักษาพยาบาล", s.medicalExpense],
      ["วันเดินทาง", s.travelLabel || data.travelLabel, valueBold],
      ["เส้นทาง", s.routeLabel || data.routeLabel],
      ["จำนวนวัน", `${data.days} วัน`],
      ["จำนวนผู้เดินทาง", `${count} คน`],
    ],
    `อัตราเบี้ยประกัน${s.discountLabel ? ` (${s.discountLabel})` : ""}`,
    [
      ...rateRows,
      ["เบี้ยสุทธิต่อคน", money(perPerson), moneyCell],
      ["เบี้ยประกันรวม", money(net), moneyCell],
      ["ภาษี / อากร", money(tax), moneyCell],
      ["รวมทั้งสิ้น", money(grand), style({ bold: true, sz: 15, color: C.white, fill: C.blue, border: true, h: "right", numFmt: "#,##0.00" })],
    ],
  );

  sh.block(r, 0, COLS - 1, "รายชื่อผู้ร่วมเดินทางและผู้รับผลประโยชน์", style({ bold: true, sz: 16, color: C.navy, fill: C.band, h: "center", border: true }));
  sh.height(r, 26);
  r += 1;

  const th = style({ bold: true, color: C.white, fill: C.navy, h: "center", border: true });
  const top = r;
  const single: [number, string][] = [
    [0, "ที่"], [1, "คำนำหน้า"], [2, "ชื่อ"], [3, "สกุล"], [4, "วันเดือนปีเกิด"],
    [5, "อายุ"], [6, "หมายเลขบัตรประชาชน"], [7, "ส่วนงาน"], [14, "อัตราเบี้ย"],
  ];
  for (const [c, t] of single) sh.block(top, c, c, t, th, top + 1);
  sh.block(top, 8, 10, "ผู้รับผลประโยชน์ 1", th);
  sh.block(top, 11, 13, "ผู้รับผลประโยชน์ 2", th);
  ["คำนำหน้า", "ชื่อ", "สกุล", "คำนำหน้า", "ชื่อ", "สกุล"].forEach((t, i) => sh.set(top + 1, 8 + i, t, th));
  sh.height(top, 24);
  sh.height(top + 1, 24);
  r = top + 2;

  data.people.forEach((p, i) => {
    const fill = i % 2 ? C.zebra : C.white;
    const cell = style({ color: C.navy, fill, border: true });
    const center = style({ color: C.navy, fill, border: true, h: "center" });
    const warn = style({ color: "B91C1C", fill: "FEF2F2", border: true, h: "center" });
    const vals: [string | number, CellStyle][] = [
      [i + 1, center],
      [p.title, cell],
      [p.first, cell],
      [p.last, cell],
      [p.birthDate ? thaiShortDate(p.birthDate) : "ไม่มีข้อมูล", p.birthDate ? center : warn],
      [p.age ?? "", center],
      [p.idNumber, center],
      [p.unit, cell],
      [p.bens[0]?.title ?? "", cell],
      [p.bens[0]?.first ?? "", cell],
      [p.bens[0]?.last ?? "", cell],
      [p.bens[1]?.title ?? "", cell],
      [p.bens[1]?.first ?? "", cell],
      [p.bens[1]?.last ?? "", cell],
      [perPerson ?? "", style({ color: C.navy, fill, border: true, h: "right", numFmt: "#,##0.00" })],
    ];
    vals.forEach(([v, st], c) => sh.set(r, c, v, st));
    sh.height(r, 22);
    r += 1;
  });

  const totalStyle = style({ bold: true, color: C.navy, fill: C.total, border: true, h: "right" });
  sh.block(r, 0, 13, `รวม ${count} คน`, totalStyle);
  sh.set(r, 14, net ?? "", style({ bold: true, color: C.navy, fill: C.total, border: true, h: "right", numFmt: "#,##0.00" }));
  sh.height(r, 24);
  r += 3;

  const sign = style({ color: C.navy, h: "center" });
  sh.block(r, 1, 6, "ลงชื่อ ......................................................... ผู้จัดทำ", sign);
  sh.block(r, 9, 14, "ลงชื่อ ......................................................... ผู้อนุมัติ", sign);
  r += 1;
  sh.block(r, 1, 6, `( ${s.operatorName || "........................................................."} )`, sign);
  sh.block(r, 9, 14, "( ......................................................... )", sign);
  r += 2;
  sh.block(
    r,
    0,
    COLS - 1,
    "ข้อมูลส่วนบุคคลในเอกสารนี้ใช้เพื่อการทำประกันภัยสำหรับภารกิจขนส่งธนบัตรเท่านั้น ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562",
    style({ sz: 12, color: C.label, h: "center" }),
  );

  sh.ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r, c: COLS - 1 } });
  sh.ws["!merges"] = sh.merges;
  sh.ws["!cols"] = [5, 11, 13, 15, 12, 6, 19, 30, 10, 11, 13, 10, 11, 13, 11].map((wch) => ({ wch }));
  sh.ws["!rows"] = Array.from({ length: r + 1 }, (_, i) => (sh.heights[i] ? { hpt: sh.heights[i] } : {}));
  sh.ws["!margins"] = { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sh.ws, "ประกัน");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
