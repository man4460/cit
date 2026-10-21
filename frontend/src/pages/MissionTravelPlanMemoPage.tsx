import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { apiJson } from "../api/client";
import { CopyButton, CopyField, EditableText, MemoBackButton, Section, SmallInput } from "../components/CentralMemoUi";
import {
  INDENT,
  textToHtml,
  addDays,
  daysBetween,
  defaultMissionDates,
  fullDate,
  isAssistantRole,
  isDirectorRole,
  millions,
  personName,
  rangeLabel,
  readJson,
  resolvePlaces,
  toNumber,
  type LocationCode,
} from "../lib/centralMemo";
import { policeRankIndex } from "../lib/allowanceDocs";
import {
  cargoRoleLabel,
  cargoSeatKey,
  cargoTruckCallSign,
  cargoTruckDriverCount,
  cargoTruckDriverNames,
  cargoTruckFilled,
  isSpareCargoTractor,
  toCargoTruckForm,
  type CargoTruckRow,
} from "../lib/missionCargoTrucks";
import { cargoSequenceNum, compareConvoyOrder } from "../lib/missionConvoyOrder";
import {
  MISSION_PERSONNEL_TABS,
  missionPersonnelTabByCategory,
  type MissionPersonnelTabKey,
} from "../lib/missionPersonnelTabs";
import type { MissionSummary } from "../types";

type Settings = {
  to: string;
  speed: string;
  secrecy: string;
  purpose: string;
  planName: string;
  requestingDept: string;
  originFull: string;
  truckCompany: string;
  truckLabel: string;
  routeUsage: string;
  fuelStops: string;
  otherPractices: string;
};

type Times = { inspect: string; receive: string; briefing: string; back: string };

type PlanState = {
  loadDate: string;
  departDate: string;
  returnDate: string;
  fdMemoNo: string;
  missionMemoNo: string;
  spareTractors: string;
  returnLeader: string;
  times: Times;
  overrides: Record<string, string>;
  /** ลายนิ้วมือคน/หน้าที่/รถ — ถ้าเปลี่ยนจะทิ้ง sec3html ที่แก้ค้างไว้ */
  dataSig?: string;
};

const SETTINGS_KEY = "cit.travelPlanMemo.v1";
const stateKey = (id: string) => `cit.travelPlanMemo.m.${id}`;

const CONVOY_HEAD = ["คันที่", "รูปขบวน", "นามเรียกขาน", "สังกัด", "จำนวน (นาย)", "ยศ ชื่อ สกุล"];
const STAFF_HEAD = ["ลำดับ", "ยศ/ชื่อ - ชื่อสกุล", "หน้าที่ ความรับผิดชอบในการปฏิบัติงาน และนามเรียกขาน"];
const EXT_HEAD = ["ลำดับ", "ชื่อหน่วยงาน", "จำนวน (นาย)"];

const DEFAULT_SETTINGS: Settings = {
  to: "คุณนรศิ พุกกะมาน",
  speed: "ปกติ",
  secrecy: "ลับมาก",
  purpose: "อนุมัติ",
  planName: "การปฏิบัติภารกิจรักษาความปลอดภัยขนส่งธนบัตร (แผนเดินทาง)",
  requestingDept: "ฝ่ายจัดการธนบัตรและบริการระบบการชำระเงิน (ฝธช.)",
  originFull: "ส่วนห้องมั่นคง ฝธช.",
  truckCompany: "พนักงานขับรถบริษัท บลู แอนด์ ไวท์ โลจิสติกส์ จำกัด",
  truckLabel: "B & W",
  routeUsage:
    "ให้ใช้เส้นทางหลัก ทั้งไป และ กลับ หากกรณีฉุกเฉิน หรือมีเหตุจำเป็นเร่งด่วน ให้อยู่ในดุลยพินิจของผู้อำนวยการเดินทาง หรือผู้ที่ได้รับมอบหมายในการกำหนดการใช้เส้นทางเดินทางไป และกลับ",
  fuelStops:
    "ให้ปฏิบัติตามแผนการจอดพักระหว่างปฏิบัติภารกิจ หรือตามที่ผู้อำนวยการเดินทาง/ผู้ได้รับมอบหมาย เห็นสมควรเพื่อความปลอดภัยและเหมาะสมในแต่ละพื้นที่จอดพัก",
  otherPractices: [
    "ให้เจ้าหน้าที่ตำรวจทางหลวง ช่วยประสานการใช้เส้นทาง และควบคุมดูแลความปลอดภัยรถยนต์ในขบวน รวมทั้งพิจารณาปิดกั้นทางร่วมทางแยกที่มีความเสี่ยง และ/หรือ ไม่มีเจ้าหน้าที่ตำรวจท้องที่ประจำ ณ จุดนั้น ๆ ตลอดจนช่วยตรวจสอบเครื่องมืออุปกรณ์ต่าง ๆ เช่น ระบบโทรทัศน์วงจรปิด ระบบวิทยุสื่อสาร",
    "ให้เจ้าหน้าที่ตำรวจกองบังคับการปราบปราม ติดต่อสื่อสารประสานงานเจ้าหน้าที่ตรวจภูธรพื้นที่ในเส้นทาง หรือตามที่ผู้อำนวยการเดินทางมอบหมาย / ผู้ช่วยผู้อำนวยการเดินทางมอบหมาย",
    "ให้เจ้าหน้าที่ งขส. ช่วยกันดูแลห้ามไม่ให้นำสิ่งของผิดกฎหมายหรือไม่เหมาะสม อาทิ สุรา บุหรี่ ฯลฯ มากับรถยนต์ของธนาคาร ในขบวนภารกิจฯ ตามคำสั่งฝ่ายรักษาความปลอดภัย ที่ 40/2564 เรื่อง พิธีปฏิบัติการรักษาความปลอดภัยขนส่งธนบัตรและทรัพย์สินมีค่า ลงวันที่ 17 ธันวาคม 2564",
    "ให้หัวหน้าส่วนล่วงหน้า หรือผู้ที่ได้รับมอบหมาย ทำหน้าที่อำนวยการควบคุม และสั่งการในขบวนภารกิจฯ ในการเดินทางกลับแทนผู้อำนวยการ/ผู้ช่วยผู้อำนวยการเดินทาง ในกรณีที่ผู้อำนวยการ/ผู้ช่วยผู้อำนวยการเดินทาง ไม่ได้ร่วมเดินทางกลับพร้อมกับขบวนฯ โดยให้ปฏิบัติตามคำสั่งฝ่ายรักษาความปลอดภัย ที่ 40/2564 เรื่อง พิธีปฏิบัติการรักษาความปลอดภัยขนส่งธนบัตรและทรัพย์สินมีค่า ลงวันที่ 17 ธันวาคม 2564",
    "กรณีมีเหตุความจำเป็น หรือมีเหตุฉุกเฉินให้เจ้าหน้าที่ฝ่ายรักษาความปลอดภัยที่ปฏิบัติภารกิจขนส่งฯ สามารถขับรถยนต์ธนาคารได้ทุกคัน",
    "ให้นำเสื้อเกราะป้องกันกระสุน และเครื่องอุปกรณ์ที่จำเป็น เช่น ไฟฉาย กรวยยาง เสื้อกันฝน และอื่น ๆ ไปใช้ในการปฏิบัติภารกิจขนส่งฯ",
    "ในการจอดพักระหว่างทาง ณ สถานที่ต่าง ๆ อาทิ สถานีบริการเชื้อเพลิง หรือตามเส้นทาง ให้จอดตามแผนที่กำหนด จะต้องไม่ปิดกั้น/กีดขวางยานพาหนะของประชาชนที่จอดอยู่ก่อนหน้านี้ กรณีสถานที่นั้น ๆ มีพื้นที่จำกัด ไม่สามารถดำเนินตามแผนการที่กำหนดได้ ให้พิจารณาจอดตามสภาพแวดล้อมในขณะนั้นโดยให้คำนึงถึงความปลอดภัยและการปฏิบัติทางด้านยุทธวิธี",
    "ในการปฏิบัติภารกิจฯ ให้ผู้อำนวยการเดินทางใช้ดุลยพินิจเลือกใช้เส้นทางรอง ในกรณีมีเหตุฉุกเฉินเฉพาะหน้าหรือมีความเสี่ยงซึ่งอาจจะส่งผลกระทบต่อการปฏิบัติภารกิจฯ ได้ในทันที โดยมิต้องขออนุมัติ ผอ.ฝรภ. เพิ่มเติม และรายงานให้ ผอ.ฝรภ.ทราบในโอกาสแรกที่สามารถกระทำได้",
    "ในการปฏิบัติภารกิจฯ กรณีที่พบ และหรือ ได้รับแจ้งว่ามีบุคลากรที่ร่วมปฏิบัติภารกิจฯ ขาดความพร้อมในการปฏิบัติงานในตำแหน่ง/หน้าที่ที่ได้รับมอบหมาย ให้ผู้อำนวยการเดินทางผู้ช่วยผู้อำนวยการเดินทาง สามารถสลับ/สับเปลี่ยน ตำแหน่ง/หน้าที่ได้ในทันที รวมถึงยกเลิกการมาร่วมปฏิบัติภารกิจ",
    "ในการปฏิบัติภารกิจฯ กรณีพักค้างคืน หากมีเหตุจำเป็น/ฉุกเฉิน ที่ทำให้ไม่สามารถพักค้างคืนในจังหวัด ที่ตั้งสำนักงานภาค หรือศูนย์จัดการธนบัตร ปลายทางได้ เช่น โรงแรมที่พักในพื้นที่จังหวัดไม่เพียงพอ ผู้ร่วมปฏิบัติภารกิจของธนาคารมีภารกิจสำคัญต้องกระทำในวันถัดไป หรือเหตุอื่นใด ให้อยู่ในดุลยพินิจของผู้อำนวยการเดินทางหรือผู้ช่วยผู้อำนวยการเดินทาง พิจารณาให้ผู้ร่วมปฏิบัติภารกิจฯ สามารถพักค้างคืนในพื้นที่จังหวัดใกล้เคียงได้",
  ]
    .map((s, i) => `${INDENT}${i + 1}. ${s}`)
    .join("\n"),
};

