import { formatBaht } from "./formatNumber";
import type { EvaluationSummary } from "./missionEvaluation";
import { incidentReportLines, type MissionIncident } from "./missionIncidents";
import type { MissionSummary } from "../types";

export type MissionOutcome = "success" | "successWithIssues" | "incomplete";

export const OUTCOME_OPTIONS: { key: MissionOutcome; label: string; sentence: string; tone: string }[] = [
  { key: "success", label: "สำเร็จเรียบร้อย", sentence: "ปฏิบัติภารกิจสำเร็จเรียบร้อยตามแผน ทรัพย์สินถึงปลายทางครบถ้วนถูกต้อง", tone: "emerald" },
  { key: "successWithIssues", label: "สำเร็จ แต่มีเหตุขัดข้อง", sentence: "ปฏิบัติภารกิจสำเร็จ ทรัพย์สินถึงปลายทางครบถ้วน แต่มีเหตุขัดข้องระหว่างปฏิบัติ (รายละเอียดตามข้อ 5)", tone: "amber" },
  { key: "incomplete", label: "ไม่สำเร็จ / เลื่อน", sentence: "ภารกิจไม่สามารถดำเนินการได้ตามแผน (รายละเอียดตามข้อ 5)", tone: "rose" },
];

export type ReportForm = {
  recipient: string;
  outcome: MissionOutcome;
  incidents: string;
  suggestions: string;
  reporterName: string;
  reporterPosition: string;
  includeExpenses: boolean;
  includeVehicles: boolean;
  includeEvaluation: boolean;
};

export type ReportExtras = {
  /** ยอดขออนุมัติตามประมาณการ */
  approvedBudget: number | null;
  evaluation: EvaluationSummary | null;
  /** บันทึกเหตุการณ์ไม่ปกติของทริป */
  incidents: MissionIncident[];
};

const TRUCK_HIRE_KEYWORD = "ค่าจ้างรถบรรทุก";

const EXPENSE_GROUP_ORDER = ["ค่าตอบแทน", "ที่พัก/อาหาร", "น้ำมัน/ยานพาหนะ", "อื่นๆ"] as const;

function expenseGroup(typeName: string): (typeof EXPENSE_GROUP_ORDER)[number] {
  if (/ค่าตอบแทน|เงินช่วยเหลือ|เบี้ยเลี้ยง/.test(typeName)) return "ค่าตอบแทน";
  if (/ที่พัก|อาหาร|เครื่องดื่ม|รับรอง/.test(typeName)) return "ที่พัก/อาหาร";
  if (/น้ำมัน|เชื้อเพลิง|ล้างรถ|ทางด่วน|ยานพาหนะ/.test(typeName)) return "น้ำมัน/ยานพาหนะ";
  return "อื่นๆ";
}

type Line = { text: string; indent?: number; bold?: boolean };
type Section = { title: string; lines: Line[] };

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const THAI_MONTHS_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

