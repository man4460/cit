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

function externalUnitLabel(station: string) {
  const s = station.trim();
  if (/^กองบังคับการตำรวจทางหลวง/.test(s)) return "เจ้าหน้าที่ตำรวจทางหลวง";
  return `เจ้าหน้าที่ตำรวจ${s}`;
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

const isCargoRow = (row: string[]) => /สินค้า|หัวลาก/.test(row[1] ?? "");

function renumber(rows: string[][]) {
  return rows.map((r, i) => [String(i + 1), ...r.slice(1)]);
}

function sumCol(rows: string[][], col: number) {
  return rows.reduce((s, r) => s + (toNumber(r[col] ?? "") || 0), 0);
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
        const saved = readJson<PlanState>(stateKey(id));
        setSt({
          ...defaultMissionDates(s),
          fdMemoNo: "",
          missionMemoNo: "",
          spareTractors: spare,
          returnLeader: director ? personName(director) : "",
          times: DEFAULT_TIMES,
          overrides: {},
          ...(saved ?? {}),
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

    const bankStaff = people
      .filter((p) => !p.policeStationId)
      .map((p) => ({ p, order: isDirectorRole(p.roleName) ? (isAssistantRole(p.roleName) ? 1 : 0) : 2 }))
      .sort((a, b) => a.order - b.order)
      .map(({ p, order }) => ({
        name: personName(p),
        duty:
          order === 0
            ? "ผู้อำนวยการเดินทาง กรรมการรับมอบ-ส่งมอบธนบัตร และสื่อสาร"
            : order === 1
              ? "ผู้ช่วยผู้อำนวยการเดินทาง กรรมการรับมอบ-ส่งมอบธนบัตร และสื่อสาร"
              : "เจ้าหน้าที่ขับรถ และสื่อสาร",
        vehicleId: p.assignedVehicleId ?? null,
      }));

    const policeGroups = new Map<string, { names: string[]; vehicleIds: (string | null)[] }>();
    for (const p of people.filter((x) => x.policeStationId)) {
      const key = p.policeStationName?.trim() || p.personnelCategoryName?.trim() || "หน่วยงานภายนอก";
      const g = policeGroups.get(key) ?? { names: [], vehicleIds: [] };
      g.names.push(personName(p));
      g.vehicleIds.push(p.assignedVehicleId ?? null);
      policeGroups.set(key, g);
    }

    const callSignOf = new Map((summary.vehicles ?? []).map((v) => [v.vehicleId, v.callSign?.trim() ?? ""]));
    const staffRows = bankStaff.map((s, i) => {
      const cs = s.vehicleId ? callSignOf.get(s.vehicleId) : "";
      return [String(i + 1), s.name, cs ? `${s.duty} (นามเรียกขาน ${cs})` : s.duty];
    });
    const extRows = [...policeGroups.entries()].map(([station, g], i) => [
      String(i + 1),
      externalUnitLabel(station),
      String(g.names.length),
    ]);
    const drivers = (totalContainers + spare) * 2;
    if (drivers > 0) extRows.push([String(extRows.length + 1), settings.truckCompany, String(drivers)]);

    const cargoRows: string[][] = [];
    for (let i = 1; i <= totalContainers; i++) cargoRows.push(["", `สินค้า ${i}`, "", settings.truckLabel, "2", ""]);
    for (let i = 1; i <= spare; i++) cargoRows.push(["", spare > 1 ? `หัวลากสำรอง ${i}` : "หัวลากสำรอง", "", settings.truckLabel, "2", ""]);

    const vehicleRows = (summary.vehicles ?? []).map((v) => {
      const crew = bankStaff.filter((s) => s.vehicleId === v.vehicleId).map((s) => s.name);
      return ["", v.roleName.replace(/^รถ/, ""), v.callSign ?? "", "ฝรภ.", String(crew.length || ""), crew.join("\n")];
    });
    const unassigned = bankStaff.filter((s) => !s.vehicleId || !(summary.vehicles ?? []).some((v) => v.vehicleId === s.vehicleId));
    if (unassigned.length)
      vehicleRows.push(["", "ฝรภ. (ยังไม่ระบุคัน)", "", "ฝรภ.", String(unassigned.length), unassigned.map((s) => s.name).join("\n")]);
    const policeRows = [...policeGroups.entries()].map(([station, g]) => [
      "",
      policeShortLabel(station),
      "",
      policeShortLabel(station),
      String(g.names.length),
      g.names.join("\n"),
    ]);
    const convoyGo = renumber([...vehicleRows, ...policeRows, ...cargoRows]);

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
      staffRows,
      extRows,
      conclusion: `${INDENT}เพื่อโปรดพิจารณาอนุมัติ แผน “${settings.planName}” จาก${settings.requestingDept} ${destDelivery(true)} ระหว่างวันที่ ${range}`,
      warnings: [
        !dests.length ? "ภารกิจยังไม่มีจุดส่งสินค้า" : null,
        !bankStaff.some((s) => s.duty.startsWith("ผู้อำนวยการ")) ? "ยังไม่ได้กำหนดบุคลากรหน้าที่ «ผอ.เดินทาง»" : null,
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
  const convoyBack = renumber(convoyGo.filter((r) => !isCargoRow(r)));
  const staff = gen.staffRows;
  const external = gen.extRows;

  const unitOf = new Map(
    (summary.personnel ?? []).map((p) => [
      personName(p),
      p.policeStationId ? policeShortLabel(p.policeStationName?.trim() || p.personnelCategoryName?.trim() || "") : "ฝรภ.",
    ]),
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