const DEFAULT_TIMES: Times = { inspect: "08.00", receive: "14.30", briefing: "02.30", back: "07.30" };

function policeShortLabel(station: string) {
  if (/ทางหลวง/.test(station)) return "ตำรวจทางหลวง";
  if (/ปราบปราม/.test(station)) return "ตำรวจกองปราบ";
  if (/ก่อการร้าย|อรินทราช/.test(station)) return "อรินทราช";
  return station;
}

const I2 = INDENT.repeat(2);
const I3 = INDENT.repeat(3);
function indentLines(text: string, prefix: string) {
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => `${prefix}${l.trimStart()}`)
    .join("\n");
}

/** แปลง HTML เป็นข้อความล้วน (สำหรับวางในช่องที่ไม่รับตาราง) — innerText ต้องอยู่ใน DOM จึงจะคงการขึ้นบรรทัด */
function htmlToText(html: string) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:-9999px;top:0;white-space:pre-wrap;";
  el.innerHTML = html;
  document.body.appendChild(el);
  const t = el.innerText;
  el.remove();
  return t;
}

/** กล่องแก้ไขแบบเอกสาร — ไม่เขียนทับเนื้อหาระหว่างพิมพ์ เพื่อไม่ให้เคอร์เซอร์กระโดด */
function EditableHtml({ html, onChange }: { html: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== html && document.activeElement !== el) el.innerHTML = html;
  }, [html]);
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onInput={(e) => onChange(e.currentTarget.innerHTML)}
      className="max-h-[75vh] overflow-auto rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-800 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
    />
  );
}

function TextSetting({ label, value, onChange, rows }: { label: string; value: string; onChange: (v: string) => void; rows: number }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
      />
    </label>
  );
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const CELL = "border:1px solid #64748b;padding:3px 8px;vertical-align:top;";
const TH = `${CELL}background:#f1f5f9;font-weight:600;text-align:center;`;

function htmlTable(head: string[], body: string) {
  return `<table style="border-collapse:collapse;margin:4px 0 8px 4em;"><tr>${head
    .map((h) => `<th style="${TH}">${esc(h)}</th>`)
    .join("")}</tr>${body}</table>`;
}

function groupNamesByUnit(names: string, rowUnit: string, unitOf: Map<string, string>) {
  const groups = new Map<string, string[]>();
  for (const n of names.split(/\n|,/).map((x) => x.trim()).filter(Boolean)) {
    const u = unitOf.get(n) ?? rowUnit;
    groups.set(u, [...(groups.get(u) ?? []), n]);
  }
  if (!groups.size) groups.set(rowUnit, []);
  return [...groups.entries()];
}

/** ตารางรูปขบวนแบบในบันทึกจริง — รถที่มีหลายสังกัดรวมช่องคันที่/รูปขบวน/นามเรียกขาน (rowspan) */
function convoyHtml(rows: string[][], totalLabel: string, unitOf: Map<string, string>) {
  const center = `${CELL}text-align:center;`;
  const body = rows
    .map(([no, formation, callSign, unit, count, names]) => {
      const groups = groupNamesByUnit(names ?? "", unit?.trim() ?? "", unitOf);
      const span = groups.length > 1 ? ` rowspan="${groups.length}"` : "";
      return groups
        .map(([u, ns], i) => {
          const lead = i
            ? ""
            : `<td style="${center}"${span}>${esc(no)}</td><td style="${CELL}"${span}>${esc(formation ?? "")}</td><td style="${center}"${span}>${esc(callSign ?? "")}</td>`;
          const n = ns.length ? String(ns.length) : groups.length === 1 ? count ?? "" : "";
          return `<tr>${lead}<td style="${CELL}">${esc(u)}</td><td style="${center}">${esc(n)}</td><td style="${CELL}">${ns.map(esc).join("<br>")}</td></tr>`;
        })
        .join("");
    })
    .join("");
  const total = `<tr><td colspan="4" style="${CELL}text-align:right;font-weight:600;">${esc(totalLabel)}</td><td style="${center}font-weight:600;">${sumCol(rows, 4)}</td><td style="${CELL}"></td></tr>`;
  return htmlTable(CONVOY_HEAD, body + total);
}

