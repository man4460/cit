import {
  BOT_SPECIAL_ALLOWANCE_PER_DAY,
  botPerDiemDailyRate,
  filterBotAllowancePersonnel,
  formatThaiMissionDateRange,
  missionInclusiveDays,
  type BotAllowancePerson,
} from "./botAllowancePrint";
import {
  buildPolicePrintGroups,
  filterPoliceAllowancePersonnel,
  type MissionPoliceStationRow,
  type PoliceAllowancePerson,
} from "./policeAllowancePrint";

export type AllowanceDocSource = {
  missionId: string;
  title: string | null | undefined;
  code: string | null | undefined;
  plannedStart: string | null | undefined;
  plannedEnd: string | null | undefined;
  routeLabel: string | null | undefined;
  /** จำนวนวันเดินทางตามเส้นทาง — วันเริ่มภารกิจเป็นวันโหลด จึงใช้ค่านี้ก่อนช่วงวันที่ */
  routeMissionDays?: number | null;
  personnel: PoliceAllowancePerson[];
  policeStations?: MissionPoliceStationRow[];
};

export type AllowanceSigner = { name: string; title: string; note: string };

const DEFAULT_SIGNER: AllowanceSigner = {
  name: "(นายนรศิ พุกกะมาน)",
  title: "ผู้อำนวยการ ฝ่ายรักษาความปลอดภัย",
  note: "",
};

const DEFAULT_ORG_LINE = "สพจ. - ศสร. - ศหญ.";

/* ---------- เบี้ยเลี้ยง ธปท. ---------- */

export type BotDocRow = {
  key: string;
  employeeCode: string;
  name: string;
  position: string;
  grade: string;
  special: number;
  perDiem: number;
  travel: number;
};

export type BotAllowanceDoc = {
  heading: string;
  orgLine: string;
  dateLine: string;
  missionLine: string;
  specialHeader: string;
  rows: BotDocRow[];
  note: string;
  rules: string;
  signer: AllowanceSigner;
};

const BOT_RULES = [
  "ตามประกาศธนาคารแห่งประเทศไทย ที่ สนจ1. 14/2549 เรื่องอัตราเบี้ยเลี้ยงเดินทางไปปฏิบัติงานนอกที่ตั้งสำนักงาน และค่าใช้จ่ายในการเดินทางของพนักงานธนาคารแห่งประเทศไทย",
  "ตามหนังสือฝ่ายบริหารทั่วไป ที่ ฝบท. 19/2566 ลงวันที่ 20 เมษายน 2566 เรื่องอัตราเบี้ยเลี้ยงในการเดินทางไปปฏิบัติงานเกี่ยวกับธนบัตรและเหรียญกษาปณ์",
  "ตามหนังสือฝ่ายบริหารทั่วไป ที่ ฝบท. 65/2567 ลงวันที่ 22 พฤศจิกายน 2567 เรื่องการปรับปรุงอัตราเบี้ยเลี้ยงในการเดินทางไปปฏิบัติงานเกี่ยวกับธนบัตรและเหรียญกษาปณ์",
  "ตามหนังสือฝ่ายบริหารทั่วไป ที่ ฝบท. 19/2568 ลงวันที่ 28 มีนาคม 2568 เรื่องอัตราเงินช่วยเหลือค่าพาหนะเดินทางไป-กลับในการปฏิบัติงานเกี่ยวกับธนบัตรและเหรียญกษาปณ์",
].join("\n");

export function botRowTotal(r: BotDocRow): number {
  return (r.special || 0) + (r.perDiem || 0) + (r.travel || 0);
}

/** ค่าลำดับชั้นสำหรับเรียงสูง→ต่ำ: ตัวเลขชั้น (+0.5 ถ้าควบ) · จรส. อยู่ต่ำกว่าชั้นตัวเลข · ไม่ระบุอยู่ท้ายสุด */
export function gradeSortValue(grade: string | null | undefined): number {
  const g = (grade ?? "").replace(/\s+/g, "");
  if (!g) return -Infinity;
  const concurrent = /ควบ/.test(g) ? 0.5 : 0;
  const m = g.match(/\d+/);
  if (m) return Number(m[0]) + concurrent;
  if (/จรส/.test(g)) return -1 + concurrent;
  return -2;
}