function thaiDate(iso: string | null | undefined, full = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${(full ? THAI_MONTHS_FULL : THAI_MONTHS)[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function dateRange(start?: string | null, end?: string | null): string {
  if (!start) return "—";
  if (!end) return thaiDate(start, true);
  const a = new Date(start);
  const b = new Date(end);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return a.getDate() === b.getDate()
      ? thaiDate(start, true)
      : `${a.getDate()}–${b.getDate()} ${THAI_MONTHS_FULL[a.getMonth()]} ${a.getFullYear() + 543}`;
  }
  return `${thaiDate(start, true)} – ${thaiDate(end, true)}`;
}

function dayCount(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(1, Math.round((day(b) - day(a)) / 86_400_000) + 1);
}

const num = (v: string | number | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

function missionName(s: MissionSummary): string {
  const title = s.title
    ?.replace(/\s*\(หัวลาก[^)]*\)/g, "")
    .split("·")[0]
    .trim();
  return title || s.code || "ภารกิจ";
}

function shortDateRange(start?: string | null, end?: string | null): string {
  if (!start) return "";
  const a = new Date(start);
  if (Number.isNaN(a.getTime())) return "";
  const fmt = (d: Date) => `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${String(d.getFullYear() + 543).slice(-2)}`;
  const b = end ? new Date(end) : null;
  if (!b || Number.isNaN(b.getTime()) || b.toDateString() === a.toDateString()) return fmt(a);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${a.getDate()}–${fmt(b)}`;
  return `${fmt(a)} – ${fmt(b)}`;
}

function tripLabel(s: MissionSummary): string | null {
  const fromTitle = s.title?.match(/trip\s*(\d+)/i);
  if (fromTitle) return `Trip ${Number(fromTitle[1])}`;
  const fromCode = s.code?.match(/^trip-\d{4}-(\d+)$/i);
  return fromCode ? `Trip ${Number(fromCode[1])}` : null;
}

export function reportSubject(s: MissionSummary): string {
  const date = shortDateRange(s.plannedStart, s.plannedEnd);
  const route = s.route ? [s.route.startLocation, s.route.endLocation].filter(Boolean).join(" - ") || s.route.name : "";
  return [
    "รายงานผลภารกิจ",
    tripLabel(s) ?? s.code?.trim() ?? missionName(s),
    route ? `เส้นทาง ${route}` : "",
    date ? `เมื่อ ${date}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildSections(s: MissionSummary, form: ReportForm, extras: ReportExtras): Section[] {
  const personnel = s.personnel ?? [];
  const vehicles = s.vehicles ?? [];
  const destinations = (s.destinations ?? []).filter((d) => d.address.trim());
  const outcome = OUTCOME_OPTIONS.find((o) => o.key === form.outcome) ?? OUTCOME_OPTIONS[0];
  const days = dayCount(s.plannedStart, s.plannedEnd);
  const containers = destinations.reduce((sum, d) => sum + (d.containerCount || 0), 0);
  const stops = [s.route?.startLocation, ...destinations.map((d) => d.address)]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .filter((x, i, arr) => i === 0 || x !== arr[i - 1]);
  const end = s.route?.endLocation?.trim();
  if (end) {
    const norm = (t: string) => t.replace(/[.\s]/g, "");
    const seen = new Set(stops.map(norm));
    const endParts = end.split(/[-–,/]/).map(norm).filter(Boolean);
    if (!endParts.every((p) => seen.has(p))) stops.push(end);
  }

  const sections: Section[] = [];
  let n = 1;

  sections.push({ title: `${n++}. ผลการปฏิบัติ`, lines: [{ text: outcome.sentence }] });

  sections.push({
    title: `${n++}. ข้อมูลภารกิจ`,
    lines: [
      { text: `เส้นทาง: ${stops.join(" → ") || s.route?.name || "—"}`, indent: 1 },
      { text: `ระยะเวลา: ${dateRange(s.plannedStart, s.plannedEnd)}${days ? ` (${days} วัน)` : ""}`, indent: 1 },
      {
        text: `จุดส่ง ${destinations.length} จุด · ตู้สินค้า ${containers} ตู้ · มูลค่าทรัพย์สินรวม ${formatBaht(num(s.totalCargoValue))} บาท`,
        indent: 1,
      },
    ],
  });

  const byGroup = new Map<string, number>();
  for (const p of personnel) {
    const g = p.personnelCategoryName?.trim() || "อื่นๆ";
    byGroup.set(g, (byGroup.get(g) ?? 0) + 1);
  }
  const groupText = [...byGroup.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([g, c]) => `${g} ${c} คน`)
    .join(", ");
  const fuelLiters = vehicles.reduce((sum, v) => sum + num(v.fuelLiters), 0);
  const fuelAmount = vehicles.reduce((sum, v) => sum + num(v.fuelAmount), 0);
  const forceLines: Line[] = [
    { text: `บุคลากร ${personnel.length} คน${groupText ? ` (${groupText})` : ""}`, indent: 1 },
    {
      text: `ยานพาหนะ ${vehicles.length} คัน${fuelLiters > 0 ? ` · ใช้น้ำมันรวม ${fuelLiters.toLocaleString("th-TH")} ลิตร (${formatBaht(fuelAmount)} บาท)` : ""}`,
      indent: 1,
    },
  ];
  if (form.includeVehicles) {
    for (const v of vehicles) {
      forceLines.push({
        text: `${v.licensePlate}${v.callSign ? ` (${v.callSign})` : ""} — ${v.roleName}${v.brandModel ? ` · ${v.brandModel}` : ""}`,
        indent: 2,
      });
    }
  }
  sections.push({ title: `${n++}. กำลังพลและยานพาหนะ`, lines: forceLines });

  if (form.includeExpenses) {
    const spent = num(s.totalExpenses);
    const expenseRows = Object.entries(s.expensesByType)
      .map(([k, v]) => [k, num(v)] as const)
      .filter(([, v]) => v > 0);
    const truckHire = expenseRows.filter(([k]) => k.includes(TRUCK_HIRE_KEYWORD)).reduce((sum, [, v]) => sum + v, 0);
    const operatingSpent = spent - truckHire;
    const budget = extras.approvedBudget ?? (s.budgetAmount != null && s.budgetAmount !== "" ? num(s.budgetAmount) : null);
    const hasBudget = budget != null && budget > 0;
    const lines: Line[] = [];
    const truckNote = truckHire > 0 ? " (ไม่รวมค่าจ้างรถบรรทุก)" : "";
    if (hasBudget) {
      const diff = budget - operatingSpent;
      lines.push({ text: `งบที่ขออนุมัติ ${formatBaht(budget)} บาท${truckNote}`, indent: 1 });
      lines.push({
        text: `จ่ายจริง ${formatBaht(operatingSpent)} บาท · ${
          diff >= 0 ? `คงเหลือ ${formatBaht(diff)} บาท` : `เกินงบ ${formatBaht(-diff)} บาท`
        }`,
        indent: 1,
        bold: diff < 0,
      });
    } else {
      lines.push({ text: `จ่ายจริง ${formatBaht(operatingSpent)} บาท${truckNote}`, indent: 1 });
    }

    const groupTotals = new Map<string, number>();
    for (const [k, v] of expenseRows) {
      if (k.includes(TRUCK_HIRE_KEYWORD)) continue;
      const g = expenseGroup(k);
      groupTotals.set(g, (groupTotals.get(g) ?? 0) + v);
    }
    for (const g of EXPENSE_GROUP_ORDER) {
      const v = groupTotals.get(g) ?? 0;
      if (v > 0) lines.push({ text: `${g} ${formatBaht(v)} บาท`, indent: 2 });
    }

    const pct =
      s.expenseToCargoPercent != null
        ? ` (${s.expenseToCargoPercent.toLocaleString("th-TH", { maximumFractionDigits: 3 })}% ของมูลค่าทรัพย์สิน)`
        : "";
    if (truckHire > 0) lines.push({ text: `ค่าจ้างรถบรรทุก ${formatBaht(truckHire)} บาท`, indent: 1 });
    lines.push({ text: `รวมค่าใช้จ่ายทั้งสิ้น ${formatBaht(spent)} บาท${pct}`, indent: 1 });
    sections.push({ title: `${n++}. ค่าใช้จ่าย`, lines });
  }

  const incidentLines: Line[] = [];
  extras.incidents.forEach((inc, i) => {
    const { head, details } = incidentReportLines(inc);
    incidentLines.push({ text: `${i + 1}) ${head}`, indent: 1, bold: inc.severity === "HIGH" || inc.cargoAffected });
    for (const d of details) incidentLines.push({ text: d, indent: 2 });
  });
  const note = form.incidents.trim();
  if (note) {
    if (incidentLines.length) incidentLines.push({ text: "หมายเหตุเพิ่มเติม:", indent: 1 });
    for (const t of note.split(/\r?\n/)) incidentLines.push({ text: t, indent: extras.incidents.length ? 2 : 1 });
  }
  if (!incidentLines.length) incidentLines.push({ text: "ไม่มีเหตุการณ์ผิดปกติ", indent: 1 });
  sections.push({ title: `${n++}. เหตุการณ์ระหว่างปฏิบัติ`, lines: incidentLines });

  const ev = extras.evaluation;
  if (form.includeEvaluation && ev && ev.responseCount > 0) {
    const fmt = (v: number | null) => (v == null ? "—" : v.toFixed(2));
    const lines: Line[] = [
      {
        text: `ผู้ตอบแบบประเมิน ${ev.responseCount} จาก ${ev.crewCount} คน (${ev.responseRate}%) · ความพึงพอใจโดยรวม ${fmt(ev.overall.average)} / 5`,
        indent: 1,
      },
      { text: ev.categories.map((c) => `${c.label} ${fmt(c.average)}`).join(" · "), indent: 1 },
    ];
    const topTags = ev.categories
      .flatMap((c) => c.tags.map((t) => ({ ...t, label: c.label.replace(/^ด้าน/, "") })))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    if (topTags.length) {
      lines.push({ text: "ประเด็นที่ควรปรับปรุง:", indent: 1 });
      for (const t of topTags) lines.push({ text: `${t.tag} (${t.label}) — ${t.count} คน`, indent: 2 });
    }
    sections.push({ title: `${n++}. ผลประเมินจากผู้ร่วมภารกิจ`, lines });
  }

  if (form.suggestions.trim()) {
    sections.push({
      title: `${n++}. ปัญหาอุปสรรคและข้อเสนอแนะ`,
      lines: form.suggestions.trim().split(/\r?\n/).map((t) => ({ text: t, indent: 1 })),
    });
  }

  return sections;
}

function intro(s: MissionSummary): string {
  const route = s.route ? [s.route.startLocation, s.route.endLocation].filter(Boolean).join(" – ") || s.route.name : "";
  return `ตามที่ได้รับมอบหมายให้ปฏิบัติภารกิจ ${missionName(s)}${route ? ` เส้นทาง ${route}` : ""} ระหว่างวันที่ ${dateRange(
    s.plannedStart,
    s.plannedEnd,
  )} บัดนี้การปฏิบัติภารกิจได้เสร็จสิ้นแล้ว จึงขอรายงานผลการปฏิบัติ ดังนี้`;
}

function signature(form: ReportForm): string[] {
  return [form.reporterName.trim(), form.reporterPosition.trim(), `วันที่ ${thaiDate(new Date().toISOString(), true)}`].filter(Boolean);
}

export function buildReportText(s: MissionSummary, form: ReportForm, extras: ReportExtras): string {
  const out: string[] = [`เรียน ${form.recipient.trim() || "ผู้บริหาร"}`, "", intro(s), ""];
  for (const sec of buildSections(s, form, extras)) {
    out.push(sec.title);
    for (const l of sec.lines) {
      const pad = "    ".repeat(l.indent ?? 0);
      out.push(`${pad}${l.indent ? (l.indent === 1 ? "• " : "- ") : ""}${l.text}`);
    }
    out.push("");
  }
  out.push("จึงเรียนมาเพื่อโปรดทราบ", "", ...signature(form));
  return out.join("\n");
}

function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** HTML แบบ inline style — วางในอีเมล (Outlook/Gmail) แล้วคงรูปแบบ */
export function buildReportHtml(s: MissionSummary, form: ReportForm, extras: ReportExtras): string {
  const font = "font-family:Tahoma,'Sarabun',sans-serif;font-size:14px;line-height:1.7;color:#1f2937";
  const parts: string[] = [
    `<div style="${font}">`,
    `<p style="margin:0 0 12px">เรียน ${esc(form.recipient.trim() || "ผู้บริหาร")}</p>`,
    `<p style="margin:0 0 14px;text-indent:2em">${esc(intro(s))}</p>`,
  ];
  for (const sec of buildSections(s, form, extras)) {
    parts.push(`<p style="margin:12px 0 4px;font-weight:bold;color:#1e1b4b">${esc(sec.title)}</p>`);
    for (const l of sec.lines) {
      const indent = (l.indent ?? 0) * 22;
      const bullet = l.indent === 1 ? "• " : l.indent === 2 ? "– " : "";
      parts.push(
        `<div style="margin:0 0 2px ${indent}px${l.bold ? ";font-weight:bold;color:#b91c1c" : ""}">${esc(bullet + l.text)}</div>`,
      );
    }
  }
  parts.push(`<p style="margin:18px 0 18px">จึงเรียนมาเพื่อโปรดทราบ</p>`);
  for (const line of signature(form)) parts.push(`<div style="margin:0">${esc(line)}</div>`);
  parts.push("</div>");
  return parts.join("");
}