function rowsHtml(rows: string[][], centerCols: number[]) {
  return rows
    .map(
      (r) =>
        `<tr>${r.map((c, i) => `<td style="${CELL}${centerCols.includes(i) ? "text-align:center;" : ""}">${esc(c)}</td>`).join("")}</tr>`,
    )
    .join("");
}

function renumber(rows: string[][]) {
  return rows.map((r, i) => [String(i + 1), ...r.slice(1)]);
}

function sortConvoyRows(rows: string[][], leg: "go" | "return" = "go") {
  return [...rows].sort((a, b) =>
    compareConvoyOrder(
      { roleName: a[1] ?? "", callSign: a[2] ?? "" },
      { roleName: b[1] ?? "", callSign: b[2] ?? "" },
      leg,
    ),
  );
}

function sumCol(rows: string[][], col: number) {
  return rows.reduce((s, r) => s + (toNumber(r[col] ?? "") || 0), 0);
}

type MemoPerson = NonNullable<MissionSummary["personnel"]>[number];
type MemoVehicle = NonNullable<MissionSummary["vehicles"]>[number];

type ConvoySeat = {
  key: string;
  formation: string;
  callSign: string;
  vehicleRole: string;
  defaultUnit: string;
  isCargo: boolean;
  people: MemoPerson[];
  extraNames?: string[];
};

/** แท็บบุคลากรในหน้าแก้ไขภารกิจ — ธปท. / กองปราบ / ทางหลวง / ปฏิบัติการพิเศษ */
function personTab(p: MemoPerson): MissionPersonnelTabKey | null {
  const byCat = missionPersonnelTabByCategory(p.personnelCategoryName);
  if (byCat) return byCat;
  // สำรองจากบทบาท ถ้าประเภทบุคลากรว่าง
  const role = p.roleName ?? "";
  if (/คนขับ|พนักงานขับรถสินค้า|ขับรถสินค้า/.test(role)) return "driver";
  if (/กองปราบ/.test(role)) return "crime";
  if (/ทางหลวง/.test(role)) return "highway";
  if (/อรินทราช|หนุมาน|ปฏิบัติการพิเศษ/.test(role)) return "special";
  if (/ฝรภ|ผอ\.?\s*เดินทาง|ผช\.?\s*ผอ|เจ้าหน้าที่ขับรถ|สื่อสาร|ส่วนล่วงหน้า/.test(role)) return "bot";
  if (p.policeStationId) return "highway";
  return "bot";
}

function tabLabel(key: MissionPersonnelTabKey) {
  return MISSION_PERSONNEL_TABS.find((t) => t.key === key)?.label ?? key;
}

/** เรียงยศสูง→ต่ำ (กองปราบ / ทางหลวง / ปฏิบัติการพิเศษ) */
function byPoliceRank(a: MemoPerson, b: MemoPerson) {
  return (
    policeRankIndex(a.rank ?? "") - policeRankIndex(b.rank ?? "") ||
    personName(a).localeCompare(personName(b), "th")
  );
}

function sortPeopleForTab(people: MemoPerson[], key: MissionPersonnelTabKey) {
  const list = people.slice();
  if (key === "crime" || key === "highway" || key === "special") return list.sort(byPoliceRank);
  return list.sort((a, b) => personName(a).localeCompare(personName(b), "th"));
}

/** ลายนิ้วมือจากคน/หน้าที่/ประจำรถ/ยานพาหนะ ที่บันทึกในภารกิจ */
function effectiveVehicleId(
  p: Pick<MemoPerson, "assignedVehicleId" | "assignedVehicleReturnId" | "returnVehicleSameAsGo">,
  leg: "go" | "return",
): string | null {
  if (leg === "go") return p.assignedVehicleId ?? null;
  if (p.returnVehicleSameAsGo !== false) return p.assignedVehicleId ?? null;
  return p.assignedVehicleReturnId ?? null;
}

function hasGoSeat(
  p: Pick<MemoPerson, "assignedVehicleId" | "assignedCargoTruckId" | "assignedVehicleReturnId" | "returnVehicleSameAsGo">,
) {
  return Boolean(p.assignedCargoTruckId) || Boolean(effectiveVehicleId(p, "go"));
}

function hasReturnSeat(
  p: Pick<MemoPerson, "assignedVehicleId" | "assignedVehicleReturnId" | "returnVehicleSameAsGo">,
) {
  return Boolean(effectiveVehicleId(p, "return"));
}

function missionCrewSig(s: MissionSummary) {
  const people = (s.personnel ?? [])
    .map((p) => {
      const same = p.returnVehicleSameAsGo !== false ? "1" : "0";
      return `${p.personnelId}|${p.personnelCategoryName ?? ""}|${p.roleName}|${p.assignedVehicleId ?? ""}|${p.assignedCargoTruckId ?? ""}|${same}|${p.assignedVehicleReturnId ?? ""}`;
    })
    .sort()
    .join(";");
  const vehicles = (s.vehicles ?? [])
    .map((v) => `${v.vehicleId}|${v.roleName}|${v.callSign ?? ""}|${v.licensePlate}`)
    .sort()
    .join(";");
  const trucks = (s.cargoTrucks ?? [])
    .map(
      (t) =>
        `${t.id ?? ""}|${t.tractorVehicleId ?? ""}|${t.tractorPlate ?? ""}|${t.trailerPlate ?? ""}|${t.role ?? ""}|${t.driver1PersonnelId ?? ""}|${t.driver1Name ?? ""}|${t.driver2PersonnelId ?? ""}|${t.driver2Name ?? ""}|${t.note ?? ""}`,
    )
    .join(";");
  return `v11:${people}#${vehicles}#${trucks}`;
}

/** ขยายชื่อหน้าที่สั้นให้ตรงรูปแบบบันทึก — นอกนั้นใช้ชื่อหน้าที่ที่บันทึกในภารกิจ */
function dutyFromRole(roleName: string) {
  const role = roleName.trim();
  if (!role) return "—";
  if (/^ผอ\.?\s*เดินทาง$|^ผู้อำนวยการเดินทาง$/.test(role))
    return "ผู้อำนวยการเดินทาง กรรมการรับมอบ-ส่งมอบธนบัตร และสื่อสาร";
  if (/^ผช\.?\s*ผอ\.?\s*เดินทาง$|^ผู้ช่วยผู้อำนวยการเดินทาง$/.test(role))
    return "ผู้ช่วยผู้อำนวยการเดินทาง กรรมการรับมอบ-ส่งมอบธนบัตร และสื่อสาร";
  return role;
}

function isCargoVehicleRole(role: string) {
  return /สินค้า|หัวลาก/.test(role);
}