export function buildBotAllowanceDoc(src: AllowanceDocSource): BotAllowanceDoc {
  const routeDays = Number(src.routeMissionDays);
  const days = routeDays > 0 ? routeDays : missionInclusiveDays(src.plannedStart, src.plannedEnd);
  const people: BotAllowancePerson[] = filterBotAllowancePersonnel(src.personnel)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => gradeSortValue(b.p.gradeLevel) - gradeSortValue(a.p.gradeLevel) || a.i - b.i)
    .map((x) => x.p);
  return {
    heading: "รายการเบิกเบี้ยพิเศษสำหรับภารกิจขนส่งธนบัตร เบี้ยเลี้ยง และเงินช่วยเหลือค่ายานพาหนะ",
    orgLine: src.routeLabel?.trim() || DEFAULT_ORG_LINE,
    dateLine: formatThaiMissionDateRange(src.plannedStart, src.plannedEnd),
    missionLine: [src.code, src.title?.trim()].filter(Boolean).join(" · "),
    specialHeader: `วันละ ${BOT_SPECIAL_ALLOWANCE_PER_DAY.toLocaleString("th-TH")} / วัน${days > 1 ? ` × ${days} วัน` : ""}`,
    rows: people.map((p) => {
      const stored = Number(p.perDiemRate);
      const perDiemDay = Number.isFinite(stored) && stored > 0 ? stored : botPerDiemDailyRate(p.gradeLevel);
      const travel = Number(p.vehicleTravelAllowance);
      return {
        key: p.personnelId,
        employeeCode: p.employeeCode?.trim() || "",
        name: [p.rank, p.fullName].filter(Boolean).join(" "),
        position: p.position?.trim() || "",
        grade: p.gradeLevel?.trim() || "",
        special: BOT_SPECIAL_ALLOWANCE_PER_DAY * days,
        perDiem: perDiemDay > 0 ? perDiemDay * days : 0,
        travel: Number.isFinite(travel) && travel > 0 ? travel : 0,
      };
    }),
    note: "ใบสำคัญรับเงินนี้จะมีผลสมบูรณ์ก็ต่อเมื่อได้รับการโอนเงินแล้ว",
    rules: BOT_RULES,
    signer: { ...DEFAULT_SIGNER },
  };
}

/* ---------- ค่าตอบแทนบุคคลภายนอก ---------- */

export type PoliceDocRow = {
  key: string;
  rank: string;
  firstName: string;
  lastName: string;
  idDisplay: string;
  amount: number;
  affiliation: string;
  isEntity?: boolean;
};

export type PoliceDocGroup = { key: string; title: string; rows: PoliceDocRow[] };

export type PoliceAllowanceDoc = {
  heading: string;
  orgLine: string;
  dateLine: string;
  groups: PoliceDocGroup[];
  /** หมายเหตุท้ายเอกสาร (หลายบรรทัดได้) */
  note?: string;
  signer: AllowanceSigner;
};

/** ยศตำรวจเรียงสูง→ต่ำ (เทียบแบบตัดช่องว่าง/คำว่า หญิง) */
const POLICE_RANK_ORDER = [
  "พล.ต.อ.",
  "พล.ต.ท.",
  "พล.ต.ต.",
  "พ.ต.อ.(พิเศษ)",
  "พ.ต.อ.",
  "พ.ต.ท.",
  "พ.ต.ต.",
  "ร.ต.อ.",
  "ร.ต.ท.",
  "ร.ต.ต.",
  "ด.ต.",
  "จ.ส.ต.",
  "ส.ต.อ.",
  "ส.ต.ท.",
  "ส.ต.ต.",
];

export function policeRankIndex(rank: string): number {
  const raw = rank.replace(/\s+/g, "").replace(/หญิง/g, "");
  const acting = raw.startsWith("ว่าที่");
  const r = acting ? raw.slice("ว่าที่".length) : raw;
  const idx = POLICE_RANK_ORDER.findIndex((x) => r.startsWith(x));
  if (idx < 0) return POLICE_RANK_ORDER.length;
  return idx + (acting ? 0.5 : 0);
}

function sortPoliceRows(rows: PoliceDocRow[]): PoliceDocRow[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort(
      (a, b) =>
        Number(Boolean(a.r.isEntity)) - Number(Boolean(b.r.isEntity)) ||
        policeRankIndex(a.r.rank) - policeRankIndex(b.r.rank) ||
        a.i - b.i,
    )
    .map((x) => x.r);
}

