import type { MissionSummary } from "../types";

export type LocationCode = { code: string; name: string; province: string };

export const INDENT = "    ";

const TH_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const TH_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export function readJson<T>(key: string): Partial<T> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<T>) : null;
  } catch {
    return null;
  }
}

export function isoToLocalDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parts(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

export function addDays(s: string, n: number): string {
  if (!s) return "";
  const { y, m, d } = parts(s);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function daysBetween(a: string, b: string): number {
  if (!a || !b) return 0;
  const pa = parts(a);
  const pb = parts(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

export function fullDate(s: string) {
  if (!s) return "…";
  const { y, m, d } = parts(s);
  return `${d} ${TH_MONTHS[m - 1]} ${y + 543}`;
}

export function shortDate(s: string) {
  const { y, m, d } = parts(s);
  return `${d} ${TH_MONTHS_SHORT[m - 1]} ${String(y + 543).slice(2)}`;
}

export function rangeLabel(a: string, b: string, sep: string) {
  if (!a || !b) return fullDate(a || b);
  const pa = parts(a);
  const pb = parts(b);
  if (pa.y === pb.y && pa.m === pb.m) return `${pa.d}${sep}${pb.d} ${TH_MONTHS[pa.m - 1]} ${pa.y + 543}`;
  if (pa.y === pb.y) return `${pa.d} ${TH_MONTHS[pa.m - 1]}${sep}${pb.d} ${TH_MONTHS[pb.m - 1]} ${pa.y + 543}`;
  return `${fullDate(a)}${sep}${fullDate(b)}`;
}

export function yearBe(s: string) {
  return s ? String(parts(s).y + 543) : "";
}

export const baht = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
export const millions = (n: number) => (n / 1_000_000).toLocaleString("th-TH", { maximumFractionDigits: 2 });
export const toNumber = (s: string) => Number(String(s).replace(/,/g, "")) || 0;

/** วันเริ่มภารกิจ = วันโหลด, วันสิ้นสุด = วันกลับ, วันออกเดินทางย้อนจากวันกลับตามจำนวนวันเดินทางของเส้นทาง */
export function defaultMissionDates(s: MissionSummary) {
  const load = isoToLocalDate(s.plannedStart);
  const ret = isoToLocalDate(s.plannedEnd);
  const days = s.route?.missionDays ?? 0;
  let depart = ret && days > 0 ? addDays(ret, -(days - 1)) : load ? addDays(load, 1) : "";
  if (load && depart < load) depart = load;
  if (ret && depart > ret) depart = ret;
  return { loadDate: load, departDate: depart, returnDate: ret };
}

export type MemoDestination = { code: string; name: string; containers: number; value: number };

export function resolvePlaces(s: MissionSummary, locations: LocationCode[]) {
  const codeOf = (text: string) => {
    const compact = text.replace(/[\s.]/g, "");
    return locations
      .filter((l) => compact.includes(l.code))
      .sort((a, b) => compact.indexOf(a.code) - compact.indexOf(b.code));
  };
  const originCode = codeOf(s.route?.startLocation ?? "")[0]?.code ?? "สพฐ";
  const dests: MemoDestination[] = (s.destinations ?? [])
    .filter((d) => d.address.trim())
    .map((d) => {
      const loc = codeOf(d.address)[0];
      return {
        code: loc ? `${loc.code}.` : d.address.trim(),
        name: loc?.name ?? d.address.trim(),
        containers: d.containerCount,
        value: Number(d.cargoValue) || 0,
      };
    });
  return { originCode, originShort: `${originCode}.`, dests };
}

export function personName(p: { rank: string | null; fullName: string }) {
  return `${p.rank ?? ""}${p.fullName}`.trim();
}

export const isDirectorRole = (role: string) => /ผอ\.?\s*เดินทาง|ผู้อำนวยการเดินทาง/.test(role);
export const isAssistantRole = (role: string) => /ผช|ผู้ช่วย/.test(role);

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** ข้อความหลายบรรทัด → HTML ที่คงย่อหน้า (ช่องว่างหน้าบรรทัด) เมื่อวางในโปรแกรมแก้ไขแบบ rich text */
export function textToHtml(text: string) {
  return text
    .split("\n")
    .map((line) => {
      const lead = line.match(/^ */)?.[0].length ?? 0;
      return `<div>${"&nbsp;".repeat(lead)}${escapeHtml(line.slice(lead)) || "&nbsp;"}</div>`;
    })
    .join("");
}

export function tableToHtml(head: string[], rows: string[][]) {
  const cell = "border:1px solid #999;padding:4px 8px;vertical-align:top;";
  const th = head.map((h) => `<th style="${cell}background:#f1f5f9;">${escapeHtml(h)}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${r.map((c) => `<td style="${cell}">${escapeHtml(c).replace(/\n/g, "<br>")}</td>`).join("")}</tr>`)
    .join("");
  return `<table style="border-collapse:collapse;"><tr>${th}</tr>${body}</table>`;
}

export function tableToText(head: string[], rows: string[][]) {
  return [head, ...rows].map((r) => r.map((c) => c.replace(/\n/g, " / ")).join("\t")).join("\n");
}

export async function copyToClipboard(text: string, html?: string): Promise<boolean> {
  try {
    if (html && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
      return true;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* ตกไปใช้วิธีสำรองด้านล่าง (เช่น เปิดผ่าน http ที่ไม่ใช่ localhost) */
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  return ok;
}