function unitForCrew(crew: MemoPerson[], fallback: string) {
  if (!crew.length) return fallback;
  const tabs = crew.map(personTab);
  if (tabs.some((t) => t === "bot")) return "ฝรภ.";
  if (tabs.some((t) => t === "driver")) return fallback;
  const first = tabs.find(Boolean);
  if (first && first !== "bot" && first !== "driver") return tabLabel(first);
  return policeShortLabel(crew[0]?.policeStationName?.trim() || crew[0]?.personnelCategoryName?.trim() || fallback);
}

/**
 * จัดคนเข้าขบวนตามที่บันทึกในหน้าแก้ไขภารกิจเท่านั้น
 * - ประจำรถขาไป/ขากลับที่เลือก → คันนั้น
 * - ปฏิบัติการพิเศษที่นั่งหัวลากสินค้าขาไป → แถวสินค้า/หัวลากสำรองคันนั้น
 * - ขากลับ: ไม่สร้างแถวสินค้า/หัวลากสำรอง (คนขับไม่กลับขบวน)
 */
function buildConvoySeats(opts: {
  people: MemoPerson[];
  vehicles: MemoVehicle[];
  cargoTrucks: CargoTruckRow[];
  totalContainers: number;
  spare: number;
  truckLabel: string;
  leg: "go" | "return";
}): { seats: ConvoySeat[]; seatOf: Map<string, ConvoySeat>; unseated: MemoPerson[] } {
  const { people, vehicles, cargoTrucks, totalContainers, spare, truckLabel, leg } = opts;
  const goodsVehicles = vehicles.filter((v) => /สินค้า/.test(v.roleName) && !/หัวลาก/.test(v.roleName));
  const spareVehicles = vehicles.filter((v) => /หัวลาก/.test(v.roleName));
  const tractorIds = new Set(
    cargoTrucks.map((t) => t.tractorVehicleId.trim()).filter(Boolean),
  );
  const escortVehicles = vehicles.filter(
    (v) => !isCargoVehicleRole(v.roleName) && !tractorIds.has(v.vehicleId),
  );
  const includeCargo = leg === "go";
  const filledTrucks = cargoTrucks.filter(cargoTruckFilled);

  const seats: ConvoySeat[] = escortVehicles.map((v) => ({
    key: v.vehicleId,
    formation: v.roleName.replace(/^รถ/, ""),
    callSign: v.callSign?.trim() || v.licensePlate || "",
    vehicleRole: v.roleName,
    defaultUnit: "ฝรภ.",
    isCargo: false,
    people: [],
  }));

  if (includeCargo && filledTrucks.length) {
    const goods = filledTrucks.filter((t) => !isSpareCargoTractor(t));
    const spares = filledTrucks.filter(isSpareCargoTractor);
    goods.forEach((t, i) => {
      seats.push({
        key: cargoSeatKey(t) || `hired-cargo-${i}`,
        formation: cargoRoleLabel(t, i, 0, 0),
        callSign: cargoTruckCallSign(t),
        vehicleRole: t.role.trim() || "รถสินค้า",
        defaultUnit: truckLabel,
        isCargo: true,
        people: [],
        extraNames: cargoTruckDriverNames(t).map((n) => `พขร. ${n}`),
      });
    });
    spares.forEach((t, i) => {
      seats.push({
        key: cargoSeatKey(t) || `hired-spare-${i}`,
        formation: cargoRoleLabel(t, 0, i, spares.length),
        callSign: cargoTruckCallSign(t),
        vehicleRole: t.role.trim() || "รถหัวลากสำรอง",
        defaultUnit: truckLabel,
        isCargo: true,
        people: [],
        extraNames: cargoTruckDriverNames(t).map((n) => `พขร. ${n}`),
      });
    });
  } else if (includeCargo) {
    // รถสินค้าจากภารกิจ — เรียงตามเลขในนามเรียกขาน แล้วตั้งรูปขบวนเป็น สินค้า 1..n
    if (goodsVehicles.length) {
      const ordered = [...goodsVehicles].sort((a, b) => {
        const na = cargoSequenceNum(a.callSign ?? "", a.roleName) ?? Number.POSITIVE_INFINITY;
        const nb = cargoSequenceNum(b.callSign ?? "", b.roleName) ?? Number.POSITIVE_INFINITY;
        if (na !== nb) return na - nb;
        return (a.callSign || a.licensePlate || "").localeCompare(b.callSign || b.licensePlate || "", "th");
      });
      ordered.forEach((v, i) => {
        seats.push({
          key: v.vehicleId,
          formation: `สินค้า ${i + 1}`,
          callSign: v.callSign?.trim() || v.licensePlate || "",
          vehicleRole: v.roleName,
          defaultUnit: truckLabel,
          isCargo: true,
          people: [],
        });
      });
    } else {
      for (let i = 1; i <= totalContainers; i++) {
        seats.push({
          key: `cargo-${i}`,
          formation: `สินค้า ${i}`,
          callSign: "",
          vehicleRole: "รถสินค้า",
          defaultUnit: truckLabel,
          isCargo: true,
          people: [],
        });
      }
    }

    if (spareVehicles.length) {
      const orderedSpare = [...spareVehicles].sort((a, b) =>
        (a.callSign || a.licensePlate || "").localeCompare(b.callSign || b.licensePlate || "", "th"),
      );
      orderedSpare.forEach((v, i) => {
        seats.push({
          key: v.vehicleId,
          formation: orderedSpare.length > 1 ? `หัวลากสำรอง ${i + 1}` : "หัวลากสำรอง",
          callSign: v.callSign?.trim() || v.licensePlate || "",
          vehicleRole: v.roleName,
          defaultUnit: truckLabel,
          isCargo: true,
          people: [],
        });
      });
    } else if (!goodsVehicles.length || spare > 0) {
      for (let i = 1; i <= spare; i++) {
        seats.push({
          key: `spare-${i}`,
          formation: spare > 1 ? `หัวลากสำรอง ${i}` : "หัวลากสำรอง",
          callSign: "",
          vehicleRole: "รถหัวลากสำรอง",
          defaultUnit: truckLabel,
          isCargo: true,
          people: [],
        });
      }
    }
  }

  const byKey = new Map(seats.map((s) => [s.key, s]));
  const seated = new Set<string>();

  // 1) ประจำรถขาไป/ขากลับตามที่บันทึกในหน้าแก้ไขภารกิจ
  for (const p of people) {
    if (leg === "go" && p.assignedCargoTruckId) {
      const byCargoId = filledTrucks.find((t) => t.id === p.assignedCargoTruckId);
      const cargoSeat = byKey.get(byCargoId ? cargoSeatKey(byCargoId) : p.assignedCargoTruckId);
      if (cargoSeat && !p.assignedVehicleId) {
        cargoSeat.people.push(p);
        seated.add(p.personnelId);
        continue;
      }
    }
    const vid = effectiveVehicleId(p, leg);
    if (!vid) continue;
    const seat = byKey.get(vid);
    if (!seat) continue;
    seat.people.push(p);
    seated.add(p.personnelId);
  }

  // 2) ภารกิจเก่าที่ยังบันทึกคนขับเป็นบุคลากร (ไม่มีตารางหัว/หาง) → ใส่แถวสินค้า/หัวลาก คันละ 2
  if (includeCargo && !filledTrucks.length) {
    const cargoSeats = seats.filter((s) => s.isCargo);
    const drivers = people.filter((p) => !seated.has(p.personnelId) && personTab(p) === "driver");
    let di = 0;
    for (const seat of cargoSeats) {
      while (seat.people.length < 2 && di < drivers.length) {
        const p = drivers[di++]!;
        seat.people.push(p);
        seated.add(p.personnelId);
      }
    }
    while (di < drivers.length) {
      const chunk: MemoPerson[] = [];
      while (chunk.length < 2 && di < drivers.length) chunk.push(drivers[di++]!);
      const n = cargoSeats.length + seats.filter((s) => s.key.startsWith("cargo-extra-")).length + 1;
      seats.push({
        key: `cargo-extra-${n}`,
        formation: `สินค้า (เพิ่ม ${n})`,
        callSign: "",
        vehicleRole: "รถสินค้า",
        defaultUnit: truckLabel,
        isCargo: true,
        people: chunk,
      });
      for (const p of chunk) seated.add(p.personnelId);
    }
  }

  const seatOf = new Map<string, ConvoySeat>();
  for (const s of seats) for (const p of s.people) seatOf.set(p.personnelId, s);
  // ขากลับ: ไม่นับคนขับสินค้าเป็นค้างจัดที่นั่ง
  const unseated = people.filter((p) => {
    if (seated.has(p.personnelId)) return false;
    if (personTab(p) === "driver" && (leg === "return" || filledTrucks.length)) return false;
    return true;
  });
  return { seats, seatOf, unseated };
}