export function buildPoliceAllowanceDoc(src: AllowanceDocSource): PoliceAllowanceDoc {
  return {
    heading: "รายงานสรุปรายชื่อตำรวจผู้ปฏิบัติภารกิจ",
    orgLine: src.routeLabel?.trim() || DEFAULT_ORG_LINE,
    dateLine: formatThaiMissionDateRange(src.plannedStart, src.plannedEnd),
    groups: buildPolicePrintGroups(src.personnel, src.policeStations ?? []).map((g) => ({
      key: g.key,
      title: g.title,
      rows: sortPoliceRows(g.rows.map((r) => ({ ...r }))),
    })),
    signer: { ...DEFAULT_SIGNER, note: "ผู้รับรองรายชื่อการปฏิบัติภารกิจ" },
  };
}

export function policeDocTotal(doc: PoliceAllowanceDoc): number {
  return doc.groups.reduce((s, g) => s + g.rows.reduce((t, r) => t + (Number.isFinite(r.amount) ? r.amount : 0), 0), 0);
}

/* ---------- แบบร่างในเครื่อง ---------- */

const draftKey = (kind: "bot" | "police", missionId: string) => `cit.allowanceDoc.${kind}.${missionId}`;

type AllowanceDraftEnvelope<T> = { v: 2; sourceSig: string; doc: T };

function isDraftEnvelope(x: unknown): x is AllowanceDraftEnvelope<unknown> {
  return Boolean(
    x &&
      typeof x === "object" &&
      (x as AllowanceDraftEnvelope<unknown>).v === 2 &&
      typeof (x as AllowanceDraftEnvelope<unknown>).sourceSig === "string" &&
      "doc" in (x as object),
  );
}

/** ลายนิ้วมือจากข้อมูลภารกิจที่ใช้สร้างตาราง — เปลี่ยนแล้วทิ้งแถวเก่าในแบบร่าง */
export function allowanceSourceSig(kind: "bot" | "police", src: AllowanceDocSource): string {
  const head = [
    src.plannedStart ?? "",
    src.plannedEnd ?? "",
    String(src.routeMissionDays ?? ""),
    (src.routeLabel ?? "").trim(),
    (src.code ?? "").trim(),
    (src.title ?? "").trim(),
  ].join("|");

  if (kind === "bot") {
    const people = filterBotAllowancePersonnel(src.personnel)
      .map((p) =>
        [
          p.personnelId,
          p.fullName,
          p.rank ?? "",
          p.employeeCode ?? "",
          p.position ?? "",
          p.gradeLevel ?? "",
          String(p.perDiemRate ?? ""),
          String(p.vehicleTravelAllowance ?? ""),
        ].join("~"),
      )
      .sort()
      .join(";");
    return `bot:v1:${head}#${people}`;
  }

  const people = filterPoliceAllowancePersonnel(src.personnel as PoliceAllowancePerson[])
    .map((p) =>
      [
        p.personnelId,
        p.fullName,
        p.rank ?? "",
        p.idNumber ?? "",
        p.position ?? "",
        p.policeStationName ?? "",
        p.personnelCategoryName ?? "",
        String(p.compensationRate ?? ""),
      ].join("~"),
    )
    .sort()
    .join(";");
  const stations = (src.policeStations ?? [])
    .map((s) => [s.policeStationId, s.name, String(s.amount ?? ""), s.vendorCode ?? ""].join("~"))
    .sort()
    .join(";");
  return `police:v1:${head}#${people}#${stations}`;
}

function mergeBotEditorial(fresh: BotAllowanceDoc, draft: BotAllowanceDoc): BotAllowanceDoc {
  return {
    ...fresh,
    heading: draft.heading?.trim() ? draft.heading : fresh.heading,
    orgLine: draft.orgLine?.trim() ? draft.orgLine : fresh.orgLine,
    note: draft.note ?? fresh.note,
    rules: draft.rules?.trim() ? draft.rules : fresh.rules,
    signer: draft.signer ?? fresh.signer,
  };
}

function mergePoliceEditorial(fresh: PoliceAllowanceDoc, draft: PoliceAllowanceDoc): PoliceAllowanceDoc {
  return {
    ...fresh,
    heading: draft.heading?.trim() ? draft.heading : fresh.heading,
    orgLine: draft.orgLine?.trim() ? draft.orgLine : fresh.orgLine,
    note: draft.note ?? fresh.note,
    signer: draft.signer ?? fresh.signer,
  };
}

export type ResolvedAllowanceDoc<T> = {
  doc: T;
  /** มีการแก้หัวเอกสาร/ลงนามค้างในเครื่อง (แถวตรงกับภารกิจแล้ว) */
  edited: boolean;
  sourceSig: string;
};