function seatsToConvoyRows(
  seats: ConvoySeat[],
  unseated: MemoPerson[],
  settings: Settings,
): string[][] {
  const convoyRows: string[][] = seats.map((s) => {
    const crew = s.people.slice().sort(byPoliceRank);
    const names = [...crew.map((p) => personName(p)), ...(s.extraNames ?? [])].filter(Boolean);
    if (s.isCargo && !names.length) {
      return ["", s.formation, s.callSign, settings.truckLabel, "2", ""];
    }
    const count = s.isCargo ? Math.max(2, names.length) : names.length;
    const cargoUnit =
      crew.some((p) => personTab(p) === "special")
        ? `${settings.truckLabel} / ปฏิบัติการพิเศษ`
        : settings.truckLabel;
    return [
      "",
      s.formation,
      s.callSign,
      s.isCargo ? cargoUnit : unitForCrew(crew, s.defaultUnit),
      count ? String(count) : "",
      names.join("\n"),
    ];
  });

  const leftoverByTab = new Map<MissionPersonnelTabKey, MemoPerson[]>();
  for (const p of unseated) {
    const t = personTab(p) ?? "bot";
    leftoverByTab.set(t, [...(leftoverByTab.get(t) ?? []), p]);
  }
  for (const key of ["bot", "crime", "highway", "special", "driver"] as MissionPersonnelTabKey[]) {
    const group = leftoverByTab.get(key);
    if (!group?.length) continue;
    const ordered = sortPeopleForTab(group, key);
    const unit = key === "bot" ? "ฝรภ." : key === "driver" ? settings.truckLabel : tabLabel(key);
    const formation =
      key === "bot" ? "ฝรภ. (ยังไม่ระบุคัน)" : key === "driver" ? "ขับรถสินค้า (ยังไม่ระบุคัน)" : tabLabel(key);
    convoyRows.push(["", formation, "", unit, String(ordered.length), ordered.map((p) => personName(p)).join("\n")]);
  }
  return convoyRows;
}

export function MissionTravelPlanMemoPage() {
  const { id = "" } = useParams();
  const [summary, setSummary] = useState<MissionSummary | null>(null);
  const [locations, setLocations] = useState<LocationCode[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    ...(readJson<Settings>(SETTINGS_KEY) ?? {}),
  }));
  const [st, setSt] = useState<PlanState | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiJson<MissionSummary>(`/api/missions/${id}/summary`),
      apiJson<LocationCode[]>("/api/route-master/locations").catch(() => [] as LocationCode[]),
    ])
      .then(([s, locs]) => {
        if (!alive) return;
        setSummary(s);
        setLocations(locs);
        const spare = (s.title ?? "").match(/หัวลากสำรอง\s*(\d+)/)?.[1] ?? "0";
        const director = (s.personnel ?? []).find((p) => isDirectorRole(p.roleName) && !isAssistantRole(p.roleName));
        const dataSig = missionCrewSig(s);
        const saved = readJson<PlanState>(stateKey(id));
        const overrides = { ...(saved?.overrides ?? {}) };
        // ถ้าคน/หน้าที่/ประจำรถในภารกิจเปลี่ยน (หรือยังไม่มี dataSig) ให้สร้างข้อ 3 ใหม่จากข้อมูลล่าสุด
        if (overrides.sec3html && saved?.dataSig !== dataSig) delete overrides.sec3html;
        setSt({
          ...defaultMissionDates(s),
          fdMemoNo: "",
          missionMemoNo: "",
          spareTractors: spare,
          returnLeader: director ? personName(director) : "",
          times: DEFAULT_TIMES,
          ...(saved ?? {}),
          overrides,
          dataSig,
        });
      })
      .catch((e) => alive && setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"));
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (st) localStorage.setItem(stateKey(id), JSON.stringify(st));
  }, [id, st]);

  const gen = useMemo(() => {
    if (!summary || !st) return null;
    const { originCode, originShort, dests } = resolvePlaces(summary, locations);
    const totalContainers = dests.reduce((s, d) => s + d.containers, 0);
    const spare = Math.max(0, Math.floor(toNumber(st.spareTractors)));
    const { loadDate, departDate, returnDate } = st;
    const range = rangeLabel(loadDate || departDate, returnDate, "-");
    const people = summary.personnel ?? [];

    const vehicles = summary.vehicles ?? [];
    const cargoTrucks = (summary.cargoTrucks ?? []).map(toCargoTruckForm);
    const goBuilt = buildConvoySeats({
      people,
      vehicles,
      cargoTrucks,
      totalContainers,
      spare,
      truckLabel: settings.truckLabel,
      leg: "go",
    });
    const returnBuilt = buildConvoySeats({
      people,
      vehicles,
      cargoTrucks,
      totalContainers,
      spare: 0,
      truckLabel: settings.truckLabel,
      leg: "return",
    });

    /**
     * เรียงข้อ (4) ฝรภ.: ผอ.เดินทาง → ผช.ผอ.เดินทาง → ส่วนล่วงหน้า → คุ้มกันหน้า → คุ้มกันหลัง → สื่อสาร
     * (ไม่ใช้ isAssistantRole เปล่าๆ — จะไปจับ «ผู้ช่วยหัวหน้าส่วนล่วงหน้า»)
     */
    const botStaffRoleOrder = (role: string): [number, number] => {
      const r = role.trim();
      if (isDirectorRole(r) && !isAssistantRole(r)) return [0, 0];
      if (isDirectorRole(r) && isAssistantRole(r)) return [1, 0];
      if (/ส่วนล่วงหน้า/.test(r)) {
        const sub = /หัวหน้า/.test(r) && !/ผู้ช่วย/.test(r) ? 0 : /ผู้ช่วย/.test(r) ? 1 : 2;
        return [2, sub];
      }
      if (/คุ้มกันหน้า/.test(r) && !/คุ้มกันหลัง/.test(r)) return [3, 0];
      if (/คุ้มกันหลัง/.test(r)) return [4, 0];
      if (/สื่อสาร/.test(r)) return [5, /ขับรถ/.test(r) ? 1 : 0];
      return [6, 0];
    };

    /** ตารางเจ้าหน้าที่ ฝรภ. = แท็บ ธปท. ตามที่บันทึก */
    const botPeople = people
      .filter((p) => personTab(p) === "bot")
      .slice()
      .sort((a, b) => {
        const [ga, sa] = botStaffRoleOrder(a.roleName);
        const [gb, sb] = botStaffRoleOrder(b.roleName);
        return ga - gb || sa - sb || personName(a).localeCompare(personName(b), "th");
      });

    const staffRows = botPeople.map((p, i) => {
      const duty = dutyFromRole(p.roleName);
      const cs = goBuilt.seatOf.get(p.personnelId)?.callSign?.trim() || "";
      return [String(i + 1), personName(p), cs ? `${duty} (นามเรียกขาน ${cs})` : duty];
    });

    /** หน่วยงานภายนอก = แท็บ กองปราบ / ทางหลวง / ปฏิบัติการพิเศษ + คนขับจากข้อมูลรถสินค้า */
    const extTabOrder: MissionPersonnelTabKey[] = ["crime", "highway", "special"];
    const extRows: string[][] = [];
    for (const key of extTabOrder) {
      const group = people.filter((p) => personTab(p) === key);
      if (!group.length) continue;
      const label =
        key === "crime"
          ? "เจ้าหน้าที่ตำรวจกองบังคับการปราบปราม"
          : key === "highway"
            ? "เจ้าหน้าที่ตำรวจทางหลวง"
            : "เจ้าหน้าที่ตำรวจปฏิบัติการพิเศษ";
      extRows.push([String(extRows.length + 1), label, String(group.length)]);
    }
    const hiredDriverCount = cargoTruckDriverCount(cargoTrucks);
    if (hiredDriverCount > 0) {
      extRows.push([String(extRows.length + 1), settings.truckCompany, String(hiredDriverCount)]);
    } else if (!people.some((p) => personTab(p) === "driver")) {
      const companyDrivers = (totalContainers + spare) * 2;
      if (companyDrivers > 0)
        extRows.push([String(extRows.length + 1), settings.truckCompany, String(companyDrivers)]);
    } else {
      const group = people.filter((p) => personTab(p) === "driver");
      if (group.length)
        extRows.push([String(extRows.length + 1), settings.truckCompany, String(group.length)]);
    }

    const convoyGo = renumber(
      sortConvoyRows(seatsToConvoyRows(goBuilt.seats, goBuilt.unseated, settings), "go"),
    );
    const convoyBack = renumber(
      sortConvoyRows(seatsToConvoyRows(returnBuilt.seats, returnBuilt.unseated, settings), "return"),
    );
    const missingVehicleAssign = people.filter((p) => {
      const tab = personTab(p);
      if (tab === "driver") return false;
      return !hasGoSeat(p) || !hasReturnSeat(p);
    }).length;
    const driverCount = hiredDriverCount || people.filter((p) => personTab(p) === "driver").length;

    const schedule = new Map<string, string[]>();
    const push = (d: string, line: string) => d && schedule.set(d, [...(schedule.get(d) ?? []), line]);
    const t = st.times;
    push(loadDate, `เวลา ${t.inspect} น. ตรวจสภาพรถหัวลาก หางลากจูงบรรทุกตู้ และตู้ Container บริเวณหน้าอาคาร 7 ${originShort}`);
    push(
      loadDate,
      `เวลา ${t.receive} น. รับมอบตู้คอนเทนเนอร์บรรจุธนบัตร จำนวน ${totalContainers} ตู้ จาก${settings.originFull} และจอดรถบรรทุกตู้คอนเทนเนอร์พักค้างภายในชานขนถ่าย${spare ? " สำหรับหัวลากสำรองจอดด้านนอกชานขนถ่าย" : ""}`,
    );
    const legs = dests
      .map((d, i) =>
        `${i ? " ต่อเนื่องด้วย " : ""}ออกเดินทางจาก ${i ? dests[i - 1].code : originShort} นำธนบัตรบรรจุใส่ตู้ Container ส่ง ${d.code} ${d.containers} ตู้`,
      )
      .join("");
    const nights = daysBetween(departDate, returnDate);
    push(
      departDate,
      `เวลา ${t.briefing} น. ประชุมแผนการปฏิบัติภารกิจฯ เจ้าหน้าที่ผู้ร่วมปฏิบัติภารกิจทุกคน แล้ว${legs}${nights > 0 ? ` และพักค้างแรม ${nights} คืน` : ""}`,
    );
    if (departDate && returnDate)
      for (let d = addDays(departDate, 1); d && d < returnDate; d = addDays(d, 1))
        push(d, "ตรวจสภาพความพร้อมยานพาหนะ พักผ่อนเตรียมเดินทางวันรุ่งขึ้น");
    if (returnDate && returnDate !== departDate) push(returnDate, `เวลา ${t.back} น. คณะผู้ปฏิบัติภารกิจฯ ออกเดินทางกลับ ${originShort}`);

    const scheduleText = [...schedule.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([d, lines], i) => [`${I2}${i + 1}. วันที่ ${fullDate(d)}`, ...lines.map((l, j) => `${I3}${j + 1}) ${l}`)])
      .join("\n");

    const destDelivery = (withValue: boolean) =>
      dests
        .map((d, i) => `${i ? " และ" : "ส่งมอบยัง"}${d.name} (${d.code}) จำนวน ${d.containers} ตู้${withValue ? ` (${millions(d.value)} ล้านบาท)` : ""}`)
        .join("");

    return {
      subject: `ขออนุมัติแผน “${settings.planName} ${originCode}-${dests.map((d) => d.code).join("")}”`,
      background: `${INDENT}งานขนส่งธนบัตรฯ ขอนำเรียนแผน “${settings.planName}” จาก${settings.requestingDept} ${destDelivery(false)} ระหว่างวันที่ ${range}`,
      references: [
        `${INDENT}1. บันทึกอนุมัติ เลขที่ใบงาน ${st.fdMemoNo || "…………"} ฝ่ายจัดการธนบัตรและบริการระบบการชำระเงิน`,
        `${INDENT}2. บันทึกอนุมัติ เลขที่ใบงาน ${st.missionMemoNo || "…………"} ฝ่ายรักษาความปลอดภัย`,
      ].join("\n"),
      schedule: scheduleText,
      convoyGo,
      convoyBack,
      staffRows,
      extRows,
      conclusion: `${INDENT}เพื่อโปรดพิจารณาอนุมัติ แผน “${settings.planName}” จาก${settings.requestingDept} ${destDelivery(true)} ระหว่างวันที่ ${range}`,
      warnings: [
        !dests.length ? "ภารกิจยังไม่มีจุดส่งสินค้า" : null,
        !botPeople.some((p) => isDirectorRole(p.roleName) && !isAssistantRole(p.roleName))
          ? "ยังไม่ได้กำหนดบุคลากรหน้าที่ «ผอ.เดินทาง» ในแท็บ ธปท."
          : null,
        driverCount === 0 && totalContainers + spare > 0
          ? "ยังไม่มีหัวลาก/หางลากในขั้น «ข้อมูลรถสินค้า» — เลือกส่วนหัวจากยานพาหนะ แล้วกรอกหางและบทบาท"
          : null,
        missingVehicleAssign > 0
          ? `ธปท./ตำรวจที่ยังไม่ระบุประจำรถขาไปหรือขากลับ ${missingVehicleAssign} คน — เลือกจากขั้นยานพาหนะ`
          : null,
      ].filter((w): w is string => Boolean(w)),
    };
  }, [summary, st, locations, settings]);

  const back = <MemoBackButton fallback={`/missions/${id}/summary`} />;
  if (err) return <div className="space-y-4">{back}<p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</p></div>;
  if (!summary || !st || !gen) return <div className="space-y-4">{back}<p className="text-sm text-slate-500">กำลังเตรียมข้อมูล…</p></div>;

  const patch = (p: Partial<PlanState>) => setSt((cur) => (cur ? { ...cur, ...p } : cur));
  const text = (key: string, generated: string) => st.overrides[key] ?? generated;
  const setOverride = (key: string, value: string | null) =>
    setSt((cur) => {
      if (!cur) return cur;
      const overrides = { ...cur.overrides };
      if (value === null) delete overrides[key];
      else overrides[key] = value;
      return { ...cur, overrides };
    });
  const setSetting = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setSettings((s) => ({ ...s, [k]: e.target.value }));

  const convoyGo = gen.convoyGo;
  const convoyBack = gen.convoyBack;
  const staff = gen.staffRows;
  const external = gen.extRows;

  const unitOf = new Map(
    (summary.personnel ?? []).map((p) => {
      const t = personTab(p);
      const unit =
        t === "bot" || !t ? "ฝรภ." : t === "driver" ? settings.truckLabel : tabLabel(t);
      return [personName(p), unit] as const;
    }),
  );
  const schedule = gen.schedule;
  const fuel = settings.fuelStops;
  const returnTitle = `${I2}2. การเดินทางกลับ${st.returnLeader ? ` (มอบหมายให้ ${st.returnLeader} เป็นผู้ควบคุมขบวนฯ ในการเดินทางกลับ)` : ""}`;

  const sec3Generated = [
    textToHtml(
      [
        `${INDENT}(1) รายละเอียดการปฏิบัติภารกิจ`,
        schedule,
        `${INDENT}(2) การใช้เส้นทางในการเดินทาง`,
        indentLines(settings.routeUsage, I2),
        `${INDENT}(3) รูปขบวน นามเรียกขาน และผังที่นั่งรถเดินทางไป-กลับ`,
        `${I2}1. การเดินทางไป`,
      ].join("\n"),
    ),
    convoyHtml(convoyGo, "รวมทั้งหมด", unitOf),
    textToHtml(returnTitle),
    convoyHtml(convoyBack, "รวมจำนวน", unitOf),
    textToHtml(`${INDENT}(4) รายชื่อ และ/หรือจำนวนผู้ร่วมปฏิบัติภารกิจ\n${I2}1. เจ้าหน้าที่ฝ่ายรักษาความปลอดภัย`),
    htmlTable(STAFF_HEAD, rowsHtml(staff, [0])),
    textToHtml(`${I2}2. เจ้าหน้าที่หน่วยงานภายนอกอื่น ที่ร่วมปฏิบัติภารกิจ`),
    htmlTable(
      EXT_HEAD,
      rowsHtml(external, [0, 2]) +
        `<tr><td colspan="2" style="${CELL}text-align:right;font-weight:600;">รวมจำนวน</td><td style="${CELL}text-align:center;font-weight:600;">${sumCol(external, 2)}</td></tr>`,
    ),
    textToHtml(
      [
        `${INDENT}(5) การปฏิบัติจอดพักรถระหว่างการเดินทาง ณ สถานีบริการเชื้อเพลิง`,
        ...(fuel.trim() ? [indentLines(fuel, I2)] : []),
        `${INDENT}(6) การปฏิบัติอื่นๆ`,
        indentLines(settings.otherPractices, I2),
      ].join("\n"),
    ),
  ].join("");
  const sec3Edited = "sec3html" in st.overrides;
  const sec3Html = st.overrides.sec3html ?? sec3Generated;
  const sec3Text = () => htmlToText(sec3Html);

  const subject = text("subject", gen.subject);
  const background = text("background", gen.background);
  const references = text("references", gen.references);
  const conclusion = text("conclusion", gen.conclusion);
  const allText = () =>
    [
      `เรียน ${settings.to}`,
      `เรื่อง ${subject}`,
      "",
      "1. ความเป็นมา",
      background,
      "",
      "2. หลักเกณฑ์อ้างอิง",
      references,
      "",
      "3. ข้อมูลประกอบการพิจารณา",
      sec3Text(),
      "",
      "4. ข้อสรุปประเด็นเพื่อทราบ/พิจารณา",
      conclusion,
    ].join("\n");
  const allHtml = [
    textToHtml(
      `เรียน ${settings.to}\nเรื่อง ${subject}\n\n1. ความเป็นมา\n${background}\n\n2. หลักเกณฑ์อ้างอิง\n${references}\n\n3. ข้อมูลประกอบการพิจารณา`,
    ),
    sec3Html,
    textToHtml(`\n4. ข้อสรุปประเด็นเพื่อทราบ/พิจารณา\n${conclusion}`),
  ].join("");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {back}
        <CopyButton label="คัดลอกทั้งฉบับ" text={allText} html={allHtml} primary />
      </div>

      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="font-mono text-xs font-bold tracking-wide text-indigo-600">{summary.code}</p>
        <h1 className="mt-1 text-xl font-black text-slate-900">ระบบกลาง: บันทึกขออนุมัติแผนเดินทาง</h1>
        <p className="mt-1 text-sm text-slate-500">
          ระบบเติมข้อความและตารางจากข้อมูลภารกิจให้อัตโนมัติ แก้ไขได้ก่อนคัดลอก — ตารางจะวางในระบบกลางเป็นตาราง
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SmallInput label="วันโหลดทรัพย์สิน" type="date" value={st.loadDate} onChange={(v) => patch({ loadDate: v })} />
          <SmallInput label="วันออกเดินทาง" type="date" value={st.departDate} onChange={(v) => patch({ departDate: v })} />
          <SmallInput label="วันเดินทางกลับ" type="date" value={st.returnDate} onChange={(v) => patch({ returnDate: v })} />
          <SmallInput label="หัวลากสำรอง (คัน)" value={st.spareTractors} onChange={(v) => patch({ spareTractors: v })} />
          <SmallInput label="เลขที่ใบงานอนุมัติ ฝธช." value={st.fdMemoNo} placeholder="MM2026…" onChange={(v) => patch({ fdMemoNo: v })} />
          <SmallInput label="เลขที่ใบงานอนุมัติภารกิจ" value={st.missionMemoNo} placeholder="MM2026…" onChange={(v) => patch({ missionMemoNo: v })} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-5">
          <SmallInput label="ผู้ควบคุมขบวนเดินทางกลับ" value={st.returnLeader} onChange={(v) => patch({ returnLeader: v })} />
          <SmallInput label="เวลาตรวจสภาพรถ (วันโหลด)" value={st.times.inspect} onChange={(v) => patch({ times: { ...st.times, inspect: v } })} />
          <SmallInput label="เวลารับมอบตู้ (วันโหลด)" value={st.times.receive} onChange={(v) => patch({ times: { ...st.times, receive: v } })} />
          <SmallInput label="เวลาประชุม/ออกเดินทาง" value={st.times.briefing} onChange={(v) => patch({ times: { ...st.times, briefing: v } })} />
          <SmallInput label="เวลาเดินทางกลับ" value={st.times.back} onChange={(v) => patch({ times: { ...st.times, back: v } })} />
        </div>

        {gen.warnings.length ? (
          <ul className="mt-3 list-disc rounded-xl border border-amber-200 bg-amber-50 py-2 pl-8 pr-3 text-[13px] text-amber-900">
            {gen.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}

        <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">ค่าตั้งต้นหน่วยงาน (จำไว้ใช้ทุกภารกิจ)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <SmallInput label="ชื่อแผน" value={settings.planName} onChange={(v) => setSettings({ ...settings, planName: v })} wide />
            <SmallInput label="ส่วนงานต้นทาง" value={settings.requestingDept} onChange={(v) => setSettings({ ...settings, requestingDept: v })} />
            <SmallInput label="จุดรับมอบตู้" value={settings.originFull} onChange={(v) => setSettings({ ...settings, originFull: v })} />
            <SmallInput label="บริษัทรถบรรทุก (ตารางหน่วยงานภายนอก)" value={settings.truckCompany} onChange={(v) => setSettings({ ...settings, truckCompany: v })} />
            <SmallInput label="สังกัดรถบรรทุก (ตารางรูปขบวน)" value={settings.truckLabel} onChange={(v) => setSettings({ ...settings, truckLabel: v })} />
          </div>
          <div className="mt-3 space-y-3">
            <TextSetting label="(2) การใช้เส้นทางในการเดินทาง" value={settings.routeUsage} onChange={(v) => setSettings({ ...settings, routeUsage: v })} rows={3} />
            <TextSetting label="(5) การปฏิบัติจอดพักรถ ณ สถานีบริการเชื้อเพลิง" value={fuel} onChange={(v) => setSettings({ ...settings, fuelStops: v })} rows={3} />
            <TextSetting label="(6) การปฏิบัติอื่นๆ" value={settings.otherPractices} onChange={(v) => setSettings({ ...settings, otherPractices: v })} rows={10} />
          </div>
          <div className="mt-2 flex flex-wrap gap-4">
            <button
              type="button"
              className="text-xs font-semibold text-rose-600 hover:underline"
              onClick={() => confirm("คืนค่าตั้งต้นหน่วยงานทั้งหมด?") && setSettings(DEFAULT_SETTINGS)}
            >
              คืนค่าตั้งต้น
            </button>
          </div>
        </details>
      </header>

      <Section n="ส่วนหัว" title="ข้อมูลหัวบันทึก">
        <div className="grid gap-2 sm:grid-cols-2">
          <CopyField label="เรียน" value={settings.to} onChange={setSetting("to")} />
          <CopyField label="เพื่อ" value={settings.purpose} onChange={setSetting("purpose")} />
          <CopyField label="ชั้นความเร็ว" value={settings.speed} onChange={setSetting("speed")} />
          <CopyField label="ชั้นความลับ" value={settings.secrecy} onChange={setSetting("secrecy")} />
        </div>
        <div className="mt-2">
          <CopyField
            label="เรื่อง"
            value={subject}
            onChange={(e) => setOverride("subject", e.target.value)}
            edited={"subject" in st.overrides}
            onReset={() => setOverride("subject", null)}
          />
        </div>
      </Section>

      <Section n="1" title="ความเป็นมา" copyText={background} hint="มีเรื่องอื่นในห้วงเดียวกัน (เช่น ขนย้ายอาวุธปืน) พิมพ์ต่อท้ายได้">
        <EditableText
          value={background}
          onChange={(v) => setOverride("background", v)}
          edited={"background" in st.overrides}
          onReset={() => setOverride("background", null)}
          rows={5}
        />
      </Section>

      <Section n="2" title="หลักเกณฑ์อ้างอิง" copyText={references} hint="เลขที่ใบงานกรอกที่ด้านบน — เพิ่มข้ออื่นได้ในกล่อง">
        <EditableText
          value={references}
          onChange={(v) => setOverride("references", v)}
          edited={"references" in st.overrides}
          onReset={() => setOverride("references", null)}
          rows={Math.max(3, references.split("\n").length + 1)}
        />
      </Section>

      <Section
        n="3"
        title="ข้อมูลประกอบการพิจารณา"
        copyText={sec3Text}
        copyHtml={sec3Html}
        hint="คลิกแก้ข้อความหรือช่องในตารางได้ทันที กดคัดลอกครั้งเดียววางได้ทั้งข้อ — มีขนย้ายอาวุธปืนให้พิมพ์ข้อ (7) ต่อท้าย"
      >
        {sec3Edited ? (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            <span>แก้ไขเองแล้ว — ข้อมูลภารกิจหรือค่าตั้งต้นที่เปลี่ยนภายหลังจะไม่อัปเดตในข้อนี้</span>
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => confirm("ล้างการแก้ไขในข้อ 3 แล้วสร้างใหม่จากข้อมูลภารกิจ?") && setOverride("sec3html", null)}
            >
              สร้างใหม่จากข้อมูลภารกิจ
            </button>
          </div>
        ) : null}
        <EditableHtml html={sec3Html} onChange={(v) => setOverride("sec3html", v)} />
      </Section>

      <Section n="4" title="ข้อสรุปประเด็นเพื่อทราบ/พิจารณา" copyText={conclusion}>
        <EditableText
          value={conclusion}
          onChange={(v) => setOverride("conclusion", v)}
          edited={"conclusion" in st.overrides}
          onReset={() => setOverride("conclusion", null)}
          rows={5}
        />
      </Section>
    </div>
  );
}