/**
 * สร้างเอกสารจากภารกิจ แล้วผสานแบบร่างในเครื่อง:
 * - ลายนิ้วมือตรงกัน → ใช้แบบร่างทั้งฉบับ (รวมแถวที่แก้เอง)
 * - ภารกิจเปลี่ยน / แบบร่างเก่าไม่มีลายนิ้วมือ → ดึงแถวจากภารกิจใหม่ เก็บแค่หัวเอกสาร/ลงนาม
 */
export function resolveAllowanceDoc<T>(
  kind: "bot" | "police",
  missionId: string,
  src: AllowanceDocSource,
  build: (src: AllowanceDocSource) => T,
): ResolvedAllowanceDoc<T> {
  const sourceSig = allowanceSourceSig(kind, src);
  const fresh = build(src);
  let raw: unknown = null;
  try {
    const text = localStorage.getItem(draftKey(kind, missionId));
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }
  if (!raw) return { doc: fresh, edited: false, sourceSig };

  const envelope = isDraftEnvelope(raw) ? (raw as AllowanceDraftEnvelope<T>) : null;
  const draftDoc = (envelope ? envelope.doc : raw) as T;
  const draftSig = envelope?.sourceSig ?? "";

  if (draftSig && draftSig === sourceSig) {
    return { doc: draftDoc, edited: true, sourceSig };
  }

  /* ภารกิจเปลี่ยน หรือแบบร่างเก่า — แถว/ยอดใช้ของใหม่จากภารกิจ */
  const merged =
    kind === "bot"
      ? (mergeBotEditorial(fresh as BotAllowanceDoc, draftDoc as BotAllowanceDoc) as T)
      : (mergePoliceEditorial(fresh as PoliceAllowanceDoc, draftDoc as PoliceAllowanceDoc) as T);

  const editorialKept =
    kind === "bot"
      ? JSON.stringify({
          h: (merged as BotAllowanceDoc).heading,
          o: (merged as BotAllowanceDoc).orgLine,
          n: (merged as BotAllowanceDoc).note,
          r: (merged as BotAllowanceDoc).rules,
          s: (merged as BotAllowanceDoc).signer,
        }) !==
        JSON.stringify({
          h: (fresh as BotAllowanceDoc).heading,
          o: (fresh as BotAllowanceDoc).orgLine,
          n: (fresh as BotAllowanceDoc).note,
          r: (fresh as BotAllowanceDoc).rules,
          s: (fresh as BotAllowanceDoc).signer,
        })
      : JSON.stringify({
          h: (merged as PoliceAllowanceDoc).heading,
          o: (merged as PoliceAllowanceDoc).orgLine,
          n: (merged as PoliceAllowanceDoc).note,
          s: (merged as PoliceAllowanceDoc).signer,
        }) !==
        JSON.stringify({
          h: (fresh as PoliceAllowanceDoc).heading,
          o: (fresh as PoliceAllowanceDoc).orgLine,
          n: (fresh as PoliceAllowanceDoc).note,
          s: (fresh as PoliceAllowanceDoc).signer,
        });

  try {
    localStorage.setItem(draftKey(kind, missionId), JSON.stringify({ v: 2, sourceSig, doc: merged } satisfies AllowanceDraftEnvelope<T>));
  } catch {
    /* ignore */
  }

  return { doc: merged, edited: editorialKept, sourceSig };
}

/** @deprecated ใช้ resolveAllowanceDoc — คงไว้เผื่อโค้ดเก่า */
export function loadAllowanceDraft<T>(kind: "bot" | "police", missionId: string): T | null {
  try {
    const raw = localStorage.getItem(draftKey(kind, missionId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isDraftEnvelope(parsed)) return parsed.doc as T;
    return parsed as T;
  } catch {
    return null;
  }
}

export function saveAllowanceDraft(kind: "bot" | "police", missionId: string, doc: unknown, sourceSig?: string): void {
  try {
    if (sourceSig) {
      localStorage.setItem(draftKey(kind, missionId), JSON.stringify({ v: 2, sourceSig, doc } satisfies AllowanceDraftEnvelope<unknown>));
    } else {
      /* ไม่มีลายนิ้วมือ — เก็บแบบ envelope ว่าง เพื่อรอบถัดไปจะ sync จากภารกิจ */
      localStorage.setItem(draftKey(kind, missionId), JSON.stringify({ v: 2, sourceSig: "", doc } satisfies AllowanceDraftEnvelope<unknown>));
    }
  } catch {
    /* storage เต็ม/ปิดไว้ — ข้ามได้ */
  }
}

export function clearAllowanceDraft(kind: "bot" | "police", missionId: string): void {
  localStorage.removeItem(draftKey(kind, missionId));
}

export function newRowKey(): string {
  return `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
